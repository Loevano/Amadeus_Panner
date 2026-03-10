#!/usr/bin/env python3
import json
import math
import os
import queue
import re
import signal
import socket
import struct
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import quote, unquote, urlparse

from showfile_validator import validate_show_bundle

PROJECT_ROOT = Path(__file__).resolve().parents[2]
UI_ROOT = PROJECT_ROOT / "apps" / "ui" / "public"
OSC_CONFIG_PATH = PROJECT_ROOT / "config" / "osc.json"

DEFAULT_OSC_OUT_HOST = "127.0.0.1"
DEFAULT_OSC_OUT_PORT = 9000
DEFAULT_OSC_IN_PORT = 9001
DEFAULT_OSC_OBJECT_PATH_PREFIX = "/art/object"
DEFAULT_OSC_SCENE_PATH_PREFIX = "/art/scene"
DEFAULT_OSC_ACTION_PATH_PREFIX = "/art/action"
DEFAULT_OSC_ACTION_GROUP_PATH_PREFIX = "/art/action-group"

CONFIG = {
    "mode": os.getenv("MODE", "program"),
    "host": os.getenv("HOST", "0.0.0.0"),
    "http_port": int(os.getenv("HTTP_PORT", "8787")),
    "osc_out_host": os.getenv("OSC_OUT_HOST", DEFAULT_OSC_OUT_HOST),
    "osc_out_port": int(os.getenv("OSC_OUT_PORT", str(DEFAULT_OSC_OUT_PORT))),
    "osc_in_port": int(os.getenv("OSC_IN_PORT", str(DEFAULT_OSC_IN_PORT))),
    "osc_object_path_prefix": os.getenv("OSC_OBJECT_PATH_PREFIX", DEFAULT_OSC_OBJECT_PATH_PREFIX),
    "osc_scene_path_prefix": os.getenv("OSC_SCENE_PATH_PREFIX", DEFAULT_OSC_SCENE_PATH_PREFIX),
    "osc_action_path_prefix": os.getenv("OSC_ACTION_PATH_PREFIX", DEFAULT_OSC_ACTION_PATH_PREFIX),
    "osc_action_group_path_prefix": os.getenv("OSC_ACTION_GROUP_PATH_PREFIX", DEFAULT_OSC_ACTION_GROUP_PATH_PREFIX),
}

OBJECT_LIMITS = {
    "x": (-100.0, 100.0),
    "y": (-100.0, 100.0),
    "z": (-100.0, 100.0),
    "size": (0.0, 100.0),
    "gain": (-120.0, 12.0),
}

OBJECT_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
SCENE_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
SHOW_ID_PATTERN = re.compile(r"^[a-z0-9-]+$")
VERSION_PATTERN = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+$")
COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULT_OBJECT_TYPE = "point"
DEFAULT_OBJECT_COLOR = "#1c4f89"
DEFAULT_GROUP_COLOR = "#2f7f7a"
VIRTUAL_ALL_GROUP_ID = "all"
LINKABLE_GROUP_PARAMS = {"x", "y", "z", "size", "gain", "mute", "algorithm", "type", "color"}
RELATIVE_GROUP_PARAMS = {"x", "y", "z"}
LFO_PARAMS = {"x", "y", "z", "size", "gain"}
LFO_TARGET_PARAMS = ("x", "y", "z", "size", "gain")
LFO_TARGET_PARAM_ALL = "all"
LFO_TARGET_SCOPE_OBJECT = "object"
LFO_TARGET_SCOPE_GROUP = "group"
LFO_WAVES = {"sine", "triangle", "square", "saw"}
LFO_POLARITIES = {"bipolar", "unipolar"}
ACTION_TICK_SEC = 1.0 / 60.0
ACTION_GROUP_ACTION_COMMANDS = {"start", "stop", "abort"}
ACTION_RULE_TYPES = {"modulationControl", "parameterRamp"}
ACTION_RULE_MODULATION_PARAMS = {"enabled", "wave", "rateHz", "depth", "offset", "phaseDeg", "mappingPhaseDeg", "polarity"}
ENABLED_SWITCH_ON_VALUES = {"on", "enable", "enabled", "true", "1", "yes"}
ENABLED_SWITCH_OFF_VALUES = {"off", "disable", "disabled", "false", "0", "no"}
ENABLED_SWITCH_TOGGLE_VALUES = {"toggle", "flip"}


def clamp(value: float, min_max: Tuple[float, float]) -> float:
    lo, hi = min_max
    return max(lo, min(hi, value))


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


