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
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import unquote, urlparse

from showfile_validator import validate_show_bundle

PROJECT_ROOT = Path(__file__).resolve().parents[2]
UI_ROOT = PROJECT_ROOT / "apps" / "ui" / "public"

CONFIG = {
    "mode": os.getenv("MODE", "program"),
    "host": os.getenv("HOST", "0.0.0.0"),
    "http_port": int(os.getenv("HTTP_PORT", "8787")),
    "osc_out_host": os.getenv("OSC_OUT_HOST", "127.0.0.1"),
    "osc_out_port": int(os.getenv("OSC_OUT_PORT", "9000")),
    "osc_in_port": int(os.getenv("OSC_IN_PORT", "9001")),
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
LFO_WAVES = {"sine", "triangle", "square", "saw"}


def clamp(value: float, min_max: Tuple[float, float]) -> float:
    lo, hi = min_max
    return max(lo, min(hi, value))


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        out = float(value)
        if math.isfinite(out):
            return out
    except (TypeError, ValueError):
        pass
    return default


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
        "excludeFromAll": bool(input_obj.get("exclude_from_all") if "exclude_from_all" in input_obj else input_obj.get("excludeFromAll", False)),
    }


def normalize_action_lfo(raw_lfo: Dict[str, Any]) -> Dict[str, Any]:
    object_id = normalize_object_id(raw_lfo.get("object_id") if "object_id" in raw_lfo else raw_lfo.get("objectId"))
    parameter = str(raw_lfo.get("parameter") or "").strip()
    if parameter not in LFO_PARAMS:
        raise ValueError(f"LFO parameter must be one of: {', '.join(sorted(LFO_PARAMS))}")

    wave = str(raw_lfo.get("wave") or "sine").strip().lower()
    if wave not in LFO_WAVES:
        raise ValueError(f"LFO wave must be one of: {', '.join(sorted(LFO_WAVES))}")

    rate_hz = max(0.0, to_float(raw_lfo.get("rate_hz") if "rate_hz" in raw_lfo else raw_lfo.get("rateHz"), 0.0))
    depth = to_float(raw_lfo.get("depth"), 0.0)
    offset = to_float(raw_lfo.get("offset"), 0.0)
    phase_deg = to_float(raw_lfo.get("phase_deg") if "phase_deg" in raw_lfo else raw_lfo.get("phaseDeg"), 0.0)

    return {
        "objectId": object_id,
        "parameter": parameter,
        "wave": wave,
        "rateHz": rate_hz,
        "depth": depth,
        "offset": offset,
        "phaseDeg": phase_deg,
    }


