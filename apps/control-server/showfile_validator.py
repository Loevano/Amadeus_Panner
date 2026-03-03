#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict


class ShowfileValidationError(ValueError):
    pass


@dataclass(frozen=True)
class ValidatedShowBundle:
    raw_show: Dict[str, Any]
    scenes_by_id: Dict[str, Dict[str, Any]]
    actions_by_id: Dict[str, Dict[str, Any]]


def _type_matches(expected_type: str, value: Any) -> bool:
    if expected_type == "string":
        return isinstance(value, str)
    if expected_type == "object":
        return isinstance(value, dict)
    if expected_type == "array":
        return isinstance(value, list)
    if expected_type == "boolean":
        return isinstance(value, bool)
    if expected_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected_type == "number":
        return (isinstance(value, int) and not isinstance(value, bool)) or isinstance(value, float)
    if expected_type == "null":
        return value is None
    return False


def _validate_date_time(value: str) -> bool:
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def _join_path(path: str, key: Any) -> str:
    if isinstance(key, int):
        return f"{path}[{key}]"
    return f"{path}.{key}" if path != "$" else f"$.{key}"


def _raise(path: str, message: str) -> None:
    raise ShowfileValidationError(f"{path}: {message}")


def _validate_schema(schema: Dict[str, Any], value: Any, path: str) -> None:
    schema_type = schema.get("type")
    if isinstance(schema_type, str):
        allowed_types = [schema_type]
    elif isinstance(schema_type, list):
        allowed_types = [item for item in schema_type if isinstance(item, str)]
    else:
        allowed_types = []

    if allowed_types and not any(_type_matches(type_name, value) for type_name in allowed_types):
        _raise(path, f"expected type {allowed_types}, got {type(value).__name__}")

    if "enum" in schema and value not in schema["enum"]:
        _raise(path, f"value must be one of {schema['enum']}")

    if isinstance(value, str):
        min_length = schema.get("minLength")
        if isinstance(min_length, int) and len(value) < min_length:
            _raise(path, f"string must have min length {min_length}")

        pattern = schema.get("pattern")
        if isinstance(pattern, str) and not re.fullmatch(pattern, value):
            _raise(path, f"string does not match pattern {pattern}")

        if schema.get("format") == "date-time" and not _validate_date_time(value):
            _raise(path, "string is not a valid date-time")

    if ((isinstance(value, int) and not isinstance(value, bool)) or isinstance(value, float)) and not isinstance(value, bool):
        minimum = schema.get("minimum")
        if isinstance(minimum, (int, float)) and value < minimum:
            _raise(path, f"number must be >= {minimum}")

        maximum = schema.get("maximum")
        if isinstance(maximum, (int, float)) and value > maximum:
            _raise(path, f"number must be <= {maximum}")

    if isinstance(value, dict):
        required = schema.get("required", [])
        if isinstance(required, list):
            for key in required:
                if isinstance(key, str) and key not in value:
                    _raise(path, f"missing required key '{key}'")

        properties = schema.get("properties", {})
        additional = schema.get("additionalProperties", True)
        if not isinstance(properties, dict):
            properties = {}

        for key, item in value.items():
            child_path = _join_path(path, key)
            if key in properties and isinstance(properties[key], dict):
                _validate_schema(properties[key], item, child_path)
                continue

            if additional is False:
                _raise(child_path, "additional property is not allowed")
            if isinstance(additional, dict):
                _validate_schema(additional, item, child_path)

    if isinstance(value, list):
        items_schema = schema.get("items")
        if isinstance(items_schema, dict):
            for index, item in enumerate(value):
                _validate_schema(items_schema, item, _join_path(path, index))


def _read_json(path: Path) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ShowfileValidationError(f"{path}: file not found") from exc
    except json.JSONDecodeError as exc:
        raise ShowfileValidationError(f"{path}: invalid JSON ({exc.msg})") from exc

    if not isinstance(data, dict):
        raise ShowfileValidationError(f"{path}: top-level JSON value must be an object")
    return data


def _resolve_show_asset(project_root: Path, show_dir: Path, file_ref: str, context_path: str) -> Path:
    candidate = (show_dir / file_ref).resolve()
    if project_root not in candidate.parents and candidate != project_root:
        _raise(context_path, "path escapes project root")
    if not candidate.is_file():
        _raise(context_path, f"file does not exist: {candidate}")
    return candidate


def _load_schema(project_root: Path, schema_name: str) -> Dict[str, Any]:
    schema_path = project_root / "showfiles" / "_schema" / schema_name
    return _read_json(schema_path)


