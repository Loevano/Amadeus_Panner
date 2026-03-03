# Amadeus Panner

Runnable starter for a web-based Amadeus ART controller with OSC in/out, showfiles, scenes, and time-based actions.

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
  - Showfile load input.
  - Scene recall buttons.
  - Action start/stop/abort controls.
  - Interactive perspective 3D panner with camera zoom, Option-drag orbit, drag marquee multi-select, and Cmd/Ctrl-click additive selection.
  - Object Manager page with add, rename, type, color, remove, clear, and object-group controls.
  - Live object list with selection sync between manager and panner/inspector.
  - Object inspector (x/y/z/size/gain/mute/algorithm) with simultaneous apply to selected objects.
  - Live debug event log (OSC in/out + system events).
- Control server with:
  - REST API for show/scene/object/action/group.
  - OSC UDP outbound encoder.
  - OSC UDP inbound decoder.
  - OSC-triggered actions (`start`/`stop`/`abort`).
  - Object groups with linked-parameter propagation across group members.
  - Server-sent events stream for debug UI.

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
