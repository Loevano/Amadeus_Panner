# Patch Notes

Release-facing summary for operators and production notes.

## v0.1.0 - 2026-03-03 - Initial Scaffold

### Added
- Stable project structure for Amadeus ART web control.
- OSC communication scaffold (outbound/inbound gateway placeholders).
- Showfile, scene, and action JSON schemas.
- Action trigger model (start/stop/abort) for OSC-triggerable automation.
- Reliability docs, bugfix prompt system, and version-control workflow.

### Changed
- Project scope moved to `/Users/jens/Documents/Coding/Amadeus_Panner`.
- Naming aligned to `Amadeus_Panner` across docs and package metadata.

### Fixed
- Corrected shared import paths in control-server scaffolding.

### Known Issues
- Official ART OSC address/argument map still needs confirmation from Amadeus.
- Runtime server and UI are scaffolded but not fully implemented yet.

## v0.1.1 - 2026-03-03 - Runnable Dev Server And UI

### Added
- Runnable Python control server at `apps/control-server/server.py`.
- One-command launcher: `./scripts/run-dev.sh`.
- HTTP API for status, show load, scene recall, object update, and action control.
- Server-sent event stream for live debug updates.
- OSC UDP outbound encoder and inbound decoder with action-trigger handling.
- Browser UI in `apps/ui/public` with scene/action controls, draggable panner, object inspector, and debug event log.

### Changed
- Root startup workflow now uses Python runtime instead of Node runtime assumptions.
- `README.md` updated with direct run/access instructions for desktop and iPad.

### Fixed
- Resolved non-runnable startup path on this machine (no `node` binary available).

### Known Issues
- ART OSC mappings are still scaffold defaults and must be replaced with official addresses/ranges.
- Current panner canvas is an X/Z plane representation, not full production 3D rendering yet.

## v0.1.2 - 2026-03-03 - Visual 3D Panner Upgrade

### Added
- Perspective 3D panner rendering in `apps/ui/public/app.js` with room box, grid, axes, and depth-sorted objects.
- Camera controls in UI (`yaw`, `pitch`, `zoom`) with reset action.
- Interactive camera orbit by dragging empty canvas space.
- Object movement on X/Z via 3D ray-plane drag.
- Shift-drag gesture for direct Y-axis object adjustment.

### Changed
- Panner panel now presents a 3D visual workspace instead of flat 2D X/Z view.
- Updated UI layout and styles to include camera control strip and 3D interaction hints.
- Updated README implementation notes and TODO status for baseline 3D support.

### Fixed
- Resolved mismatch between requested 3D visual behavior and previous 2D canvas-only panner.

### Known Issues
- 3D renderer is custom canvas projection, not yet a full production Three.js scene.
- Touch gestures for advanced camera control still need dedicated iPad QA.

## v0.1.3 - 2026-03-03 - Object Manager Page

### Added
- New Object Manager page view in the web UI with dedicated controls for:
  - add object
  - rename object
  - set object type
  - set object color
  - remove selected object
  - clear all objects
- Object table with live state (id, type, color, position) and selection sync.
- Object lifecycle API endpoints:
  - `POST /api/object/add`
  - `POST /api/object/{id}/rename`
  - `POST /api/object/{id}/remove`
  - `POST /api/object/clear`

### Changed
- Runtime object model now includes `type` and `color` fields.
- 3D panner now renders per-object color and includes object type in labels.
- View switching added between `Panner` and `Object Manager` pages.

### Fixed
- Prevented object endpoint routing ambiguity by handling object manager endpoints before generic object updates.

### Known Issues
- Object manager edits are runtime-only and are not yet persisted back to showfile scene files.
- Clear/remove operations currently update controller state only (no explicit OSC object-delete semantics yet).

## v0.1.4 - 2026-03-03 - Multi-Select And Object Groups

### Added
- Multi-object selection in the 3D panner using drag marquee selection.
- Cmd/Ctrl + click object toggles additive selection.
- Batch object updates from inspector and object manager (type, color, remove, and inspector parameter apply).
- Object groups with linkable parameters (`x`, `y`, `z`, `size`, `gain`, `mute`, `algorithm`, `type`, `color`).
- Group lifecycle API endpoints:
  - `POST /api/groups/create`
  - `POST /api/groups/{id}/update`
  - `POST /api/groups/{id}/delete`

### Changed
- Interaction model in panner:
  - `Option` + drag now controls camera orbit.
  - Normal drag now performs selection box instead of direct object movement.
- Object manager now supports multi-selection context and group management controls.

### Fixed
- Eliminated object teleport risk tied to drag-mode switching by removing mixed move gestures in the panner and switching to explicit batch edit workflow.

### Known Issues
- Group updates currently use current object selection as full membership replacement.
- Group state remains runtime-only and is not yet persisted into showfile data.