def normalize_enabled_switch(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in ENABLED_SWITCH_ON_VALUES:
        return "on"
    if normalized in ENABLED_SWITCH_OFF_VALUES:
        return "off"
    if normalized in ENABLED_SWITCH_TOGGLE_VALUES:
        return "toggle"
    raise ValueError("Enabled switch must be one of: on, off, toggle")


def apply_enabled_switch(current_enabled: bool, switch: str) -> bool:
    normalized_switch = normalize_enabled_switch(switch)
    if normalized_switch == "toggle":
        return not bool(current_enabled)
    return normalized_switch == "on"


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        out = float(value)
        if math.isfinite(out):
            return out
    except (TypeError, ValueError):
        pass
    return default


def normalize_osc_host(value: Any, default: str = DEFAULT_OSC_OUT_HOST) -> str:
    host = str(value or "").strip()
    if not host:
        return default
    if any(ch.isspace() for ch in host):
        raise ValueError("OSC host must not contain whitespace")
    if len(host) > 253:
        raise ValueError("OSC host must be 253 characters or fewer")
    return host


def normalize_osc_port(value: Any, default: int) -> int:
    if value is None or str(value).strip() == "":
        return int(default)
    try:
        port = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("OSC port must be an integer") from exc
    if port < 1 or port > 65535:
        raise ValueError("OSC port must be between 1 and 65535")
    return port


def normalize_osc_path_prefix(value: Any, default: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raw = default
    normalized = "/" + raw.lstrip("/")
    normalized = re.sub(r"/+", "/", normalized)
    if len(normalized) > 1:
        normalized = normalized.rstrip("/")
    return normalized or default


def osc_join_path(prefix: str, *segments: Any) -> str:
    normalized_prefix = normalize_osc_path_prefix(prefix, "/")
    normalized_segments = [str(segment or "").strip().strip("/") for segment in segments]
    normalized_segments = [segment for segment in normalized_segments if segment]
    if normalized_prefix == "/":
        return "/" + "/".join(normalized_segments)
    if not normalized_segments:
        return normalized_prefix
    return normalized_prefix + "/" + "/".join(normalized_segments)


def osc_strip_prefix(address: Any, prefix: Any) -> Optional[str]:
    normalized_address = str(address or "").strip()
    normalized_prefix = normalize_osc_path_prefix(prefix, "/")
    if normalized_prefix == "/":
        if not normalized_address.startswith("/"):
            return None
        return normalized_address[1:]
    prefix_with_sep = f"{normalized_prefix}/"
    if not normalized_address.startswith(prefix_with_sep):
        return None
    return normalized_address[len(prefix_with_sep) :]


def current_osc_runtime_config() -> Dict[str, Any]:
    return {
        "outHost": normalize_osc_host(CONFIG.get("osc_out_host"), DEFAULT_OSC_OUT_HOST),
        "outPort": normalize_osc_port(CONFIG.get("osc_out_port"), DEFAULT_OSC_OUT_PORT),
        "inPort": normalize_osc_port(CONFIG.get("osc_in_port"), DEFAULT_OSC_IN_PORT),
        "objectPathPrefix": normalize_osc_path_prefix(CONFIG.get("osc_object_path_prefix"), DEFAULT_OSC_OBJECT_PATH_PREFIX),
        "scenePathPrefix": normalize_osc_path_prefix(CONFIG.get("osc_scene_path_prefix"), DEFAULT_OSC_SCENE_PATH_PREFIX),
        "actionPathPrefix": normalize_osc_path_prefix(CONFIG.get("osc_action_path_prefix"), DEFAULT_OSC_ACTION_PATH_PREFIX),
        "actionGroupPathPrefix": normalize_osc_path_prefix(CONFIG.get("osc_action_group_path_prefix"), DEFAULT_OSC_ACTION_GROUP_PATH_PREFIX),
    }


def normalize_osc_runtime_config(raw_config: Any, fallback: Dict[str, Any], partial: bool = False) -> Dict[str, Any]:
    source = raw_config if isinstance(raw_config, dict) else {}
    normalized: Dict[str, Any] = {}

    field_aliases = {
        "outHost": ("outHost", "out_host", "oscOutHost", "osc_out_host"),
        "outPort": ("outPort", "out_port", "oscOutPort", "osc_out_port"),
        "inPort": ("inPort", "in_port", "oscInPort", "osc_in_port"),
        "objectPathPrefix": ("objectPathPrefix", "object_path_prefix", "oscObjectPathPrefix", "osc_object_path_prefix"),
        "scenePathPrefix": ("scenePathPrefix", "scene_path_prefix", "oscScenePathPrefix", "osc_scene_path_prefix"),
        "actionPathPrefix": ("actionPathPrefix", "action_path_prefix", "oscActionPathPrefix", "osc_action_path_prefix"),
        "actionGroupPathPrefix": ("actionGroupPathPrefix", "action_group_path_prefix", "oscActionGroupPathPrefix", "osc_action_group_path_prefix"),
    }

    def pick_value(field_name: str) -> Tuple[Any, bool]:
        for alias in field_aliases[field_name]:
            if alias in source:
                return source.get(alias), True
        return None, False

    raw_out_host, has_out_host = pick_value("outHost")
    raw_out_port, has_out_port = pick_value("outPort")
    raw_in_port, has_in_port = pick_value("inPort")
    raw_object_prefix, has_object_prefix = pick_value("objectPathPrefix")
    raw_scene_prefix, has_scene_prefix = pick_value("scenePathPrefix")
    raw_action_prefix, has_action_prefix = pick_value("actionPathPrefix")
    raw_action_group_prefix, has_action_group_prefix = pick_value("actionGroupPathPrefix")

    if has_out_host or not partial:
        normalized["outHost"] = normalize_osc_host(raw_out_host, str(fallback.get("outHost") or DEFAULT_OSC_OUT_HOST))
    if has_out_port or not partial:
        normalized["outPort"] = normalize_osc_port(raw_out_port, int(fallback.get("outPort") or DEFAULT_OSC_OUT_PORT))
    if has_in_port or not partial:
        normalized["inPort"] = normalize_osc_port(raw_in_port, int(fallback.get("inPort") or DEFAULT_OSC_IN_PORT))
    if has_object_prefix or not partial:
        normalized["objectPathPrefix"] = normalize_osc_path_prefix(raw_object_prefix, str(fallback.get("objectPathPrefix") or DEFAULT_OSC_OBJECT_PATH_PREFIX))
    if has_scene_prefix or not partial:
        normalized["scenePathPrefix"] = normalize_osc_path_prefix(raw_scene_prefix, str(fallback.get("scenePathPrefix") or DEFAULT_OSC_SCENE_PATH_PREFIX))
    if has_action_prefix or not partial:
        normalized["actionPathPrefix"] = normalize_osc_path_prefix(raw_action_prefix, str(fallback.get("actionPathPrefix") or DEFAULT_OSC_ACTION_PATH_PREFIX))
    if has_action_group_prefix or not partial:
        normalized["actionGroupPathPrefix"] = normalize_osc_path_prefix(raw_action_group_prefix, str(fallback.get("actionGroupPathPrefix") or DEFAULT_OSC_ACTION_GROUP_PATH_PREFIX))
    return normalized


def normalize_lfo_target_scope(raw_scope: Any = LFO_TARGET_SCOPE_OBJECT) -> str:
    normalized = str(raw_scope or LFO_TARGET_SCOPE_OBJECT).strip().lower()
    if normalized == LFO_TARGET_SCOPE_GROUP:
        return LFO_TARGET_SCOPE_GROUP
    return LFO_TARGET_SCOPE_OBJECT


def is_lfo_target_parameter(parameter: Any, scope: Any = LFO_TARGET_SCOPE_OBJECT) -> bool:
    target_scope = normalize_lfo_target_scope(scope)
    normalized_parameter = str(parameter or "").strip().lower()
    if normalized_parameter == LFO_TARGET_PARAM_ALL:
        return target_scope == LFO_TARGET_SCOPE_GROUP
    return normalized_parameter in LFO_PARAMS


def mapping_distributes_phase_over_members(mapping: Dict[str, Any]) -> bool:
    if "distributePhaseOverMembers" in mapping:
        return bool(mapping.get("distributePhaseOverMembers"))
    return bool(mapping.get("distribute_phase_over_members", False))


def lfo_member_phase_offset_deg(mapping: Dict[str, Any], member_index: int, member_count: int) -> float:
    if member_count <= 1:
        return 0.0
    if not mapping_distributes_phase_over_members(mapping):
        return 0.0
    safe_index = max(0, min(member_index, member_count - 1))
    return (360.0 * float(safe_index)) / float(member_count)


def iter_lfo_target_entries(
    mapping: Dict[str, Any],
    object_groups_by_id: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    target_scope = normalize_lfo_target_scope(mapping.get("targetScope", mapping.get("target_scope")))
    raw_parameter = str(mapping.get("parameter") or "").strip().lower()
    if not is_lfo_target_parameter(raw_parameter, target_scope):
        return []

    if target_scope == LFO_TARGET_SCOPE_OBJECT:
        raw_object_id = str(mapping.get("objectId") or mapping.get("object_id") or "").strip()
        if not raw_object_id:
            return []
        try:
            return [
                {
                    "objectId": normalize_object_id(raw_object_id),
                    "parameter": raw_parameter,
                    "memberIndex": 0,
                    "memberCount": 1,
                    "phaseOffsetDeg": 0.0,
                }
            ]
        except Exception:
            return []

    raw_group_id = str(mapping.get("groupId") or mapping.get("group_id") or "").strip()
    if not raw_group_id:
        return []

    try:
        normalized_group_id = normalize_object_id(raw_group_id)
    except Exception:
        return []
    group = object_groups_by_id.get(normalized_group_id)
    if not isinstance(group, dict):
        return []
    object_ids = group.get("objectIds")
    if not isinstance(object_ids, list):
        return []

    normalized_member_ids: List[str] = []
    for raw_object_id in object_ids:
        if not isinstance(raw_object_id, str):
            continue
        try:
            normalized_member_ids.append(normalize_object_id(raw_object_id))
        except Exception:
            continue

    member_count = len(normalized_member_ids)
    if member_count <= 0:
        return []

    parameters = LFO_TARGET_PARAMS if raw_parameter == LFO_TARGET_PARAM_ALL else (raw_parameter,)
    entries: List[Dict[str, Any]] = []
    for member_index, normalized_object_id in enumerate(normalized_member_ids):
        phase_offset_deg = lfo_member_phase_offset_deg(mapping, member_index, member_count)
        for target_parameter in parameters:
            entries.append(
                {
                    "objectId": normalized_object_id,
                    "parameter": target_parameter,
                    "memberIndex": member_index,
                    "memberCount": member_count,
                    "phaseOffsetDeg": phase_offset_deg,
                }
            )
    return entries


def iter_lfo_target_pairs(
    mapping: Dict[str, Any],
    object_groups_by_id: Dict[str, Dict[str, Any]],
) -> List[Tuple[str, str]]:
    return [
        (str(entry.get("objectId") or ""), str(entry.get("parameter") or ""))
        for entry in iter_lfo_target_entries(mapping, object_groups_by_id)
    ]


def apply_runtime_osc_config(config_values: Dict[str, Any]) -> None:
    CONFIG["osc_out_host"] = normalize_osc_host(config_values.get("outHost"), DEFAULT_OSC_OUT_HOST)
    CONFIG["osc_out_port"] = normalize_osc_port(config_values.get("outPort"), DEFAULT_OSC_OUT_PORT)
    CONFIG["osc_in_port"] = normalize_osc_port(config_values.get("inPort"), DEFAULT_OSC_IN_PORT)
    CONFIG["osc_object_path_prefix"] = normalize_osc_path_prefix(config_values.get("objectPathPrefix"), DEFAULT_OSC_OBJECT_PATH_PREFIX)
    CONFIG["osc_scene_path_prefix"] = normalize_osc_path_prefix(config_values.get("scenePathPrefix"), DEFAULT_OSC_SCENE_PATH_PREFIX)
    CONFIG["osc_action_path_prefix"] = normalize_osc_path_prefix(config_values.get("actionPathPrefix"), DEFAULT_OSC_ACTION_PATH_PREFIX)
    CONFIG["osc_action_group_path_prefix"] = normalize_osc_path_prefix(config_values.get("actionGroupPathPrefix"), DEFAULT_OSC_ACTION_GROUP_PATH_PREFIX)


def load_persisted_osc_runtime_config(fallback: Dict[str, Any]) -> Dict[str, Any]:
    if not OSC_CONFIG_PATH.exists():
        return dict(fallback)
    try:
        raw = json.loads(OSC_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return dict(fallback)
    try:
        return normalize_osc_runtime_config(raw, fallback, partial=False)
    except Exception:
        return dict(fallback)


def save_persisted_osc_runtime_config(config_values: Dict[str, Any]) -> None:
    OSC_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    OSC_CONFIG_PATH.write_text(json.dumps(config_values, indent=2) + "\n", encoding="utf-8")


def normalize_object_id(value: Any) -> str:
    object_id = str(value or "").strip()
    if not OBJECT_ID_PATTERN.fullmatch(object_id):
        raise ValueError("objectId must use only letters, numbers, dot, underscore, dash (max 64 chars)")
    return object_id


def normalize_scene_id(value: Any) -> str:
    scene_id = str(value or "").strip()
    if not SCENE_ID_PATTERN.fullmatch(scene_id):
        raise ValueError("sceneId must use only letters, numbers, dot, underscore, dash (max 64 chars)")
    return scene_id


def normalize_action_id(value: Any) -> str:
    action_id = str(value or "").strip()
    if not OBJECT_ID_PATTERN.fullmatch(action_id):
        raise ValueError("actionId must use only letters, numbers, dot, underscore, dash (max 64 chars)")
    return action_id


def normalize_lfo_id(value: Any) -> str:
    lfo_id = str(value or "").strip()
    if not OBJECT_ID_PATTERN.fullmatch(lfo_id):
        raise ValueError("lfoId must use only letters, numbers, dot, underscore, dash (max 64 chars)")
    return lfo_id


def normalize_lfo_polarity(value: Any) -> str:
    polarity = str(value or "bipolar").strip().lower()
    if polarity not in LFO_POLARITIES:
        raise ValueError(f"LFO polarity must be one of: {', '.join(sorted(LFO_POLARITIES))}")
    return polarity


def coerce_lfo_polarity(value: Any) -> str:
    polarity = str(value or "").strip().lower()
    if polarity in LFO_POLARITIES:
        return polarity
    return "bipolar"


def normalize_action_rule_type(value: Any) -> str:
    raw = str(value or "").strip()
    if raw in ACTION_RULE_TYPES:
        return raw
    lowered = raw.lower()
    if lowered in {"modulationcontrol", "modulation_control", "modulation"}:
        return "modulationControl"
    if lowered in {"parameterramp", "parameter_ramp", "ramp"}:
        return "parameterRamp"
    return "parameterRamp"


def _parse_boolean_like(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    normalized = str(value or "").strip().lower()
    if normalized in {"1", "true", "yes", "on", "enabled"}:
        return True
    if normalized in {"0", "false", "no", "off", "disabled"}:
        return False
    return bool(fallback)


def normalize_action_rule_mod_value(parameter: str, value: Any, fallback: Any = 0.0) -> Any:
    if parameter == "enabled":
        return _parse_boolean_like(value, _parse_boolean_like(fallback, True))
    if parameter == "wave":
        normalized_wave = str(value or "").strip().lower()
        if normalized_wave in LFO_WAVES:
            return normalized_wave
        fallback_wave = str(fallback or "").strip().lower()
        return fallback_wave if fallback_wave in LFO_WAVES else "sine"
    if parameter == "polarity":
        return coerce_lfo_polarity(value or fallback)
    numeric = to_float(value, to_float(fallback, 0.0))
    if parameter == "rateHz":
        numeric = max(0.0, numeric)
    return numeric


def normalize_action_rule(raw_rule: Any) -> Dict[str, Any]:
    source = raw_rule if isinstance(raw_rule, dict) else {}
    rule_type = normalize_action_rule_type(source.get("type"))

    if rule_type == "modulationControl":
        raw_target_modulator = source.get("target_modulator") if "target_modulator" in source else source.get("targetModulator")
        target_modulator = ""
        try:
            target_modulator = normalize_lfo_id(raw_target_modulator or "")
        except Exception:
            target_modulator = ""

        parameter = str(source.get("parameter") or "").strip()
        if parameter not in ACTION_RULE_MODULATION_PARAMS:
            parameter = "depth"
        default_value: Any = "sine" if parameter == "wave" else ("bipolar" if parameter == "polarity" else (True if parameter == "enabled" else 0.0))
        normalized_value = normalize_action_rule_mod_value(parameter, source.get("value"), default_value)
        return {
            "type": "modulationControl",
            "targetModulator": target_modulator,
            "parameter": parameter,
            "value": normalized_value,
        }

    raw_target = str(source.get("target") or "").strip()
    target = ""
    if raw_target:
        split_index = raw_target.rfind(".")
        if split_index > 0:
            object_id_raw = raw_target[:split_index]
            parameter_raw = raw_target[split_index + 1:].strip().lower()
            try:
                object_id = normalize_object_id(object_id_raw)
            except Exception:
                object_id = ""
            if object_id and parameter_raw in LFO_PARAMS:
                target = f"{object_id}.{parameter_raw}"

    start_value = to_float(source.get("start_value") if "start_value" in source else source.get("startValue"), 0.0)
    end_value = to_float(source.get("end_value") if "end_value" in source else source.get("endValue"), start_value)
    speed_ms = max(0.0, to_float(
        source.get("speed_ms") if "speed_ms" in source else (
            source.get("speedMs") if "speedMs" in source else source.get("speed")
        ),
        0.0,
    ))
    relative = _parse_boolean_like(source.get("relative"), False)
    return {
        "type": "parameterRamp",
        "target": target,
        "startValue": start_value,
        "endValue": end_value,
        "speedMs": speed_ms,
        "relative": relative,
    }


def action_rule_to_raw(action_rule: Any) -> Dict[str, Any]:
    normalized = normalize_action_rule(action_rule)
    rule_type = normalize_action_rule_type(normalized.get("type"))
    if rule_type == "modulationControl":
        parameter = str(normalized.get("parameter") or "depth")
        return {
            "type": "modulation_control",
            "target_modulator": str(normalized.get("targetModulator") or ""),
            "parameter": parameter,
            "value": normalize_action_rule_mod_value(parameter, normalized.get("value"), 0.0),
        }
    return {
        "type": "parameter_ramp",
        "target": str(normalized.get("target") or ""),
        "start_value": to_float(normalized.get("startValue"), 0.0),
        "end_value": to_float(normalized.get("endValue"), 0.0),
        "speed_ms": max(0.0, to_float(
            normalized.get("speedMs") if "speedMs" in normalized else normalized.get("speed"),
            0.0,
        )),
        "relative": bool(normalized.get("relative", False)),
    }


def parse_action_rule_target(value: Any) -> Tuple[str, str]:
    raw_target = str(value or "").strip()
    if not raw_target:
        return "", ""
    split_index = raw_target.rfind(".")
    if split_index <= 0:
        return "", ""
    object_id_raw = raw_target[:split_index]
    parameter = raw_target[split_index + 1:].strip().lower()
    if parameter not in LFO_PARAMS:
        return "", ""
    try:
        object_id = normalize_object_id(object_id_raw)
    except Exception:
        return "", ""
    return object_id, parameter


def normalize_action_group_id(value: Any) -> str:
    group_id = str(value or "").strip()
    if not OBJECT_ID_PATTERN.fullmatch(group_id):
        raise ValueError("actionGroupId must use only letters, numbers, dot, underscore, dash (max 64 chars)")
    return group_id


def normalize_color(value: Any, default: str = DEFAULT_OBJECT_COLOR) -> str:
    raw = str(value or default).strip()
    if COLOR_PATTERN.fullmatch(raw):
        return raw.lower()
    return default


def discover_show_paths() -> List[str]:
    showfiles_root = PROJECT_ROOT / "showfiles"
    if not showfiles_root.is_dir():
        return []

    paths: List[str] = []
    for candidate in showfiles_root.rglob("show.json"):
        if "_schema" in candidate.parts:
            continue
        relative = str(candidate.relative_to(PROJECT_ROOT)).replace("\\", "/")
        paths.append(relative)

    unique_sorted = sorted(set(paths))
    template_path = "showfiles/_template/show.json"
    if template_path in unique_sorted:
        unique_sorted.remove(template_path)
        unique_sorted.insert(0, template_path)
    return unique_sorted


def normalize_show_id(value: Any) -> str:
    show_id = str(value or "").strip().lower()
    show_id = re.sub(r"[^a-z0-9-]+", "-", show_id)
    show_id = re.sub(r"-+", "-", show_id).strip("-")
    if not show_id:
        show_id = "new-show"
    if not SHOW_ID_PATTERN.fullmatch(show_id):
        raise ValueError("show_id must use only lowercase letters, numbers, and dash")
    return show_id


def normalize_show_version(value: Any, default: str = "0.1.0") -> str:
    version = str(value or default).strip()
    if VERSION_PATTERN.fullmatch(version):
        return version
    return default


def normalize_link_params(values: Any) -> List[str]:
    if not isinstance(values, list):
        return []
    normalized: List[str] = []
    seen = set()
    for value in values:
        param = str(value or "").strip()
        if param in LINKABLE_GROUP_PARAMS and param not in seen:
            normalized.append(param)
            seen.add(param)
    return normalized


def normalize_object_group(raw_group: Dict[str, Any], fallback_id: str, known_object_ids: Optional[set[str]] = None) -> Dict[str, Any]:
    group_id = normalize_object_id(raw_group.get("group_id") if "group_id" in raw_group else raw_group.get("groupId") or fallback_id)
    raw_ids = raw_group.get("object_ids") if "object_ids" in raw_group else raw_group.get("objectIds")
    if not isinstance(raw_ids, list):
        raw_ids = []

    normalized_ids: List[str] = []
    seen_ids = set()
    for raw_id in raw_ids:
        candidate = str(raw_id or "").strip()
        if not candidate:
            continue
        normalized_id = normalize_object_id(candidate)
        if known_object_ids is not None and normalized_id not in known_object_ids:
            continue
        if normalized_id in seen_ids:
            continue
        normalized_ids.append(normalized_id)
        seen_ids.add(normalized_id)
    normalized_ids.sort()

    raw_link_params = raw_group.get("link_params") if "link_params" in raw_group else raw_group.get("linkParams")
    normalized_link_params = normalize_link_params(raw_link_params if isinstance(raw_link_params, list) else [])
    return {
        "groupId": group_id,
        "name": str(raw_group.get("name") or group_id).strip() or group_id,
        "objectIds": normalized_ids,
        "linkParams": normalized_link_params,
        "enabled": bool(raw_group.get("enabled", True)),
        "color": normalize_color(raw_group.get("color"), DEFAULT_GROUP_COLOR),
    }


def object_group_to_raw(group: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "group_id": normalize_object_id(group.get("groupId")),
        "name": str(group.get("name") or group.get("groupId") or "group"),
        "object_ids": [
            normalize_object_id(object_id)
            for object_id in (group.get("objectIds") if isinstance(group.get("objectIds"), list) else [])
            if str(object_id or "").strip()
        ],
        "link_params": normalize_link_params(group.get("linkParams") if isinstance(group.get("linkParams"), list) else []),
        "enabled": bool(group.get("enabled", True)),
        "color": normalize_color(group.get("color"), DEFAULT_GROUP_COLOR),
    }


def normalize_object(input_obj: Dict[str, Any], fallback_id: str) -> Dict[str, Any]:
    object_id = str(input_obj.get("object_id") or input_obj.get("objectId") or fallback_id)
    return {
        "objectId": object_id,
        "x": clamp(to_float(input_obj.get("x"), 0.0), OBJECT_LIMITS["x"]),
        "y": clamp(to_float(input_obj.get("y"), 0.0), OBJECT_LIMITS["y"]),
        "z": clamp(to_float(input_obj.get("z"), 0.0), OBJECT_LIMITS["z"]),
        "size": clamp(to_float(input_obj.get("size"), 25.0), OBJECT_LIMITS["size"]),
        "gain": clamp(to_float(input_obj.get("gain"), 0.0), OBJECT_LIMITS["gain"]),
        "mute": bool(input_obj.get("mute", False)),
        "algorithm": str(input_obj.get("algorithm") or "default"),
        "type": str(input_obj.get("type") or DEFAULT_OBJECT_TYPE),
        "color": normalize_color(input_obj.get("color"), DEFAULT_OBJECT_COLOR),
        "hidden": bool(input_obj.get("hidden", False)),
        "excludeFromAll": bool(input_obj.get("exclude_from_all") if "exclude_from_all" in input_obj else input_obj.get("excludeFromAll", False)),
    }


def normalize_lfo_definition(raw_lfo: Dict[str, Any], fallback_lfo_id: str = "lfo") -> Dict[str, Any]:
    wave = str(raw_lfo.get("wave") or "sine").strip().lower()
    if wave not in LFO_WAVES:
        raise ValueError(f"LFO wave must be one of: {', '.join(sorted(LFO_WAVES))}")

    rate_hz = max(0.0, to_float(raw_lfo.get("rate_hz") if "rate_hz" in raw_lfo else raw_lfo.get("rateHz"), 0.0))
    depth = to_float(raw_lfo.get("depth"), 0.0)
    offset = to_float(raw_lfo.get("offset"), 0.0)
    phase_deg = to_float(raw_lfo.get("phase_deg") if "phase_deg" in raw_lfo else raw_lfo.get("phaseDeg"), 0.0)
    polarity = normalize_lfo_polarity(raw_lfo.get("polarity"))
    raw_lfo_id = raw_lfo.get("lfo_id") if "lfo_id" in raw_lfo else raw_lfo.get("lfoId")
    lfo_id = normalize_lfo_id(raw_lfo_id or fallback_lfo_id)

    return {
        "lfoId": lfo_id,
        "enabled": bool(raw_lfo.get("enabled", True)),
        "wave": wave,
        "rateHz": rate_hz,
        "depth": depth,
        "offset": offset,
        "phaseDeg": phase_deg,
        "polarity": polarity,
    }


def normalize_action_lfo_mapping(raw_lfo: Dict[str, Any], fallback_lfo_id: str = "lfo") -> Dict[str, Any]:
    target_scope = normalize_lfo_target_scope(raw_lfo.get("targetScope", raw_lfo.get("target_scope")))
    raw_object_id = raw_lfo.get("object_id") if "object_id" in raw_lfo else raw_lfo.get("objectId")
    raw_group_id = raw_lfo.get("group_id") if "group_id" in raw_lfo else raw_lfo.get("groupId")
    object_id_text = str(raw_object_id or "").strip()
    group_id_text = str(raw_group_id or "").strip()
    parameter = str(raw_lfo.get("parameter") or "").strip().lower()

    # Backward compatibility: infer group scope when only a group target is present.
    if target_scope == LFO_TARGET_SCOPE_OBJECT and group_id_text and not object_id_text:
        target_scope = LFO_TARGET_SCOPE_GROUP

    if target_scope == LFO_TARGET_SCOPE_GROUP:
        if not group_id_text and not parameter and not object_id_text:
            object_id = ""
            group_id = ""
        else:
            if not group_id_text:
                raise ValueError("LFO group target requires groupId")
            if parameter not in LFO_PARAMS and parameter != LFO_TARGET_PARAM_ALL:
                raise ValueError(f"LFO parameter must be one of: all, {', '.join(sorted(LFO_PARAMS))}")
            group_id = normalize_object_id(group_id_text)
            object_id = ""
    elif object_id_text and parameter:
        if not is_lfo_target_parameter(parameter, target_scope):
            raise ValueError(f"LFO parameter must be one of: {', '.join(sorted(LFO_PARAMS))}")
        object_id = normalize_object_id(object_id_text)
        group_id = ""
    elif not object_id_text and not group_id_text and not parameter:
        # Allow unassigned mappings so LFO definitions can exist before targets are configured.
        object_id = ""
        group_id = ""
    else:
        if not is_lfo_target_parameter(parameter, target_scope):
            raise ValueError(f"LFO parameter must be one of: {', '.join(sorted(LFO_PARAMS))}")
        raise ValueError("LFO target requires objectId and parameter (or groupId and parameter with targetScope=group)")

    mapping_phase_deg = to_float(
        raw_lfo.get("mapping_phase_deg") if "mapping_phase_deg" in raw_lfo else raw_lfo.get("mappingPhaseDeg"),
        0.0,
    )
    phase_flip = bool(raw_lfo.get("phase_flip") if "phase_flip" in raw_lfo else raw_lfo.get("phaseFlip", False))
    distribute_phase_over_members = bool(
        raw_lfo.get("distribute_phase_over_members")
        if "distribute_phase_over_members" in raw_lfo
        else raw_lfo.get("distributePhaseOverMembers", False)
    ) and target_scope == LFO_TARGET_SCOPE_GROUP
    target_enabled = bool(raw_lfo.get("target_enabled") if "target_enabled" in raw_lfo else raw_lfo.get("targetEnabled", True))
    raw_lfo_id = raw_lfo.get("lfo_id") if "lfo_id" in raw_lfo else raw_lfo.get("lfoId")
    lfo_id = normalize_lfo_id(raw_lfo_id or fallback_lfo_id)

    return {
        "lfoId": lfo_id,
        "targetScope": target_scope,
        "objectId": object_id,
        "groupId": group_id,
        "parameter": parameter,
        "mappingPhaseDeg": mapping_phase_deg,
        "phaseFlip": phase_flip,
        "distributePhaseOverMembers": distribute_phase_over_members,
        "targetEnabled": target_enabled,
    }


def merge_lfo_definition_into_mapping(mapping: Dict[str, Any], definition: Dict[str, Any]) -> Dict[str, Any]:
    target_scope = normalize_lfo_target_scope(mapping.get("targetScope", mapping.get("target_scope", LFO_TARGET_SCOPE_OBJECT)))
    object_id = ""
    group_id = ""
    if target_scope == LFO_TARGET_SCOPE_GROUP:
        raw_group_id = str(mapping.get("groupId") or mapping.get("group_id") or "").strip()
        if raw_group_id:
            try:
                group_id = normalize_object_id(raw_group_id)
            except Exception:
                group_id = ""
    else:
        raw_object_id = str(mapping.get("objectId") or mapping.get("object_id") or "").strip()
        if raw_object_id:
            try:
                object_id = normalize_object_id(raw_object_id)
            except Exception:
                object_id = ""
    return {
        "lfoId": normalize_lfo_id(mapping.get("lfoId") or definition.get("lfoId") or "lfo"),
        "enabled": bool(definition.get("enabled", True)),
        "targetEnabled": bool(mapping.get("targetEnabled", True)),
        "targetScope": target_scope,
        "objectId": object_id,
        "groupId": group_id,
        "parameter": str(mapping.get("parameter") or ""),
        "wave": str(definition.get("wave") or "sine"),
        "rateHz": max(0.0, to_float(definition.get("rateHz"), 0.0)),
        "depth": to_float(definition.get("depth"), 0.0),
        "offset": to_float(definition.get("offset"), 0.0),
        "phaseDeg": to_float(definition.get("phaseDeg"), 0.0),
        "mappingPhaseDeg": to_float(mapping.get("mappingPhaseDeg"), 0.0),
        "phaseFlip": bool(mapping.get("phaseFlip", False)),
        "distributePhaseOverMembers": bool(mapping.get("distributePhaseOverMembers", False)),
        "polarity": coerce_lfo_polarity(definition.get("polarity")),
    }


def normalize_action_lfo(raw_lfo: Dict[str, Any], fallback_lfo_id: str = "lfo") -> Dict[str, Any]:
    definition = normalize_lfo_definition(raw_lfo, fallback_lfo_id)
    mapping = normalize_action_lfo_mapping(raw_lfo, definition["lfoId"])
    return merge_lfo_definition_into_mapping(mapping, definition)


def normalize_global_lfos(raw_lfos: Any) -> Dict[str, Dict[str, Any]]:
    if isinstance(raw_lfos, dict):
        candidate_values = list(raw_lfos.values())
    elif isinstance(raw_lfos, list):
        candidate_values = raw_lfos
    else:
        candidate_values = []

    normalized: Dict[str, Dict[str, Any]] = {}
    generated_index = 1
    for item in candidate_values:
        if not isinstance(item, dict):
            continue
        raw_lfo_id = str(item.get("lfo_id") if "lfo_id" in item else item.get("lfoId") or "").strip()
        fallback_lfo_id = raw_lfo_id
        if not fallback_lfo_id:
            fallback_lfo_id = f"lfo-{generated_index}"
            generated_index += 1
        definition = normalize_lfo_definition(item, fallback_lfo_id)
        normalized[definition["lfoId"]] = definition
    return normalized


def collect_global_lfos_from_actions(actions_by_id: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    collected: Dict[str, Dict[str, Any]] = {}
    for action in actions_by_id.values():
        lfos = action.get("lfos")
        if not isinstance(lfos, list):
            continue
        for lfo in lfos:
            if not isinstance(lfo, dict):
                continue
            raw_lfo_id = str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip()
            if not raw_lfo_id:
                continue
            definition = normalize_lfo_definition(lfo, raw_lfo_id)
            collected[definition["lfoId"]] = definition
    return collected


def sync_action_lfo_snapshots_with_global(
    actions_by_id: Dict[str, Dict[str, Any]],
    global_lfos_by_id: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    next_global = dict(global_lfos_by_id) if isinstance(global_lfos_by_id, dict) else {}
    if not next_global:
        next_global = collect_global_lfos_from_actions(actions_by_id)

    for action_id, action in actions_by_id.items():
        action_lfos = action.get("lfos")
        if not isinstance(action_lfos, list):
            action["lfos"] = []
            continue

        next_lfos: List[Dict[str, Any]] = []
        for index, raw_lfo in enumerate(action_lfos):
            if not isinstance(raw_lfo, dict):
                continue
            fallback_lfo_id = str(raw_lfo.get("lfoId") or raw_lfo.get("lfo_id") or "").strip() or f"lfo-{index + 1}"
            normalized_mapping = normalize_action_lfo_mapping(raw_lfo, fallback_lfo_id)
            lfo_id = normalized_mapping["lfoId"]
            definition = next_global.get(lfo_id)
            if not isinstance(definition, dict):
                definition = normalize_lfo_definition(raw_lfo, lfo_id)
                next_global[lfo_id] = definition
            else:
                definition = normalize_lfo_definition(definition, lfo_id)
                next_global[lfo_id] = definition
            next_lfos.append(merge_lfo_definition_into_mapping(normalized_mapping, definition))
        action["lfos"] = next_lfos
        actions_by_id[action_id] = action
    return next_global


def normalize_action(raw_action: Dict[str, Any], fallback_id: str) -> Dict[str, Any]:
    action_id = normalize_action_id(raw_action.get("action_id") or raw_action.get("actionId") or fallback_id)
    osc_triggers_raw = raw_action.get("osc_triggers") if "osc_triggers" in raw_action else raw_action.get("oscTriggers")
    if not isinstance(osc_triggers_raw, dict):
        osc_triggers_raw = {}
    action_rule_raw = raw_action.get("action_rule") if "action_rule" in raw_action else raw_action.get("actionRule")
    action_rule = normalize_action_rule(action_rule_raw)

    tracks = raw_action.get("tracks", [])
    if not isinstance(tracks, list):
        tracks = []

    on_end_action_id = str(
        raw_action.get("on_end_action_id") if "on_end_action_id" in raw_action else raw_action.get("onEndActionId", "")
    ).strip()
    if on_end_action_id:
        on_end_action_id = normalize_action_id(on_end_action_id)

    lfos_raw = raw_action.get("lfos", [])
    if not isinstance(lfos_raw, list):
        lfos_raw = []

    normalized_lfos: List[Dict[str, Any]] = []
    used_generated_lfo_ids: set[str] = set()
    assigned_lfo_ids: set[str] = set()
    generated_index = 1
    for raw_lfo in lfos_raw:
        if not isinstance(raw_lfo, dict):
            continue
        raw_lfo_id = str(raw_lfo.get("lfo_id") if "lfo_id" in raw_lfo else raw_lfo.get("lfoId") or "").strip()
        fallback_lfo_id = raw_lfo_id
        if not fallback_lfo_id:
            while True:
                candidate = f"lfo-{generated_index}"
                generated_index += 1
                if candidate in used_generated_lfo_ids:
                    continue
                if candidate in assigned_lfo_ids:
                    continue
                fallback_lfo_id = candidate
                used_generated_lfo_ids.add(candidate)
                break
        normalized_lfo = normalize_action_lfo(raw_lfo, fallback_lfo_id)
        normalized_lfos.append(normalized_lfo)
        assigned_lfo_ids.add(str(normalized_lfo.get("lfoId") or ""))

    return {
        "actionId": action_id,
        "name": str(raw_action.get("name") or action_id),
        "enabled": bool(raw_action.get("enabled", True)),
        "durationMs": int(max(0.0, to_float(raw_action.get("duration_ms") if "duration_ms" in raw_action else raw_action.get("durationMs"), 0.0))),
        "actionRule": action_rule,
        "tracks": tracks,
        "lfos": normalized_lfos,
        "onEndActionId": on_end_action_id,
        "oscTriggers": {
            "start": str(osc_triggers_raw.get("start", "")),
            "stop": str(osc_triggers_raw.get("stop", "")),
            "abort": str(osc_triggers_raw.get("abort", "")),
        },
    }


def lfo_to_raw(lfo: Dict[str, Any]) -> Dict[str, Any]:
    object_id = str(lfo.get("objectId") or "").strip()
    group_id = str(lfo.get("groupId") or "").strip()
    target_scope = normalize_lfo_target_scope(lfo.get("targetScope", lfo.get("target_scope", "")))
    parameter = str(lfo.get("parameter") or "").strip()
    raw = {
        "lfo_id": normalize_lfo_id(lfo.get("lfoId") or "lfo-1"),
        "enabled": bool(lfo.get("enabled", True)),
        "wave": str(lfo.get("wave") or "sine"),
        "rate_hz": to_float(lfo.get("rateHz"), 0.0),
        "depth": to_float(lfo.get("depth"), 0.0),
        "offset": to_float(lfo.get("offset"), 0.0),
        "phase_deg": to_float(lfo.get("phaseDeg"), 0.0),
        "mapping_phase_deg": to_float(lfo.get("mappingPhaseDeg"), 0.0),
        "phase_flip": bool(lfo.get("phaseFlip", False)),
        "distribute_phase_over_members": bool(lfo.get("distributePhaseOverMembers", False)),
        "target_enabled": bool(lfo.get("targetEnabled", True)),
        "polarity": coerce_lfo_polarity(lfo.get("polarity")),
    }
    if target_scope == LFO_TARGET_SCOPE_OBJECT and object_id and is_lfo_target_parameter(parameter, target_scope):
        raw["object_id"] = normalize_object_id(object_id)
        raw["target_scope"] = LFO_TARGET_SCOPE_OBJECT
        raw["parameter"] = parameter
    elif target_scope == LFO_TARGET_SCOPE_GROUP and group_id and is_lfo_target_parameter(parameter, target_scope):
        raw["group_id"] = normalize_object_id(group_id)
        raw["target_scope"] = LFO_TARGET_SCOPE_GROUP
        raw["parameter"] = parameter
    return raw


def lfo_definition_to_raw(lfo: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "lfo_id": normalize_lfo_id(lfo.get("lfoId") or "lfo-1"),
        "enabled": bool(lfo.get("enabled", True)),
        "wave": str(lfo.get("wave") or "sine"),
        "rate_hz": to_float(lfo.get("rateHz"), 0.0),
        "depth": to_float(lfo.get("depth"), 0.0),
        "offset": to_float(lfo.get("offset"), 0.0),
        "phase_deg": to_float(lfo.get("phaseDeg"), 0.0),
        "polarity": coerce_lfo_polarity(lfo.get("polarity")),
    }


def action_to_raw(action: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "action_id": normalize_action_id(action.get("actionId")),
        "name": str(action.get("name") or action.get("actionId") or "action"),
        "enabled": bool(action.get("enabled", True)),
        "duration_ms": int(max(0.0, to_float(action.get("durationMs"), 0.0))),
        "action_rule": action_rule_to_raw(action.get("actionRule")),
        "on_end_action_id": str(action.get("onEndActionId") or ""),
        "tracks": action.get("tracks", []) if isinstance(action.get("tracks"), list) else [],
        "lfos": [lfo_to_raw(lfo) for lfo in (action.get("lfos") if isinstance(action.get("lfos"), list) else [])],
        "osc_triggers": {
            "start": str(action.get("oscTriggers", {}).get("start", "")),
            "stop": str(action.get("oscTriggers", {}).get("stop", "")),
            "abort": str(action.get("oscTriggers", {}).get("abort", "")),
        },
    }


def normalize_action_group_entry(raw_entry: Dict[str, Any]) -> Dict[str, Any]:
    entry_type = str(raw_entry.get("entry_type") if "entry_type" in raw_entry else raw_entry.get("entryType") or "").strip().lower()
    if entry_type in {"lfos_enabled", "lfosenabled"}:
        return {
            "entryType": "lfosEnabled",
            "enabled": bool(raw_entry.get("enabled", True)),
        }
    if entry_type in {"action_lfo_enable", "action_lfo_disable", "action_lfo_enabled", "actionlfoenabled"}:
        default_enabled = entry_type not in {"action_lfo_disable"}
        action_id = normalize_action_id(raw_entry.get("action_id") if "action_id" in raw_entry else raw_entry.get("actionId"))
        lfo_id = normalize_lfo_id(raw_entry.get("lfo_id") if "lfo_id" in raw_entry else raw_entry.get("lfoId"))
        return {
            "entryType": "actionLfoEnabled",
            "actionId": action_id,
            "lfoId": lfo_id,
            "enabled": bool(raw_entry.get("enabled", default_enabled)),
        }

    if entry_type in {"action_start", "action_stop", "action_abort"}:
        command = entry_type.split("_", 1)[1]
    else:
        command = str(raw_entry.get("command") or "start").strip().lower()

    if command not in ACTION_GROUP_ACTION_COMMANDS:
        raise ValueError(f"action group entry command must be one of: {', '.join(sorted(ACTION_GROUP_ACTION_COMMANDS))}")

    action_id = normalize_action_id(raw_entry.get("action_id") if "action_id" in raw_entry else raw_entry.get("actionId"))
    return {
        "entryType": "action",
        "actionId": action_id,
        "command": command,
    }


def normalize_action_group(raw_group: Dict[str, Any], fallback_id: str) -> Dict[str, Any]:
    group_id = normalize_action_group_id(raw_group.get("group_id") or raw_group.get("groupId") or fallback_id)
    osc_triggers_raw = raw_group.get("osc_triggers") if "osc_triggers" in raw_group else raw_group.get("oscTriggers")
    if not isinstance(osc_triggers_raw, dict):
        osc_triggers_raw = {}

    entries_raw = raw_group.get("entries", [])
    if not isinstance(entries_raw, list):
        entries_raw = []

    entries: List[Dict[str, Any]] = []
    for raw_entry in entries_raw:
        if not isinstance(raw_entry, dict):
            continue
        entries.append(normalize_action_group_entry(raw_entry))

    return {
        "groupId": group_id,
        "name": str(raw_group.get("name") or group_id),
        "enabled": bool(raw_group.get("enabled", True)),
        "entries": entries,
        "oscTriggers": {
            "trigger": str(osc_triggers_raw.get("trigger", "")),
        },
    }


def action_group_entry_to_raw(entry: Dict[str, Any]) -> Dict[str, Any]:
    entry_type = str(entry.get("entryType") or "").strip()
    if entry_type == "lfosEnabled":
        return {
            "entry_type": "lfos_enabled",
            "enabled": bool(entry.get("enabled", True)),
        }
    if entry_type == "actionLfoEnabled":
        return {
            "entry_type": "action_lfo_enabled",
            "action_id": normalize_action_id(entry.get("actionId")),
            "lfo_id": normalize_lfo_id(entry.get("lfoId")),
            "enabled": bool(entry.get("enabled", True)),
        }
    return {
        "entry_type": "action",
        "action_id": normalize_action_id(entry.get("actionId")),
        "command": str(entry.get("command") or "start"),
    }


def action_group_to_raw(group: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "group_id": normalize_action_group_id(group.get("groupId")),
        "name": str(group.get("name") or group.get("groupId") or "group"),
        "enabled": bool(group.get("enabled", True)),
        "entries": [
            action_group_entry_to_raw(entry)
            for entry in (group.get("entries") if isinstance(group.get("entries"), list) else [])
            if isinstance(entry, dict)
        ],
        "osc_triggers": {
            "trigger": str(group.get("oscTriggers", {}).get("trigger", "")),
        },
    }


def default_object(object_id: str) -> Dict[str, Any]:
    return normalize_object({"object_id": object_id}, object_id)


def osc_pad4(length: int) -> int:
    return (4 - (length % 4)) % 4


def osc_encode_string(value: str) -> bytes:
    raw = value.encode("utf-8") + b"\x00"
    return raw + (b"\x00" * osc_pad4(len(raw)))


def encode_osc_message(address: str, args: List[Any]) -> bytes:
    types = ","
    payload = []

    for arg in args:
        if isinstance(arg, str):
            types += "s"
            payload.append(osc_encode_string(arg))
        elif isinstance(arg, bool):
            types += "i"
            payload.append(struct.pack(">i", 1 if arg else 0))
        elif isinstance(arg, int):
            types += "i"
            payload.append(struct.pack(">i", arg))
        elif isinstance(arg, float):
            types += "f"
            payload.append(struct.pack(">f", arg))
        else:
            types += "s"
            payload.append(osc_encode_string(str(arg)))

    return b"".join([osc_encode_string(address), osc_encode_string(types), *payload])


def osc_read_string(data: bytes, offset: int) -> Tuple[str, int]:
    cursor = offset
    while cursor < len(data) and data[cursor] != 0:
        cursor += 1
    value = data[offset:cursor].decode("utf-8", errors="replace")
    cursor += 1
    while cursor % 4 != 0:
        cursor += 1
    return value, cursor


def decode_osc_message(data: bytes) -> Dict[str, Any]:
    address, offset = osc_read_string(data, 0)
    if address == "#bundle":
        raise ValueError("OSC bundles not supported in scaffold")

    tags, offset = osc_read_string(data, offset)
    if not tags.startswith(","):
        tags = ","

    args: List[Any] = []
    for tag in tags[1:]:
        if tag == "i":
            args.append(struct.unpack_from(">i", data, offset)[0])
            offset += 4
        elif tag == "f":
            args.append(struct.unpack_from(">f", data, offset)[0])
            offset += 4
        elif tag == "s":
            value, offset = osc_read_string(data, offset)
            args.append(value)
        elif tag == "T":
            args.append(True)
        elif tag == "F":
            args.append(False)
        else:
            raise ValueError(f"Unsupported OSC type tag: {tag}")

    return {"address": address, "args": args}


class Runtime:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.show: Optional[Dict[str, Any]] = None
        self.objects: Dict[str, Dict[str, Any]] = {}
        self.object_groups: Dict[str, Dict[str, Any]] = {}
        self.selected_object_ids: List[str] = []
        self.selected_group_id: Optional[str] = None
        self.groups_enabled = True
        self.lfos_enabled = True
        self.active_scene_id: Optional[str] = None
        self.running_actions: Dict[str, Dict[str, Any]] = {}

        self.osc_inbound_count = 0
        self.osc_outbound_count = 0
        self.last_inbound_at: Optional[str] = None
        self.last_outbound_at: Optional[str] = None
        self.last_inbound_address: Optional[str] = None
        self.last_outbound_address: Optional[str] = None

        self.sequence = 1
        self.recent_events: List[Dict[str, Any]] = []
        self.max_recent_events = 250
        self.event_queues: List[queue.Queue] = []
        self.last_lfo_debug_emit_ms: Dict[str, int] = {}
        self.always_lfo_target_states: Dict[str, Dict[str, float]] = {}
        self.always_lfo_phase_ms_by_id: Dict[str, float] = {}
        self.last_client_update_seq_by_object: Dict[Tuple[str, str], int] = {}
        self.last_client_center_target_by_key: Dict[Tuple[str, str, str, str], float] = {}

        # Load persisted OSC routing/transport config before sockets are created.
        persisted_osc_config = load_persisted_osc_runtime_config(current_osc_runtime_config())
        apply_runtime_osc_config(persisted_osc_config)

        self.osc_out_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.osc_in_socket = self._create_osc_in_socket(CONFIG["osc_in_port"])

        self.stop_event = threading.Event()
        self.osc_thread = threading.Thread(target=self._osc_loop, daemon=True)
        self.always_lfo_thread = threading.Thread(target=self._always_lfo_loop, daemon=True)

    def start(self) -> None:
        self.load_show("showfiles/_template/show.json")
        self.osc_thread.start()
        self.always_lfo_thread.start()
        self.emit_event(
            "system",
            {
                "message": "server_started",
                "http": f"http://{CONFIG['host']}:{CONFIG['http_port']}",
                "oscOut": f"{CONFIG['osc_out_host']}:{CONFIG['osc_out_port']}",
                "oscIn": f"0.0.0.0:{CONFIG['osc_in_port']}",
                "oscObjectPrefix": CONFIG["osc_object_path_prefix"],
                "oscScenePrefix": CONFIG["osc_scene_path_prefix"],
            },
        )

    def shutdown(self) -> None:
        self.stop_event.set()
        with self.lock:
            for action_id in list(self.running_actions.keys()):
                self.stop_action(action_id, "shutdown")
        try:
            self.osc_in_socket.close()
        except OSError:
            pass
        try:
            self.osc_out_socket.close()
        except OSError:
            pass

    def _create_osc_in_socket(self, port: Any) -> socket.socket:
        normalized_port = normalize_osc_port(port, DEFAULT_OSC_IN_PORT)
        osc_in_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        osc_in_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        osc_in_socket.bind(("0.0.0.0", normalized_port))
        osc_in_socket.settimeout(1.0)
        return osc_in_socket

    def osc_runtime_config(self) -> Dict[str, Any]:
        with self.lock:
            return current_osc_runtime_config()

    def update_osc_runtime_config(self, patch: Dict[str, Any], source: str = "api") -> Dict[str, Any]:
        if not isinstance(patch, dict):
            raise ValueError("Body must be an object")

        with self.lock:
            current = current_osc_runtime_config()
        normalized_patch = normalize_osc_runtime_config(patch, current, partial=True)
        if not normalized_patch:
            return current

        merged = dict(current)
        merged.update(normalized_patch)
        merged = normalize_osc_runtime_config(merged, merged, partial=False)

        replacement_socket: Optional[socket.socket] = None
        if merged["inPort"] != current["inPort"]:
            replacement_socket = self._create_osc_in_socket(merged["inPort"])

        try:
            save_persisted_osc_runtime_config(merged)
        except Exception:
            if replacement_socket is not None:
                try:
                    replacement_socket.close()
                except OSError:
                    pass
            raise

        previous_socket: Optional[socket.socket] = None
        with self.lock:
            apply_runtime_osc_config(merged)
            if replacement_socket is not None:
                previous_socket = self.osc_in_socket
                self.osc_in_socket = replacement_socket
        if previous_socket is not None:
            try:
                previous_socket.close()
            except OSError:
                pass

        self.emit_event(
            "system",
            {
                "message": "osc_config_updated",
                "source": source,
                "oscOut": f"{merged['outHost']}:{merged['outPort']}",
                "oscIn": f"0.0.0.0:{merged['inPort']}",
                "objectPathPrefix": merged["objectPathPrefix"],
                "scenePathPrefix": merged["scenePathPrefix"],
                "actionPathPrefix": merged["actionPathPrefix"],
                "actionGroupPathPrefix": merged["actionGroupPathPrefix"],
            },
        )
        return merged

    def _push_recent_event(self, event: Dict[str, Any]) -> None:
        self.recent_events.append(event)
        while len(self.recent_events) > self.max_recent_events:
            self.recent_events.pop(0)

    def emit_event(self, event_type: str, payload: Dict[str, Any]) -> None:
        with self.lock:
            event = {
                "id": self.sequence,
                "type": event_type,
                "at": now_iso(),
                "payload": payload,
            }
            self.sequence += 1
            self._push_recent_event(event)
            for q in list(self.event_queues):
                try:
                    q.put_nowait(event)
                except queue.Full:
                    pass

    def subscribe_events(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=200)
        with self.lock:
            self.event_queues.append(q)
        return q

    def unsubscribe_events(self, q: queue.Queue) -> None:
        with self.lock:
            if q in self.event_queues:
                self.event_queues.remove(q)

    def status(self) -> Dict[str, Any]:
        with self.lock:
            show_payload = None
            if self.show:
                global_lfos_by_id = self.show.get("globalLfosById")
                if not isinstance(global_lfos_by_id, dict):
                    global_lfos_by_id = {}
                show_payload = {
                    "path": self.show["path"],
                    "showId": self.show["showId"],
                    "name": self.show["name"],
                    "version": self.show["version"],
                    "defaultSceneId": self.show["defaultSceneId"],
                    "loadedAt": self.show["loadedAt"],
                    "sceneIds": sorted(self.show["scenesById"].keys()),
                    "actionIds": sorted(self.show["actionsById"].keys()),
                    "actionsById": json.loads(json.dumps(self.show["actionsById"])),
                    "globalLfoIds": sorted(global_lfos_by_id.keys()),
                    "globalLfosById": json.loads(json.dumps(global_lfos_by_id)),
                    "actionGroupIds": sorted(self.show["actionGroupsById"].keys()),
                    "actionGroupsById": json.loads(json.dumps(self.show["actionGroupsById"])),
                }

            selected_object_ids = [
                object_id
                for object_id in self.selected_object_ids
                if object_id in self.objects
            ]
            selected_group_id = str(self.selected_group_id or "").strip()
            if selected_group_id and selected_group_id.lower() != VIRTUAL_ALL_GROUP_ID and selected_group_id not in self.object_groups:
                selected_group_id = ""

            running_action_details = {
                action_id: {
                    "source": str(payload.get("source") or ""),
                    "startedAtMs": int(to_float(payload.get("startedAtMs"), 0.0)),
                }
                for action_id, payload in self.running_actions.items()
            }

            return {
                "mode": CONFIG["mode"],
                "server": {"host": CONFIG["host"], "httpPort": CONFIG["http_port"]},
                "osc": {
                    "outHost": CONFIG["osc_out_host"],
                    "outPort": CONFIG["osc_out_port"],
                    "inPort": CONFIG["osc_in_port"],
                    "objectPathPrefix": CONFIG["osc_object_path_prefix"],
                    "scenePathPrefix": CONFIG["osc_scene_path_prefix"],
                    "actionPathPrefix": CONFIG["osc_action_path_prefix"],
                    "actionGroupPathPrefix": CONFIG["osc_action_group_path_prefix"],
                    "inboundCount": self.osc_inbound_count,
                    "outboundCount": self.osc_outbound_count,
                    "lastInboundAt": self.last_inbound_at,
                    "lastOutboundAt": self.last_outbound_at,
                    "lastInboundAddress": self.last_inbound_address,
                    "lastOutboundAddress": self.last_outbound_address,
                },
                "show": show_payload,
                "activeSceneId": self.active_scene_id,
                "runningActions": sorted(self.running_actions.keys()),
                "runningActionDetails": running_action_details,
                "groupsEnabled": self.groups_enabled,
                "lfosEnabled": self.lfos_enabled,
                "selectedObjectIds": selected_object_ids,
                "selectedGroupId": selected_group_id,
                "objectGroups": list(self.object_groups.values()),
                "objects": list(self.objects.values()),
            }

    def _sanitize_project_path(self, requested: str, default_path: str = "showfiles/_template/show.json") -> Path:
        requested_path = (requested or "").strip()
        if not requested_path:
            requested_path = (default_path or "").strip()
        if not requested_path:
            raise ValueError("Path is required")
        if requested_path.endswith("/"):
            raise ValueError("Path must point to a file, not a folder")
        absolute = (PROJECT_ROOT / requested_path).resolve()
        if PROJECT_ROOT not in absolute.parents and absolute != PROJECT_ROOT:
            raise ValueError("Path must stay inside project root")
        if absolute.exists() and absolute.is_dir():
            raise ValueError("Path must point to a file, not a folder")
        return absolute

    def _relative_project_path(self, absolute_path: Path) -> str:
        return str(absolute_path.relative_to(PROJECT_ROOT)).replace("\\", "/")

    def _write_json_atomic(self, absolute_path: Path, payload: Dict[str, Any]) -> None:
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = absolute_path.with_suffix(absolute_path.suffix + ".tmp")
        temp_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        os.replace(temp_path, absolute_path)

    def _resolve_show_asset_path(self, show_dir: Path, file_ref: str, label: str) -> Path:
        normalized_ref = str(file_ref or "").strip().replace("\\", "/")
        if not normalized_ref:
            raise ValueError(f"{label} file path cannot be empty")
        if normalized_ref.startswith("/"):
            raise ValueError(f"{label} file path must be relative to show directory")
        absolute = (show_dir / normalized_ref).resolve()
        if show_dir not in absolute.parents and absolute != show_dir:
            raise ValueError(f"{label} file path must stay inside show directory")
        if PROJECT_ROOT not in absolute.parents and absolute != PROJECT_ROOT:
            raise ValueError(f"{label} file path must stay inside project root")
        return absolute

    def _scene_object_to_raw(self, obj: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "object_id": str(obj.get("objectId") or obj.get("object_id") or "obj-1"),
            "x": clamp(to_float(obj.get("x"), 0.0), OBJECT_LIMITS["x"]),
            "y": clamp(to_float(obj.get("y"), 0.0), OBJECT_LIMITS["y"]),
            "z": clamp(to_float(obj.get("z"), 0.0), OBJECT_LIMITS["z"]),
            "size": clamp(to_float(obj.get("size"), 25.0), OBJECT_LIMITS["size"]),
            "gain": clamp(to_float(obj.get("gain"), 0.0), OBJECT_LIMITS["gain"]),
            "mute": bool(obj.get("mute", False)),
            "algorithm": str(obj.get("algorithm") or "default"),
            "hidden": bool(obj.get("hidden", False)),
        }

    def _sanitize_action_links(self, actions_by_id: Dict[str, Dict[str, Any]]) -> None:
        known_ids = set(actions_by_id.keys())
        for action_id, action in actions_by_id.items():
            on_end_action_id = str(action.get("onEndActionId") or "").strip()
            if not on_end_action_id:
                action["onEndActionId"] = ""
                continue
            if on_end_action_id == action_id or on_end_action_id not in known_ids:
                action["onEndActionId"] = ""

    def _sanitize_action_group_links(
        self,
        action_groups_by_id: Dict[str, Dict[str, Any]],
        actions_by_id: Dict[str, Dict[str, Any]],
    ) -> None:
        known_action_ids = set(actions_by_id.keys())
        known_lfo_ids_by_action: Dict[str, set[str]] = {}
        for action_id, action in actions_by_id.items():
            lfo_ids = set()
            for lfo in (action.get("lfos") if isinstance(action.get("lfos"), list) else []):
                if not isinstance(lfo, dict):
                    continue
                lfo_id = str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip()
                if lfo_id:
                    lfo_ids.add(lfo_id)
            known_lfo_ids_by_action[action_id] = lfo_ids
        for group in action_groups_by_id.values():
            entries = group.get("entries")
            if not isinstance(entries, list):
                group["entries"] = []
                continue

            sanitized_entries: List[Dict[str, Any]] = []
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                entry_type = str(entry.get("entryType") or "").strip()
                if entry_type == "lfosEnabled":
                    sanitized_entries.append(
                        {
                            "entryType": "lfosEnabled",
                            "enabled": bool(entry.get("enabled", True)),
                        }
                    )
                    continue
                if entry_type == "actionLfoEnabled":
                    action_id = str(entry.get("actionId") or "").strip()
                    lfo_id = str(entry.get("lfoId") or "").strip()
                    if action_id not in known_action_ids or not lfo_id:
                        continue
                    if lfo_id not in known_lfo_ids_by_action.get(action_id, set()):
                        continue
                    sanitized_entries.append(
                        {
                            "entryType": "actionLfoEnabled",
                            "actionId": action_id,
                            "lfoId": lfo_id,
                            "enabled": bool(entry.get("enabled", True)),
                        }
                    )
                    continue
                if entry_type != "action":
                    continue
                action_id = str(entry.get("actionId") or "").strip()
                command = str(entry.get("command") or "start").strip().lower()
                if action_id not in known_action_ids:
                    continue
                if command not in ACTION_GROUP_ACTION_COMMANDS:
                    continue
                sanitized_entries.append(
                    {
                        "entryType": "action",
                        "actionId": action_id,
                        "command": command,
                    }
                )

            group["entries"] = sanitized_entries

    def _derive_show_id_from_path(self, show_path: Path) -> str:
        if show_path.name.lower() == "show.json":
            return normalize_show_id(show_path.parent.name or "new-show")
        return normalize_show_id(show_path.stem or "new-show")

    def _derive_show_name(self, show_id: str) -> str:
        words = [part for part in show_id.split("-") if part]
        if not words:
            return "New Show"
        return " ".join(word.capitalize() for word in words)

    def create_new_show(self, show_path: str, overwrite: bool = False) -> Dict[str, Any]:
        requested = str(show_path or "").strip()
        if not requested:
            raise ValueError("New show path is required")

        absolute_show_path = self._sanitize_project_path(requested, default_path="")
        if absolute_show_path.exists() and not overwrite:
            raise ValueError("Show file already exists")

        show_id = self._derive_show_id_from_path(absolute_show_path)
        show_name = self._derive_show_name(show_id)
        show_version = "0.1.0"
        timestamp = now_iso()

        scene_id = "scene-main"
        scene_file = f"scenes/{scene_id}.json"
        show_dir = absolute_show_path.parent
        absolute_scene_path = self._resolve_show_asset_path(show_dir, scene_file, f"Scene '{scene_id}'")

        scene_payload = {
            "scene_id": scene_id,
            "name": "Main",
            "transition_ms": 0,
            "objects": [],
        }
        show_payload = {
            "show_id": show_id,
            "name": show_name,
            "version": show_version,
            "created_at": timestamp,
            "updated_at": timestamp,
            "default_scene_id": scene_id,
            "scenes": [{"scene_id": scene_id, "file": scene_file}],
            "actions": [],
            "global_lfos": [],
            "action_groups": [],
            "groups_enabled": True,
            "object_groups": [],
            "metadata": {"created_by": "amadeus-panner-ui"},
        }

        self._write_json_atomic(absolute_scene_path, scene_payload)
        self._write_json_atomic(absolute_show_path, show_payload)
        validate_show_bundle(PROJECT_ROOT, absolute_show_path)

        relative_path = self._relative_project_path(absolute_show_path)
        self.load_show(relative_path)
        self.emit_event(
            "show",
            {
                "status": "created",
                "showId": show_id,
                "path": relative_path,
            },
        )
        return {"path": relative_path, "showId": show_id, "name": show_name}

    def save_show(
        self,
        show_path: Optional[str] = None,
        set_as_current: bool = True,
        capture_runtime_scene: bool = True,
    ) -> Dict[str, Any]:
        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            show_snapshot = json.loads(json.dumps(self.show))
            objects_snapshot = json.loads(json.dumps(list(self.objects.values())))
            object_groups_snapshot = json.loads(json.dumps(list(self.object_groups.values())))
            groups_enabled_snapshot = bool(self.groups_enabled)
            active_scene_id = str(self.active_scene_id or "")

        source_path = str(show_snapshot.get("path") or "").strip()
        requested_path = str(show_path or "").strip()
        absolute_show_path = self._sanitize_project_path(
            requested_path or source_path,
            default_path=source_path or "showfiles/_template/show.json",
        )
        relative_show_path = self._relative_project_path(absolute_show_path)
        show_dir = absolute_show_path.parent

        show_id = normalize_show_id(show_snapshot.get("showId") or self._derive_show_id_from_path(absolute_show_path))
        show_name = str(show_snapshot.get("name") or self._derive_show_name(show_id)).strip() or self._derive_show_name(show_id)
        show_version = normalize_show_version(show_snapshot.get("version") or "0.1.0")
        created_at = str(show_snapshot.get("createdAt") or now_iso())
        updated_at = now_iso()

        metadata = show_snapshot.get("metadata")
        if not isinstance(metadata, dict):
            metadata = {}

        input_scenes = show_snapshot.get("scenesById")
        if not isinstance(input_scenes, dict):
            input_scenes = {}
        input_actions = show_snapshot.get("actionsById")
        if not isinstance(input_actions, dict):
            input_actions = {}
        input_global_lfos = show_snapshot.get("globalLfosById")
        if not isinstance(input_global_lfos, dict):
            input_global_lfos = show_snapshot.get("globalLfos")
        input_action_groups = show_snapshot.get("actionGroupsById")
        if not isinstance(input_action_groups, dict):
            input_action_groups = {}
        input_object_groups = object_groups_snapshot if isinstance(object_groups_snapshot, list) else []
        scene_files = show_snapshot.get("sceneFiles")
        if not isinstance(scene_files, dict):
            scene_files = {}
        action_files = show_snapshot.get("actionFiles")
        if not isinstance(action_files, dict):
            action_files = {}

        normalized_scenes: Dict[str, Dict[str, Any]] = {}
        for scene_key, raw_scene in input_scenes.items():
            scene_id = str((raw_scene or {}).get("sceneId") or scene_key).strip()
            if not scene_id:
                continue
            objects: List[Dict[str, Any]] = []
            raw_objects = (raw_scene or {}).get("objects", [])
            if isinstance(raw_objects, list):
                for index, obj in enumerate(raw_objects):
                    fallback_id = str((obj or {}).get("objectId") or (obj or {}).get("object_id") or f"{scene_id}-obj-{index + 1}")
                    objects.append(normalize_object(obj or {}, fallback_id))
            normalized_scenes[scene_id] = {
                "sceneId": scene_id,
                "name": str((raw_scene or {}).get("name") or scene_id),
                "transitionMs": int(to_float((raw_scene or {}).get("transitionMs"), 0.0)),
                "objects": objects,
            }

        normalized_actions: Dict[str, Dict[str, Any]] = {}
        for action_key, raw_action in input_actions.items():
            raw_action_input = raw_action if isinstance(raw_action, dict) else {}
            action_id = str(raw_action_input.get("actionId") or raw_action_input.get("action_id") or action_key).strip()
            if not action_id:
                continue
            normalized = normalize_action(raw_action_input, action_id)
            normalized_actions[normalized["actionId"]] = normalized
        normalized_global_lfos = normalize_global_lfos(input_global_lfos)
        normalized_global_lfos = sync_action_lfo_snapshots_with_global(normalized_actions, normalized_global_lfos)

        self._sanitize_action_links(normalized_actions)

        normalized_action_groups: Dict[str, Dict[str, Any]] = {}
        for group_key, raw_group in input_action_groups.items():
            raw_group_input = raw_group if isinstance(raw_group, dict) else {}
            group_id = str(raw_group_input.get("groupId") or raw_group_input.get("group_id") or group_key).strip()
            if not group_id:
                continue
            normalized_group = normalize_action_group(raw_group_input, group_id)
            normalized_action_groups[normalized_group["groupId"]] = normalized_group
        self._sanitize_action_group_links(normalized_action_groups, normalized_actions)

        known_object_ids = {
            str(obj.get("objectId") or "")
            for obj in objects_snapshot
            if isinstance(obj, dict) and str(obj.get("objectId") or "").strip()
        }
        normalized_object_groups: Dict[str, Dict[str, Any]] = {}
        for raw_group in input_object_groups:
            if not isinstance(raw_group, dict):
                continue
            group_id = str(raw_group.get("groupId") or raw_group.get("group_id") or "").strip()
            if not group_id:
                continue
            if group_id.lower() == VIRTUAL_ALL_GROUP_ID:
                continue
            normalized_group = normalize_object_group(
                raw_group,
                group_id,
                known_object_ids=known_object_ids if known_object_ids else None,
            )
            normalized_object_groups[normalized_group["groupId"]] = normalized_group

        default_scene_id = str(show_snapshot.get("defaultSceneId") or "").strip()
        if not default_scene_id:
            if active_scene_id:
                default_scene_id = active_scene_id
            elif normalized_scenes:
                default_scene_id = sorted(normalized_scenes.keys())[0]
            else:
                default_scene_id = "scene-main"

        if capture_runtime_scene:
            capture_scene_id = active_scene_id or default_scene_id
            captured_objects: List[Dict[str, Any]] = []
            for index, obj in enumerate(objects_snapshot):
                fallback_id = str((obj or {}).get("objectId") or (obj or {}).get("object_id") or f"obj-{index + 1}")
                captured_objects.append(normalize_object(obj or {}, fallback_id))

            if capture_scene_id:
                if capture_scene_id not in normalized_scenes:
                    normalized_scenes[capture_scene_id] = {
                        "sceneId": capture_scene_id,
                        "name": capture_scene_id,
                        "transitionMs": 0,
                        "objects": [],
                    }
                normalized_scenes[capture_scene_id]["objects"] = captured_objects

        if default_scene_id not in normalized_scenes:
            normalized_scenes[default_scene_id] = {
                "sceneId": default_scene_id,
                "name": default_scene_id,
                "transitionMs": 0,
                "objects": [],
            }

        scene_refs: List[Dict[str, str]] = []
        updated_scene_files: Dict[str, str] = {}
        for scene_id in sorted(normalized_scenes.keys()):
            scene = normalized_scenes[scene_id]
            scene_file = str(scene_files.get(scene_id) or f"scenes/{scene_id}.json").strip().replace("\\", "/")
            absolute_scene_path = self._resolve_show_asset_path(show_dir, scene_file, f"Scene '{scene_id}'")
            scene_payload = {
                "scene_id": scene_id,
                "name": str(scene.get("name") or scene_id),
                "transition_ms": int(to_float(scene.get("transitionMs"), 0.0)),
                "objects": [self._scene_object_to_raw(obj) for obj in scene.get("objects", [])],
            }
            self._write_json_atomic(absolute_scene_path, scene_payload)
            scene_refs.append({"scene_id": scene_id, "file": scene_file})
            updated_scene_files[scene_id] = scene_file

            normalized_objects = [
                normalize_object(raw_obj, str(raw_obj.get("object_id") or f"{scene_id}-obj-{index + 1}"))
                for index, raw_obj in enumerate(scene_payload["objects"])
            ]
            normalized_scenes[scene_id] = {
                "sceneId": scene_id,
                "name": scene_payload["name"],
                "transitionMs": scene_payload["transition_ms"],
                "objects": normalized_objects,
            }

        action_refs: List[Dict[str, str]] = []
        updated_action_files: Dict[str, str] = {}
        for action_id in sorted(normalized_actions.keys()):
            action = normalized_actions[action_id]
            action_file = str(action_files.get(action_id) or f"actions/{action_id}.json").strip().replace("\\", "/")
            absolute_action_path = self._resolve_show_asset_path(show_dir, action_file, f"Action '{action_id}'")
            action_payload = action_to_raw(action)
            self._write_json_atomic(absolute_action_path, action_payload)
            action_refs.append({"action_id": action_id, "file": action_file})
            updated_action_files[action_id] = action_file

            normalized_actions[action_id] = normalize_action(action_payload, action_id)
        normalized_global_lfos = sync_action_lfo_snapshots_with_global(normalized_actions, normalized_global_lfos)

        show_payload = {
            "show_id": show_id,
            "name": show_name,
            "version": show_version,
            "created_at": created_at,
            "updated_at": updated_at,
            "default_scene_id": default_scene_id,
            "scenes": scene_refs,
            "actions": action_refs,
            "global_lfos": [
                lfo_definition_to_raw(normalized_global_lfos[lfo_id])
                for lfo_id in sorted(normalized_global_lfos.keys())
            ],
            "action_groups": [
                action_group_to_raw(normalized_action_groups[group_id])
                for group_id in sorted(normalized_action_groups.keys())
            ],
            "groups_enabled": bool(groups_enabled_snapshot),
            "object_groups": [
                object_group_to_raw(normalized_object_groups[group_id])
                for group_id in sorted(normalized_object_groups.keys())
            ],
            "metadata": metadata,
        }
        self._write_json_atomic(absolute_show_path, show_payload)
        validate_show_bundle(PROJECT_ROOT, absolute_show_path)

        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            self.show["showId"] = show_id
            self.show["name"] = show_name
            self.show["version"] = show_version
            self.show["createdAt"] = created_at
            self.show["updatedAt"] = updated_at
            self.show["defaultSceneId"] = default_scene_id
            self.show["scenesById"] = normalized_scenes
            self.show["actionsById"] = normalized_actions
            self.show["globalLfosById"] = normalized_global_lfos
            self.show["actionGroupsById"] = normalized_action_groups
            self.show["sceneFiles"] = updated_scene_files
            self.show["actionFiles"] = updated_action_files
            self.show["metadata"] = metadata
            self.object_groups = {group_id: dict(group) for group_id, group in normalized_object_groups.items()}
            self.groups_enabled = bool(groups_enabled_snapshot)
            if set_as_current:
                self.show["path"] = relative_show_path

        self.emit_event(
            "show",
            {
                "status": "saved",
                "path": relative_show_path,
                "setAsCurrent": bool(set_as_current),
                "scenes": len(scene_refs),
                "actions": len(action_refs),
                "globalLfos": len(normalized_global_lfos),
                "actionGroups": len(normalized_action_groups),
                "objectGroups": len(normalized_object_groups),
            },
        )
        return {"path": relative_show_path, "showId": show_id}

    def load_show(self, show_path: str) -> None:
        absolute_show_path = self._sanitize_project_path(show_path)
        bundle = validate_show_bundle(PROJECT_ROOT, absolute_show_path)
        raw_show = bundle.raw_show

        scene_files: Dict[str, str] = {}
        for ref in raw_show.get("scenes", []):
            scene_id = str(ref.get("scene_id") or "").strip()
            file_ref = str(ref.get("file") or "").strip()
            if scene_id and file_ref:
                scene_files[scene_id] = file_ref

        action_files: Dict[str, str] = {}
        for ref in raw_show.get("actions", []):
            action_id = str(ref.get("action_id") or "").strip()
            file_ref = str(ref.get("file") or "").strip()
            if action_id and file_ref:
                action_files[action_id] = file_ref

        scenes_by_id: Dict[str, Dict[str, Any]] = {}
        for scene_id, raw_scene in bundle.scenes_by_id.items():
            objects = [normalize_object(obj, str(obj.get("object_id", "obj-1"))) for obj in raw_scene.get("objects", [])]
            scenes_by_id[scene_id] = {
                "sceneId": scene_id,
                "name": str(raw_scene.get("name", scene_id)),
                "transitionMs": int(to_float(raw_scene.get("transition_ms"), 0.0)),
                "objects": objects,
            }

        actions_by_id: Dict[str, Dict[str, Any]] = {}
        for action_id, raw_action in bundle.actions_by_id.items():
            actions_by_id[action_id] = normalize_action(raw_action, action_id)
        raw_global_lfos = raw_show.get("global_lfos")
        if raw_global_lfos is None:
            raw_global_lfos = raw_show.get("globalLfos")
        global_lfos_by_id = normalize_global_lfos(raw_global_lfos)
        global_lfos_by_id = sync_action_lfo_snapshots_with_global(actions_by_id, global_lfos_by_id)
        self._sanitize_action_links(actions_by_id)

        action_groups_by_id: Dict[str, Dict[str, Any]] = {}
        for raw_group in raw_show.get("action_groups", []):
            if not isinstance(raw_group, dict):
                continue
            group_id = str(raw_group.get("group_id") or raw_group.get("groupId") or "").strip()
            if not group_id:
                continue
            normalized_group = normalize_action_group(raw_group, group_id)
            action_groups_by_id[normalized_group["groupId"]] = normalized_group
        self._sanitize_action_group_links(action_groups_by_id, actions_by_id)

        initial_scene_id = str(raw_show.get("default_scene_id") or "").strip()
        if initial_scene_id not in scenes_by_id and scenes_by_id:
            initial_scene_id = sorted(scenes_by_id.keys())[0]
        known_object_ids = {
            str(obj.get("objectId") or "")
            for obj in (scenes_by_id.get(initial_scene_id, {}).get("objects", []) if initial_scene_id else [])
            if isinstance(obj, dict) and str(obj.get("objectId") or "").strip()
        }
        object_groups_by_id: Dict[str, Dict[str, Any]] = {}
        for raw_group in raw_show.get("object_groups", []):
            if not isinstance(raw_group, dict):
                continue
            group_id = str(raw_group.get("group_id") or raw_group.get("groupId") or "").strip()
            if not group_id:
                continue
            if group_id.lower() == VIRTUAL_ALL_GROUP_ID:
                continue
            normalized_group = normalize_object_group(
                raw_group,
                group_id,
                known_object_ids=known_object_ids if known_object_ids else None,
            )
            object_groups_by_id[normalized_group["groupId"]] = normalized_group
        groups_enabled = bool(raw_show.get("groups_enabled", True))

        with self.lock:
            running_action_ids = list(self.running_actions.keys())
        for action_id in running_action_ids:
            self.stop_action(action_id, "show-load")

        with self.lock:
            self.object_groups = {group_id: dict(group) for group_id, group in object_groups_by_id.items()}
            self.groups_enabled = groups_enabled
            self.objects = {}
            self.selected_object_ids = []
            self.selected_group_id = None
            self.active_scene_id = None
            self.always_lfo_target_states = {}
            self.always_lfo_phase_ms_by_id = {}
            self.show = {
                "path": self._relative_project_path(absolute_show_path),
                "showId": str(raw_show.get("show_id", "show")),
                "name": str(raw_show.get("name", "Show")),
                "version": normalize_show_version(raw_show.get("version", "0.0.0"), default="0.0.0"),
                "createdAt": str(raw_show.get("created_at") or now_iso()),
                "updatedAt": str(raw_show.get("updated_at") or now_iso()),
                "defaultSceneId": str(raw_show.get("default_scene_id", "")),
                "scenesById": scenes_by_id,
                "actionsById": actions_by_id,
                "globalLfosById": global_lfos_by_id,
                "actionGroupsById": action_groups_by_id,
                "sceneFiles": scene_files,
                "actionFiles": action_files,
                "metadata": raw_show.get("metadata", {}) if isinstance(raw_show.get("metadata"), dict) else {},
                "loadedAt": now_iso(),
            }

        if self.show["defaultSceneId"] and self.show["defaultSceneId"] in scenes_by_id:
            self.recall_scene(self.show["defaultSceneId"], source="show-load", emit_osc=False)

        self.emit_event(
            "show",
            {
                "status": "loaded",
                "showId": self.show["showId"],
                "path": self.show["path"],
                "scenes": len(scenes_by_id),
                "actions": len(actions_by_id),
                "globalLfos": len(global_lfos_by_id),
                "actionGroups": len(action_groups_by_id),
                "objectGroups": len(object_groups_by_id),
                "groupsEnabled": groups_enabled,
            },
        )

    def _send_osc(self, address: str, args: List[Any]) -> None:
        data = encode_osc_message(address, args)
        self.osc_out_socket.sendto(data, (CONFIG["osc_out_host"], CONFIG["osc_out_port"]))
        with self.lock:
            self.osc_outbound_count += 1
            self.last_outbound_at = now_iso()
            self.last_outbound_address = address

        self.emit_event(
            "osc_out",
            {
                "address": address,
                "args": args,
                "target": f"{CONFIG['osc_out_host']}:{CONFIG['osc_out_port']}",
            },
        )

    def _send_object_param(self, object_id: str, param: str, value: Any) -> None:
        self._send_osc(osc_join_path(CONFIG["osc_object_path_prefix"], object_id, param), [value])

    def _send_full_object_state(self, obj: Dict[str, Any]) -> None:
        self._send_object_param(obj["objectId"], "x", obj["x"])
        self._send_object_param(obj["objectId"], "y", obj["y"])
        self._send_object_param(obj["objectId"], "z", obj["z"])
        self._send_object_param(obj["objectId"], "size", obj["size"])
        self._send_object_param(obj["objectId"], "gain", obj["gain"])
        self._send_object_param(obj["objectId"], "mute", 1 if obj["mute"] else 0)
        self._send_object_param(obj["objectId"], "algorithm", obj["algorithm"])

    def create_object_group(
        self,
        group_id: str,
        name: str,
        object_ids: List[str],
        link_params: List[str],
        color: Any = DEFAULT_GROUP_COLOR,
        enabled: bool = True,
        source: str = "api",
    ) -> Dict[str, Any]:
        normalized_group_id = normalize_object_id(group_id)
        if normalized_group_id.lower() == VIRTUAL_ALL_GROUP_ID:
            raise ValueError("Group ID 'all' is reserved")
        normalized_object_ids = sorted(
            set(normalize_object_id(object_id) for object_id in object_ids if str(object_id or "").strip())
        )
        normalized_link_params = normalize_link_params(link_params)
        group_name = str(name or normalized_group_id).strip() or normalized_group_id

        with self.lock:
            if normalized_group_id in self.object_groups:
                raise ValueError(f"Group already exists: {normalized_group_id}")
            for object_id in normalized_object_ids:
                if object_id not in self.objects:
                    raise ValueError(f"Object not found for group membership: {object_id}")
            group = {
                "groupId": normalized_group_id,
                "name": group_name,
                "objectIds": normalized_object_ids,
                "linkParams": normalized_link_params,
                "color": normalize_color(color, DEFAULT_GROUP_COLOR),
                "enabled": bool(enabled),
            }
            self.object_groups[normalized_group_id] = group

        self.emit_event(
            "object_group",
            {
                "source": source,
                "action": "create",
                "group": group,
            },
        )
        return group

    def update_object_group(self, group_id: str, patch: Dict[str, Any], source: str = "api") -> Dict[str, Any]:
        normalized_group_id = normalize_object_id(group_id)
        if normalized_group_id.lower() == VIRTUAL_ALL_GROUP_ID:
            raise ValueError("Group ID 'all' is reserved")
        with self.lock:
            if normalized_group_id not in self.object_groups:
                raise ValueError(f"Group not found: {normalized_group_id}")
            current = dict(self.object_groups[normalized_group_id])

            if "name" in patch:
                current["name"] = str(patch.get("name") or normalized_group_id).strip() or normalized_group_id
            if "objectIds" in patch or "object_ids" in patch:
                raw_ids = patch.get("objectIds")
                if raw_ids is None:
                    raw_ids = patch.get("object_ids")
                if not isinstance(raw_ids, list):
                    raise ValueError("objectIds must be a list")
                normalized_ids = sorted(
                    set(normalize_object_id(object_id) for object_id in raw_ids if str(object_id or "").strip())
                )
                for object_id in normalized_ids:
                    if object_id not in self.objects:
                        raise ValueError(f"Object not found for group membership: {object_id}")
                current["objectIds"] = normalized_ids
            if "linkParams" in patch or "link_params" in patch:
                raw_params = patch.get("linkParams")
                if raw_params is None:
                    raw_params = patch.get("link_params")
                current["linkParams"] = normalize_link_params(raw_params)
            if "enabled" in patch:
                current["enabled"] = bool(patch.get("enabled"))
            if "color" in patch:
                current["color"] = normalize_color(patch.get("color"), DEFAULT_GROUP_COLOR)

            self.object_groups[normalized_group_id] = current

        self.emit_event(
            "object_group",
            {
                "source": source,
                "action": "update",
                "group": current,
            },
        )
        return current

    def set_groups_enabled(self, enabled: bool, source: str = "api") -> bool:
        with self.lock:
            self.groups_enabled = bool(enabled)
            next_enabled = self.groups_enabled

        self.emit_event(
            "object_group",
            {
                "source": source,
                "action": "master_enable",
                "enabled": next_enabled,
            },
        )
        return next_enabled

    def set_lfos_enabled(self, enabled: bool, source: str = "api") -> bool:
        with self.lock:
            self.lfos_enabled = bool(enabled)
            next_enabled = self.lfos_enabled

        self.emit_event(
            "system",
            {
                "source": source,
                "message": "lfos_enabled",
                "enabled": next_enabled,
            },
        )
        return next_enabled

    def select_objects(self, object_ids: List[Any], source: str = "api") -> List[str]:
        normalized_ids: List[str] = []
        seen_ids: set[str] = set()
        for raw_object_id in object_ids:
            object_text = str(raw_object_id or "").strip()
            if not object_text:
                continue
            normalized_object_id = normalize_object_id(object_text)
            if normalized_object_id in seen_ids:
                continue
            seen_ids.add(normalized_object_id)
            normalized_ids.append(normalized_object_id)

        with self.lock:
            for object_id in normalized_ids:
                if object_id not in self.objects:
                    raise ValueError(f"Object not found: {object_id}")
            self.selected_object_ids = list(normalized_ids)
            selected_snapshot = list(self.selected_object_ids)

        self.emit_event(
            "selection",
            {
                "source": source,
                "target": "objects",
                "objectIds": selected_snapshot,
            },
        )
        return selected_snapshot

    def clear_object_selection(self, source: str = "api") -> List[str]:
        with self.lock:
            self.selected_object_ids = []

        self.emit_event(
            "selection",
            {
                "source": source,
                "target": "objects",
                "objectIds": [],
            },
        )
        return []

    def select_group(self, group_id: str, source: str = "api") -> str:
        normalized_group_id = normalize_object_id(group_id)
        with self.lock:
            if normalized_group_id.lower() != VIRTUAL_ALL_GROUP_ID and normalized_group_id not in self.object_groups:
                raise ValueError(f"Group not found: {normalized_group_id}")
            self.selected_group_id = normalized_group_id

        self.emit_event(
            "selection",
            {
                "source": source,
                "target": "group",
                "groupId": normalized_group_id,
            },
        )
        return normalized_group_id

    def clear_group_selection(self, source: str = "api") -> str:
        with self.lock:
            self.selected_group_id = None

        self.emit_event(
            "selection",
            {
                "source": source,
                "target": "group",
                "groupId": "",
            },
        )
        return ""

    def set_action_lfo_enabled(self, action_id: str, lfo_id: str, enabled: bool, source: str = "api") -> Dict[str, Any]:
        normalized_action_id = normalize_action_id(action_id)
        normalized_lfo_id = normalize_lfo_id(lfo_id)
        next_enabled = bool(enabled)
        changed_count = 0
        changed_count_in_action = 0

        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            if next_enabled:
                # Enabling a concrete LFO should make modulation audible/visible immediately,
                # even if the global LFO master was previously turned off.
                self.lfos_enabled = True
            actions_by_id = self.show.get("actionsById")
            if not isinstance(actions_by_id, dict):
                actions_by_id = {}
            action = actions_by_id.get(normalized_action_id)
            if not isinstance(action, dict):
                raise ValueError(f"Action not found: {normalized_action_id}")

            lfos = action.get("lfos")
            if not isinstance(lfos, list):
                lfos = []
            changed_count_in_action = sum(
                1
                for lfo in lfos
                if isinstance(lfo, dict) and str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip() == normalized_lfo_id
            )
            if changed_count_in_action <= 0:
                raise ValueError(f"LFO not found in action: {normalized_action_id}.{normalized_lfo_id}")

            global_lfos_by_id = self.show.get("globalLfosById")
            if not isinstance(global_lfos_by_id, dict):
                global_lfos_by_id = {}
            next_global_lfos_by_id = dict(global_lfos_by_id)

            existing_definition = next_global_lfos_by_id.get(normalized_lfo_id)
            if not isinstance(existing_definition, dict):
                existing_definition = None
                for lfo in lfos:
                    if not isinstance(lfo, dict):
                        continue
                    current_lfo_id = str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip()
                    if current_lfo_id != normalized_lfo_id:
                        continue
                    existing_definition = normalize_lfo_definition(lfo, normalized_lfo_id)
                    break
            if not isinstance(existing_definition, dict):
                raise ValueError(f"LFO definition not found: {normalized_lfo_id}")

            next_global_lfos_by_id[normalized_lfo_id] = normalize_lfo_definition(
                {
                    **existing_definition,
                    "lfoId": normalized_lfo_id,
                    "enabled": next_enabled,
                },
                normalized_lfo_id,
            )

            synced_global_lfos_by_id = sync_action_lfo_snapshots_with_global(actions_by_id, next_global_lfos_by_id)
            self.show["actionsById"] = actions_by_id
            self.show["globalLfosById"] = synced_global_lfos_by_id
            for candidate_action in actions_by_id.values():
                action_lfos = candidate_action.get("lfos")
                if not isinstance(action_lfos, list):
                    continue
                for lfo in action_lfos:
                    if not isinstance(lfo, dict):
                        continue
                    if str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip() == normalized_lfo_id:
                        changed_count += 1

            for running_action_id, running in self.running_actions.items():
                if not isinstance(running, dict):
                    continue
                running_action = running.get("action")
                if not isinstance(running_action, dict):
                    continue
                snapshot_map = {running_action_id: dict(running_action)}
                sync_action_lfo_snapshots_with_global(snapshot_map, synced_global_lfos_by_id)
                running["action"] = snapshot_map[running_action_id]
                self.running_actions[running_action_id] = running

        payload = {
            "actionId": normalized_action_id,
            "lfoId": normalized_lfo_id,
            "enabled": next_enabled,
            "changedMappings": changed_count,
            "changedMappingsInAction": changed_count_in_action,
            "source": source,
        }
        self.emit_event("action_lfo", payload)
        return payload

    def set_action_lfo_target_enabled(
        self,
        action_id: str,
        lfo_id: str,
        target_scope: str,
        object_id: str,
        group_id: str,
        parameter: str,
        enabled: bool,
        source: str = "api",
    ) -> Dict[str, Any]:
        normalized_action_id = normalize_action_id(action_id)
        normalized_lfo_id = normalize_lfo_id(lfo_id)
        normalized_target_scope = normalize_lfo_target_scope(target_scope)
        normalized_object_id = str(object_id or "").strip() if normalized_target_scope == LFO_TARGET_SCOPE_OBJECT else ""
        normalized_group_id = str(group_id or "").strip() if normalized_target_scope == LFO_TARGET_SCOPE_GROUP else ""
        normalized_parameter = str(parameter or "").strip().lower()
        if not is_lfo_target_parameter(normalized_parameter, normalized_target_scope):
            raise ValueError(
                f"LFO parameter must be one of: {', '.join(sorted(LFO_PARAMS))}"
                if normalized_target_scope == LFO_TARGET_SCOPE_OBJECT
                else f"LFO parameter must be one of: all, {', '.join(sorted(LFO_PARAMS))}"
            )

        next_enabled = bool(enabled)
        changed_count = 0
        changed_count_in_action = 0

        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            actions_by_id = self.show.get("actionsById")
            if not isinstance(actions_by_id, dict):
                actions_by_id = {}
            action = actions_by_id.get(normalized_action_id)
            if not isinstance(action, dict):
                raise ValueError(f"Action not found: {normalized_action_id}")

            action_lfos = action.get("lfos")
            if not isinstance(action_lfos, list):
                action_lfos = []

            next_action_lfos: List[Dict[str, Any]] = []
            for lfo in action_lfos:
                if not isinstance(lfo, dict):
                    continue
                next_lfo = dict(lfo)
                current_lfo_id = str(next_lfo.get("lfoId") or next_lfo.get("lfo_id") or "").strip()
                current_target_scope = normalize_lfo_target_scope(next_lfo.get("targetScope", next_lfo.get("target_scope")))
                current_object_id = str(next_lfo.get("objectId") or next_lfo.get("object_id") or "").strip()
                current_group_id = str(next_lfo.get("groupId") or next_lfo.get("group_id") or "").strip()
                current_parameter = str(next_lfo.get("parameter") or "").strip().lower()
                if (
                    current_lfo_id == normalized_lfo_id
                    and current_target_scope == normalized_target_scope
                    and current_object_id == normalized_object_id
                    and current_group_id == normalized_group_id
                    and current_parameter == normalized_parameter
                ):
                    changed_count_in_action += 1
                    current_target_enabled = bool(next_lfo.get("targetEnabled", True))
                    if current_target_enabled != next_enabled:
                        changed_count += 1
                    next_lfo["targetEnabled"] = next_enabled
                next_action_lfos.append(next_lfo)

            if changed_count_in_action <= 0:
                raise ValueError(
                    f"LFO target not found in action: {normalized_action_id}.{normalized_lfo_id}."
                    f"{normalized_object_id if normalized_target_scope == LFO_TARGET_SCOPE_OBJECT else normalized_group_id}.{normalized_parameter}"
                )

            next_action = dict(action)
            next_action["lfos"] = next_action_lfos
            actions_by_id = dict(actions_by_id)
            actions_by_id[normalized_action_id] = next_action

            global_lfos_by_id = self.show.get("globalLfosById")
            if not isinstance(global_lfos_by_id, dict):
                global_lfos_by_id = {}
            global_lfos_by_id = sync_action_lfo_snapshots_with_global(actions_by_id, global_lfos_by_id)
            next_action = actions_by_id.get(normalized_action_id, next_action)

            self.show["actionsById"] = actions_by_id
            self.show["globalLfosById"] = global_lfos_by_id

            running = self.running_actions.get(normalized_action_id)
            if isinstance(running, dict):
                running["action"] = json.loads(json.dumps(next_action))
                self.running_actions[normalized_action_id] = running

        payload = {
            "actionId": normalized_action_id,
            "lfoId": normalized_lfo_id,
            "objectId": normalized_object_id,
            "groupId": normalized_group_id,
            "targetScope": normalized_target_scope,
            "parameter": normalized_parameter,
            "enabled": next_enabled,
            "changedMappings": changed_count,
            "changedMappingsInAction": changed_count_in_action,
            "source": source,
        }
        self.emit_event("action_lfo", payload)
        return payload

    def update_action_lfo(self, action_id: str, lfo_id: str, patch: Dict[str, Any], source: str = "api") -> Dict[str, Any]:
        normalized_action_id = normalize_action_id(action_id)
        normalized_lfo_id = normalize_lfo_id(lfo_id)
        patch_input = patch if isinstance(patch, dict) else {}
        changed_count = 0
        changed_count_in_action = 0

        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            actions_by_id = self.show.get("actionsById")
            if not isinstance(actions_by_id, dict):
                actions_by_id = {}
            action = actions_by_id.get(normalized_action_id)
            if not isinstance(action, dict):
                raise ValueError(f"Action not found: {normalized_action_id}")

            lfos = action.get("lfos")
            if not isinstance(lfos, list):
                lfos = []
            changed_count_in_action = sum(
                1
                for lfo in lfos
                if isinstance(lfo, dict) and str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip() == normalized_lfo_id
            )
            if changed_count_in_action <= 0:
                raise ValueError(f"LFO not found in action: {normalized_action_id}.{normalized_lfo_id}")

            global_lfos_by_id = self.show.get("globalLfosById")
            if not isinstance(global_lfos_by_id, dict):
                global_lfos_by_id = {}
            next_global_lfos_by_id = dict(global_lfos_by_id)

            existing_definition = next_global_lfos_by_id.get(normalized_lfo_id)
            if not isinstance(existing_definition, dict):
                existing_definition = None
                for lfo in lfos:
                    if not isinstance(lfo, dict):
                        continue
                    current_lfo_id = str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip()
                    if current_lfo_id != normalized_lfo_id:
                        continue
                    existing_definition = normalize_lfo_definition(lfo, normalized_lfo_id)
                    break
            if not isinstance(existing_definition, dict):
                raise ValueError(f"LFO definition not found: {normalized_lfo_id}")

            definition_input: Dict[str, Any] = {
                **existing_definition,
                "lfoId": normalized_lfo_id,
            }

            if "enabled" in patch_input:
                definition_input["enabled"] = bool(patch_input.get("enabled"))
            if "wave" in patch_input:
                definition_input["wave"] = str(patch_input.get("wave") or "").strip().lower()
            if "rateHz" in patch_input or "rate_hz" in patch_input:
                definition_input["rateHz"] = to_float(
                    patch_input.get("rate_hz") if "rate_hz" in patch_input else patch_input.get("rateHz"),
                    to_float(existing_definition.get("rateHz"), 0.0),
                )
            if "depth" in patch_input:
                definition_input["depth"] = to_float(patch_input.get("depth"), to_float(existing_definition.get("depth"), 0.0))
            if "offset" in patch_input:
                definition_input["offset"] = to_float(patch_input.get("offset"), to_float(existing_definition.get("offset"), 0.0))
            if "phaseDeg" in patch_input or "phase_deg" in patch_input:
                definition_input["phaseDeg"] = to_float(
                    patch_input.get("phase_deg") if "phase_deg" in patch_input else patch_input.get("phaseDeg"),
                    to_float(existing_definition.get("phaseDeg"), 0.0),
                )
            if "polarity" in patch_input:
                definition_input["polarity"] = str(patch_input.get("polarity") or "").strip().lower()

            normalized_definition = normalize_lfo_definition(definition_input, normalized_lfo_id)
            next_global_lfos_by_id[normalized_lfo_id] = normalized_definition

            synced_global_lfos_by_id = sync_action_lfo_snapshots_with_global(actions_by_id, next_global_lfos_by_id)
            self.show["actionsById"] = actions_by_id
            self.show["globalLfosById"] = synced_global_lfos_by_id
            for candidate_action in actions_by_id.values():
                action_lfos = candidate_action.get("lfos")
                if not isinstance(action_lfos, list):
                    continue
                for lfo in action_lfos:
                    if not isinstance(lfo, dict):
                        continue
                    if str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip() == normalized_lfo_id:
                        changed_count += 1

            for running_action_id, running in self.running_actions.items():
                if not isinstance(running, dict):
                    continue
                running_action = running.get("action")
                if not isinstance(running_action, dict):
                    continue
                snapshot_map = {running_action_id: dict(running_action)}
                sync_action_lfo_snapshots_with_global(snapshot_map, synced_global_lfos_by_id)
                running["action"] = snapshot_map[running_action_id]
                self.running_actions[running_action_id] = running

        payload = {
            "actionId": normalized_action_id,
            "lfoId": normalized_lfo_id,
            "changedMappings": changed_count,
            "changedMappingsInAction": changed_count_in_action,
            "lfo": normalized_definition,
            "source": source,
        }
        self.emit_event("action_lfo", payload)
        return payload

    def delete_object_group(self, group_id: str, source: str = "api") -> Dict[str, Any]:
        normalized_group_id = normalize_object_id(group_id)
        if normalized_group_id.lower() == VIRTUAL_ALL_GROUP_ID:
            raise ValueError("Group ID 'all' is reserved")
        with self.lock:
            if normalized_group_id not in self.object_groups:
                raise ValueError(f"Group not found: {normalized_group_id}")
            deleted = self.object_groups.pop(normalized_group_id)
            if self.selected_group_id == normalized_group_id:
                self.selected_group_id = None

        self.emit_event(
            "object_group",
            {
                "source": source,
                "action": "delete",
                "groupId": normalized_group_id,
            },
        )
        return deleted

    def _cleanup_groups_for_object(self, object_id: str) -> None:
        with self.lock:
            updates: List[Dict[str, Any]] = []
            for group in self.object_groups.values():
                if object_id in group["objectIds"]:
                    next_ids = [member_id for member_id in group["objectIds"] if member_id != object_id]
                    if next_ids != group["objectIds"]:
                        group["objectIds"] = next_ids
                        updates.append(dict(group))

        for group in updates:
            self.emit_event(
                "object_group",
                {
                    "source": "system",
                    "action": "membership_update",
                    "group": group,
                },
            )

    def _rename_groups_for_object(self, old_object_id: str, new_object_id: str) -> None:
        with self.lock:
            updates: List[Dict[str, Any]] = []
            for group in self.object_groups.values():
                if old_object_id in group["objectIds"]:
                    next_ids = []
                    for member_id in group["objectIds"]:
                        next_ids.append(new_object_id if member_id == old_object_id else member_id)
                    group["objectIds"] = sorted(set(next_ids))
                    updates.append(dict(group))

        for group in updates:
            self.emit_event(
                "object_group",
                {
                    "source": "system",
                    "action": "membership_update",
                    "group": group,
                },
            )

    def _propagate_group_links(
        self,
        object_id: str,
        changed: List[str],
        previous_object: Dict[str, Any],
        next_object: Dict[str, Any],
        source: str,
        emit_osc: bool,
    ) -> None:
        with self.lock:
            if not self.groups_enabled:
                return
            groups_snapshot = [dict(group) for group in self.object_groups.values() if object_id in group["objectIds"]]

        for group in groups_snapshot:
            if not bool(group.get("enabled", True)):
                continue
            linked_params = [param for param in changed if param in group["linkParams"]]
            if not linked_params:
                continue
            targets = [target_id for target_id in group["objectIds"] if target_id != object_id]
            if not targets:
                continue

            for target_id in targets:
                with self.lock:
                    target_current = dict(self.objects.get(target_id, default_object(target_id)))
                patch: Dict[str, Any] = {}
                for param in linked_params:
                    if param not in next_object:
                        continue
                    if param in RELATIVE_GROUP_PARAMS:
                        source_before = to_float(previous_object.get(param), to_float(next_object.get(param), 0.0))
                        source_after = to_float(next_object.get(param), source_before)
                        delta = source_after - source_before
                        target_value = to_float(target_current.get(param), 0.0)
                        patch[param] = target_value + delta
                    else:
                        patch[param] = next_object[param]
                if not patch:
                    continue
                self.update_object(
                    target_id,
                    patch,
                    source=f"group:{group['groupId']}:{source}",
                    emit_osc=emit_osc,
                    propagate_group_links=False,
                )

    def add_object(self, object_id: str, patch: Dict[str, Any], source: str = "api", emit_osc: bool = True) -> Dict[str, Any]:
        normalized_id = normalize_object_id(object_id)
        with self.lock:
            if normalized_id in self.objects:
                raise ValueError(f"Object already exists: {normalized_id}")
            created = normalize_object({**patch, "object_id": normalized_id}, normalized_id)
            self.objects[normalized_id] = created

        if emit_osc:
            self._send_full_object_state(created)

        self.emit_event(
            "object_manager",
            {
                "source": source,
                "action": "add",
                "object": created,
            },
        )
        return created

    def rename_object(self, object_id: str, new_object_id: str, source: str = "api", emit_osc: bool = True) -> Dict[str, Any]:
        old_id = normalize_object_id(object_id)
        next_id = normalize_object_id(new_object_id)
        with self.lock:
            if old_id not in self.objects:
                raise ValueError(f"Object not found: {old_id}")
            if next_id in self.objects and next_id != old_id:
                raise ValueError(f"Object already exists: {next_id}")
            obj = dict(self.objects.pop(old_id))
            obj["objectId"] = next_id
            self.objects[next_id] = obj
            if self.selected_object_ids:
                self.selected_object_ids = [next_id if selected_id == old_id else selected_id for selected_id in self.selected_object_ids]

        self._rename_groups_for_object(old_id, next_id)

        if emit_osc:
            self._send_full_object_state(obj)

        self.emit_event(
            "object_manager",
            {
                "source": source,
                "action": "rename",
                "oldObjectId": old_id,
                "newObjectId": next_id,
                "object": obj,
            },
        )
        return obj

    def remove_object(self, object_id: str, source: str = "api") -> Dict[str, Any]:
        normalized_id = normalize_object_id(object_id)
        cleaned_action_ids: List[str] = []
        removed_track_count = 0
        removed_lfo_target_count = 0
        cleared_ramp_target_count = 0
        with self.lock:
            if normalized_id not in self.objects:
                raise ValueError(f"Object not found: {normalized_id}")
            removed = self.objects.pop(normalized_id)
            if self.selected_object_ids:
                self.selected_object_ids = [object_id for object_id in self.selected_object_ids if object_id != normalized_id]

            if self.show and isinstance(self.show.get("actionsById"), dict):
                actions_by_id = dict(self.show.get("actionsById") or {})
                next_actions_by_id = dict(actions_by_id)
                for action_id, action in actions_by_id.items():
                    if not isinstance(action, dict):
                        continue
                    action_changed = False
                    next_action = dict(action)

                    tracks = action.get("tracks")
                    if isinstance(tracks, list):
                        next_tracks: List[Dict[str, Any]] = []
                        for track in tracks:
                            if not isinstance(track, dict):
                                continue
                            track_object_id = str(track.get("objectId") or track.get("object_id") or "").strip()
                            if track_object_id == normalized_id:
                                removed_track_count += 1
                                action_changed = True
                                continue
                            next_tracks.append(track)
                        if len(next_tracks) != len(tracks):
                            next_action["tracks"] = next_tracks

                    lfos = action.get("lfos")
                    if isinstance(lfos, list):
                        next_lfos: List[Dict[str, Any]] = []
                        for lfo in lfos:
                            if not isinstance(lfo, dict):
                                continue
                            lfo_object_id = str(lfo.get("objectId") or lfo.get("object_id") or "").strip()
                            if lfo_object_id == normalized_id:
                                removed_lfo_target_count += 1
                                action_changed = True
                                continue
                            next_lfos.append(lfo)
                        if len(next_lfos) != len(lfos):
                            next_action["lfos"] = next_lfos

                    action_rule = normalize_action_rule(next_action.get("actionRule"))
                    if normalize_action_rule_type(action_rule.get("type")) == "parameterRamp":
                        target_object_id, _ = parse_action_rule_target(action_rule.get("target"))
                        if target_object_id == normalized_id:
                            action_rule["target"] = ""
                            next_action["actionRule"] = action_rule
                            cleared_ramp_target_count += 1
                            action_changed = True

                    if action_changed:
                        cleaned_action_ids.append(action_id)
                        next_actions_by_id[action_id] = next_action

                if cleaned_action_ids:
                    global_lfos_by_id = self.show.get("globalLfosById")
                    if not isinstance(global_lfos_by_id, dict):
                        global_lfos_by_id = {}
                    global_lfos_by_id = sync_action_lfo_snapshots_with_global(next_actions_by_id, global_lfos_by_id)
                    self.show["actionsById"] = next_actions_by_id
                    self.show["globalLfosById"] = global_lfos_by_id

                    for action_id in cleaned_action_ids:
                        running = self.running_actions.get(action_id)
                        if not isinstance(running, dict):
                            continue
                        next_action = next_actions_by_id.get(action_id)
                        if isinstance(next_action, dict):
                            running["action"] = json.loads(json.dumps(next_action))
                        lfo_states = running.get("lfoStates")
                        if isinstance(lfo_states, dict):
                            stale_lfo_state_keys = [
                                key
                                for key in list(lfo_states.keys())
                                if key.startswith(f"{normalized_id}:") or key.startswith(f"__ruleRampBase:{normalized_id}:")
                            ]
                            for stale_key in stale_lfo_state_keys:
                                lfo_states.pop(stale_key, None)
                            running["lfoStates"] = lfo_states
                        self.running_actions[action_id] = running

            stale_always_lfo_keys = [
                key
                for key in list(self.always_lfo_target_states.keys())
                if key.startswith(f"{normalized_id}:")
            ]
            for stale_key in stale_always_lfo_keys:
                self.always_lfo_target_states.pop(stale_key, None)

        self._cleanup_groups_for_object(normalized_id)

        self.emit_event(
            "object_manager",
            {
                "source": source,
                "action": "remove",
                "objectId": normalized_id,
                "cleanedActions": cleaned_action_ids,
                "removedTracks": removed_track_count,
                "removedLfoTargets": removed_lfo_target_count,
                "clearedRampTargets": cleared_ramp_target_count,
            },
        )
        return removed

    def clear_objects(self, source: str = "api") -> List[str]:
        with self.lock:
            object_ids = sorted(self.objects.keys())
            self.objects = {}
            self.selected_object_ids = []
            for group in self.object_groups.values():
                group["objectIds"] = []

        self.emit_event(
            "object_manager",
            {
                "source": source,
                "action": "clear",
                "count": len(object_ids),
                "objectIds": object_ids,
            },
        )
        for group in list(self.object_groups.values()):
            self.emit_event(
                "object_group",
                {
                    "source": "system",
                    "action": "membership_update",
                    "group": dict(group),
                },
            )
        return object_ids

    def update_object(
        self,
        object_id: str,
        patch: Dict[str, Any],
        source: str = "api",
        emit_osc: bool = True,
        propagate_group_links: bool = True,
        client_update_session_id: Optional[str] = None,
        client_update_seq: Optional[int] = None,
        lfo_center_mode: bool = False,
        lfo_center_gesture_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        source_name = str(source or "")
        client_session = str(client_update_session_id or "").strip()
        center_gesture_id = str(lfo_center_gesture_id or "").strip()
        parsed_client_seq: Optional[int] = None
        if client_update_seq is not None:
            try:
                candidate_seq = int(client_update_seq)
                if candidate_seq > 0:
                    parsed_client_seq = candidate_seq
            except (TypeError, ValueError):
                parsed_client_seq = None
        with self.lock:
            current = self.objects.get(object_id, default_object(object_id))
            if source_name == "api" and client_session and parsed_client_seq is not None:
                seq_key = (client_session, object_id)
                previous_seq = int(self.last_client_update_seq_by_object.get(seq_key, 0))
                if parsed_client_seq <= previous_seq:
                    return current
                self.last_client_update_seq_by_object[seq_key] = parsed_client_seq

            if object_id not in self.objects and source_name.startswith("action:"):
                # Action/LFO runtime must not resurrect objects that were removed while a frame was in flight.
                return default_object(object_id)
            merged = {**current, **patch, "objectId": object_id, "object_id": object_id}
            next_obj = normalize_object(merged, object_id)

            # External writes to an actively modulated target should move the LFO center,
            # not briefly force an unmodulated value that then snaps on the next tick.
            if not source_name.startswith("action:"):
                now_mono = time.monotonic()
                for parameter in LFO_PARAMS:
                    if parameter not in patch:
                        continue
                    if parameter not in next_obj:
                        continue

                    desired_value = to_float(next_obj.get(parameter), to_float(current.get(parameter), 0.0))
                    affected_any = False
                    center_drag_delta: Optional[float] = None
                    if lfo_center_mode and client_session and center_gesture_id:
                        center_key = (client_session, center_gesture_id, object_id, parameter)
                        previous_center_target = self.last_client_center_target_by_key.get(center_key)
                        self.last_client_center_target_by_key[center_key] = desired_value
                        if previous_center_target is None:
                            center_drag_delta = 0.0
                            stale_center_keys = [
                                key
                                for key in list(self.last_client_center_target_by_key.keys())
                                if key[0] == client_session
                                and key[2] == object_id
                                and key[3] == parameter
                                and key[1] != center_gesture_id
                            ]
                            for stale_key in stale_center_keys:
                                self.last_client_center_target_by_key.pop(stale_key, None)
                        else:
                            center_drag_delta = desired_value - to_float(previous_center_target, desired_value)
                    for running in self.running_actions.values():
                        action_snapshot = running.get("action")
                        if not isinstance(action_snapshot, dict):
                            continue
                        lfo_states = running.get("lfoStates")
                        if not isinstance(lfo_states, dict):
                            continue
                        started_at_mono = to_float(running.get("startedAtMonotonic"), 0.0)
                        if started_at_mono <= 0.0:
                            continue

                        elapsed_ms = int(max(0.0, (now_mono - started_at_mono) * 1000.0))
                        lfo_phase_ms_by_id = running.get("lfoPhaseMsById")
                        if not isinstance(lfo_phase_ms_by_id, dict):
                            lfo_phase_ms_by_id = None
                        total_mod = self._lfo_total_mod_for_target(
                            action_snapshot,
                            object_id,
                            parameter,
                            elapsed_ms,
                            lfo_phase_ms_by_id=lfo_phase_ms_by_id,
                        )
                        if total_mod is None:
                            continue
                        action_track_value = self._action_track_value_for_target(action_snapshot, object_id, parameter, elapsed_ms)

                        lfo_key = f"{object_id}:{parameter}"
                        state = lfo_states.get(lfo_key)
                        if not isinstance(state, dict):
                            state = {}
                            lfo_states[lfo_key] = state

                        current_rendered_value = to_float(current.get(parameter), desired_value)
                        drag_delta = center_drag_delta if center_drag_delta is not None else (desired_value - current_rendered_value)
                        if action_track_value is not None:
                            if lfo_center_mode:
                                existing_center = to_float(
                                    state.get("center"),
                                    action_track_value + to_float(state.get("manualOffset"), 0.0),
                                )
                                next_center = existing_center + drag_delta
                                manual_offset = next_center - action_track_value
                                state["manualOffset"] = manual_offset
                                state["center"] = next_center
                            else:
                                manual_offset = desired_value - (action_track_value + total_mod)
                                state["manualOffset"] = manual_offset
                                state["center"] = action_track_value + manual_offset
                        else:
                            state.pop("manualOffset", None)
                            if lfo_center_mode:
                                existing_center = to_float(state.get("center"), current_rendered_value - total_mod)
                                state["center"] = existing_center + drag_delta
                            else:
                                state["center"] = desired_value - total_mod
                        if lfo_center_mode:
                            state["lastValue"] = current_rendered_value
                        else:
                            state["lastValue"] = desired_value
                        affected_any = True

                    target_key = f"{object_id}:{parameter}"
                    if lfo_center_mode:
                        target_state = self.always_lfo_target_states.get(target_key)
                        if isinstance(target_state, dict):
                            current_rendered_value = to_float(current.get(parameter), desired_value)
                            drag_delta = center_drag_delta if center_drag_delta is not None else (desired_value - current_rendered_value)
                            existing_center = to_float(target_state.get("center"), current_rendered_value)
                            target_state["center"] = existing_center + drag_delta
                            target_state["lastValue"] = current_rendered_value
                            self.always_lfo_target_states[target_key] = target_state
                            affected_any = True
                    else:
                        always_total_mod = self._always_lfo_total_mod_for_target(object_id, parameter)
                        if always_total_mod is not None:
                            target_state = self.always_lfo_target_states.get(target_key)
                            if not isinstance(target_state, dict):
                                target_state = {}
                            # Regular writes set the rendered value at current LFO phase.
                            target_state["center"] = desired_value - always_total_mod
                            target_state["lastValue"] = desired_value
                            self.always_lfo_target_states[target_key] = target_state
                            affected_any = True

                    if affected_any and parameter in OBJECT_LIMITS:
                        if lfo_center_mode:
                            # For drag-style center moves, keep the currently rendered modulated value.
                            next_obj[parameter] = clamp(
                                to_float(current.get(parameter), desired_value),
                                OBJECT_LIMITS[parameter],
                            )
                        else:
                            next_obj[parameter] = clamp(desired_value, OBJECT_LIMITS[parameter])

            changed = [
                k
                for k in ["x", "y", "z", "size", "gain", "mute", "algorithm", "type", "color", "hidden", "excludeFromAll"]
                if current.get(k) != next_obj.get(k)
            ]
            self.objects[object_id] = next_obj

        if emit_osc:
            for param in changed:
                if param not in ["x", "y", "z", "size", "gain", "mute", "algorithm"]:
                    continue
                value = 1 if (param == "mute" and next_obj[param]) else (0 if param == "mute" else next_obj[param])
                self._send_object_param(object_id, param, value)

        if propagate_group_links and changed:
            self._propagate_group_links(object_id, changed, current, next_obj, source, emit_osc)

        if not changed:
            return next_obj

        self.emit_event(
            "object",
            {
                "source": source,
                "objectId": object_id,
                "changed": changed,
                "object": next_obj,
            },
        )
        return next_obj

    def recall_scene(self, scene_id: str, source: str = "api", emit_osc: bool = True) -> None:
        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            scene = self.show["scenesById"].get(scene_id)
            if not scene:
                raise ValueError(f"Scene not found: {scene_id}")
            self.objects = {obj["objectId"]: normalize_object(obj, obj["objectId"]) for obj in scene["objects"]}
            self.active_scene_id = scene_id
            objects_snapshot = list(self.objects.values())

        if emit_osc:
            for obj in objects_snapshot:
                self._send_full_object_state(obj)
            self._send_osc(osc_join_path(CONFIG["osc_scene_path_prefix"], scene_id, "recall"), [1])

        self.emit_event(
            "scene",
            {
                "source": source,
                "sceneId": scene_id,
                "objectCount": len(objects_snapshot),
            },
        )

    def _snapshot_runtime_objects(self) -> List[Dict[str, Any]]:
        with self.lock:
            raw_objects = [dict(obj) for obj in self.objects.values()]

        snapshot: List[Dict[str, Any]] = []
        for index, obj in enumerate(raw_objects):
            fallback_id = str(obj.get("objectId") or obj.get("object_id") or f"obj-{index + 1}")
            snapshot.append(normalize_object(obj, fallback_id))
        return snapshot

    def save_scene(self, scene_id: str, source: str = "api") -> Dict[str, Any]:
        normalized_scene_id = normalize_scene_id(scene_id)
        runtime_objects = self._snapshot_runtime_objects()

        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            scene = self.show["scenesById"].get(normalized_scene_id)
            if not scene:
                raise ValueError(f"Scene not found: {normalized_scene_id}")

            updated_scene = {
                "sceneId": normalized_scene_id,
                "name": str(scene.get("name") or normalized_scene_id),
                "transitionMs": int(to_float(scene.get("transitionMs"), 0.0)),
                "objects": runtime_objects,
            }
            self.show["scenesById"][normalized_scene_id] = updated_scene

        self.save_show(capture_runtime_scene=False)
        self.emit_event(
            "scene",
            {
                "source": source,
                "sceneId": normalized_scene_id,
                "status": "saved",
                "objectCount": len(runtime_objects),
            },
        )
        return updated_scene

    def save_scene_as(self, source_scene_id: str, new_scene_id: str, source: str = "api") -> Dict[str, Any]:
        normalized_source_scene_id = normalize_scene_id(source_scene_id)
        normalized_new_scene_id = normalize_scene_id(new_scene_id)
        runtime_objects = self._snapshot_runtime_objects()

        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            source_scene = self.show["scenesById"].get(normalized_source_scene_id)
            if not source_scene:
                raise ValueError(f"Scene not found: {normalized_source_scene_id}")
            if normalized_new_scene_id in self.show["scenesById"]:
                raise ValueError(f"Scene already exists: {normalized_new_scene_id}")

            new_scene = {
                "sceneId": normalized_new_scene_id,
                "name": str(source_scene.get("name") or normalized_new_scene_id),
                "transitionMs": int(to_float(source_scene.get("transitionMs"), 0.0)),
                "objects": runtime_objects,
            }
            self.show["scenesById"][normalized_new_scene_id] = new_scene

            scene_files = self.show.get("sceneFiles")
            if not isinstance(scene_files, dict):
                scene_files = {}
            scene_files[normalized_new_scene_id] = f"scenes/{normalized_new_scene_id}.json"
            self.show["sceneFiles"] = scene_files

            self.active_scene_id = normalized_new_scene_id

        self.save_show(capture_runtime_scene=False)
        self.emit_event(
            "scene",
            {
                "source": source,
                "sceneId": normalized_new_scene_id,
                "status": "saved_as",
                "fromSceneId": normalized_source_scene_id,
                "objectCount": len(runtime_objects),
            },
        )
        return new_scene

    def create_action(self, action_id: str, patch: Dict[str, Any], source: str = "api") -> Dict[str, Any]:
        normalized_action_id = normalize_action_id(action_id)
        patch_input = patch if isinstance(patch, dict) else {}
        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            if normalized_action_id in self.show["actionsById"]:
                raise ValueError(f"Action already exists: {normalized_action_id}")

            created = normalize_action({**patch_input, "actionId": normalized_action_id}, normalized_action_id)
            actions_by_id = dict(self.show["actionsById"])
            actions_by_id[normalized_action_id] = created
            global_lfos_by_id = self.show.get("globalLfosById")
            if not isinstance(global_lfos_by_id, dict):
                global_lfos_by_id = {}
            global_lfos_by_id = sync_action_lfo_snapshots_with_global(actions_by_id, global_lfos_by_id)
            created = actions_by_id.get(normalized_action_id, created)
            self._sanitize_action_links(actions_by_id)
            self.show["actionsById"] = actions_by_id
            self.show["globalLfosById"] = global_lfos_by_id
            action_groups_by_id = self.show.get("actionGroupsById")
            if isinstance(action_groups_by_id, dict):
                next_groups_by_id = dict(action_groups_by_id)
                self._sanitize_action_group_links(next_groups_by_id, actions_by_id)
                self.show["actionGroupsById"] = next_groups_by_id

            action_files = self.show.get("actionFiles")
            if not isinstance(action_files, dict):
                action_files = {}
            action_files[normalized_action_id] = str(action_files.get(normalized_action_id) or f"actions/{normalized_action_id}.json")
            self.show["actionFiles"] = action_files

        self.emit_event(
            "action",
            {"actionId": normalized_action_id, "state": "created", "source": source, "action": created},
        )
        return created

    def update_action(self, action_id: str, patch: Dict[str, Any], source: str = "api") -> Dict[str, Any]:
        normalized_action_id = normalize_action_id(action_id)
        patch_input = patch if isinstance(patch, dict) else {}
        should_stop = False

        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            current = self.show["actionsById"].get(normalized_action_id)
            if not current:
                raise ValueError(f"Action not found: {normalized_action_id}")

            merged = {**current, **patch_input, "actionId": normalized_action_id}
            if "osc_triggers" in patch_input and "oscTriggers" not in patch_input:
                merged["oscTriggers"] = patch_input.get("osc_triggers")
            if "on_end_action_id" in patch_input and "onEndActionId" not in patch_input:
                merged["onEndActionId"] = patch_input.get("on_end_action_id")

            updated = normalize_action(merged, normalized_action_id)

            actions_by_id = dict(self.show["actionsById"])
            actions_by_id[normalized_action_id] = updated
            global_lfos_by_id = self.show.get("globalLfosById")
            if not isinstance(global_lfos_by_id, dict):
                global_lfos_by_id = {}
            global_lfos_by_id = sync_action_lfo_snapshots_with_global(actions_by_id, global_lfos_by_id)
            updated = actions_by_id.get(normalized_action_id, updated)
            self._sanitize_action_links(actions_by_id)
            self.show["actionsById"] = actions_by_id
            self.show["globalLfosById"] = global_lfos_by_id
            action_groups_by_id = self.show.get("actionGroupsById")
            if isinstance(action_groups_by_id, dict):
                next_groups_by_id = dict(action_groups_by_id)
                self._sanitize_action_group_links(next_groups_by_id, actions_by_id)
                self.show["actionGroupsById"] = next_groups_by_id

            if current.get("enabled", True) and not updated.get("enabled", True):
                should_stop = normalized_action_id in self.running_actions

            running = self.running_actions.get(normalized_action_id)
            if isinstance(running, dict):
                # Keep live action runner aligned with edited action state so LFO/track changes
                # apply immediately while the action is already running.
                running["action"] = json.loads(json.dumps(updated))
                self.running_actions[normalized_action_id] = running

        if should_stop:
            self.stop_action(normalized_action_id, "disabled")
        self.emit_event(
            "action",
            {"actionId": normalized_action_id, "state": "updated", "source": source, "action": updated},
        )
        return updated

    def save_action_as(
        self,
        source_action_id: str,
        new_action_id: str,
        patch: Optional[Dict[str, Any]] = None,
        source: str = "api",
    ) -> Dict[str, Any]:
        normalized_source_action_id = normalize_action_id(source_action_id)
        normalized_new_action_id = normalize_action_id(new_action_id)
        if normalized_new_action_id == normalized_source_action_id:
            raise ValueError("newActionId must be different from source action")

        patch_input = patch if isinstance(patch, dict) else {}
        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            source_action = self.show["actionsById"].get(normalized_source_action_id)
            if not source_action:
                raise ValueError(f"Action not found: {normalized_source_action_id}")
            if normalized_new_action_id in self.show["actionsById"]:
                raise ValueError(f"Action already exists: {normalized_new_action_id}")

            merged = {**source_action, **patch_input, "actionId": normalized_new_action_id}
            if "osc_triggers" in patch_input and "oscTriggers" not in patch_input:
                merged["oscTriggers"] = patch_input.get("osc_triggers")
            if "on_end_action_id" in patch_input and "onEndActionId" not in patch_input:
                merged["onEndActionId"] = patch_input.get("on_end_action_id")

            copied = normalize_action(merged, normalized_new_action_id)
            actions_by_id = dict(self.show["actionsById"])
            actions_by_id[normalized_new_action_id] = copied
            global_lfos_by_id = self.show.get("globalLfosById")
            if not isinstance(global_lfos_by_id, dict):
                global_lfos_by_id = {}
            global_lfos_by_id = sync_action_lfo_snapshots_with_global(actions_by_id, global_lfos_by_id)
            copied = actions_by_id.get(normalized_new_action_id, copied)
            self._sanitize_action_links(actions_by_id)
            self.show["actionsById"] = actions_by_id
            self.show["globalLfosById"] = global_lfos_by_id
            action_groups_by_id = self.show.get("actionGroupsById")
            if isinstance(action_groups_by_id, dict):
                next_groups_by_id = dict(action_groups_by_id)
                self._sanitize_action_group_links(next_groups_by_id, actions_by_id)
                self.show["actionGroupsById"] = next_groups_by_id

            action_files = self.show.get("actionFiles")
            if not isinstance(action_files, dict):
                action_files = {}
            action_files[normalized_new_action_id] = f"actions/{normalized_new_action_id}.json"
            self.show["actionFiles"] = action_files

        self.emit_event(
            "action",
            {
                "actionId": normalized_new_action_id,
                "state": "saved_as",
                "source": source,
                "fromActionId": normalized_source_action_id,
                "action": copied,
            },
        )
        return copied

    def delete_action(self, action_id: str, source: str = "api") -> Dict[str, Any]:
        normalized_action_id = normalize_action_id(action_id)
        was_running = False

        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            current = self.show["actionsById"].get(normalized_action_id)
            if not current:
                raise ValueError(f"Action not found: {normalized_action_id}")

            actions_by_id: Dict[str, Dict[str, Any]] = {}
            for existing_id, existing_action in self.show["actionsById"].items():
                if existing_id == normalized_action_id:
                    continue
                action_copy = dict(existing_action)
                if str(action_copy.get("onEndActionId") or "").strip() == normalized_action_id:
                    action_copy["onEndActionId"] = ""
                actions_by_id[existing_id] = action_copy
            self._sanitize_action_links(actions_by_id)
            self.show["actionsById"] = actions_by_id
            action_groups_by_id = self.show.get("actionGroupsById")
            if isinstance(action_groups_by_id, dict):
                next_groups_by_id = dict(action_groups_by_id)
                self._sanitize_action_group_links(next_groups_by_id, actions_by_id)
                self.show["actionGroupsById"] = next_groups_by_id

            action_files = self.show.get("actionFiles")
            if not isinstance(action_files, dict):
                action_files = {}
            action_files.pop(normalized_action_id, None)
            self.show["actionFiles"] = action_files

            was_running = normalized_action_id in self.running_actions
            deleted = dict(current)

        if was_running:
            self.stop_action(normalized_action_id, "deleted")

        self.emit_event(
            "action",
            {"actionId": normalized_action_id, "state": "deleted", "source": source},
        )
        return deleted

    def create_action_group(self, group_id: str, patch: Dict[str, Any], source: str = "api") -> Dict[str, Any]:
        normalized_group_id = normalize_action_group_id(group_id)
        patch_input = patch if isinstance(patch, dict) else {}
        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            action_groups_by_id = self.show.get("actionGroupsById")
            if not isinstance(action_groups_by_id, dict):
                action_groups_by_id = {}
            if normalized_group_id in action_groups_by_id:
                raise ValueError(f"Action group already exists: {normalized_group_id}")

            created = normalize_action_group({**patch_input, "groupId": normalized_group_id}, normalized_group_id)
            next_groups_by_id = dict(action_groups_by_id)
            next_groups_by_id[normalized_group_id] = created
            self._sanitize_action_group_links(next_groups_by_id, self.show["actionsById"])
            self.show["actionGroupsById"] = next_groups_by_id

        self.emit_event(
            "action_group",
            {"groupId": normalized_group_id, "state": "created", "source": source, "group": created},
        )
        return created

    def update_action_group(self, group_id: str, patch: Dict[str, Any], source: str = "api") -> Dict[str, Any]:
        normalized_group_id = normalize_action_group_id(group_id)
        patch_input = patch if isinstance(patch, dict) else {}
        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            action_groups_by_id = self.show.get("actionGroupsById")
            if not isinstance(action_groups_by_id, dict):
                action_groups_by_id = {}
            current = action_groups_by_id.get(normalized_group_id)
            if not current:
                raise ValueError(f"Action group not found: {normalized_group_id}")

            merged = {**current, **patch_input, "groupId": normalized_group_id}
            if "osc_triggers" in patch_input and "oscTriggers" not in patch_input:
                merged["oscTriggers"] = patch_input.get("osc_triggers")

            updated = normalize_action_group(merged, normalized_group_id)
            next_groups_by_id = dict(action_groups_by_id)
            next_groups_by_id[normalized_group_id] = updated
            self._sanitize_action_group_links(next_groups_by_id, self.show["actionsById"])
            self.show["actionGroupsById"] = next_groups_by_id

        self.emit_event(
            "action_group",
            {"groupId": normalized_group_id, "state": "updated", "source": source, "group": updated},
        )
        return updated

    def delete_action_group(self, group_id: str, source: str = "api") -> Dict[str, Any]:
        normalized_group_id = normalize_action_group_id(group_id)
        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            action_groups_by_id = self.show.get("actionGroupsById")
            if not isinstance(action_groups_by_id, dict):
                action_groups_by_id = {}
            current = action_groups_by_id.get(normalized_group_id)
            if not current:
                raise ValueError(f"Action group not found: {normalized_group_id}")

            next_groups_by_id = dict(action_groups_by_id)
            next_groups_by_id.pop(normalized_group_id, None)
            self.show["actionGroupsById"] = next_groups_by_id
            deleted = dict(current)

        self.emit_event(
            "action_group",
            {"groupId": normalized_group_id, "state": "deleted", "source": source},
        )
        return deleted

    def trigger_action_group(self, group_id: str, source: str = "api") -> Dict[str, Any]:
        normalized_group_id = normalize_action_group_id(group_id)
        with self.lock:
            if not self.show:
                raise ValueError("No show loaded")
            action_groups_by_id = self.show.get("actionGroupsById")
            if not isinstance(action_groups_by_id, dict):
                action_groups_by_id = {}
            group = action_groups_by_id.get(normalized_group_id)
            if not group:
                raise ValueError(f"Action group not found: {normalized_group_id}")
            if not bool(group.get("enabled", True)):
                raise ValueError(f"Action group is disabled: {normalized_group_id}")
            group_snapshot = json.loads(json.dumps(group))

        results: List[Dict[str, Any]] = []
        entries = group_snapshot.get("entries")
        if not isinstance(entries, list):
            entries = []

        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            entry_type = str(entry.get("entryType") or "").strip()
            if entry_type == "lfosEnabled":
                enabled = bool(entry.get("enabled", True))
                self.set_lfos_enabled(enabled, source=f"{source}:group:{normalized_group_id}")
                results.append({"index": index, "entryType": entry_type, "status": "ok"})
                continue
            if entry_type == "actionLfoEnabled":
                action_id = str(entry.get("actionId") or "").strip()
                lfo_id = str(entry.get("lfoId") or "").strip()
                enabled = bool(entry.get("enabled", True))
                if not action_id or not lfo_id:
                    results.append({"index": index, "entryType": entry_type, "status": "skipped", "error": "invalid_entry"})
                    continue
                try:
                    result = self.set_action_lfo_enabled(
                        action_id,
                        lfo_id,
                        enabled,
                        source=f"{source}:group:{normalized_group_id}",
                    )
                    results.append(
                        {
                            "index": index,
                            "entryType": entry_type,
                            "actionId": action_id,
                            "lfoId": lfo_id,
                            "enabled": enabled,
                            "status": "ok",
                            "changedMappings": int(to_float(result.get("changedMappings"), 0.0)),
                        }
                    )
                except Exception as exc:  # noqa: BLE001
                    results.append(
                        {
                            "index": index,
                            "entryType": entry_type,
                            "actionId": action_id,
                            "lfoId": lfo_id,
                            "enabled": enabled,
                            "status": "error",
                            "error": str(exc),
                        }
                    )
                continue

            command = str(entry.get("command") or "start").strip().lower()
            action_id = str(entry.get("actionId") or "").strip()
            if command not in ACTION_GROUP_ACTION_COMMANDS or not action_id:
                results.append({"index": index, "entryType": entry_type or "action", "status": "skipped", "error": "invalid_entry"})
                continue
            try:
                if command == "start":
                    self.start_action(action_id, source=f"{source}:group:{normalized_group_id}")
                elif command == "stop":
                    self.stop_action(action_id, reason=f"group:{normalized_group_id}")
                else:
                    self.abort_action(action_id, source=f"{source}:group:{normalized_group_id}")
                results.append({"index": index, "entryType": "action", "actionId": action_id, "command": command, "status": "ok"})
            except Exception as exc:  # noqa: BLE001
                results.append(
                    {
                        "index": index,
                        "entryType": "action",
                        "actionId": action_id,
                        "command": command,
                        "status": "error",
                        "error": str(exc),
                    }
                )

        failed = sum(1 for item in results if str(item.get("status")) == "error")
        self.emit_event(
            "action_group",
            {
                "groupId": normalized_group_id,
                "state": "triggered",
                "source": source,
                "entryCount": len(entries),
                "failed": failed,
                "results": results,
            },
        )
        return {
            "groupId": normalized_group_id,
            "entryCount": len(entries),
            "failed": failed,
            "results": results,
        }

    def _interpolate_numeric(self, keyframes: List[Dict[str, Any]], elapsed_ms: int) -> Optional[float]:
        if not keyframes:
            return None
        frames = sorted(
            keyframes,
            key=lambda f: to_float(f.get("time_ms") if "time_ms" in f else f.get("timeMs"), 0.0),
        )
        if elapsed_ms <= to_float(frames[0].get("time_ms") if "time_ms" in frames[0] else frames[0].get("timeMs"), 0.0):
            return to_float(frames[0].get("value"), 0.0)

        for idx in range(len(frames) - 1):
            a = frames[idx]
            b = frames[idx + 1]
            t0 = to_float(a.get("time_ms") if "time_ms" in a else a.get("timeMs"), 0.0)
            t1 = to_float(b.get("time_ms") if "time_ms" in b else b.get("timeMs"), 0.0)
            if t0 <= elapsed_ms <= t1:
                v0 = to_float(a.get("value"), 0.0)
                v1 = to_float(b.get("value"), v0)
                if t1 <= t0:
                    return v0
                ratio = (elapsed_ms - t0) / (t1 - t0)
                curve = str(b.get("curve") or "linear")
                if curve == "step":
                    return v0
                if curve == "ease-in":
                    return v0 + (v1 - v0) * ratio * ratio
                if curve == "ease-out":
                    eased = 1 - (1 - ratio) * (1 - ratio)
                    return v0 + (v1 - v0) * eased
                return v0 + (v1 - v0) * ratio

        return to_float(frames[-1].get("value"), 0.0)

    def _lfo_sample(self, wave: str, phase_cycles: float) -> float:
        phase = phase_cycles - math.floor(phase_cycles)
        if wave == "triangle":
            return 1.0 - (4.0 * abs(phase - 0.5))
        if wave == "square":
            return 1.0 if phase < 0.5 else -1.0
        if wave == "saw":
            return (2.0 * phase) - 1.0
        return math.sin(2.0 * math.pi * phase)

    def _collect_always_lfo_mappings(self) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
        mappings: List[Dict[str, Any]] = []
        live_values_by_target: Dict[str, float] = {}
        with self.lock:
            if not self.show or not self.lfos_enabled:
                return (mappings, live_values_by_target)
            actions_by_id = self.show.get("actionsById")
            if not isinstance(actions_by_id, dict):
                return (mappings, live_values_by_target)
            object_groups_by_id = {group_id: dict(group) for group_id, group in self.object_groups.items()}

        running_mapping_keys: set[Tuple[str, str, str]] = set()
        for running in self.running_actions.values():
            if not isinstance(running, dict):
                continue
            running_action = running.get("action")
            if not isinstance(running_action, dict):
                continue
            running_lfos = running_action.get("lfos")
            if not isinstance(running_lfos, list):
                continue
            for lfo in running_lfos:
                if not isinstance(lfo, dict):
                    continue
                if lfo.get("enabled") is False or lfo.get("targetEnabled") is False:
                    continue
                lfo_id = str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip()
                if not lfo_id:
                    continue
                for target_entry in iter_lfo_target_entries(lfo, object_groups_by_id):
                    target_object_id = str(target_entry.get("objectId") or "").strip()
                    target_parameter = str(target_entry.get("parameter") or "").strip()
                    if target_object_id not in self.objects:
                        continue
                    running_mapping_keys.add((lfo_id, target_object_id, target_parameter))

        seen_mapping_keys: set[Tuple[str, str, str]] = set()
        tracked_targets: set[str] = set()

        for action_id in sorted(actions_by_id.keys()):
            action = actions_by_id.get(action_id)
            if not isinstance(action, dict):
                continue
            if not bool(action.get("enabled", True)):
                continue

            action_lfos = action.get("lfos")
            if not isinstance(action_lfos, list):
                continue
            for lfo in action_lfos:
                if not isinstance(lfo, dict):
                    continue
                if lfo.get("enabled") is False or lfo.get("targetEnabled") is False:
                    continue
                lfo_id = str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip()
                if not lfo_id:
                    continue
                for target_entry in iter_lfo_target_entries(lfo, object_groups_by_id):
                    target_object_id = str(target_entry.get("objectId") or "").strip()
                    target_parameter = str(target_entry.get("parameter") or "").strip()
                    phase_offset_deg = to_float(target_entry.get("phaseOffsetDeg"), 0.0)
                    if target_object_id not in self.objects:
                        continue
                    mapping_key = (lfo_id, target_object_id, target_parameter)
                    if mapping_key in running_mapping_keys:
                        continue
                    if mapping_key in seen_mapping_keys:
                        continue
                    seen_mapping_keys.add(mapping_key)

                    target_key = f"{target_object_id}:{target_parameter}"
                    tracked_targets.add(target_key)
                    mappings.append(
                        {
                            "lfoId": lfo_id,
                            "objectId": target_object_id,
                            "parameter": target_parameter,
                            "wave": str(lfo.get("wave") or "sine").strip().lower(),
                            "rateHz": max(0.0, to_float(lfo.get("rateHz"), 0.0)),
                            "depth": to_float(lfo.get("depth"), 0.0),
                            "offset": to_float(lfo.get("offset"), 0.0),
                            "phaseDeg": to_float(lfo.get("phaseDeg"), 0.0),
                            "mappingPhaseDeg": to_float(lfo.get("mappingPhaseDeg"), 0.0),
                            "groupPhaseOffsetDeg": phase_offset_deg,
                            "phaseFlip": bool(lfo.get("phaseFlip", False)),
                            "polarity": coerce_lfo_polarity(lfo.get("polarity")),
                            "targetKey": target_key,
                        }
                    )

        for target_key in tracked_targets:
            object_id, parameter = target_key.split(":", 1)
            current_obj = self.objects.get(object_id, default_object(object_id))
            live_values_by_target[target_key] = to_float(current_obj.get(parameter), 0.0)

        return (mappings, live_values_by_target)

    def _apply_always_lfo_frame(self, frame_delta_ms: float) -> None:
        mappings, live_values_by_target = self._collect_always_lfo_mappings()
        if not mappings:
            self.always_lfo_target_states = {}
            return

        delta_ms = max(0.0, to_float(frame_delta_ms, 0.0))
        advanced_lfo_ids: set[str] = set()
        total_mod_by_target: Dict[str, float] = {}
        object_param_by_target: Dict[str, Tuple[str, str]] = {}
        active_target_keys: set[str] = set()

        for mapping in mappings:
            lfo_id = str(mapping.get("lfoId") or "").strip()
            object_id = str(mapping.get("objectId") or "").strip()
            parameter = str(mapping.get("parameter") or "").strip()
            target_key = str(mapping.get("targetKey") or "").strip()
            if not lfo_id or not object_id or parameter not in LFO_PARAMS or not target_key:
                continue
            if lfo_id not in advanced_lfo_ids:
                current_phase_ms = to_float(self.always_lfo_phase_ms_by_id.get(lfo_id), 0.0)
                self.always_lfo_phase_ms_by_id[lfo_id] = current_phase_ms + delta_ms
                advanced_lfo_ids.add(lfo_id)
            phase_ms = to_float(self.always_lfo_phase_ms_by_id.get(lfo_id), 0.0)

            wave = str(mapping.get("wave") or "sine").strip().lower()
            if wave not in LFO_WAVES:
                wave = "sine"
            rate_hz = max(0.0, to_float(mapping.get("rateHz"), 0.0))
            depth = to_float(mapping.get("depth"), 0.0)
            offset = to_float(mapping.get("offset"), 0.0)
            phase_deg = to_float(mapping.get("phaseDeg"), 0.0)
            mapping_phase_deg = to_float(mapping.get("mappingPhaseDeg"), 0.0) + to_float(mapping.get("groupPhaseOffsetDeg"), 0.0)
            phase_flip = bool(mapping.get("phaseFlip", False))
            polarity = coerce_lfo_polarity(mapping.get("polarity"))

            phase_cycles = (phase_ms / 1000.0) * rate_hz + ((phase_deg + mapping_phase_deg) / 360.0)
            sample = self._lfo_sample(wave, phase_cycles)
            if polarity == "unipolar":
                sample = (sample + 1.0) * 0.5
            if phase_flip:
                sample *= -1.0
            contribution = offset + (depth * sample)

            total_mod_by_target[target_key] = to_float(total_mod_by_target.get(target_key), 0.0) + contribution
            object_param_by_target[target_key] = (object_id, parameter)
            active_target_keys.add(target_key)

        next_patch_by_object: Dict[str, Dict[str, float]] = {}
        for target_key in active_target_keys:
            object_id, parameter = object_param_by_target[target_key]
            live_value = to_float(live_values_by_target.get(target_key), 0.0)
            target_state = self.always_lfo_target_states.get(target_key)
            if not isinstance(target_state, dict):
                target_state = {
                    "center": live_value,
                    "lastValue": live_value,
                }
                self.always_lfo_target_states[target_key] = target_state

            center_value = to_float(target_state.get("center"), live_value)
            last_value = to_float(target_state.get("lastValue"), live_value)
            center_value += (live_value - last_value)

            total_mod = to_float(total_mod_by_target.get(target_key), 0.0)
            final_value = center_value + total_mod
            if parameter in OBJECT_LIMITS:
                final_value = clamp(final_value, OBJECT_LIMITS[parameter])

            target_state["center"] = center_value
            target_state["lastValue"] = final_value
            self.always_lfo_target_states[target_key] = target_state

            patch = next_patch_by_object.get(object_id)
            if not isinstance(patch, dict):
                patch = {}
                next_patch_by_object[object_id] = patch
            patch[parameter] = final_value

        stale_targets = [key for key in self.always_lfo_target_states.keys() if key not in active_target_keys]
        for stale_target_key in stale_targets:
            self.always_lfo_target_states.pop(stale_target_key, None)

        for object_id, patch in next_patch_by_object.items():
            with self.lock:
                if object_id not in self.objects:
                    continue
            self.update_object(
                object_id,
                patch,
                source="action:lfo-always",
                emit_osc=True,
                propagate_group_links=False,
            )

    def _always_lfo_loop(self) -> None:
        next_tick = time.monotonic()
        last_tick = next_tick
        while not self.stop_event.is_set():
            now = time.monotonic()
            if now < next_tick:
                time.sleep(min(ACTION_TICK_SEC, next_tick - now))
                continue

            frame_delta_ms = max(0.0, (now - last_tick) * 1000.0)
            last_tick = now
            try:
                self._apply_always_lfo_frame(frame_delta_ms)
            except Exception as exc:  # noqa: BLE001
                self.emit_event(
                    "system",
                    {"message": "always_lfo_error", "error": str(exc)},
                )

            next_tick += ACTION_TICK_SEC
            if (now - next_tick) > (ACTION_TICK_SEC * 4.0):
                next_tick = now + ACTION_TICK_SEC

    def _lfo_total_mod_for_target(
        self,
        action: Dict[str, Any],
        object_id: str,
        parameter: str,
        elapsed_ms: int,
        lfo_phase_ms_by_id: Optional[Dict[str, float]] = None,
    ) -> Optional[float]:
        total = 0.0
        matched = False
        with self.lock:
            object_groups_by_id = {group_id: dict(group) for group_id, group in self.object_groups.items()}
        for lfo in action.get("lfos", []):
            target_entries = iter_lfo_target_entries(lfo, object_groups_by_id)
            matching_entries = [
                target_entry
                for target_entry in target_entries
                if str(target_entry.get("objectId") or "").strip() == object_id
                and str(target_entry.get("parameter") or "").strip() == parameter
            ]
            if not matching_entries:
                continue
            if lfo.get("enabled") is False:
                continue
            if lfo.get("targetEnabled") is False:
                continue
            lfo_id = str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip()

            wave = str(lfo.get("wave") or "sine").strip().lower()
            if wave not in LFO_WAVES:
                wave = "sine"
            rate_hz = max(0.0, to_float(lfo.get("rateHz"), 0.0))
            depth = to_float(lfo.get("depth"), 0.0)
            offset = to_float(lfo.get("offset"), 0.0)
            phase_deg = to_float(lfo.get("phaseDeg"), 0.0)
            phase_flip = bool(lfo.get("phaseFlip", False))
            polarity = coerce_lfo_polarity(lfo.get("polarity"))

            phase_ms = float(elapsed_ms)
            if isinstance(lfo_phase_ms_by_id, dict) and lfo_id:
                phase_ms = to_float(lfo_phase_ms_by_id.get(lfo_id), phase_ms)
            for target_entry in matching_entries:
                mapping_phase_deg = (
                    to_float(lfo.get("mappingPhaseDeg"), 0.0)
                    + to_float(target_entry.get("phaseOffsetDeg"), 0.0)
                )
                phase_cycles = (phase_ms / 1000.0) * rate_hz + ((phase_deg + mapping_phase_deg) / 360.0)
                sample = self._lfo_sample(wave, phase_cycles)
                if polarity == "unipolar":
                    sample = (sample + 1.0) * 0.5
                if phase_flip:
                    sample *= -1.0
                total += offset + (depth * sample)
                matched = True

        if not matched:
            return None
        return total

    def _always_lfo_total_mod_for_target(self, object_id: str, parameter: str) -> Optional[float]:
        target_key = f"{object_id}:{parameter}"
        mappings, _ = self._collect_always_lfo_mappings()
        if not mappings:
            return None

        total = 0.0
        matched = False
        for mapping in mappings:
            if str(mapping.get("targetKey") or "").strip() != target_key:
                continue
            lfo_id = str(mapping.get("lfoId") or "").strip()
            if not lfo_id:
                continue
            phase_ms = to_float(self.always_lfo_phase_ms_by_id.get(lfo_id), 0.0)

            wave = str(mapping.get("wave") or "sine").strip().lower()
            if wave not in LFO_WAVES:
                wave = "sine"
            rate_hz = max(0.0, to_float(mapping.get("rateHz"), 0.0))
            depth = to_float(mapping.get("depth"), 0.0)
            offset = to_float(mapping.get("offset"), 0.0)
            phase_deg = to_float(mapping.get("phaseDeg"), 0.0)
            mapping_phase_deg = to_float(mapping.get("mappingPhaseDeg"), 0.0) + to_float(mapping.get("groupPhaseOffsetDeg"), 0.0)
            phase_flip = bool(mapping.get("phaseFlip", False))
            polarity = coerce_lfo_polarity(mapping.get("polarity"))

            phase_cycles = (phase_ms / 1000.0) * rate_hz + ((phase_deg + mapping_phase_deg) / 360.0)
            sample = self._lfo_sample(wave, phase_cycles)
            if polarity == "unipolar":
                sample = (sample + 1.0) * 0.5
            if phase_flip:
                sample *= -1.0
            total += offset + (depth * sample)
            matched = True

        if not matched:
            return None
        return total

    def _action_track_value_for_target(self, action: Dict[str, Any], object_id: str, parameter: str, elapsed_ms: int) -> Optional[float]:
        for track in action.get("tracks", []):
            track_object_id = str(track.get("object_id") or track.get("objectId") or "").strip()
            track_parameter = str(track.get("parameter") or "").strip()
            if track_object_id != object_id or track_parameter != parameter:
                continue
            numeric = self._interpolate_numeric(track.get("keyframes", []), elapsed_ms)
            if numeric is None:
                continue
            if math.isfinite(numeric):
                return float(numeric)
        return None

    def _apply_action_frame(
        self,
        action: Dict[str, Any],
        elapsed_ms: int,
        lfo_states: Dict[str, Dict[str, float]],
        lfo_phase_ms_by_id: Optional[Dict[str, float]] = None,
        frame_delta_ms: float = 0.0,
    ) -> None:
        patch_by_object_id: Dict[str, Dict[str, Any]] = {}
        lfo_debug_samples: List[Dict[str, Any]] = []
        action_rule = normalize_action_rule(action.get("actionRule"))
        action_rule_type = normalize_action_rule_type(action_rule.get("type"))
        phase_state = lfo_phase_ms_by_id if isinstance(lfo_phase_ms_by_id, dict) else {}
        delta_ms = max(0.0, to_float(frame_delta_ms, 0.0))
        with self.lock:
            existing_object_ids = set(self.objects.keys())
            object_groups_by_id = {group_id: dict(group) for group_id, group in self.object_groups.items()}

        if action_rule_type == "modulationControl":
            target_modulator = str(action_rule.get("targetModulator") or "").strip()
            parameter = str(action_rule.get("parameter") or "").strip()
            if target_modulator and parameter in ACTION_RULE_MODULATION_PARAMS:
                mod_value = normalize_action_rule_mod_value(parameter, action_rule.get("value"), 0.0)
                for lfo in (action.get("lfos") if isinstance(action.get("lfos"), list) else []):
                    if not isinstance(lfo, dict):
                        continue
                    lfo_id = str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip()
                    if lfo_id != target_modulator:
                        continue
                    if parameter == "enabled":
                        lfo["enabled"] = bool(mod_value)
                    elif parameter == "wave":
                        wave = str(mod_value or "").strip().lower()
                        lfo["wave"] = wave if wave in LFO_WAVES else "sine"
                    elif parameter == "polarity":
                        lfo["polarity"] = coerce_lfo_polarity(mod_value)
                    else:
                        numeric = to_float(mod_value, to_float(lfo.get(parameter), 0.0))
                        if parameter == "rateHz":
                            numeric = max(0.0, numeric)
                        lfo[parameter] = numeric

        for track in action.get("tracks", []):
            object_id = str(track.get("object_id") or track.get("objectId") or "")
            parameter = str(track.get("parameter") or "")
            if not object_id or not parameter:
                continue
            if object_id not in existing_object_ids:
                continue

            if parameter == "mute":
                numeric = self._interpolate_numeric(track.get("keyframes", []), elapsed_ms)
                if numeric is None:
                    continue
                value: Any = bool(numeric >= 0.5)
            elif parameter == "algorithm":
                frames = sorted(
                    track.get("keyframes", []),
                    key=lambda f: to_float(f.get("time_ms") if "time_ms" in f else f.get("timeMs"), 0.0),
                )
                current = self.objects.get(object_id, default_object(object_id))["algorithm"]
                value = current
                for frame in frames:
                    frame_time = to_float(frame.get("time_ms") if "time_ms" in frame else frame.get("timeMs"), 0.0)
                    if elapsed_ms >= frame_time:
                        value = str(frame.get("value", current))
            else:
                numeric = self._interpolate_numeric(track.get("keyframes", []), elapsed_ms)
                if numeric is None:
                    continue
                value = numeric

            patch = patch_by_object_id.get(object_id)
            if not patch:
                patch = {}
                patch_by_object_id[object_id] = patch
            patch[parameter] = value

        if action_rule_type == "parameterRamp":
            target_object_id, target_parameter = parse_action_rule_target(action_rule.get("target"))
            if target_object_id and target_parameter in LFO_PARAMS:
                if target_object_id not in existing_object_ids:
                    target_object_id = ""
            if target_object_id and target_parameter in LFO_PARAMS:
                start_value = to_float(action_rule.get("startValue"), 0.0)
                end_value = to_float(action_rule.get("endValue"), start_value)
                speed_ms = max(0.0, to_float(
                    action_rule.get("speedMs") if "speedMs" in action_rule else action_rule.get("speed"),
                    0.0,
                ))
                relative = bool(action_rule.get("relative", False))

                if relative:
                    state_key = f"__ruleRampBase:{target_object_id}:{target_parameter}"
                    rule_state = lfo_states.get(state_key)
                    if not isinstance(rule_state, dict):
                        with self.lock:
                            base_object = self.objects.get(target_object_id, default_object(target_object_id))
                        base_value = to_float(base_object.get(target_parameter), 0.0)
                        rule_state = {"baseValue": base_value}
                        lfo_states[state_key] = rule_state
                    base_value = to_float(rule_state.get("baseValue"), 0.0)
                    start_value += base_value
                    end_value += base_value

                distance = end_value - start_value
                if speed_ms > 0.0:
                    ratio = max(0.0, min(1.0, max(0.0, float(elapsed_ms)) / speed_ms))
                    ramp_value = start_value + (distance * ratio)
                else:
                    duration_ms = max(1.0, to_float(action.get("durationMs"), 0.0))
                    ratio = max(0.0, min(1.0, max(0.0, float(elapsed_ms)) / duration_ms))
                    ramp_value = start_value + (distance * ratio)

                if target_parameter in OBJECT_LIMITS:
                    ramp_value = clamp(ramp_value, OBJECT_LIMITS[target_parameter])

                patch = patch_by_object_id.get(target_object_id)
                if not patch:
                    patch = {}
                    patch_by_object_id[target_object_id] = patch
                patch[target_parameter] = ramp_value

        lfos_enabled = self.lfos_enabled
        if lfos_enabled:
            lfo_accumulators: Dict[str, Dict[str, Any]] = {}
            advanced_lfo_ids: set[str] = set()
            for index, lfo in enumerate(action.get("lfos", [])):
                if lfo.get("enabled") is False:
                    continue
                if lfo.get("targetEnabled") is False:
                    continue
                lfo_id = str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip()
                if not lfo_id:
                    continue

                if lfo_id not in advanced_lfo_ids:
                    current_phase_ms = to_float(phase_state.get(lfo_id), 0.0)
                    phase_state[lfo_id] = current_phase_ms + delta_ms
                    advanced_lfo_ids.add(lfo_id)
                phase_ms = to_float(phase_state.get(lfo_id), 0.0)

                for target_entry in iter_lfo_target_entries(lfo, object_groups_by_id):
                    target_object_id = str(target_entry.get("objectId") or "").strip()
                    target_parameter = str(target_entry.get("parameter") or "").strip()
                    if not target_object_id or target_parameter not in LFO_PARAMS:
                        continue
                    if target_object_id not in existing_object_ids:
                        continue

                    lfo_key = f"{target_object_id}:{target_parameter}"
                    lfo_state = lfo_states.get(lfo_key)
                    if not isinstance(lfo_state, dict):
                        with self.lock:
                            base_object = self.objects.get(target_object_id, default_object(target_object_id))
                        center_seed = to_float(base_object.get(target_parameter), 0.0)
                        lfo_state = {
                            "center": center_seed,
                            "lastValue": center_seed,
                        }
                        lfo_states[lfo_key] = lfo_state

                    accumulator = lfo_accumulators.get(lfo_key)
                    if not isinstance(accumulator, dict):
                        center_value = to_float(lfo_state.get("center"), 0.0)
                        existing_patch = patch_by_object_id.get(target_object_id)
                        if existing_patch and target_parameter in existing_patch:
                            track_value_raw = existing_patch.get(target_parameter)
                            if isinstance(track_value_raw, (int, float)):
                                track_value = float(track_value_raw)
                                if math.isfinite(track_value):
                                    manual_offset = to_float(lfo_state.get("manualOffset"), 0.0)
                                    center_value = track_value + manual_offset
                        else:
                            # If the object changed since the previous frame (UI drag/OSC/group link),
                            # shift the LFO center by the external delta so modulation does not snap back.
                            lfo_state.pop("manualOffset", None)
                            with self.lock:
                                live_object = self.objects.get(target_object_id, default_object(target_object_id))
                            live_value = to_float(live_object.get(target_parameter), center_value)
                            last_value = to_float(lfo_state.get("lastValue"), live_value)
                            center_value += (live_value - last_value)

                        accumulator = {
                            "objectId": target_object_id,
                            "parameter": target_parameter,
                            "center": center_value,
                            "totalMod": 0.0,
                        }
                        lfo_accumulators[lfo_key] = accumulator

                    center_value = to_float(accumulator.get("center"), 0.0)

                    wave = str(lfo.get("wave") or "sine").strip().lower()
                    if wave not in LFO_WAVES:
                        wave = "sine"
                    rate_hz = max(0.0, to_float(lfo.get("rateHz"), 0.0))
                    depth = to_float(lfo.get("depth"), 0.0)
                    offset = to_float(lfo.get("offset"), 0.0)
                    phase_deg = to_float(lfo.get("phaseDeg"), 0.0)
                    mapping_phase_deg = (
                        to_float(lfo.get("mappingPhaseDeg"), 0.0)
                        + to_float(target_entry.get("phaseOffsetDeg"), 0.0)
                    )
                    phase_flip = bool(lfo.get("phaseFlip", False))
                    polarity = coerce_lfo_polarity(lfo.get("polarity"))

                    phase_cycles = (phase_ms / 1000.0) * rate_hz + ((phase_deg + mapping_phase_deg) / 360.0)
                    sample = self._lfo_sample(wave, phase_cycles)
                    if polarity == "unipolar":
                        sample = (sample + 1.0) * 0.5
                    if phase_flip:
                        sample *= -1.0
                    contribution = offset + (depth * sample)
                    accumulator["totalMod"] = to_float(accumulator.get("totalMod"), 0.0) + contribution

                    lfo_debug_samples.append(
                        {
                            "_lfoKey": lfo_key,
                            "lfoIndex": index,
                            "objectId": target_object_id,
                            "parameter": target_parameter,
                            "value": center_value + contribution,
                            "center": center_value,
                            "sample": sample,
                            "contribution": contribution,
                            "wave": wave,
                            "rateHz": rate_hz,
                            "depth": depth,
                            "offset": offset,
                            "phaseDeg": phase_deg,
                            "mappingPhaseDeg": mapping_phase_deg,
                            "phaseFlip": phase_flip,
                            "polarity": polarity,
                        }
                    )

            final_values_by_key: Dict[str, float] = {}
            for lfo_key, accumulator in lfo_accumulators.items():
                object_id = str(accumulator.get("objectId") or "").strip()
                parameter = str(accumulator.get("parameter") or "").strip()
                if not object_id or not parameter:
                    continue

                center_value = to_float(accumulator.get("center"), 0.0)
                total_mod = to_float(accumulator.get("totalMod"), 0.0)
                value = center_value + total_mod
                if parameter in OBJECT_LIMITS:
                    value = clamp(value, OBJECT_LIMITS[parameter])

                lfo_state = lfo_states.get(lfo_key)
                if isinstance(lfo_state, dict):
                    lfo_state["center"] = center_value
                    lfo_state["lastValue"] = value

                patch = patch_by_object_id.get(object_id)
                if not patch:
                    patch = {}
                    patch_by_object_id[object_id] = patch
                patch[parameter] = value
                final_values_by_key[lfo_key] = value

            for debug_sample in lfo_debug_samples:
                lfo_key = str(debug_sample.pop("_lfoKey", "")).strip()
                if lfo_key and lfo_key in final_values_by_key:
                    debug_sample["value"] = final_values_by_key[lfo_key]

        for object_id, patch in patch_by_object_id.items():
            with self.lock:
                if object_id not in self.objects:
                    continue
            self.update_object(
                object_id,
                patch,
                source=f"action:{action.get('actionId') or 'runtime'}",
                emit_osc=True,
                propagate_group_links=False,
            )

        action_id = str(action.get("actionId") or "").strip()
        if action_id and lfos_enabled and lfo_debug_samples:
            now_ms = int(time.monotonic() * 1000)
            should_emit = False
            with self.lock:
                last_emit = int(to_float(self.last_lfo_debug_emit_ms.get(action_id), 0.0))
                if now_ms - last_emit >= 200:
                    self.last_lfo_debug_emit_ms[action_id] = now_ms
                    should_emit = True
            if should_emit:
                self.emit_event(
                    "lfo_debug",
                    {
                        "actionId": action_id,
                        "elapsedMs": int(max(0, elapsed_ms)),
                        "samples": lfo_debug_samples,
                    },
                )

    def start_action(self, action_id: str, source: str = "api") -> None:
        normalized_action_id = normalize_action_id(action_id)
        with self.lock:
            if normalized_action_id in self.running_actions:
                return
            if not self.show:
                raise ValueError("No show loaded")
            action = self.show["actionsById"].get(normalized_action_id)
            if not action:
                raise ValueError(f"Action not found: {normalized_action_id}")
            if not bool(action.get("enabled", True)):
                raise ValueError(f"Action is disabled: {normalized_action_id}")
            action_snapshot = json.loads(json.dumps(action))
            lfo_states: Dict[str, Dict[str, float]] = {}
            lfo_phase_ms_by_id: Dict[str, float] = {}
            has_active_lfo_target = False
            object_groups_by_id = {group_id: dict(group) for group_id, group in self.object_groups.items()}
            for lfo in action_snapshot.get("lfos", []):
                lfo_id = str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip()
                if lfo_id and lfo_id not in lfo_phase_ms_by_id:
                    lfo_phase_ms_by_id[lfo_id] = 0.0
                if lfo.get("enabled") is False:
                    continue
                if lfo.get("targetEnabled") is False:
                    continue
                for object_id, parameter in iter_lfo_target_pairs(lfo, object_groups_by_id):
                    if not object_id or parameter not in LFO_PARAMS:
                        continue
                    if object_id not in self.objects:
                        continue
                    has_active_lfo_target = True
                    base_object = self.objects.get(object_id, default_object(object_id))
                    seed = to_float(base_object.get(parameter), 0.0)
                    lfo_states[f"{object_id}:{parameter}"] = {
                        "center": seed,
                        "lastValue": seed,
                    }
            if has_active_lfo_target:
                self.lfos_enabled = True
            stop_flag = threading.Event()

        started_at = time.monotonic()

        def run() -> None:
            next_tick = time.monotonic()
            last_tick = next_tick
            phase_state_ref = lfo_phase_ms_by_id
            while not stop_flag.is_set():
                now = time.monotonic()
                if now < next_tick:
                    time.sleep(min(ACTION_TICK_SEC, next_tick - now))
                    continue

                frame_delta_ms = max(0.0, (now - last_tick) * 1000.0)
                last_tick = now
                elapsed_ms = int((now - started_at) * 1000)
                current_action_snapshot = action_snapshot
                current_duration_ms = int(max(0.0, to_float(action_snapshot.get("durationMs"), 0.0)))
                current_lfo_phase_ms_by_id = phase_state_ref
                with self.lock:
                    running = self.running_actions.get(normalized_action_id)
                    if isinstance(running, dict):
                        updated_action_snapshot = running.get("action")
                        if isinstance(updated_action_snapshot, dict):
                            current_action_snapshot = updated_action_snapshot
                            current_duration_ms = int(max(0.0, to_float(updated_action_snapshot.get("durationMs"), 0.0)))
                        updated_lfo_phase = running.get("lfoPhaseMsById")
                        if isinstance(updated_lfo_phase, dict):
                            phase_state_ref = updated_lfo_phase
                            current_lfo_phase_ms_by_id = updated_lfo_phase

                self._apply_action_frame(
                    current_action_snapshot,
                    elapsed_ms,
                    lfo_states,
                    current_lfo_phase_ms_by_id,
                    frame_delta_ms,
                )
                if elapsed_ms >= current_duration_ms:
                    self.stop_action(normalized_action_id, "complete")
                    return

                next_tick += ACTION_TICK_SEC
                if (now - next_tick) > (ACTION_TICK_SEC * 4.0):
                    next_tick = now + ACTION_TICK_SEC

        worker = threading.Thread(target=run, daemon=True)
        with self.lock:
            self.running_actions[normalized_action_id] = {
                "thread": worker,
                "stopFlag": stop_flag,
                "startedAtMs": int(time.time() * 1000),
                "startedAtMonotonic": started_at,
                "source": source,
                "action": action_snapshot,
                "lfoStates": lfo_states,
                "lfoPhaseMsById": lfo_phase_ms_by_id,
            }
            self.last_lfo_debug_emit_ms[normalized_action_id] = 0

        worker.start()
        self.emit_event("action", {"actionId": normalized_action_id, "state": "started", "source": source})

    def _finish_action(self, action_id: str, reason: str = "stop", source: str = "api") -> None:
        normalized_action_id = normalize_action_id(action_id)
        with self.lock:
            running = self.running_actions.pop(normalized_action_id, None)
            self.last_lfo_debug_emit_ms.pop(normalized_action_id, None)
        if not running:
            return

        running["stopFlag"].set()
        self.emit_event(
            "action",
            {"actionId": normalized_action_id, "state": "stopped", "reason": reason, "source": source},
        )

        if reason != "complete":
            return

        action = running.get("action")
        if not isinstance(action, dict):
            return
        next_action_id = str(action.get("onEndActionId") or "").strip()
        if not next_action_id:
            return
        if next_action_id == normalized_action_id:
            self.emit_event(
                "action",
                {"actionId": normalized_action_id, "state": "chain_skipped", "reason": "self_chain"},
            )
            return

        try:
            self.start_action(next_action_id, source=f"on-end:{normalized_action_id}")
            self.emit_event(
                "action",
                {"actionId": normalized_action_id, "state": "chained", "nextActionId": next_action_id},
            )
        except Exception as exc:  # noqa: BLE001
            self.emit_event(
                "action",
                {
                    "actionId": normalized_action_id,
                    "state": "chain_failed",
                    "nextActionId": next_action_id,
                    "error": str(exc),
                },
            )

    def stop_action(self, action_id: str, reason: str = "stop") -> None:
        self._finish_action(action_id, reason=reason, source="api")

    def abort_action(self, action_id: str, source: str = "api") -> None:
        normalized_action_id = normalize_action_id(action_id)
        self._finish_action(normalized_action_id, reason="abort", source=source)
        self.emit_event("action", {"actionId": normalized_action_id, "state": "aborted", "source": source})

    def _handle_inbound_osc(self, message: Dict[str, Any], source_addr: Tuple[str, int]) -> None:
        address = str(message.get("address", ""))
        args = list(message.get("args", []))

        with self.lock:
            self.osc_inbound_count += 1
            self.last_inbound_at = now_iso()
            self.last_inbound_address = address

        self.emit_event(
            "osc_in",
            {
                "sourceIp": source_addr[0],
                "sourcePort": source_addr[1],
                "address": address,
                "args": args,
            },
        )

        show_snapshot = self.show
        if show_snapshot:
            for action in show_snapshot["actionsById"].values():
                if address == action["oscTriggers"]["start"]:
                    self.start_action(action["actionId"], "osc")
                    return
                if address == action["oscTriggers"]["stop"]:
                    self.stop_action(action["actionId"], "osc-stop")
                    return
                if address == action["oscTriggers"]["abort"]:
                    self.abort_action(action["actionId"], "osc")
                    return

            action_groups_by_id = show_snapshot.get("actionGroupsById")
            if isinstance(action_groups_by_id, dict):
                for action_group in action_groups_by_id.values():
                    trigger_path = str(action_group.get("oscTriggers", {}).get("trigger", "")).strip()
                    if not trigger_path:
                        continue
                    if address == trigger_path:
                        self.trigger_action_group(str(action_group.get("groupId") or ""), source="osc")
                        return

            scene_remainder = osc_strip_prefix(address, CONFIG["osc_scene_path_prefix"])
            if scene_remainder:
                parts = scene_remainder.split("/")
                if len(parts) == 2 and parts[1] == "recall":
                    self.recall_scene(unquote(parts[0]), source="osc", emit_osc=False)
                    return

        object_remainder = osc_strip_prefix(address, CONFIG["osc_object_path_prefix"])
        if object_remainder:
            parts = object_remainder.split("/")
            if len(parts) == 2:
                object_id = unquote(parts[0])
                param = parts[1]
                if param in ["x", "y", "z", "size", "gain", "mute", "algorithm"] and args:
                    value = args[0]
                    if param == "mute":
                        value = bool(int(to_float(value, 0.0)))
                    self.update_object(object_id, {param: value}, source="osc", emit_osc=False)

    def _osc_loop(self) -> None:
        while not self.stop_event.is_set():
            try:
                data, addr = self.osc_in_socket.recvfrom(8192)
            except socket.timeout:
                continue
            except OSError:
                if self.stop_event.is_set():
                    return
                time.sleep(0.05)
                continue
            try:
                message = decode_osc_message(data)
                self._handle_inbound_osc(message, addr)
            except Exception as exc:  # noqa: BLE001
                self.emit_event("osc_error", {"source": "inbound", "message": str(exc)})


RUNTIME = Runtime()


class Handler(BaseHTTPRequestHandler):
    server_version = "AmadeusPanner/0.1"

    def handle(self) -> None:
        try:
            super().handle()
        except ConnectionResetError:
            # Browser/SSE clients can drop sockets abruptly; treat as normal disconnect.
            pass

    def _send_json(self, status_code: int, payload: Dict[str, Any]) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read_json_body(self) -> Dict[str, Any]:
        raw_len = int(self.headers.get("Content-Length", "0"))
        if raw_len > 1024 * 1024:
            raise ValueError("Request body too large")
        raw = self.rfile.read(raw_len) if raw_len > 0 else b"{}"
        return json.loads(raw.decode("utf-8"))

    def _drain_request_body(self) -> None:
        raw_len = int(self.headers.get("Content-Length", "0"))
        if raw_len > 1024 * 1024:
            raise ValueError("Request body too large")
        if raw_len > 0:
            _ = self.rfile.read(raw_len)

    def _serve_static(self, filename: str, content_type: str) -> None:
        file_path = UI_ROOT / filename
        if not file_path.exists():
            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "File not found"})
            return
        raw = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _streamdeck_status_payload(self) -> Dict[str, Any]:
        runtime_status = RUNTIME.status()
        show_payload = runtime_status.get("show")
        if not isinstance(show_payload, dict):
            show_payload = {}

        actions_by_id = show_payload.get("actionsById")
        if not isinstance(actions_by_id, dict):
            actions_by_id = {}

        action_groups_by_id = show_payload.get("actionGroupsById")
        if not isinstance(action_groups_by_id, dict):
            action_groups_by_id = {}
        object_groups_raw = runtime_status.get("objectGroups")
        object_groups = object_groups_raw if isinstance(object_groups_raw, list) else []

        running_actions_raw = runtime_status.get("runningActions")
        running_actions = {str(action_id) for action_id in running_actions_raw} if isinstance(running_actions_raw, list) else set()

        action_states: Dict[str, Dict[str, Any]] = {}
        for action_id in sorted(actions_by_id.keys()):
            action = actions_by_id.get(action_id)
            if not isinstance(action, dict):
                continue
            action_states[action_id] = {
                "enabled": bool(action.get("enabled", True)),
                "running": action_id in running_actions,
            }

        action_lfo_states: Dict[str, Dict[str, Dict[str, Any]]] = {}
        for action_id in sorted(actions_by_id.keys()):
            action = actions_by_id.get(action_id)
            if not isinstance(action, dict):
                continue
            lfos = action.get("lfos")
            if not isinstance(lfos, list):
                continue
            by_lfo_id: Dict[str, Dict[str, Any]] = {}
            for raw_lfo in lfos:
                if not isinstance(raw_lfo, dict):
                    continue
                lfo_id = str(raw_lfo.get("lfoId") or raw_lfo.get("lfo_id") or "").strip()
                if not lfo_id:
                    continue
                current = by_lfo_id.get(lfo_id)
                if not isinstance(current, dict):
                    current = {"mappingCount": 0, "enabledCount": 0}
                current["mappingCount"] = int(to_float(current.get("mappingCount"), 0.0)) + 1
                if bool(raw_lfo.get("enabled", True)):
                    current["enabledCount"] = int(to_float(current.get("enabledCount"), 0.0)) + 1
                by_lfo_id[lfo_id] = current
            for lfo_id, lfo_info in by_lfo_id.items():
                mapping_count = int(to_float(lfo_info.get("mappingCount"), 0.0))
                enabled_count = int(to_float(lfo_info.get("enabledCount"), 0.0))
                by_lfo_id[lfo_id] = {
                    "enabled": enabled_count > 0,
                    "mixed": enabled_count > 0 and enabled_count < mapping_count,
                    "mappingCount": mapping_count,
                    "enabledCount": enabled_count,
                }
            if by_lfo_id:
                action_lfo_states[action_id] = by_lfo_id

        action_group_states: Dict[str, Dict[str, Any]] = {}
        for group_id in sorted(action_groups_by_id.keys()):
            group = action_groups_by_id.get(group_id)
            if not isinstance(group, dict):
                continue
            action_group_states[group_id] = {
                "enabled": bool(group.get("enabled", True)),
            }

        object_group_states: Dict[str, Dict[str, Any]] = {}
        for raw_group in object_groups:
            if not isinstance(raw_group, dict):
                continue
            group_id = str(raw_group.get("groupId") or "").strip()
            if not group_id:
                continue
            member_ids = raw_group.get("objectIds")
            object_group_states[group_id] = {
                "enabled": bool(raw_group.get("enabled", True)),
                "memberCount": len(member_ids) if isinstance(member_ids, list) else 0,
            }

        object_states: Dict[str, Dict[str, Any]] = {}
        objects_raw = runtime_status.get("objects")
        objects = objects_raw if isinstance(objects_raw, list) else []
        for raw_object in objects:
            if not isinstance(raw_object, dict):
                continue
            object_id = str(raw_object.get("objectId") or "").strip()
            if not object_id:
                continue
            object_states[object_id] = {
                "hidden": bool(raw_object.get("hidden", False)),
            }

        available_show_paths = discover_show_paths()

        show_state: Optional[Dict[str, Any]] = None
        if show_payload:
            scene_ids = show_payload.get("sceneIds")
            show_state = {
                "path": str(show_payload.get("path") or ""),
                "showId": str(show_payload.get("showId") or ""),
                "name": str(show_payload.get("name") or ""),
                "sceneIds": scene_ids if isinstance(scene_ids, list) else [],
            }

        return {
            "ok": True,
            "hardware": "streamdeck",
            "at": now_iso(),
            "show": show_state,
            "activeSceneId": str(runtime_status.get("activeSceneId") or ""),
            "groupsEnabled": bool(runtime_status.get("groupsEnabled", True)),
            "lfosEnabled": bool(runtime_status.get("lfosEnabled", True)),
            "selectedObjectIds": runtime_status.get("selectedObjectIds") if isinstance(runtime_status.get("selectedObjectIds"), list) else [],
            "selectedGroupId": str(runtime_status.get("selectedGroupId") or ""),
            "runningActions": sorted(running_actions),
            "actions": action_states,
            "actionLfos": action_lfo_states,
            "actionGroups": action_group_states,
            "objectGroups": object_group_states,
            "objects": object_states,
            "availableShows": available_show_paths,
            "availableShowCount": len(available_show_paths),
        }

    def _streamdeck_base_url(self) -> str:
        host_header = str(self.headers.get("Host") or "").strip()
        if host_header:
            if host_header.startswith("http://") or host_header.startswith("https://"):
                return host_header.rstrip("/")
            return f"http://{host_header}".rstrip("/")

        fallback_host = str(CONFIG.get("host") or "127.0.0.1").strip() or "127.0.0.1"
        if fallback_host in {"0.0.0.0", "::"}:
            fallback_host = "127.0.0.1"
        fallback_port = int(to_float(CONFIG.get("http_port"), 8787.0))
        return f"http://{fallback_host}:{fallback_port}"

    def _streamdeck_button(
        self,
        row: int,
        col: int,
        title: str,
        path: str,
        notes: str = "",
    ) -> Dict[str, Any]:
        normalized_path = "/" + str(path or "").lstrip("/")
        return {
            "row": row,
            "col": col,
            "title": str(title or "").strip() or "Button",
            "method": "GET",
            "requestMode": "background",
            "path": normalized_path,
            "url": f"{self._streamdeck_base_url()}{normalized_path}",
            "system": "Website",
            "notes": str(notes or "").strip(),
        }

    def _streamdeck_button_state_payload(
        self,
        kind: str,
        active: bool,
        disabled: bool = False,
        active_label: str = "ON",
        inactive_label: str = "OFF",
    ) -> Dict[str, Any]:
        if disabled:
            return {
                "kind": kind,
                "state": "disabled",
                "active": False,
                "disabled": True,
                "label": "DIS",
                "color": "#72414c",
            }
        is_active = bool(active)
        return {
            "kind": kind,
            "state": "active" if is_active else "inactive",
            "active": is_active,
            "disabled": False,
            "label": active_label if is_active else inactive_label,
            "color": "#1f8f5f" if is_active else "#3f4a56",
        }

    def _streamdeck_button_state_for_path(self, path: str, streamdeck_status: Dict[str, Any]) -> Dict[str, Any]:
        button_path = "/" + str(path or "").lstrip("/")

        selected_object_ids_raw = streamdeck_status.get("selectedObjectIds")
        selected_object_ids = {str(object_id) for object_id in selected_object_ids_raw} if isinstance(selected_object_ids_raw, list) else set()
        selected_group_id = str(streamdeck_status.get("selectedGroupId") or "").strip()
        active_scene_id = str(streamdeck_status.get("activeSceneId") or "").strip()
        groups_enabled = bool(streamdeck_status.get("groupsEnabled", True))
        lfos_enabled = bool(streamdeck_status.get("lfosEnabled", True))

        actions_raw = streamdeck_status.get("actions")
        actions = actions_raw if isinstance(actions_raw, dict) else {}
        action_lfos_raw = streamdeck_status.get("actionLfos")
        action_lfos = action_lfos_raw if isinstance(action_lfos_raw, dict) else {}
        action_groups_raw = streamdeck_status.get("actionGroups")
        action_groups = action_groups_raw if isinstance(action_groups_raw, dict) else {}
        object_groups_raw = streamdeck_status.get("objectGroups")
        object_groups = object_groups_raw if isinstance(object_groups_raw, dict) else {}
        objects_raw = streamdeck_status.get("objects")
        objects = objects_raw if isinstance(objects_raw, dict) else {}
        available_shows_raw = streamdeck_status.get("availableShows")
        available_shows = available_shows_raw if isinstance(available_shows_raw, list) else []

        show_payload = streamdeck_status.get("show")
        show_loaded = isinstance(show_payload, dict) and bool(str(show_payload.get("showId") or "").strip())
        current_show_path = str(show_payload.get("path") or "").strip() if isinstance(show_payload, dict) else ""
        available_show_count = int(to_float(streamdeck_status.get("availableShowCount"), float(len(available_shows))))

        if button_path == "/api/hardware/streamdeck/status":
            return self._streamdeck_button_state_payload("status", True, active_label="LIVE", inactive_label="IDLE")
        if button_path == "/api/hardware/streamdeck/show/save":
            return self._streamdeck_button_state_payload("save", show_loaded, active_label="READY", inactive_label="N/A")
        if button_path == "/api/hardware/streamdeck/show/load/current":
            return self._streamdeck_button_state_payload("show-load-current", show_loaded, active_label="LOAD", inactive_label="N/A")
        if button_path == "/api/hardware/streamdeck/show/load/next":
            return self._streamdeck_button_state_payload(
                "show-load-next",
                available_show_count > 1,
                disabled=available_show_count <= 1,
                active_label="NEXT",
                inactive_label="N/A",
            )
        if button_path == "/api/hardware/streamdeck/show/save-as/timestamp":
            return self._streamdeck_button_state_payload("show-save-as", show_loaded, active_label="READY", inactive_label="N/A")
        if button_path == "/api/hardware/streamdeck/show/new/timestamp":
            return self._streamdeck_button_state_payload("show-new", True, active_label="READY", inactive_label="N/A")
        if button_path == "/api/hardware/streamdeck/groups/enabled/toggle":
            return self._streamdeck_button_state_payload("groups-master", groups_enabled)
        if button_path == "/api/hardware/streamdeck/lfos/enabled/toggle":
            return self._streamdeck_button_state_payload("lfos-master", lfos_enabled)
        if button_path == "/api/hardware/streamdeck/objects/hide/toggle":
            if not objects:
                return self._streamdeck_button_state_payload("objects-hide", False, disabled=True)
            hidden_count = sum(1 for state in objects.values() if isinstance(state, dict) and bool(state.get("hidden", False)))
            if hidden_count <= 0:
                return self._streamdeck_button_state_payload("objects-hide", False, active_label="ALL", inactive_label="NONE")
            if hidden_count >= len(objects):
                return self._streamdeck_button_state_payload("objects-hide", True, active_label="ALL", inactive_label="NONE")
            mixed_payload = self._streamdeck_button_state_payload("objects-hide", True, active_label="ALL", inactive_label="NONE")
            mixed_payload["state"] = "mixed"
            mixed_payload["label"] = "MIX"
            mixed_payload["color"] = "#8a6f2d"
            return mixed_payload
        if button_path == "/api/hardware/streamdeck/object-selection/clear":
            return self._streamdeck_button_state_payload("object-selection-clear", len(selected_object_ids) > 0, active_label="CLR", inactive_label="-")
        if button_path == "/api/hardware/streamdeck/group-selection/clear":
            return self._streamdeck_button_state_payload("group-selection-clear", bool(selected_group_id), active_label="CLR", inactive_label="-")

        scene_match = re.fullmatch(r"/api/hardware/streamdeck/scene/([^/]+)/recall", button_path)
        if scene_match:
            scene_id = unquote(scene_match.group(1))
            return self._streamdeck_button_state_payload("scene", active_scene_id == scene_id, active_label="LIVE", inactive_label="IDLE")

        action_command_match = re.fullmatch(r"/api/hardware/streamdeck/action/([^/]+)/(start|trigger|stop|abort|toggle)", button_path)
        if action_command_match:
            action_id = unquote(action_command_match.group(1))
            command = action_command_match.group(2)
            action_state = actions.get(action_id)
            if not isinstance(action_state, dict):
                return self._streamdeck_button_state_payload("action", False, disabled=True)
            action_enabled = bool(action_state.get("enabled", True))
            action_running = bool(action_state.get("running", False))
            if command in {"stop", "abort"}:
                return self._streamdeck_button_state_payload("action", action_running, disabled=not action_enabled, active_label="RUN", inactive_label="IDLE")
            return self._streamdeck_button_state_payload("action", action_running, disabled=not action_enabled, active_label="RUN", inactive_label="IDLE")

        action_enabled_match = re.fullmatch(r"/api/hardware/streamdeck/action/([^/]+)/enabled/(on|off|toggle)", button_path)
        if action_enabled_match:
            action_id = unquote(action_enabled_match.group(1))
            action_state = actions.get(action_id)
            if not isinstance(action_state, dict):
                return self._streamdeck_button_state_payload("action-enabled", False, disabled=True)
            action_enabled = bool(action_state.get("enabled", True))
            return self._streamdeck_button_state_payload("action-enabled", action_enabled)

        action_lfo_enabled_match = re.fullmatch(r"/api/hardware/streamdeck/action/([^/]+)/lfo/([^/]+)/enabled/(on|off|toggle)", button_path)
        if action_lfo_enabled_match:
            action_id = unquote(action_lfo_enabled_match.group(1))
            lfo_id = unquote(action_lfo_enabled_match.group(2))
            action_lfo_map = action_lfos.get(action_id)
            if not isinstance(action_lfo_map, dict):
                return self._streamdeck_button_state_payload("action-lfo-enabled", False, disabled=True)
            lfo_state = action_lfo_map.get(lfo_id)
            if not isinstance(lfo_state, dict):
                return self._streamdeck_button_state_payload("action-lfo-enabled", False, disabled=True)
            lfo_enabled = bool(lfo_state.get("enabled", False))
            mixed = bool(lfo_state.get("mixed", False))
            state_payload = self._streamdeck_button_state_payload("action-lfo-enabled", lfo_enabled)
            if mixed:
                state_payload["label"] = "MIX"
                state_payload["state"] = "mixed"
                state_payload["color"] = "#8a6f2d"
            return state_payload

        action_group_trigger_match = re.fullmatch(r"/api/hardware/streamdeck/action-group/([^/]+)/trigger", button_path)
        if action_group_trigger_match:
            group_id = unquote(action_group_trigger_match.group(1))
            group_state = action_groups.get(group_id)
            if not isinstance(group_state, dict):
                return self._streamdeck_button_state_payload("action-group", False, disabled=True)
            return self._streamdeck_button_state_payload("action-group", bool(group_state.get("enabled", True)), active_label="READY", inactive_label="OFF")

        action_group_enabled_match = re.fullmatch(r"/api/hardware/streamdeck/action-group/([^/]+)/enabled/(on|off|toggle)", button_path)
        if action_group_enabled_match:
            group_id = unquote(action_group_enabled_match.group(1))
            group_state = action_groups.get(group_id)
            if not isinstance(group_state, dict):
                return self._streamdeck_button_state_payload("action-group-enabled", False, disabled=True)
            return self._streamdeck_button_state_payload("action-group-enabled", bool(group_state.get("enabled", True)))

        object_select_match = re.fullmatch(r"/api/hardware/streamdeck/object/([^/]+)/select", button_path)
        if object_select_match:
            object_id = unquote(object_select_match.group(1))
            return self._streamdeck_button_state_payload("object-select", object_id in selected_object_ids, active_label="SEL", inactive_label="-")

        object_hide_match = re.fullmatch(r"/api/hardware/streamdeck/object/([^/]+)/hide/(on|off|toggle)", button_path)
        if object_hide_match:
            object_id = unquote(object_hide_match.group(1))
            object_state = objects.get(object_id)
            if not isinstance(object_state, dict):
                return self._streamdeck_button_state_payload("object-hide", False, disabled=True)
            return self._streamdeck_button_state_payload("object-hide", bool(object_state.get("hidden", False)), active_label="HIDE", inactive_label="SHOW")

        group_select_match = re.fullmatch(r"/api/hardware/streamdeck/group/([^/]+)/select", button_path)
        if group_select_match:
            group_id = unquote(group_select_match.group(1))
            return self._streamdeck_button_state_payload("group-select", selected_group_id == group_id, active_label="SEL", inactive_label="-")

        group_enabled_match = re.fullmatch(r"/api/hardware/streamdeck/group/([^/]+)/enabled/(on|off|toggle)", button_path)
        if group_enabled_match:
            group_id = unquote(group_enabled_match.group(1))
            group_state = object_groups.get(group_id)
            if not isinstance(group_state, dict):
                return self._streamdeck_button_state_payload("group-enabled", False, disabled=True)
            return self._streamdeck_button_state_payload("group-enabled", bool(group_state.get("enabled", True)))

        return self._streamdeck_button_state_payload("unknown", False, active_label="", inactive_label="")

    def _streamdeck_layout_with_state(self, layout: Dict[str, Any], streamdeck_status: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(layout, dict):
            return {}
        buttons_raw = layout.get("buttons")
        buttons = buttons_raw if isinstance(buttons_raw, list) else []
        next_buttons: List[Dict[str, Any]] = []
        for raw_button in buttons:
            if not isinstance(raw_button, dict):
                continue
            next_button = dict(raw_button)
            next_button["state"] = self._streamdeck_button_state_for_path(str(next_button.get("path") or ""), streamdeck_status)
            next_buttons.append(next_button)
        next_layout = dict(layout)
        next_layout["buttons"] = next_buttons
        return next_layout

    def _streamdeck_layout_state_payload(self, layout: Dict[str, Any], streamdeck_status: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(layout, dict):
            raise ValueError("Layout payload is invalid")
        layout_id = str(layout.get("layoutId") or "")
        buttons_raw = layout.get("buttons")
        buttons = buttons_raw if isinstance(buttons_raw, list) else []
        button_states: List[Dict[str, Any]] = []
        for raw_button in buttons:
            if not isinstance(raw_button, dict):
                continue
            button_states.append(
                {
                    "row": int(to_float(raw_button.get("row"), 0.0)),
                    "col": int(to_float(raw_button.get("col"), 0.0)),
                    "path": str(raw_button.get("path") or ""),
                    "title": str(raw_button.get("title") or ""),
                    "state": self._streamdeck_button_state_for_path(str(raw_button.get("path") or ""), streamdeck_status),
                }
            )
        return {
            "ok": True,
            "hardware": "streamdeck",
            "generatedAt": now_iso(),
            "layoutId": layout_id,
            "buttons": button_states,
        }

    def _streamdeck_layouts_payload(self) -> Dict[str, Any]:
        runtime_status = RUNTIME.status()
        streamdeck_status = self._streamdeck_status_payload()
        show_payload = runtime_status.get("show")
        if not isinstance(show_payload, dict):
            show_payload = {}

        action_ids_raw = show_payload.get("actionIds")
        action_ids = sorted({str(action_id).strip() for action_id in action_ids_raw}) if isinstance(action_ids_raw, list) else []
        action_ids = [action_id for action_id in action_ids if action_id]

        action_groups_by_id = show_payload.get("actionGroupsById")
        if not isinstance(action_groups_by_id, dict):
            action_groups_by_id = {}
        action_group_ids = sorted([str(group_id).strip() for group_id in action_groups_by_id.keys() if str(group_id).strip()])

        object_groups_raw = runtime_status.get("objectGroups")
        object_groups = object_groups_raw if isinstance(object_groups_raw, list) else []
        object_group_ids: List[str] = []
        for raw_group in object_groups:
            if not isinstance(raw_group, dict):
                continue
            group_id = str(raw_group.get("groupId") or "").strip()
            if group_id:
                object_group_ids.append(group_id)
        object_group_ids = sorted(set(object_group_ids))

        objects_raw = runtime_status.get("objects")
        objects = objects_raw if isinstance(objects_raw, list) else []
        object_ids: List[str] = []
        for raw_object in objects:
            if not isinstance(raw_object, dict):
                continue
            object_id = str(raw_object.get("objectId") or "").strip()
            if object_id:
                object_ids.append(object_id)
        object_ids = sorted(set(object_ids))

        action_lfos_raw = streamdeck_status.get("actionLfos")
        action_lfos = action_lfos_raw if isinstance(action_lfos_raw, dict) else {}
        action_lfo_pairs: List[Tuple[str, str]] = []
        for action_id in sorted(action_lfos.keys()):
            lfo_map = action_lfos.get(action_id)
            if not isinstance(lfo_map, dict):
                continue
            for lfo_id in sorted(lfo_map.keys()):
                if not str(lfo_id).strip():
                    continue
                action_lfo_pairs.append((str(action_id), str(lfo_id)))

        def short_label(prefix: str, raw_id: str, max_len: int = 8) -> str:
            normalized_prefix = str(prefix or "")
            normalized_id = str(raw_id or "").strip()
            if not normalized_id:
                return normalized_prefix.strip()[:max_len] or "Key"
            available_id_len = max(1, max_len - len(normalized_prefix))
            if len(normalized_id) > available_id_len:
                normalized_id = normalized_id[:available_id_len]
            return f"{normalized_prefix}{normalized_id}"[:max_len]

        def available_slots(excluded: Optional[Set[Tuple[int, int]]] = None) -> List[Tuple[int, int]]:
            blocked = excluded if isinstance(excluded, set) else set()
            slots: List[Tuple[int, int]] = []
            for row in range(3):
                for col in range(8):
                    if (row, col) not in blocked:
                        slots.append((row, col))
            return slots

        page_1_buttons: List[Dict[str, Any]] = [
            self._streamdeck_button(0, 0, "Status", "/api/hardware/streamdeck/status", "Read compact runtime state"),
            self._streamdeck_button(0, 1, "ObjClr", "/api/hardware/streamdeck/object-selection/clear", "Clear selected object IDs"),
            self._streamdeck_button(0, 2, "GrpClr", "/api/hardware/streamdeck/group-selection/clear", "Clear selected group ID"),
        ]
        page_1_slots = available_slots({(0, 0), (0, 1), (0, 2)})
        page_1_cursor = 0
        for object_id in object_ids:
            if page_1_cursor >= len(page_1_slots):
                break
            row, col = page_1_slots[page_1_cursor]
            page_1_cursor += 1
            page_1_buttons.append(
                self._streamdeck_button(
                    row,
                    col,
                    short_label("SEL ", object_id),
                    f"/api/hardware/streamdeck/object/{quote(object_id, safe='')}/select",
                    f"Select object {object_id}",
                )
            )
        for group_id in object_group_ids:
            if page_1_cursor >= len(page_1_slots):
                break
            row, col = page_1_slots[page_1_cursor]
            page_1_cursor += 1
            page_1_buttons.append(
                self._streamdeck_button(
                    row,
                    col,
                    short_label("GRP ", group_id),
                    f"/api/hardware/streamdeck/group/{quote(group_id, safe='')}/select",
                    f"Select group {group_id}",
                )
            )

        page_2_buttons: List[Dict[str, Any]] = [
            self._streamdeck_button(0, 0, "Status", "/api/hardware/streamdeck/status", "Read compact runtime state"),
            self._streamdeck_button(0, 1, "AllHide", "/api/hardware/streamdeck/objects/hide/toggle", "Toggle all object hide states"),
        ]
        page_2_slots = available_slots({(0, 0), (0, 1)})
        for (row, col), object_id in zip(page_2_slots, object_ids):
            page_2_buttons.append(
                self._streamdeck_button(
                    row,
                    col,
                    short_label("H ", object_id),
                    f"/api/hardware/streamdeck/object/{quote(object_id, safe='')}/hide/toggle",
                    f"Toggle hidden state for object {object_id}",
                )
            )

        page_3_buttons: List[Dict[str, Any]] = [
            self._streamdeck_button(0, 0, "Status", "/api/hardware/streamdeck/status", "Read compact runtime state"),
            self._streamdeck_button(0, 1, "GrpAll", "/api/hardware/streamdeck/groups/enabled/toggle", "Toggle all object group linking"),
            self._streamdeck_button(0, 2, "AllView", "/api/hardware/streamdeck/objects/hide/toggle", "Toggle all object visibility"),
        ]
        page_3_slots = available_slots({(0, 0), (0, 1), (0, 2)})
        for (row, col), group_id in zip(page_3_slots, object_group_ids):
            page_3_buttons.append(
                self._streamdeck_button(
                    row,
                    col,
                    short_label("GE ", group_id),
                    f"/api/hardware/streamdeck/group/{quote(group_id, safe='')}/enabled/toggle",
                    f"Toggle enabled state for group {group_id}",
                )
            )

        page_4_buttons: List[Dict[str, Any]] = [
            self._streamdeck_button(0, 0, "Status", "/api/hardware/streamdeck/status", "Read compact runtime state"),
        ]
        page_4_slots = available_slots({(0, 0)})
        page_4_cursor = 0
        for action_id in action_ids:
            if page_4_cursor >= len(page_4_slots):
                break
            row, col = page_4_slots[page_4_cursor]
            page_4_cursor += 1
            page_4_buttons.append(
                self._streamdeck_button(
                    row,
                    col,
                    short_label("TR ", action_id),
                    f"/api/hardware/streamdeck/action/{quote(action_id, safe='')}/trigger",
                    f"Trigger action {action_id}",
                )
            )
        for action_id in action_ids:
            if page_4_cursor >= len(page_4_slots):
                break
            row, col = page_4_slots[page_4_cursor]
            page_4_cursor += 1
            page_4_buttons.append(
                self._streamdeck_button(
                    row,
                    col,
                    short_label("EN ", action_id),
                    f"/api/hardware/streamdeck/action/{quote(action_id, safe='')}/enabled/toggle",
                    f"Toggle enabled state for action {action_id}",
                )
            )
        for action_id, lfo_id in action_lfo_pairs:
            if page_4_cursor >= len(page_4_slots):
                break
            row, col = page_4_slots[page_4_cursor]
            page_4_cursor += 1
            page_4_buttons.append(
                self._streamdeck_button(
                    row,
                    col,
                    short_label("LFO ", f"{action_id}:{lfo_id}"),
                    f"/api/hardware/streamdeck/action/{quote(action_id, safe='')}/lfo/{quote(lfo_id, safe='')}/enabled/toggle",
                    f"Toggle LFO {lfo_id} for action {action_id}",
                )
            )

        page_5_buttons: List[Dict[str, Any]] = [
            self._streamdeck_button(0, 0, "Status", "/api/hardware/streamdeck/status", "Read compact runtime state"),
        ]
        page_5_slots = available_slots({(0, 0)})
        page_5_cursor = 0
        for group_id in action_group_ids:
            if page_5_cursor >= len(page_5_slots):
                break
            row, col = page_5_slots[page_5_cursor]
            page_5_cursor += 1
            page_5_buttons.append(
                self._streamdeck_button(
                    row,
                    col,
                    short_label("TR ", group_id),
                    f"/api/hardware/streamdeck/action-group/{quote(group_id, safe='')}/trigger",
                    f"Trigger action group {group_id}",
                )
            )
        for group_id in action_group_ids:
            if page_5_cursor >= len(page_5_slots):
                break
            row, col = page_5_slots[page_5_cursor]
            page_5_cursor += 1
            page_5_buttons.append(
                self._streamdeck_button(
                    row,
                    col,
                    short_label("EN ", group_id),
                    f"/api/hardware/streamdeck/action-group/{quote(group_id, safe='')}/enabled/toggle",
                    f"Toggle enabled state for action group {group_id}",
                )
            )

        page_6_buttons: List[Dict[str, Any]] = [
            self._streamdeck_button(0, 0, "Status", "/api/hardware/streamdeck/status", "Read compact runtime state"),
        ]

        page_7_buttons: List[Dict[str, Any]] = [
            self._streamdeck_button(0, 0, "Status", "/api/hardware/streamdeck/status", "Read compact runtime state"),
        ]

        page_8_buttons: List[Dict[str, Any]] = [
            self._streamdeck_button(0, 0, "Status", "/api/hardware/streamdeck/status", "Read compact runtime state"),
            self._streamdeck_button(0, 1, "Save", "/api/hardware/streamdeck/show/save", "Persist current show"),
            self._streamdeck_button(0, 2, "LoadCur", "/api/hardware/streamdeck/show/load/current", "Reload current show"),
            self._streamdeck_button(0, 3, "LoadNxt", "/api/hardware/streamdeck/show/load/next", "Load next show in showfiles list"),
            self._streamdeck_button(0, 4, "SaveAs", "/api/hardware/streamdeck/show/save-as/timestamp", "Save current show under timestamped path"),
            self._streamdeck_button(0, 5, "AddShow", "/api/hardware/streamdeck/show/new/timestamp", "Create and load a new timestamped show"),
            self._streamdeck_button(0, 6, "GrpAll", "/api/hardware/streamdeck/groups/enabled/toggle", "Toggle all object group linking"),
            self._streamdeck_button(0, 7, "LFOAll", "/api/hardware/streamdeck/lfos/enabled/toggle", "Toggle all LFO processing"),
            self._streamdeck_button(1, 0, "ObjClr", "/api/hardware/streamdeck/object-selection/clear", "Clear selected object IDs"),
            self._streamdeck_button(1, 1, "GrpClr", "/api/hardware/streamdeck/group-selection/clear", "Clear selected group ID"),
        ]

        layouts = [
            {
                "layoutId": "xl-page-1-obj-select",
                "title": "Page 1 - Obj Select",
                "description": "Object selection with feedback",
                "buttons": page_1_buttons,
            },
            {
                "layoutId": "xl-page-2-obj-hide",
                "title": "Page 2 - Obj Hide",
                "description": "Per-object hide control with feedback",
                "buttons": page_2_buttons,
            },
            {
                "layoutId": "xl-page-3-group-enable",
                "title": "Page 3 - Group Enable",
                "description": "Group enable controls plus all-toggle view",
                "buttons": page_3_buttons,
            },
            {
                "layoutId": "xl-page-4-actions",
                "title": "Page 4 - Trigger Actions",
                "description": "Action trigger, enable, and LFO controls",
                "buttons": page_4_buttons,
            },
            {
                "layoutId": "xl-page-5-action-groups",
                "title": "Page 5 - Trigger Action Groups",
                "description": "Action group trigger and enable controls",
                "buttons": page_5_buttons,
            },
            {
                "layoutId": "xl-page-6-empty",
                "title": "Page 6 - Empty",
                "description": "Reserved for future mappings",
                "buttons": page_6_buttons,
            },
            {
                "layoutId": "xl-page-7-empty",
                "title": "Page 7 - Empty",
                "description": "Reserved for future mappings",
                "buttons": page_7_buttons,
            },
            {
                "layoutId": "xl-page-8-config",
                "title": "Page 8 - Config",
                "description": "Show load/save operations and global toggles",
                "buttons": page_8_buttons,
            },
        ]
        layouts_with_state = [self._streamdeck_layout_with_state(layout, streamdeck_status) for layout in layouts]

        return {
            "ok": True,
            "hardware": "streamdeck",
            "device": {"model": "Stream Deck XL", "columns": 8, "rows": 4},
            "generatedAt": now_iso(),
            "baseUrl": self._streamdeck_base_url(),
            "showId": str(show_payload.get("showId") or ""),
            "stateSource": "/api/hardware/streamdeck/status",
            "layouts": layouts_with_state,
        }

    def _handle_streamdeck_request(self, path_name: str) -> bool:
        prefix = "/api/hardware/streamdeck/"
        if path_name == "/api/hardware/streamdeck/status":
            self._send_json(HTTPStatus.OK, self._streamdeck_status_payload())
            return True
        if path_name == "/api/hardware/streamdeck/layout":
            self._send_json(HTTPStatus.OK, self._streamdeck_layouts_payload())
            return True
        if not path_name.startswith(prefix):
            return False

        try:
            route = path_name[len(prefix) :].strip("/")
            segments = [unquote(segment).strip() for segment in route.split("/") if segment.strip()]
            if not segments:
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "statusPath": "/api/hardware/streamdeck/status",
                        "routes": [
                            "/api/hardware/streamdeck/layout",
                            "/api/hardware/streamdeck/layout/<layoutId>",
                            "/api/hardware/streamdeck/layout/<layoutId>/state",
                            "/api/hardware/streamdeck/show/save",
                            "/api/hardware/streamdeck/show/load/current",
                            "/api/hardware/streamdeck/show/load/next",
                            "/api/hardware/streamdeck/show/save-as/timestamp",
                            "/api/hardware/streamdeck/show/new/timestamp",
                            "/api/hardware/streamdeck/scene/<sceneId>/recall",
                            "/api/hardware/streamdeck/object/<objectId>/select",
                            "/api/hardware/streamdeck/object/<objectId>/hide/<on|off|toggle>",
                            "/api/hardware/streamdeck/objects/hide/toggle",
                            "/api/hardware/streamdeck/object-selection/clear",
                            "/api/hardware/streamdeck/group/<groupId>/select",
                            "/api/hardware/streamdeck/group-selection/clear",
                            "/api/hardware/streamdeck/group/<groupId>/enabled/<on|off|toggle>",
                            "/api/hardware/streamdeck/action/<actionId>/<start|stop|abort|toggle>",
                            "/api/hardware/streamdeck/action/<actionId>/trigger",
                            "/api/hardware/streamdeck/action/<actionId>/lfo/<lfoId>/enabled/<on|off|toggle>",
                            "/api/hardware/streamdeck/action/<actionId>/enabled/<on|off|toggle>",
                            "/api/hardware/streamdeck/action-group/<groupId>/trigger",
                            "/api/hardware/streamdeck/action-group/<groupId>/enabled/<on|off|toggle>",
                            "/api/hardware/streamdeck/groups/enabled/<on|off|toggle>",
                            "/api/hardware/streamdeck/lfos/enabled/<on|off|toggle>",
                        ],
                    },
                )
                return True

            root = segments[0].lower()

            if root == "layout":
                payload = self._streamdeck_layouts_payload()
                if len(segments) == 1:
                    self._send_json(HTTPStatus.OK, payload)
                    return True
                if len(segments) == 2:
                    requested_layout_id = str(segments[1] or "").strip().lower()
                    layouts = payload.get("layouts")
                    if not isinstance(layouts, list):
                        raise ValueError("No layouts available")
                    for layout in layouts:
                        if not isinstance(layout, dict):
                            continue
                        layout_id = str(layout.get("layoutId") or "").strip().lower()
                        if layout_id == requested_layout_id:
                            self._send_json(
                                HTTPStatus.OK,
                                {
                                    "ok": True,
                                    "hardware": "streamdeck",
                                    "device": payload.get("device"),
                                    "generatedAt": payload.get("generatedAt"),
                                    "baseUrl": payload.get("baseUrl"),
                                    "showId": payload.get("showId"),
                                    "layout": layout,
                                },
                            )
                            return True
                    raise ValueError(f"Unknown layoutId: {segments[1]}")
                if len(segments) == 3 and segments[2].lower() == "state":
                    requested_layout_id = str(segments[1] or "").strip().lower()
                    layouts = payload.get("layouts")
                    if not isinstance(layouts, list):
                        raise ValueError("No layouts available")
                    for layout in layouts:
                        if not isinstance(layout, dict):
                            continue
                        layout_id = str(layout.get("layoutId") or "").strip().lower()
                        if layout_id != requested_layout_id:
                            continue
                        streamdeck_status = self._streamdeck_status_payload()
                        state_payload = self._streamdeck_layout_state_payload(layout, streamdeck_status)
                        state_payload["baseUrl"] = payload.get("baseUrl")
                        state_payload["stateSource"] = "/api/hardware/streamdeck/status"
                        self._send_json(HTTPStatus.OK, state_payload)
                        return True
                    raise ValueError(f"Unknown layoutId: {segments[1]}")
                raise ValueError("Layout route must be /layout, /layout/<layoutId>, or /layout/<layoutId>/state")

            if root == "show" and len(segments) == 2 and segments[1].lower() == "save":
                result = RUNTIME.save_show(capture_runtime_scene=True)
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "show",
                        "command": "save",
                        **result,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "show" and len(segments) == 3 and segments[1].lower() == "load":
                load_mode = segments[2].lower()
                if load_mode == "current":
                    with RUNTIME.lock:
                        if not RUNTIME.show:
                            raise ValueError("No show loaded")
                        current_path = str(RUNTIME.show.get("path") or "").strip()
                    if not current_path:
                        raise ValueError("Current show path is empty")
                    RUNTIME.load_show(current_path)
                    self._send_json(
                        HTTPStatus.OK,
                        {
                            "ok": True,
                            "hardware": "streamdeck",
                            "target": "show",
                            "command": "load-current",
                            "path": current_path,
                            "streamdeckStatus": self._streamdeck_status_payload(),
                        },
                    )
                    return True
                if load_mode == "next":
                    show_paths = discover_show_paths()
                    if not show_paths:
                        raise ValueError("No shows available")
                    with RUNTIME.lock:
                        current_path = str((RUNTIME.show or {}).get("path") or "").strip()
                    next_path = show_paths[0]
                    if current_path and current_path in show_paths:
                        next_index = (show_paths.index(current_path) + 1) % len(show_paths)
                        next_path = show_paths[next_index]
                    RUNTIME.load_show(next_path)
                    self._send_json(
                        HTTPStatus.OK,
                        {
                            "ok": True,
                            "hardware": "streamdeck",
                            "target": "show",
                            "command": "load-next",
                            "path": next_path,
                            "streamdeckStatus": self._streamdeck_status_payload(),
                        },
                    )
                    return True
                raise ValueError("Show load mode must be: current or next")

            if root == "show" and len(segments) == 3 and segments[1].lower() == "save-as" and segments[2].lower() == "timestamp":
                with RUNTIME.lock:
                    if not RUNTIME.show:
                        raise ValueError("No show loaded")
                    current_path = str(RUNTIME.show.get("path") or "").strip()
                if not current_path:
                    raise ValueError("Current show path is empty")
                timestamp = time.strftime("%Y%m%d-%H%M%S", time.localtime())
                current_relative_path = Path(current_path)
                suffix = current_relative_path.suffix if current_relative_path.suffix else ".json"
                target_relative_path = str(
                    current_relative_path.with_name(f"{current_relative_path.stem}-save-as-{timestamp}{suffix}")
                ).replace("\\", "/")
                result = RUNTIME.save_show(
                    show_path=target_relative_path,
                    set_as_current=True,
                    capture_runtime_scene=True,
                )
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "show",
                        "command": "save-as-timestamp",
                        **result,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "show" and len(segments) == 3 and segments[1].lower() == "new" and segments[2].lower() == "timestamp":
                timestamp = time.strftime("%Y%m%d-%H%M%S", time.localtime())
                new_show_path = f"showfiles/streamdeck-{timestamp}/show.json"
                result = RUNTIME.create_new_show(new_show_path, overwrite=False)
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "show",
                        "command": "new-timestamp",
                        **result,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "scene" and len(segments) == 3 and segments[2].lower() == "recall":
                scene_id = normalize_scene_id(segments[1])
                RUNTIME.recall_scene(scene_id, source="streamdeck", emit_osc=True)
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "scene",
                        "sceneId": scene_id,
                        "command": "recall",
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "object" and len(segments) == 3 and segments[2].lower() == "select":
                object_id = normalize_object_id(segments[1])
                selected_object_ids = RUNTIME.select_objects([object_id], source="streamdeck")
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "object",
                        "objectId": object_id,
                        "command": "select",
                        "selectedObjectIds": selected_object_ids,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "object" and len(segments) == 4 and segments[2].lower() == "hide":
                object_id = normalize_object_id(segments[1])
                switch = normalize_enabled_switch(segments[3])
                with RUNTIME.lock:
                    object_payload = RUNTIME.objects.get(object_id)
                    if not isinstance(object_payload, dict):
                        raise ValueError(f"Object not found: {object_id}")
                    current_hidden = bool(object_payload.get("hidden", False))
                hidden = apply_enabled_switch(current_hidden, switch)
                updated = RUNTIME.update_object(
                    object_id,
                    {"hidden": hidden},
                    source="streamdeck",
                    emit_osc=False,
                    propagate_group_links=False,
                )
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "object",
                        "objectId": object_id,
                        "command": "hide",
                        "switch": switch,
                        "hidden": hidden,
                        "object": updated,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "objects" and len(segments) == 3 and segments[1].lower() == "hide":
                switch = normalize_enabled_switch(segments[2])
                with RUNTIME.lock:
                    object_ids = sorted(RUNTIME.objects.keys())
                    hidden_count = sum(
                        1
                        for obj in RUNTIME.objects.values()
                        if isinstance(obj, dict) and bool(obj.get("hidden", False))
                    )
                if not object_ids:
                    raise ValueError("No objects available")
                current_all_hidden = hidden_count == len(object_ids)
                hidden = apply_enabled_switch(current_all_hidden, switch)
                for object_id in object_ids:
                    RUNTIME.update_object(
                        object_id,
                        {"hidden": hidden},
                        source="streamdeck",
                        emit_osc=False,
                        propagate_group_links=False,
                    )
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "objects",
                        "command": "hide",
                        "switch": switch,
                        "hidden": hidden,
                        "count": len(object_ids),
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "object-selection" and len(segments) == 2 and segments[1].lower() == "clear":
                _ = RUNTIME.clear_object_selection(source="streamdeck")
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "object-selection",
                        "command": "clear",
                        "selectedObjectIds": [],
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "group" and len(segments) == 3 and segments[2].lower() == "select":
                group_id = normalize_object_id(segments[1])
                selected_group_id = RUNTIME.select_group(group_id, source="streamdeck")
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "group",
                        "groupId": selected_group_id,
                        "command": "select",
                        "selectedGroupId": selected_group_id,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "group-selection" and len(segments) == 2 and segments[1].lower() == "clear":
                _ = RUNTIME.clear_group_selection(source="streamdeck")
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "group-selection",
                        "command": "clear",
                        "selectedGroupId": "",
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "group" and len(segments) == 4 and segments[2].lower() == "enabled":
                group_id = normalize_object_id(segments[1])
                switch = normalize_enabled_switch(segments[3])
                with RUNTIME.lock:
                    group = RUNTIME.object_groups.get(group_id)
                    if not isinstance(group, dict):
                        raise ValueError(f"Group not found: {group_id}")
                    current_enabled = bool(group.get("enabled", True))
                enabled = apply_enabled_switch(current_enabled, switch)
                _ = RUNTIME.update_object_group(group_id, {"enabled": enabled}, source="streamdeck")
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "group",
                        "groupId": group_id,
                        "command": "enabled",
                        "switch": switch,
                        "enabled": enabled,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "action" and len(segments) == 3:
                action_id = normalize_action_id(segments[1])
                command = segments[2].lower()
                executed_command = command
                if command == "start":
                    RUNTIME.start_action(action_id, "streamdeck")
                elif command == "trigger":
                    RUNTIME.start_action(action_id, "streamdeck")
                    executed_command = "start"
                elif command == "stop":
                    RUNTIME.stop_action(action_id, "streamdeck")
                elif command == "abort":
                    RUNTIME.abort_action(action_id, "streamdeck")
                elif command == "toggle":
                    with RUNTIME.lock:
                        if not RUNTIME.show:
                            raise ValueError("No show loaded")
                        actions_by_id = RUNTIME.show.get("actionsById")
                        if not isinstance(actions_by_id, dict) or action_id not in actions_by_id:
                            raise ValueError(f"Action not found: {action_id}")
                        is_running = action_id in RUNTIME.running_actions
                    if is_running:
                        RUNTIME.stop_action(action_id, "streamdeck-toggle")
                        executed_command = "stop"
                    else:
                        RUNTIME.start_action(action_id, "streamdeck-toggle")
                        executed_command = "start"
                else:
                    raise ValueError("Action command must be one of: start, trigger, stop, abort, toggle")

                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "action",
                        "actionId": action_id,
                        "command": command,
                        "executed": executed_command,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "action" and len(segments) == 6 and segments[2].lower() == "lfo" and segments[4].lower() == "enabled":
                action_id = normalize_action_id(segments[1])
                lfo_id = normalize_lfo_id(segments[3])
                switch = normalize_enabled_switch(segments[5])
                with RUNTIME.lock:
                    if not RUNTIME.show:
                        raise ValueError("No show loaded")
                    actions_by_id = RUNTIME.show.get("actionsById")
                    if not isinstance(actions_by_id, dict):
                        actions_by_id = {}
                    action = actions_by_id.get(action_id)
                    if not isinstance(action, dict):
                        raise ValueError(f"Action not found: {action_id}")
                    lfos = action.get("lfos")
                    if not isinstance(lfos, list):
                        lfos = []
                    matching_lfos = [
                        lfo
                        for lfo in lfos
                        if isinstance(lfo, dict) and str(lfo.get("lfoId") or lfo.get("lfo_id") or "").strip() == lfo_id
                    ]
                    if not matching_lfos:
                        raise ValueError(f"LFO not found in action: {lfo_id}")
                    current_enabled = any(bool(lfo.get("enabled", True)) for lfo in matching_lfos)
                enabled = apply_enabled_switch(current_enabled, switch)
                result = RUNTIME.set_action_lfo_enabled(action_id, lfo_id, enabled, source="streamdeck")
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "action-lfo",
                        "actionId": action_id,
                        "lfoId": lfo_id,
                        "command": "enabled",
                        "switch": switch,
                        "enabled": enabled,
                        **result,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "action" and len(segments) == 4 and segments[2].lower() == "enabled":
                action_id = normalize_action_id(segments[1])
                switch = normalize_enabled_switch(segments[3])
                with RUNTIME.lock:
                    if not RUNTIME.show:
                        raise ValueError("No show loaded")
                    actions_by_id = RUNTIME.show.get("actionsById")
                    if not isinstance(actions_by_id, dict):
                        actions_by_id = {}
                    action = actions_by_id.get(action_id)
                    if not isinstance(action, dict):
                        raise ValueError(f"Action not found: {action_id}")
                    current_enabled = bool(action.get("enabled", True))
                enabled = apply_enabled_switch(current_enabled, switch)
                _ = RUNTIME.update_action(action_id, {"enabled": enabled}, source="streamdeck")
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "action",
                        "actionId": action_id,
                        "command": "enabled",
                        "switch": switch,
                        "enabled": enabled,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "action-group" and len(segments) == 3 and segments[2].lower() == "trigger":
                group_id = normalize_action_group_id(segments[1])
                result = RUNTIME.trigger_action_group(group_id, source="streamdeck")
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "action-group",
                        "groupId": group_id,
                        "command": "trigger",
                        **result,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "action-group" and len(segments) == 4 and segments[2].lower() == "enabled":
                group_id = normalize_action_group_id(segments[1])
                switch = normalize_enabled_switch(segments[3])
                with RUNTIME.lock:
                    if not RUNTIME.show:
                        raise ValueError("No show loaded")
                    action_groups_by_id = RUNTIME.show.get("actionGroupsById")
                    if not isinstance(action_groups_by_id, dict):
                        action_groups_by_id = {}
                    action_group = action_groups_by_id.get(group_id)
                    if not isinstance(action_group, dict):
                        raise ValueError(f"Action group not found: {group_id}")
                    current_enabled = bool(action_group.get("enabled", True))
                enabled = apply_enabled_switch(current_enabled, switch)
                _ = RUNTIME.update_action_group(group_id, {"enabled": enabled}, source="streamdeck")
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "action-group",
                        "groupId": group_id,
                        "command": "enabled",
                        "switch": switch,
                        "enabled": enabled,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "groups" and len(segments) == 3 and segments[1].lower() == "enabled":
                switch = normalize_enabled_switch(segments[2])
                with RUNTIME.lock:
                    current_enabled = bool(RUNTIME.groups_enabled)
                enabled = apply_enabled_switch(current_enabled, switch)
                RUNTIME.set_groups_enabled(enabled, source="streamdeck")
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "groups",
                        "command": "enabled",
                        "switch": switch,
                        "enabled": enabled,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            if root == "lfos" and len(segments) == 3 and segments[1].lower() == "enabled":
                switch = normalize_enabled_switch(segments[2])
                with RUNTIME.lock:
                    current_enabled = bool(RUNTIME.lfos_enabled)
                enabled = apply_enabled_switch(current_enabled, switch)
                RUNTIME.set_lfos_enabled(enabled, source="streamdeck")
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "hardware": "streamdeck",
                        "target": "lfos",
                        "command": "enabled",
                        "switch": switch,
                        "enabled": enabled,
                        "streamdeckStatus": self._streamdeck_status_payload(),
                    },
                )
                return True

            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "hardware": "streamdeck", "error": "Unknown streamdeck endpoint"})
            return True
        except Exception as exc:  # noqa: BLE001
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "hardware": "streamdeck", "error": str(exc)})
            return True

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path_name = parsed.path

        if path_name == "/":
            self._serve_static("index.html", "text/html; charset=utf-8")
            return
        if path_name == "/app.js":
            self._serve_static("app.js", "text/javascript; charset=utf-8")
            return
        if path_name == "/styles.css":
            self._serve_static("styles.css", "text/css; charset=utf-8")
            return
        if path_name == "/api/status":
            self._send_json(HTTPStatus.OK, RUNTIME.status())
            return
        if path_name == "/api/osc/config":
            self._send_json(HTTPStatus.OK, {"ok": True, "osc": RUNTIME.osc_runtime_config()})
            return
        if path_name == "/api/show/list":
            with RUNTIME.lock:
                current_path = str(RUNTIME.show["path"]) if RUNTIME.show else None
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "paths": discover_show_paths(),
                    "current": current_path,
                },
            )
            return
        if path_name == "/api/events":
            self._stream_events()
            return
        if self._handle_streamdeck_request(path_name):
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})

    def _stream_events(self) -> None:
        q = RUNTIME.subscribe_events()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        try:
            status_event = {"id": 0, "type": "status", "at": now_iso(), "payload": RUNTIME.status()}
            self.wfile.write(f"event: status\ndata: {json.dumps(status_event)}\n\n".encode("utf-8"))
            self.wfile.flush()

            with RUNTIME.lock:
                snapshot = list(RUNTIME.recent_events)
            for event in snapshot:
                self.wfile.write(f"event: {event['type']}\ndata: {json.dumps(event)}\n\n".encode("utf-8"))
            self.wfile.flush()

            while not RUNTIME.stop_event.is_set():
                try:
                    event = q.get(timeout=10)
                    self.wfile.write(f"event: {event['type']}\ndata: {json.dumps(event)}\n\n".encode("utf-8"))
                    self.wfile.flush()
                except queue.Empty:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            RUNTIME.unsubscribe_events(q)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path_name = parsed.path

        try:
            if path_name.startswith("/api/hardware/streamdeck/"):
                self._drain_request_body()
                if self._handle_streamdeck_request(path_name):
                    return

            if path_name == "/api/osc/config":
                body = self._read_json_body()
                osc_config = RUNTIME.update_osc_runtime_config(body, source="api")
                self._send_json(HTTPStatus.OK, {"ok": True, "osc": osc_config, "status": RUNTIME.status()})
                return

            if path_name == "/api/show/load":
                body = self._read_json_body()
                RUNTIME.load_show(str(body.get("path", "showfiles/_template/show.json")))
                self._send_json(HTTPStatus.OK, {"ok": True, "status": RUNTIME.status()})
                return

            if path_name == "/api/show/save":
                body = self._read_json_body()
                result = RUNTIME.save_show(
                    show_path=body.get("path"),
                    set_as_current=bool(body.get("setAsCurrent", True)),
                )
                self._send_json(HTTPStatus.OK, {"ok": True, **result, "status": RUNTIME.status()})
                return

            if path_name == "/api/show/new":
                body = self._read_json_body()
                result = RUNTIME.create_new_show(
                    show_path=str(body.get("path", "")),
                    overwrite=bool(body.get("overwrite", False)),
                )
                self._send_json(HTTPStatus.OK, {"ok": True, **result, "status": RUNTIME.status()})
                return

            if path_name.startswith("/api/scene/"):
                parts = path_name.split("/")
                if len(parts) < 5:
                    self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown scene endpoint"})
                    return
                scene_id = unquote(parts[3]) if len(parts) > 3 else ""
                command = parts[4]
                body = self._read_json_body()

                if command == "recall":
                    RUNTIME.recall_scene(scene_id, source="api", emit_osc=True)
                    self._send_json(HTTPStatus.OK, {"ok": True, "sceneId": scene_id, "command": command, "status": RUNTIME.status()})
                    return
                if command == "save":
                    scene = RUNTIME.save_scene(scene_id, source="api")
                    self._send_json(HTTPStatus.OK, {"ok": True, "scene": scene, "sceneId": scene["sceneId"], "command": command, "status": RUNTIME.status()})
                    return
                if command == "save-as":
                    new_scene_id = body.get("newSceneId") or body.get("new_scene_id")
                    scene = RUNTIME.save_scene_as(scene_id, str(new_scene_id or ""), source="api")
                    self._send_json(
                        HTTPStatus.OK,
                        {
                            "ok": True,
                            "scene": scene,
                            "sceneId": scene["sceneId"],
                            "fromSceneId": scene_id,
                            "command": command,
                            "status": RUNTIME.status(),
                        },
                    )
                    return

                self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": f"Unknown scene command: {command}"})
                return

            if path_name == "/api/object/add":
                body = self._read_json_body()
                object_id = normalize_object_id(body.get("objectId") or body.get("object_id"))
                created = RUNTIME.add_object(object_id, body, source="api", emit_osc=True)
                self._send_json(HTTPStatus.OK, {"ok": True, "object": created, "status": RUNTIME.status()})
                return

            if path_name == "/api/object/clear":
                _ = self._read_json_body()
                cleared_ids = RUNTIME.clear_objects(source="api")
                self._send_json(
                    HTTPStatus.OK,
                    {"ok": True, "clearedCount": len(cleared_ids), "clearedObjectIds": cleared_ids, "status": RUNTIME.status()},
                )
                return

            if path_name.startswith("/api/object/") and path_name.endswith("/rename"):
                parts = path_name.split("/")
                object_id = unquote(parts[3]) if len(parts) > 3 else ""
                body = self._read_json_body()
                new_object_id = normalize_object_id(body.get("newObjectId") or body.get("new_object_id"))
                renamed = RUNTIME.rename_object(object_id, new_object_id, source="api", emit_osc=True)
                self._send_json(HTTPStatus.OK, {"ok": True, "object": renamed, "status": RUNTIME.status()})
                return

            if path_name.startswith("/api/object/") and path_name.endswith("/remove"):
                parts = path_name.split("/")
                object_id = unquote(parts[3]) if len(parts) > 3 else ""
                removed = RUNTIME.remove_object(object_id, source="api")
                self._send_json(HTTPStatus.OK, {"ok": True, "removedObjectId": removed["objectId"], "status": RUNTIME.status()})
                return

            if path_name.startswith("/api/object/"):
                parts = path_name.split("/")
                if len(parts) != 4:
                    self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown object endpoint"})
                    return
                object_id = unquote(parts[3]) if len(parts) > 3 else ""
                body = self._read_json_body()
                propagate_group_links = True
                client_update_session_id = ""
                client_update_seq: Optional[int] = None
                lfo_center_mode = False
                lfo_center_gesture_id = ""
                include_status = True
                if isinstance(body, dict):
                    body = dict(body)
                    if "propagateGroupLinks" in body:
                        propagate_group_links = bool(body.get("propagateGroupLinks"))
                        body.pop("propagateGroupLinks", None)
                    elif "propagate_group_links" in body:
                        propagate_group_links = bool(body.get("propagate_group_links"))
                        body.pop("propagate_group_links", None)
                    raw_client_session_id = body.pop(
                        "clientUpdateSessionId",
                        body.pop("client_update_session_id", ""),
                    )
                    client_update_session_id = str(raw_client_session_id or "").strip()
                    raw_client_seq = body.pop("clientUpdateSeq", body.pop("client_update_seq", None))
                    if raw_client_seq is not None:
                        try:
                            candidate_seq = int(raw_client_seq)
                            if candidate_seq > 0:
                                client_update_seq = candidate_seq
                        except (TypeError, ValueError):
                            client_update_seq = None
                    raw_lfo_center_mode = body.pop(
                        "lfoCenterMode",
                        body.pop("lfo_center_mode", False),
                    )
                    lfo_center_mode = bool(raw_lfo_center_mode)
                    raw_lfo_center_gesture_id = body.pop(
                        "lfoCenterGestureId",
                        body.pop("lfo_center_gesture_id", ""),
                    )
                    lfo_center_gesture_id = str(raw_lfo_center_gesture_id or "").strip()
                    if "includeStatus" in body:
                        include_status = bool(body.pop("includeStatus"))
                    elif "include_status" in body:
                        include_status = bool(body.pop("include_status"))
                updated = RUNTIME.update_object(
                    object_id,
                    body,
                    source="api",
                    emit_osc=True,
                    propagate_group_links=propagate_group_links,
                    client_update_session_id=client_update_session_id,
                    client_update_seq=client_update_seq,
                    lfo_center_mode=lfo_center_mode,
                    lfo_center_gesture_id=lfo_center_gesture_id,
                )
                response_payload: Dict[str, Any] = {"ok": True, "object": updated}
                if include_status:
                    response_payload["status"] = RUNTIME.status()
                self._send_json(HTTPStatus.OK, response_payload)
                return

            if path_name == "/api/groups/create":
                body = self._read_json_body()
                group_id = normalize_object_id(body.get("groupId") or body.get("group_id"))
                group = RUNTIME.create_object_group(
                    group_id=group_id,
                    name=str(body.get("name") or group_id),
                    object_ids=body.get("objectIds") or body.get("object_ids") or [],
                    link_params=body.get("linkParams") or body.get("link_params") or [],
                    color=body.get("color"),
                    enabled=bool(body.get("enabled", True)),
                    source="api",
                )
                self._send_json(HTTPStatus.OK, {"ok": True, "group": group, "status": RUNTIME.status()})
                return

            if path_name == "/api/groups/enabled":
                body = self._read_json_body()
                enabled = bool(body.get("enabled", True))
                RUNTIME.set_groups_enabled(enabled, source="api")
                self._send_json(HTTPStatus.OK, {"ok": True, "enabled": enabled, "status": RUNTIME.status()})
                return

            if path_name == "/api/lfos/enabled":
                body = self._read_json_body()
                enabled = bool(body.get("enabled", True))
                RUNTIME.set_lfos_enabled(enabled, source="api")
                self._send_json(HTTPStatus.OK, {"ok": True, "enabled": enabled, "status": RUNTIME.status()})
                return

            if path_name == "/api/action-lfo/enabled":
                body = self._read_json_body()
                action_id = normalize_action_id(body.get("actionId") or body.get("action_id"))
                lfo_id = normalize_lfo_id(body.get("lfoId") or body.get("lfo_id"))
                enabled = bool(body.get("enabled", True))
                result = RUNTIME.set_action_lfo_enabled(action_id, lfo_id, enabled, source="api")
                self._send_json(HTTPStatus.OK, {"ok": True, **result, "status": RUNTIME.status()})
                return

            if path_name == "/api/action-lfo/target-enabled":
                body = self._read_json_body()
                action_id = normalize_action_id(body.get("actionId") or body.get("action_id"))
                lfo_id = normalize_lfo_id(body.get("lfoId") or body.get("lfo_id"))
                target_scope = normalize_lfo_target_scope(body.get("targetScope") or body.get("target_scope"))
                object_id = str(body.get("objectId") or body.get("object_id") or "").strip()
                group_id = str(body.get("groupId") or body.get("group_id") or "").strip()
                parameter = str(body.get("parameter") or "").strip().lower()
                enabled = bool(body.get("enabled", True))
                result = RUNTIME.set_action_lfo_target_enabled(
                    action_id,
                    lfo_id,
                    target_scope,
                    object_id,
                    group_id,
                    parameter,
                    enabled,
                    source="api",
                )
                self._send_json(HTTPStatus.OK, {"ok": True, **result, "status": RUNTIME.status()})
                return

            if path_name == "/api/action-lfo/update":
                body = self._read_json_body()
                if not isinstance(body, dict):
                    raise ValueError("Body must be an object")
                action_id = normalize_action_id(body.get("actionId") or body.get("action_id"))
                lfo_id = normalize_lfo_id(body.get("lfoId") or body.get("lfo_id"))
                patch = dict(body)
                patch.pop("actionId", None)
                patch.pop("action_id", None)
                patch.pop("lfoId", None)
                patch.pop("lfo_id", None)
                result = RUNTIME.update_action_lfo(action_id, lfo_id, patch, source="api")
                self._send_json(HTTPStatus.OK, {"ok": True, **result, "status": RUNTIME.status()})
                return

            if path_name.startswith("/api/groups/") and path_name.endswith("/update"):
                parts = path_name.split("/")
                if len(parts) < 5:
                    self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown groups endpoint"})
                    return
                group_id = unquote(parts[3])
                body = self._read_json_body()
                group = RUNTIME.update_object_group(group_id, body, source="api")
                self._send_json(HTTPStatus.OK, {"ok": True, "group": group, "status": RUNTIME.status()})
                return

            if path_name.startswith("/api/groups/") and path_name.endswith("/delete"):
                parts = path_name.split("/")
                if len(parts) < 5:
                    self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown groups endpoint"})
                    return
                group_id = unquote(parts[3])
                _ = self._read_json_body()
                deleted = RUNTIME.delete_object_group(group_id, source="api")
                self._send_json(HTTPStatus.OK, {"ok": True, "groupId": deleted["groupId"], "status": RUNTIME.status()})
                return

            if path_name == "/api/action/create":
                body = self._read_json_body()
                action_id = normalize_action_id(body.get("actionId") or body.get("action_id"))
                action = RUNTIME.create_action(action_id, body, source="api")
                self._send_json(HTTPStatus.OK, {"ok": True, "action": action, "status": RUNTIME.status()})
                return

            if path_name == "/api/action-group/create":
                body = self._read_json_body()
                group_id = normalize_action_group_id(body.get("groupId") or body.get("group_id"))
                group = RUNTIME.create_action_group(group_id, body, source="api")
                self._send_json(HTTPStatus.OK, {"ok": True, "group": group, "status": RUNTIME.status()})
                return

            if path_name.startswith("/api/action-group/"):
                parts = path_name.split("/")
                if len(parts) < 5:
                    self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown action-group endpoint"})
                    return
                group_id = unquote(parts[3])
                command = parts[4]
                body = self._read_json_body()

                if command == "update":
                    group = RUNTIME.update_action_group(group_id, body, source="api")
                    self._send_json(HTTPStatus.OK, {"ok": True, "group": group, "groupId": group["groupId"], "command": command, "status": RUNTIME.status()})
                    return
                if command == "delete":
                    deleted = RUNTIME.delete_action_group(group_id, source="api")
                    self._send_json(HTTPStatus.OK, {"ok": True, "groupId": deleted["groupId"], "command": command, "status": RUNTIME.status()})
                    return
                if command == "trigger":
                    result = RUNTIME.trigger_action_group(group_id, source="api")
                    self._send_json(HTTPStatus.OK, {"ok": True, **result, "command": command, "status": RUNTIME.status()})
                    return

                self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": f"Unknown action-group command: {command}"})
                return

            if path_name.startswith("/api/action/"):
                parts = path_name.split("/")
                if len(parts) < 5:
                    self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown action endpoint"})
                    return
                action_id = unquote(parts[3])
                command = parts[4]
                body = self._read_json_body()

                if command == "update":
                    action = RUNTIME.update_action(action_id, body, source="api")
                    self._send_json(HTTPStatus.OK, {"ok": True, "action": action, "actionId": action["actionId"], "command": command, "status": RUNTIME.status()})
                    return
                if command == "save-as":
                    new_action_id = body.get("newActionId") or body.get("new_action_id")
                    patch = dict(body)
                    patch.pop("newActionId", None)
                    patch.pop("new_action_id", None)
                    action = RUNTIME.save_action_as(action_id, str(new_action_id or ""), patch=patch, source="api")
                    self._send_json(
                        HTTPStatus.OK,
                        {
                            "ok": True,
                            "action": action,
                            "actionId": action["actionId"],
                            "fromActionId": normalize_action_id(action_id),
                            "command": command,
                            "status": RUNTIME.status(),
                        },
                    )
                    return
                if command == "delete":
                    deleted = RUNTIME.delete_action(action_id, source="api")
                    self._send_json(HTTPStatus.OK, {"ok": True, "actionId": deleted["actionId"], "command": command, "status": RUNTIME.status()})
                    return
                if command == "start":
                    RUNTIME.start_action(action_id, "api")
                elif command == "stop":
                    RUNTIME.stop_action(action_id, "api-stop")
                elif command == "abort":
                    RUNTIME.abort_action(action_id, "api")
                else:
                    self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": f"Unknown action command: {command}"})
                    return

                self._send_json(
                    HTTPStatus.OK,
                    {"ok": True, "actionId": action_id, "command": command, "status": RUNTIME.status()},
                )
                return

            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})
        except Exception as exc:  # noqa: BLE001
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})

    def log_message(self, fmt: str, *args: Any) -> None:
        message = "%s - - [%s] %s" % (self.address_string(), self.log_date_time_string(), fmt % args)
        print(message)


