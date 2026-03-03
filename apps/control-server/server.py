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
COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULT_OBJECT_TYPE = "point"
DEFAULT_OBJECT_COLOR = "#1c4f89"


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


def normalize_color(value: Any, default: str = DEFAULT_OBJECT_COLOR) -> str:
    raw = str(value or default).strip()
    if COLOR_PATTERN.fullmatch(raw):
        return raw.lower()
    return default


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
                "objects": list(self.objects.values()),
            }

    def _sanitize_project_path(self, requested: str) -> Path:
        requested = (requested or "").strip()
        if not requested:
            requested = "showfiles/_template/show.json"
        absolute = (PROJECT_ROOT / requested).resolve()
        if PROJECT_ROOT not in absolute.parents and absolute != PROJECT_ROOT:
            raise ValueError("Path must stay inside project root")
        return absolute

    def load_show(self, show_path: str) -> None:
        absolute_show_path = self._sanitize_project_path(show_path)
        raw_show = json.loads(absolute_show_path.read_text(encoding="utf-8"))
        show_dir = absolute_show_path.parent

        scenes_by_id: Dict[str, Dict[str, Any]] = {}
        for scene_ref in raw_show.get("scenes", []):
            scene_path = (show_dir / str(scene_ref.get("file", ""))).resolve()
            raw_scene = json.loads(scene_path.read_text(encoding="utf-8"))
            scene_id = str(raw_scene.get("scene_id"))
            objects = [normalize_object(obj, str(obj.get("object_id", "obj-1"))) for obj in raw_scene.get("objects", [])]
            scenes_by_id[scene_id] = {
                "sceneId": scene_id,
                "name": str(raw_scene.get("name", scene_id)),
                "transitionMs": int(to_float(raw_scene.get("transition_ms"), 0.0)),
                "objects": objects,
            }

        actions_by_id: Dict[str, Dict[str, Any]] = {}
        for action_ref in raw_show.get("actions", []):
            action_path = (show_dir / str(action_ref.get("file", ""))).resolve()
            raw_action = json.loads(action_path.read_text(encoding="utf-8"))
            action_id = str(raw_action.get("action_id"))
            actions_by_id[action_id] = {
                "actionId": action_id,
                "name": str(raw_action.get("name", action_id)),
                "durationMs": int(to_float(raw_action.get("duration_ms"), 0.0)),
                "tracks": raw_action.get("tracks", []),
                "oscTriggers": {
                    "start": str(raw_action.get("osc_triggers", {}).get("start", "")),
                    "stop": str(raw_action.get("osc_triggers", {}).get("stop", "")),
                    "abort": str(raw_action.get("osc_triggers", {}).get("abort", "")),
                },
            }

        with self.lock:
            self.show = {
                "path": str(absolute_show_path.relative_to(PROJECT_ROOT)),
                "showId": str(raw_show.get("show_id", "show")),
                "name": str(raw_show.get("name", "Show")),
                "version": str(raw_show.get("version", "0.0.0")),
                "defaultSceneId": str(raw_show.get("default_scene_id", "")),
                "scenesById": scenes_by_id,
                "actionsById": actions_by_id,
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

        self.emit_event(
            "object_manager",
            {
                "source": source,
                "action": "clear",
                "count": len(object_ids),
                "objectIds": object_ids,
            },
        )
        return object_ids

    def update_object(self, object_id: str, patch: Dict[str, Any], source: str = "api", emit_osc: bool = True) -> Dict[str, Any]:
        with self.lock:
            current = self.objects.get(object_id, default_object(object_id))
            merged = {**current, **patch, "objectId": object_id, "object_id": object_id}
            next_obj = normalize_object(merged, object_id)

            changed = [k for k in ["x", "y", "z", "size", "gain", "mute", "algorithm", "type", "color"] if current.get(k) != next_obj.get(k)]
            self.objects[object_id] = next_obj

        if emit_osc:
            for param in changed:
                if param not in ["x", "y", "z", "size", "gain", "mute", "algorithm"]:
                    continue
                value = 1 if (param == "mute" and next_obj[param]) else (0 if param == "mute" else next_obj[param])
                self._send_object_param(object_id, param, value)

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

    def _interpolate_numeric(self, keyframes: List[Dict[str, Any]], elapsed_ms: int) -> Optional[float]:
        if not keyframes:
            return None
        frames = sorted(keyframes, key=lambda f: to_float(f.get("time_ms"), 0.0))
        if elapsed_ms <= to_float(frames[0].get("time_ms"), 0.0):
            return to_float(frames[0].get("value"), 0.0)

        for idx in range(len(frames) - 1):
            a = frames[idx]
            b = frames[idx + 1]
            t0 = to_float(a.get("time_ms"), 0.0)
            t1 = to_float(b.get("time_ms"), 0.0)
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

    def _apply_action_frame(self, action: Dict[str, Any], elapsed_ms: int) -> None:
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
                frames = sorted(track.get("keyframes", []), key=lambda f: to_float(f.get("time_ms"), 0.0))
                current = self.objects.get(object_id, default_object(object_id))["algorithm"]
                value = current
                for frame in frames:
                    if elapsed_ms >= to_float(frame.get("time_ms"), 0.0):
                        value = str(frame.get("value", current))
            else:
                numeric = self._interpolate_numeric(track.get("keyframes", []), elapsed_ms)
                if numeric is None:
                    continue
                value = numeric

            self.update_object(object_id, {parameter: value}, source="action", emit_osc=True)

    def start_action(self, action_id: str, source: str = "api") -> None:
        with self.lock:
            if action_id in self.running_actions:
                return
            if not self.show:
                raise ValueError("No show loaded")
            action = self.show["actionsById"].get(action_id)
            if not action:
                raise ValueError(f"Action not found: {action_id}")
            stop_flag = threading.Event()

        started_at = time.monotonic()

        def run() -> None:
            while not stop_flag.is_set():
                elapsed_ms = int((time.monotonic() - started_at) * 1000)
                self._apply_action_frame(action, elapsed_ms)
                if elapsed_ms >= action.get("durationMs", 0):
                    self.stop_action(action_id, "complete")
                    return
                time.sleep(0.05)

        worker = threading.Thread(target=run, daemon=True)
        with self.lock:
            self.running_actions[action_id] = {
                "thread": worker,
                "stopFlag": stop_flag,
                "startedAtMs": int(time.time() * 1000),
                "source": source,
            }

        worker.start()
        self.emit_event("action", {"actionId": action_id, "state": "started", "source": source})

    def stop_action(self, action_id: str, reason: str = "stop") -> None:
        with self.lock:
            running = self.running_actions.pop(action_id, None)
        if not running:
            return
        running["stopFlag"].set()
        self.emit_event("action", {"actionId": action_id, "state": "stopped", "reason": reason})

    def abort_action(self, action_id: str, source: str = "api") -> None:
        self.stop_action(action_id, "abort")
        self.emit_event("action", {"actionId": action_id, "state": "aborted", "source": source})

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

            if path_name.startswith("/api/scene/") and path_name.endswith("/recall"):
                parts = path_name.split("/")
                scene_id = unquote(parts[3]) if len(parts) > 3 else ""
                RUNTIME.recall_scene(scene_id, source="api", emit_osc=True)
                self._send_json(HTTPStatus.OK, {"ok": True, "sceneId": scene_id, "status": RUNTIME.status()})
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
                updated = RUNTIME.update_object(object_id, body, source="api", emit_osc=True)
                self._send_json(HTTPStatus.OK, {"ok": True, "object": updated, "status": RUNTIME.status()})
                return

            if path_name.startswith("/api/action/"):
                parts = path_name.split("/")
                if len(parts) < 5:
                    self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Unknown action endpoint"})
                    return
                action_id = unquote(parts[3])
                command = parts[4]
                _ = self._read_json_body()

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