def validate_show_bundle(project_root: Path, show_path: Path) -> ValidatedShowBundle:
    absolute_show_path = show_path.resolve()
    if project_root not in absolute_show_path.parents and absolute_show_path != project_root:
        raise ShowfileValidationError("show path must stay inside project root")

    show_schema = _load_schema(project_root, "showfile.schema.json")
    scene_schema = _load_schema(project_root, "scene.schema.json")
    action_schema = _load_schema(project_root, "action.schema.json")

    raw_show = _read_json(absolute_show_path)
    _validate_schema(show_schema, raw_show, "$")
    show_dir = absolute_show_path.parent

    scenes_by_id: Dict[str, Dict[str, Any]] = {}
    actions_by_id: Dict[str, Dict[str, Any]] = {}

    for index, scene_ref in enumerate(raw_show.get("scenes", [])):
        ref_path = _join_path("$.scenes", index)
        scene_id = str(scene_ref.get("scene_id"))
        if scene_id in scenes_by_id:
            _raise(ref_path, f"duplicate scene_id reference '{scene_id}'")
        scene_file = str(scene_ref.get("file", ""))
        scene_path = _resolve_show_asset(project_root, show_dir, scene_file, _join_path(ref_path, "file"))
        raw_scene = _read_json(scene_path)
        _validate_schema(scene_schema, raw_scene, "$")

        actual_scene_id = str(raw_scene.get("scene_id"))
        if actual_scene_id != scene_id:
            _raise(
                ref_path,
                f"scene_id mismatch: show references '{scene_id}' but file contains '{actual_scene_id}'",
            )
        scenes_by_id[scene_id] = raw_scene

    for index, action_ref in enumerate(raw_show.get("actions", [])):
        ref_path = _join_path("$.actions", index)
        action_id = str(action_ref.get("action_id"))
        if action_id in actions_by_id:
            _raise(ref_path, f"duplicate action_id reference '{action_id}'")
        action_file = str(action_ref.get("file", ""))
        action_path = _resolve_show_asset(project_root, show_dir, action_file, _join_path(ref_path, "file"))
        raw_action = _read_json(action_path)
        _validate_schema(action_schema, raw_action, "$")

        actual_action_id = str(raw_action.get("action_id"))
        if actual_action_id != action_id:
            _raise(
                ref_path,
                f"action_id mismatch: show references '{action_id}' but file contains '{actual_action_id}'",
            )
        actions_by_id[action_id] = raw_action

    default_scene_id = str(raw_show.get("default_scene_id", ""))
    if default_scene_id and default_scene_id not in scenes_by_id:
        _raise("$.default_scene_id", f"default scene '{default_scene_id}' not found in scenes[]")

    return ValidatedShowBundle(raw_show=raw_show, scenes_by_id=scenes_by_id, actions_by_id=actions_by_id)


def _discover_showfiles(project_root: Path) -> list[Path]:
    showfiles_root = project_root / "showfiles"
    if not showfiles_root.is_dir():
        return []
    return sorted(
        path for path in showfiles_root.rglob("show.json") if "_schema" not in path.parts and "_template" not in path.parts
    ) or sorted(path for path in showfiles_root.rglob("show.json") if "_schema" not in path.parts)


def _to_absolute_path(project_root: Path, candidate: str) -> Path:
    path = Path(candidate)
    return path.resolve() if path.is_absolute() else (project_root / path).resolve()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate Amadeus showfiles against local JSON schemas")
    parser.add_argument(
        "show_paths",
        nargs="*",
        help="Optional show.json path(s). Defaults to all show.json files under showfiles/.",
    )
    args = parser.parse_args(argv)

    project_root = Path(__file__).resolve().parents[2]
    if args.show_paths:
        show_paths = [_to_absolute_path(project_root, candidate) for candidate in args.show_paths]
    else:
        show_paths = _discover_showfiles(project_root)

    if not show_paths:
        print("No showfile candidates found.")
        return 1

    failures = 0
    for show_path in show_paths:
        label = str(show_path)
        if project_root in show_path.parents:
            label = str(show_path.relative_to(project_root))
        try:
            bundle = validate_show_bundle(project_root, show_path)
            print(f"OK {label} (scenes={len(bundle.scenes_by_id)}, actions={len(bundle.actions_by_id)})")
        except ShowfileValidationError as exc:
            failures += 1
            print(f"ERROR {label}: {exc}")

    if failures:
        print(f"Validation failed: {failures} showfile(s) invalid")
        return 1

    print(f"Validation passed: {len(show_paths)} showfile(s) checked")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
