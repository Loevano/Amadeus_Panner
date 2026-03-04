# Amadeus Panner

Runnable web-based Amadeus ART controller with OSC in/out, showfiles, scenes, actions, groups, and modulation.

## Quick Start

```bash
cd /Users/jens/Documents/Coding/Amadeus_Panner
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
