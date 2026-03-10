# Amadeus Panner

Runnable web-based Amadeus ART controller with OSC in/out, showfiles, scenes, actions, groups, and modulation.

## Quick Start

```bash
cd /path/to/Amadeus_Panner
./scripts/run-dev.sh
```

Then open:
- `http://127.0.0.1:8787`

For iPad on the same network:
- open `http://<your-mac-lan-ip>:8787`

## Runtime Defaults
- HTTP host/port: `0.0.0.0:8787`
- OSC out target: `127.0.0.1:9000`
- OSC in listen: `0.0.0.0:9001`

Override with env vars:
- `HOST`
- `HTTP_PORT`
- `OSC_OUT_HOST`
- `OSC_OUT_PORT`
- `OSC_IN_PORT`
- `MODE` (`live`, `program`, `dev`)

Example:

```bash
HOST=0.0.0.0 HTTP_PORT=8787 OSC_OUT_HOST=10.0.0.50 OSC_OUT_PORT=9000 OSC_IN_PORT=9001 ./scripts/run-dev.sh
```

## Stream Deck XL Hardware Control

The control server now exposes Stream Deck-friendly HTTP routes so buttons can trigger cues without crafting JSON bodies.

- Read compact button/state feedback:
  - `GET /api/hardware/streamdeck/status`
- Generate Stream Deck XL layout presets:
  - `GET /api/hardware/streamdeck/layout` (all presets)
  - `GET /api/hardware/streamdeck/layout/xl-page-1-obj-select`
  - `GET /api/hardware/streamdeck/layout/xl-page-2-obj-hide`
  - `GET /api/hardware/streamdeck/layout/xl-page-3-group-enable`
  - `GET /api/hardware/streamdeck/layout/xl-page-4-actions`
  - `GET /api/hardware/streamdeck/layout/xl-page-5-action-groups`
  - `GET /api/hardware/streamdeck/layout/xl-page-6-empty`
  - `GET /api/hardware/streamdeck/layout/xl-page-7-empty`
  - `GET /api/hardware/streamdeck/layout/xl-page-8-config`
- Poll computed button states for feedback:
  - `GET /api/hardware/streamdeck/layout/<layoutId>/state`
- Showfile controls:
  - `GET /api/hardware/streamdeck/show/save`
  - `GET /api/hardware/streamdeck/show/load/current`
  - `GET /api/hardware/streamdeck/show/load/next`
  - `GET /api/hardware/streamdeck/show/save-as/timestamp`
  - `GET /api/hardware/streamdeck/show/new/timestamp`
- Trigger scene recall:
  - `GET /api/hardware/streamdeck/scene/<sceneId>/recall`
- Selection control:
  - `GET /api/hardware/streamdeck/object/<objectId>/select`
  - `GET /api/hardware/streamdeck/object/<objectId>/hide/<on|off|toggle>` (visual hide/show in panner)
  - `GET /api/hardware/streamdeck/objects/hide/toggle` (visual hide/show all in panner)
  - `GET /api/hardware/streamdeck/object-selection/clear`
  - `GET /api/hardware/streamdeck/group/<groupId>/select`
  - `GET /api/hardware/streamdeck/group-selection/clear`
- Enable/disable object groups:
  - `GET /api/hardware/streamdeck/group/<groupId>/enabled/<on|off|toggle>`
  - `GET /api/hardware/streamdeck/groups/enabled/<on|off|toggle>` (global master)
- Trigger actions:
  - `GET /api/hardware/streamdeck/action/<actionId>/start`
  - `GET /api/hardware/streamdeck/action/<actionId>/trigger` (alias for `start`)
  - `GET /api/hardware/streamdeck/action/<actionId>/stop`
  - `GET /api/hardware/streamdeck/action/<actionId>/abort`
  - `GET /api/hardware/streamdeck/action/<actionId>/toggle`
- Enable/disable action:
  - `GET /api/hardware/streamdeck/action/<actionId>/enabled/<on|off|toggle>`
- LFO control:
  - `GET /api/hardware/streamdeck/lfos/enabled/<on|off|toggle>` (global master)
  - `GET /api/hardware/streamdeck/action/<actionId>/lfo/<lfoId>/enabled/<on|off|toggle>`
- Trigger action group:
  - `GET /api/hardware/streamdeck/action-group/<groupId>/trigger`
- Enable/disable action group:
  - `GET /api/hardware/streamdeck/action-group/<groupId>/enabled/<on|off|toggle>`

`POST` is also accepted for all of the routes above (empty body is fine).

Layout endpoint response includes `row`, `col`, `title`, and full `url` fields per button so you can copy/paste into Stream Deck website actions.
Layout responses now also include per-button `state` (`active`/`inactive`/`disabled`/`mixed`) with `label` and `color` for reflecting runtime status.

## What Is Implemented
- Web UI with:
  - View tabs for `Panner`, `Action Manager`, `Modulation Manager`, `Object Manager`, and `Object Group Manager`.
  - Interactive perspective 3D panner with camera zoom, Option-drag orbit, drag marquee multi-select, Cmd/Ctrl-click additive selection, and right-click quick mapping menu.
  - Object inspector (x/y/z/size/gain/mute/algorithm) with simultaneous apply to selected objects.
  - Object Manager with add/rename/type/color/remove/clear, list-based selection, and per-object `Exclude From All`.
  - Object Group Manager with list + editor workflow (name/color/linked params/members), inline save/delete, and `Create Group`.
  - Action Manager with list + setup workflow, create/save/save-as/delete, enable/disable, start/stop/abort, on-end chaining, and Action Groups.
  - Modulation Manager with per-action LFO editor (ID/wave/rate/depth/offset/polarity/enabled), panner target mapping, global LFO toggle, and LFO debug table.
  - Show Control with show load/save/save-as/new and scene load/save/save-as.
  - Live debug event log (OSC in/out + system/runtime events).
- Control server with:
  - REST API for show, scene, object, group, action, action-group, and LFO controls.
  - OSC UDP outbound encoder and inbound decoder/router.
  - OSC-triggered actions and action groups.
  - Object groups with linked-parameter propagation.
  - Action engine with chained actions and modulation application.
  - Server-sent events stream for status/debug updates.

## Working State And Save Behavior
- UI edits apply immediately to in-memory runtime state (objects, groups, actions, action groups, and modulation settings).
- Runtime changes are not auto-written to showfiles on every edit.
- `Save Show` / `Save Show As` persists current working state to disk.

## Important Limitation
- OSC address paths and parameter ranges are still scaffold defaults.
- Replace with official Amadeus ART mapping before show-critical use.

## Project Tracking
- Engineering changes: `CHANGELOG.md`
- Release-facing notes: `PATCH_NOTES.md`
- Backlog: `TODO.md`

Utilities:
- Log engineering change: `./scripts/log-change.sh "summary"`
- Add patch-note section: `./scripts/new-patch-note.sh <version> "title"`
- Create a showfile from template: `./scripts/new-showfile.sh <show-id>`