def normalize_action(raw_action: Dict[str, Any], fallback_id: str) -> Dict[str, Any]:
    action_id = normalize_action_id(raw_action.get("action_id") or raw_action.get("actionId") or fallback_id)
    osc_triggers_raw = raw_action.get("osc_triggers") if "osc_triggers" in raw_action else raw_action.get("oscTriggers")
    if not isinstance(osc_triggers_raw, dict):
        osc_triggers_raw = {}

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
    for raw_lfo in lfos_raw:
        if not isinstance(raw_lfo, dict):
            continue
        normalized_lfos.append(normalize_action_lfo(raw_lfo))

    return {
        "actionId": action_id,
        "name": str(raw_action.get("name") or action_id),
        "enabled": bool(raw_action.get("enabled", True)),
        "durationMs": int(max(0.0, to_float(raw_action.get("duration_ms") if "duration_ms" in raw_action else raw_action.get("durationMs"), 0.0))),
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
    return {
        "object_id": normalize_object_id(lfo.get("objectId")),
        "parameter": str(lfo.get("parameter") or ""),
        "wave": str(lfo.get("wave") or "sine"),
        "rate_hz": to_float(lfo.get("rateHz"), 0.0),
        "depth": to_float(lfo.get("depth"), 0.0),
        "offset": to_float(lfo.get("offset"), 0.0),
        "phase_deg": to_float(lfo.get("phaseDeg"), 0.0),
    }


def action_to_raw(action: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "action_id": normalize_action_id(action.get("actionId")),
        "name": str(action.get("name") or action.get("actionId") or "action"),
        "enabled": bool(action.get("enabled", True)),
        "duration_ms": int(max(0.0, to_float(action.get("durationMs"), 0.0))),
        "on_end_action_id": str(action.get("onEndActionId") or ""),
        "tracks": action.get("tracks", []) if isinstance(action.get("tracks"), list) else [],
        "lfos": [lfo_to_raw(lfo) for lfo in (action.get("lfos") if isinstance(action.get("lfos"), list) else [])],
        "osc_triggers": {
            "start": str(action.get("oscTriggers", {}).get("start", "")),
            "stop": str(action.get("oscTriggers", {}).get("stop", "")),
            "abort": str(action.get("oscTriggers", {}).get("abort", "")),
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
        self.groups_enabled = True
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

        self.osc_out_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.osc_in_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.osc_in_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.osc_in_socket.bind(("0.0.0.0", CONFIG["osc_in_port"]))
        self.osc_in_socket.settimeout(1.0)

        self.stop_event = threading.Event()
        self.osc_thread = threading.Thread(target=self._osc_loop, daemon=True)

    def start(self) -> None:
        self.load_show("showfiles/_template/show.json")
        self.osc_thread.start()
        self.emit_event(
            "system",
            {
                "message": "server_started",
                "http": f"http://{CONFIG['host']}:{CONFIG['http_port']}",
                "oscOut": f"{CONFIG['osc_out_host']}:{CONFIG['osc_out_port']}",
                "oscIn": f"0.0.0.0:{CONFIG['osc_in_port']}",
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
                }

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

        self._sanitize_action_links(normalized_actions)

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

        show_payload = {
            "show_id": show_id,
            "name": show_name,
            "version": show_version,
            "created_at": created_at,
            "updated_at": updated_at,
            "default_scene_id": default_scene_id,
            "scenes": scene_refs,
            "actions": action_refs,
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
            self.show["sceneFiles"] = updated_scene_files
            self.show["actionFiles"] = updated_action_files
            self.show["metadata"] = metadata
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
        self._sanitize_action_links(actions_by_id)

        with self.lock:
            running_action_ids = list(self.running_actions.keys())
        for action_id in running_action_ids:
            self.stop_action(action_id, "show-load")

        with self.lock:
            self.object_groups = {}
            self.objects = {}
            self.active_scene_id = None
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
        self._send_osc(f"/art/object/{object_id}/{param}", [value])

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

    def delete_object_group(self, group_id: str, source: str = "api") -> Dict[str, Any]:
        normalized_group_id = normalize_object_id(group_id)
        if normalized_group_id.lower() == VIRTUAL_ALL_GROUP_ID:
            raise ValueError("Group ID 'all' is reserved")
        with self.lock:
            if normalized_group_id not in self.object_groups:
                raise ValueError(f"Group not found: {normalized_group_id}")
            deleted = self.object_groups.pop(normalized_group_id)

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
        with self.lock:
            if normalized_id not in self.objects:
                raise ValueError(f"Object not found: {normalized_id}")
            removed = self.objects.pop(normalized_id)

        self._cleanup_groups_for_object(normalized_id)

        self.emit_event(
            "object_manager",
            {
                "source": source,
                "action": "remove",
                "objectId": normalized_id,
            },
        )
        return removed

    def clear_objects(self, source: str = "api") -> List[str]:
        with self.lock:
            object_ids = sorted(self.objects.keys())
            self.objects = {}
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
    ) -> Dict[str, Any]:
        with self.lock:
            current = self.objects.get(object_id, default_object(object_id))
            merged = {**current, **patch, "objectId": object_id, "object_id": object_id}
            next_obj = normalize_object(merged, object_id)

            changed = [
                k
                for k in ["x", "y", "z", "size", "gain", "mute", "algorithm", "type", "color", "excludeFromAll"]
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
            self._send_osc(f"/art/scene/{scene_id}/recall", [1])

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
            self._sanitize_action_links(actions_by_id)
            self.show["actionsById"] = actions_by_id

            action_files = self.show.get("actionFiles")
            if not isinstance(action_files, dict):
                action_files = {}
            action_files[normalized_action_id] = str(action_files.get(normalized_action_id) or f"actions/{normalized_action_id}.json")
            self.show["actionFiles"] = action_files

        self.save_show(capture_runtime_scene=False)
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
            self._sanitize_action_links(actions_by_id)
            self.show["actionsById"] = actions_by_id

            if current.get("enabled", True) and not updated.get("enabled", True):
                should_stop = normalized_action_id in self.running_actions

        if should_stop:
            self.stop_action(normalized_action_id, "disabled")

        self.save_show(capture_runtime_scene=False)
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
            self._sanitize_action_links(actions_by_id)
            self.show["actionsById"] = actions_by_id

            action_files = self.show.get("actionFiles")
            if not isinstance(action_files, dict):
                action_files = {}
            action_files[normalized_new_action_id] = f"actions/{normalized_new_action_id}.json"
            self.show["actionFiles"] = action_files

        self.save_show(capture_runtime_scene=False)
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

            action_files = self.show.get("actionFiles")
            if not isinstance(action_files, dict):
                action_files = {}
            action_files.pop(normalized_action_id, None)
            self.show["actionFiles"] = action_files

            was_running = normalized_action_id in self.running_actions
            deleted = dict(current)

        if was_running:
            self.stop_action(normalized_action_id, "deleted")

        self.save_show(capture_runtime_scene=False)
        self.emit_event(
            "action",
            {"actionId": normalized_action_id, "state": "deleted", "source": source},
        )
        return deleted

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

    def _apply_action_frame(self, action: Dict[str, Any], elapsed_ms: int, lfo_bases: Dict[str, float]) -> None:
        patch_by_object_id: Dict[str, Dict[str, Any]] = {}

        for track in action.get("tracks", []):
            object_id = str(track.get("object_id") or track.get("objectId") or "")
            parameter = str(track.get("parameter") or "")
            if not object_id or not parameter:
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

        for lfo in action.get("lfos", []):
            object_id = str(lfo.get("objectId") or lfo.get("object_id") or "").strip()
            parameter = str(lfo.get("parameter") or "").strip()
            if not object_id or parameter not in LFO_PARAMS:
                continue

            lfo_key = f"{object_id}:{parameter}"
            if lfo_key not in lfo_bases:
                with self.lock:
                    base_object = self.objects.get(object_id, default_object(object_id))
                    lfo_bases[lfo_key] = to_float(base_object.get(parameter), 0.0)
            base_value = lfo_bases.get(lfo_key, 0.0)

            wave = str(lfo.get("wave") or "sine").strip().lower()
            if wave not in LFO_WAVES:
                wave = "sine"
            rate_hz = max(0.0, to_float(lfo.get("rateHz"), 0.0))
            depth = to_float(lfo.get("depth"), 0.0)
            offset = to_float(lfo.get("offset"), 0.0)
            phase_deg = to_float(lfo.get("phaseDeg"), 0.0)

            phase_cycles = (elapsed_ms / 1000.0) * rate_hz + (phase_deg / 360.0)
            sample = self._lfo_sample(wave, phase_cycles)
            value = base_value + offset + (depth * sample)
            if parameter in OBJECT_LIMITS:
                value = clamp(value, OBJECT_LIMITS[parameter])

            patch = patch_by_object_id.get(object_id)
            if not patch:
                patch = {}
                patch_by_object_id[object_id] = patch
            patch[parameter] = value

        for object_id, patch in patch_by_object_id.items():
            self.update_object(
                object_id,
                patch,
                source=f"action:{action.get('actionId') or 'runtime'}",
                emit_osc=True,
                propagate_group_links=False,
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
            lfo_bases: Dict[str, float] = {}
            for lfo in action_snapshot.get("lfos", []):
                object_id = str(lfo.get("objectId") or "").strip()
                parameter = str(lfo.get("parameter") or "").strip()
                if not object_id or parameter not in LFO_PARAMS:
                    continue
                base_object = self.objects.get(object_id, default_object(object_id))
                lfo_bases[f"{object_id}:{parameter}"] = to_float(base_object.get(parameter), 0.0)
            stop_flag = threading.Event()

        started_at = time.monotonic()

        def run() -> None:
            while not stop_flag.is_set():
                elapsed_ms = int((time.monotonic() - started_at) * 1000)
                self._apply_action_frame(action_snapshot, elapsed_ms, lfo_bases)
                if elapsed_ms >= action_snapshot.get("durationMs", 0):
                    self.stop_action(normalized_action_id, "complete")
                    return
                time.sleep(0.05)

        worker = threading.Thread(target=run, daemon=True)
        with self.lock:
            self.running_actions[normalized_action_id] = {
                "thread": worker,
                "stopFlag": stop_flag,
                "startedAtMs": int(time.time() * 1000),
                "source": source,
                "action": action_snapshot,
            }

        worker.start()
        self.emit_event("action", {"actionId": normalized_action_id, "state": "started", "source": source})

    def _finish_action(self, action_id: str, reason: str = "stop", source: str = "api") -> None:
        normalized_action_id = normalize_action_id(action_id)
        with self.lock:
            running = self.running_actions.pop(normalized_action_id, None)
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

            scene_prefix = "/art/scene/"
            scene_suffix = "/recall"
            if address.startswith(scene_prefix) and address.endswith(scene_suffix):
                scene_id = address[len(scene_prefix) : -len(scene_suffix)]
                self.recall_scene(unquote(scene_id), source="osc", emit_osc=False)
                return

        object_prefix = "/art/object/"
        if address.startswith(object_prefix):
            remainder = address[len(object_prefix) :]
            parts = remainder.split("/")
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
                return
            try:
                message = decode_osc_message(data)
                self._handle_inbound_osc(message, addr)
            except Exception as exc:  # noqa: BLE001
                self.emit_event("osc_error", {"source": "inbound", "message": str(exc)})


RUNTIME = Runtime()


class Handler(BaseHTTPRequestHandler):
    server_version = "AmadeusPanner/0.1"

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
                if isinstance(body, dict):
                    if "propagateGroupLinks" in body:
                        propagate_group_links = bool(body.get("propagateGroupLinks"))
                        body = dict(body)
                        body.pop("propagateGroupLinks", None)
                    elif "propagate_group_links" in body:
                        propagate_group_links = bool(body.get("propagate_group_links"))
                        body = dict(body)
                        body.pop("propagate_group_links", None)
                updated = RUNTIME.update_object(
                    object_id,
                    body,
                    source="api",
                    emit_osc=True,
                    propagate_group_links=propagate_group_links,
                )
                self._send_json(HTTPStatus.OK, {"ok": True, "object": updated, "status": RUNTIME.status()})
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