def run() -> None:
    RUNTIME.start()

    httpd = ThreadingHTTPServer((CONFIG["host"], CONFIG["http_port"]), Handler)
    httpd.timeout = 1

    print("Amadeus Panner dev server started")
    print(f"HTTP: http://{CONFIG['host']}:{CONFIG['http_port']}")
    print(f"OSC out: {CONFIG['osc_out_host']}:{CONFIG['osc_out_port']}")
    print(f"OSC in: 0.0.0.0:{CONFIG['osc_in_port']}")
    print(f"OSC object prefix: {CONFIG['osc_object_path_prefix']}")
    print(f"OSC scene prefix: {CONFIG['osc_scene_path_prefix']}")
    print(f"OSC action prefix: {CONFIG['osc_action_path_prefix']}")
    print(f"OSC action-group prefix: {CONFIG['osc_action_group_path_prefix']}")

    stop_main = threading.Event()

    def stop_handler(_signum: int, _frame: Any) -> None:
        stop_main.set()

    signal.signal(signal.SIGINT, stop_handler)
    signal.signal(signal.SIGTERM, stop_handler)

    while not stop_main.is_set():
        httpd.handle_request()

    httpd.server_close()
    RUNTIME.shutdown()
    print("Shut down")


if __name__ == "__main__":
    run()
