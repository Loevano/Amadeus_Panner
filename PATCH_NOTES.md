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
