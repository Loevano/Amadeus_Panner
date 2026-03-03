# Patch Notes

Release-facing summary for operators and production notes.

## v0.1.8 - 2026-03-03 - Per-LFO Group Control And Group-State Show Persistence

### Added
- Per-LFO identity on action LFO mappings (`lfo_id`) and mapping-level enable flag (`enabled`).
- Action Group entry type to control a specific action LFO by ID:
  - `action_lfo_enabled` (`action_id`, `lfo_id`, `enabled`)
- Runtime action-LFO toggle flow (`set_action_lfo_enabled`) used by Action Group triggers and emitted as `action_lfo` events.
- Action Group editor support in UI for:
  - `Enable Action LFO`
  - `Disable Action LFO`
  - action-local LFO selection while creating entries.
- Modulation Manager UI updates:
  - LFO ID column
  - LFO enabled state column
  - enabled editor in the LFO form.

### Changed
- LFO modulation runtime now skips disabled mappings consistently.
- Panner context LFO menu now groups/targets by LFO ID when available (preserves shared-modulator mapping intent).
- Showfiles now persist object-group runtime state:
  - `groups_enabled`
  - `object_groups`
- Group editing now follows the same working-state persistence model as actions/objects: immediate runtime effect, persisted on explicit `Save Show`.

### Fixed
- Prevented stale/no-op Action Group per-LFO triggers by validating entry LFO IDs against the selected action at load/save/update sanitization time.

### Known Issues
- LFO IDs are action-local; cross-action/global LFO library management is still not implemented.

## v0.1.7 - 2026-03-03 - Action Groups And Working-State Action Editing

### Added
- Action Group runtime model and trigger execution flow (one group can fire multiple entries in one call).
- Action Group management APIs:
  - `POST /api/action-group/create`
  - `POST /api/action-group/{id}/update`
  - `POST /api/action-group/{id}/delete`
  - `POST /api/action-group/{id}/trigger`
- Action Group OSC trigger integration through `osc_triggers.trigger` in showfile data.
- Action Group editor in Action Manager:
  - group list and metadata editor (id, name, enabled, OSC trigger)
  - group entry list with action command entries (`start`, `stop`, `abort`)
  - LFO toggle entries (`enable` / `disable`)
- Show Control quick-trigger chips for Action Groups.

### Changed
- Showfile schema now supports top-level `action_groups`.
- Show load/save path now reads/writes `action_groups` and validates group-entry links against existing actions.
- Action create/update/save-as/delete now mutate in-memory working state immediately and do not force immediate showfile writes.

### Fixed
- Action Group LFO entry creation now deterministically sets enabled state from the selected entry type (`lfos-enable` or `lfos-disable`), preventing stale UI-state mismatches.

### Known Issues
- Group entries can toggle global LFO processing, but per-modulator enable/disable by LFO ID is not yet implemented.

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
- Group color selection and persistence in runtime (`create`/`update`) with color indicator chips in the Groups panel.

### Changed
- Interaction model in panner:
  - `Option` + drag now controls camera orbit.
  - Normal drag now performs selection box instead of direct object movement.
- Object manager now supports multi-selection context and group management controls.
- Auto-naming now produces context-aware object and group IDs (type/selection-derived) and humanized default group names.
- Enabled group colors now visually override member object colors in UI views; disabling groups restores each object's own color.
- Groups panel now always shows the virtual `All` group pinned at the top as a locked system entry.

### Fixed
- Eliminated object teleport risk tied to drag-mode switching by removing mixed move gestures in the panner and switching to explicit batch edit workflow.

### Known Issues
- Group updates currently use current object selection as full membership replacement.
- Group state remains runtime-only and is not yet persisted into showfile data.

## v0.1.5 - 2026-03-03 - Action Manager, Chaining, And LFOs

### Added
- New `Action Manager` view with:
  - action selection and transport (`Start`, `Stop`, `Abort`)
  - action `Create`, `Save`, `Save As`, and `Delete`
  - enable/disable action control
  - `On End -> Next` chaining selection
  - editable OSC trigger paths (`start`, `stop`, `abort`)
- LFO authoring in Action Manager:
  - target object + parameter (`x`, `y`, `z`, `size`, `gain`)
  - waveform (`sine`, `triangle`, `square`, `saw`)
  - rate, depth, offset, and phase
  - add/remove/clear operations
- Action lifecycle API endpoints:
  - `POST /api/action/create`
  - `POST /api/action/{id}/update`
  - `POST /api/action/{id}/save-as`
  - `POST /api/action/{id}/delete`

### Changed
- Runtime action model now supports `enabled`, `onEndActionId`, and `lfos`.
- `/api/status` show payload now includes `show.actionsById` and `runningActionDetails` for richer manager UI state.
- Action playback now applies LFO modulation each frame and can auto-trigger a next action on completion.

### Fixed
- Prevented disabled actions from being started via API/OSC trigger paths.

### Known Issues
- JS syntax check could not be executed in this environment because `node` is unavailable.

## v0.1.6 - 2026-03-03 - Smoother LFO Runtime, Debug, And Mapping UX

### Added
- Runtime API to globally toggle LFO processing:
  - `POST /api/lfos/enabled`
- LFO debug event stream payloads (`lfo_debug`) with sampled target/modulation data.
- Action Manager LFO debug monitor table (target/current/min/max/span/state) and summary status.
- Action list table in Action Manager with row selection support.
- Action LFO row selection + update workflow and selected-LFO summary.
- Panner right-click context menu with nested quick actions:
  - `Groups` membership toggles
  - `LFOs` mapping submenu by modulator signature and target parameter
- Reusable showfile validator utility:
  - `apps/control-server/showfile_validator.py`
  - wired through `scripts/validate-showfiles.sh`

### Changed
- Action runtime tick moved to ~60 FPS for smoother action/LFO motion.
- LFO calculation model now supports multi-modulator summation for same target parameter.
- Added per-target mapping phase offset support for LFO links (`mapping_phase_deg`).
- Action Manager layout compacted; `Action Setup` is now the top block.
- Debug log toggle now controls logging visibility/throttle while keeping live event sync active.
- Status/UI refresh path moved to debounced + animation-frame scheduling for smoother visuals.

### Fixed
- Reduced LFO snap-back while dragging/modifying modulated objects by shifting modulation center correctly on external writes.
- Prevented context-menu interaction lockups by consistently closing menus on page/interaction transitions.
- Suppressed benign `ConnectionResetError` disconnect noise in HTTP handler.

### Known Issues
- LFO definitions are still action-local; a global reusable LFO library with independent mapping is not implemented yet.
