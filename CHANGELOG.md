# Changelog

## 2026-03-03 22:40 CET
- Updated `README.md` implementation overview to match current UI/runtime capabilities:
  - dedicated Action/Modulation/Object/Group manager views
  - Action Groups and per-action LFO modulation controls
  - explicit working-state vs Save Show persistence behavior
- Updated `docs/ARCHITECTURE.md` to reflect current transport/runtime behavior:
  - UI update channel uses SSE + status refresh (not WebSocket)
  - control server maintains in-memory working state with explicit save-to-disk flow

## 2026-03-03 22:37 CET
- Added `Create Group` button directly in Group Manager editor toolbar.
- Wired Group Manager create flow to:
  - use editor member selection when editing a group
  - fall back to currently selected objects when no editor members are available
  - prompt for a new group ID with auto-normalization
- Group Manager creation now applies current editor name/color/link settings when available.

## 2026-03-03 22:35 CET
- Added per-action LFO identity and enable state in runtime/action serialization (`lfoId` / `lfo_id`, `enabled`) with backward-compatible auto-ID generation for existing actions.
- Added Action Group entry support for per-action-LFO toggling (`actionLfoEnabled` / `action_lfo_enabled`) so groups can enable/disable a specific LFO ID.
- Added runtime method `set_action_lfo_enabled(...)` and wired it into Action Group trigger execution; updates are applied to both stored action data and currently running action snapshots.
- Updated modulation engine to ignore disabled LFO mappings (including live action runtime and helper modulation queries).
- Expanded Action Manager Action Group editor UI:
  - new entry types `Enable Action LFO` / `Disable Action LFO`
  - action-scoped LFO selector when authoring those entries
- Expanded Modulation Manager LFO list UI with LFO ID and enabled state display, plus enabled editing in the LFO form.
- Updated panner LFO context-menu grouping/linking logic to use LFO IDs when present, preserving shared-ID mapping workflows.
- Added SSE handling for `action_group` and new `action_lfo` events for immediate UI refresh.
- Added showfile persistence for object-group runtime state:
  - `groups_enabled` and `object_groups` now load/save with shows
  - group edits now follow the same working-state model and persist on explicit `Save Show`
- Extended schemas/templates:
  - `showfile.schema.json`: `object_groups`, `groups_enabled`, and `action_lfo_enabled` entries
  - `action.schema.json`: optional `lfo_id` and `enabled` in `lfos`
  - template show/actions updated with the new fields.

## 2026-03-03 22:10 CET
- Added Action Group support in runtime show model and status payload (`show.actionGroupIds`, `show.actionGroupsById`) with full create/update/delete/trigger lifecycle.
- Added Action Group HTTP API endpoints:
  - `POST /api/action-group/create`
  - `POST /api/action-group/:id/update`
  - `POST /api/action-group/:id/delete`
  - `POST /api/action-group/:id/trigger`
- Added Action Group OSC trigger routing (`osc_triggers.trigger`) so groups can be fired from external controllers like QLab.
- Extended showfile schema/templates with top-level `action_groups` and normalized entry support (`action` commands plus `lfos_enabled` toggles).
- Added Action Manager UI block for Action Groups:
  - group create/save/delete/trigger controls
  - ordered group-entry list editor
  - entry types for action start/stop/abort and LFO enable/disable
- Added Show Control trigger chips for Action Groups alongside single-action controls.
- Changed action mutation behavior (`create/update/save-as/delete`) to update runtime working state without immediate disk save; persistence still happens on explicit `Save Show`.
- Fixed Action Group LFO entry authoring so `lfos-enable` and `lfos-disable` always serialize to deterministic enabled states.

## 2026-03-03 21:49 CET
- Increased action runtime update frequency to 60 Hz (`ACTION_TICK_SEC`) for smoother motion.
- Reworked LFO modulation logic to keep per-target center state, apply external/manual deltas without snapping, and sum multiple modulators targeting the same object parameter.
- Added LFO mapping phase offset support end-to-end (`mapping_phase_deg` / `mappingPhaseDeg`) in runtime normalization, modulation, debug payloads, UI editor inputs, and action schema.
- Added global LFO enable state and API (`POST /api/lfos/enabled`) with Action Manager toggle and status line integration.
- Added LFO debug telemetry/event flow:
  - backend emits throttled `lfo_debug` samples during action playback
  - Action Manager shows live target/current/min/max/span/state debug table
- Improved UI refresh pipeline for smooth visuals without requiring debug log:
  - debounced status refresh queueing
  - reconcile interval fallback
  - requestAnimationFrame-based render scheduling
  - noisy debug log throttling by event type
- Added Action Manager list/table selection workflow for actions and LFO rows (click or keyboard select), plus explicit LFO update action and selected-LFO summary.
- Added panner right-click context menu with nested hover menus:
  - `Groups` membership toggles per object
  - `LFOs` -> select reusable modulator signature -> param target mapping with mapping-phase prompt
- Fixed menu interaction lockups by closing context menus on outside click, Escape, resize, and pointer down.
- Hardened HTTP handler against benign browser disconnects by catching `ConnectionResetError`.
- Updated Action Manager layout to a compact grid with `Action Setup` as the top block (desktop and mobile ordering updated).
- Added reusable showfile validator CLI (`apps/control-server/showfile_validator.py`) and wired `scripts/validate-showfiles.sh` to execute it.
- Updated template show/action data to include an additional action and current LFO-enabled examples for regression checks.

## 2026-03-03 19:09 CET
- Improved automatic ID generation in Object Manager:
  - object auto-ID now derives from entered type when ID is blank (with numeric uniqueness suffixing)
  - group auto-ID now derives from current selection context (single object, shared prefix, or shared type)
- Improved group naming defaults: new group names now auto-humanize from generated IDs (for example `violin-1-group` -> `Violin 1 Group`).
- Added group color support end-to-end:
  - UI group color picker in Object Groups manager
  - group color included in group create/update API payloads
  - runtime group model now stores/normalizes `color`
  - groups panel now displays a color chip per group entry
  - enabled groups now visually override member object colors in the panner/object table, and object colors restore when groups are disabled
- Updated Groups panel to always include the virtual `All` group pinned at the top as a locked system row.

## 2026-03-03 12:14 CET
- Implemented showfile validation gate in Python runtime load path (`Runtime.load_show`), enforcing schema + file-reference checks before scenes/actions are accepted.
- Added `apps/control-server/showfile_validator.py` with reusable validation logic for showfile, scene, and action schema enforcement.
- Implemented `scripts/validate-showfiles.sh` to run validation for explicit show paths or all discovered `show.json` files.
- Marked TODO item complete: JSON Schema validation gate before show/action load.

## 2026-03-03 01:03 CET
- Created `art-control/` scaffold for Amadeus ART web controller.
- Added architecture and design docs for reliability, OSC IO, showfiles, scenes, and actions.
- Added JSON schemas and template showfile/scene/action examples.
- Added bugfix prompt workflow and version-control plan.
- Added starter TypeScript domain and OSC contract placeholders.

## 2026-03-03 01:06 CET
- Added scripts/log-change.sh for timestamped changelog entries

## 2026-03-03 01:07 CET
- Moved ART controller scaffold into /Users/jens/Documents/Coding/Studio_Wiring/Amadeus_Panner

## 2026-03-03 01:08 CET
- Aligned package names, schema IDs, and docs to Amadeus_Panner naming

## 2026-03-03 01:14 CET
- Moved project root to /Users/jens/Documents/Coding/Amadeus_Panner and set this as active working scope

## 2026-03-03 01:16 CET
- Added PATCH_NOTES.md and scripts/new-patch-note.sh; wired patch-note workflow in README and package scripts

## 2026-03-03 01:36 CET
- Implemented runnable Python dev server with OSC in/out, REST+SSE API, and interactive browser panner UI; added scripts/run-dev.sh and updated docs

## 2026-03-03 01:37 CET
- Switched default runtime path to Python (Node unavailable), updated README/start scripts, and refreshed TODO + patch notes

## 2026-03-03 01:54 CET
- Upgraded UI panner from 2D to perspective 3D with camera controls, orbit, X/Z drag, and Shift-drag Y movement

## 2026-03-03 02:08 CET
- Added requested backlog items for object manager, advanced action manager, movement types, multi-select editing, object-specific triggers, and non-selected object opacity

## 2026-03-03 02:16 CET
- Marked TODO item complete: initialized git repo and created baseline commit

## 2026-03-03 02:29 CET
- Implemented Object Manager page with add/rename/type/color/remove/clear controls and matching object lifecycle API endpoints

## 2026-03-03 02:34 CET
- Fixed Object Manager ID handling: add now auto-normalizes input and auto-generates unique IDs when empty/invalid

## 2026-03-03 11:51 CET
- Fixed 3D drag mode switching: Shift height adjustments now re-anchor to current pointer/object and no longer teleport after X/Z movement

## 2026-03-03 11:54 CET
- Fixed Shift release teleport: mode switch between Y and XZ drag now preserves cursor/object offset and suppresses snap frame

## 2026-03-03 12:14 CET
- Implemented multi-object selection and simultaneous editing with marquee select, Cmd+click additive selection, and batch inspector/object-manager updates
- Changed 3D panner interaction model: Option+drag now controls camera orbit, normal drag now performs multi-selection box
- Added object groups with linkable parameters, including group create/update/delete UI and runtime propagation of linked parameter updates

## 2026-03-03 12:21 CET
- Restored direct object edit in 3D panner: dragging an object now moves it on X/Z, with Shift-drag height (Y) adjustment while preserving Option-drag camera and empty-space marquee select

## 2026-03-03 12:26 CET
- Updated multi-object drag behavior to be relative: dragging one selected object now applies movement deltas to all selected objects (including Shift Y-height), preserving their inter-object offsets

## 2026-03-03 12:46 CET
- Added UI toggle to enable/disable live debug event stream logging in the Debug Events panel
- Added TODO follow-ups for boundary clamp smoothness tuning and Shift-drag mode-transition smoothing

## 2026-03-03 12:53 CET
- Added a new Groups panel below Object Inspector with per-group on/off toggles
- Added runtime group `enabled` state and propagation guard so disabled groups stop linked-parameter follow behavior

## 2026-03-03 13:20 CET
- Changed group link propagation for `x/y/z` from absolute copy to relative delta application, so grouped objects preserve their spacing when one object moves

## 2026-03-03 13:24 CET
- Added live panner preview for group-linked drag updates so grouped objects visually follow immediately during drag (matching selection-link responsiveness)

## 2026-03-03 13:25 CET
- Added table-based object selection toggles in Object Manager (`Sel` checkbox column) for direct multi-selection from the object list

## 2026-03-03 13:30 CET
- Updated selection logic to expand by enabled group membership, so selecting any member selects/highlights/modifies the full enabled group
- Cmd/Ctrl additive selection now adds/removes whole enabled group units (supports combining multiple groups in one selection)

## 2026-03-03 13:36 CET
- Fixed jumpy group+selection drag behavior by avoiding duplicate group propagation when full group members are already in the direct drag patch set
- Added API-level `propagateGroupLinks` control and disabled backend group re-propagation for drag batch updates to prevent double-apply

## 2026-03-03 13:37 CET
- Added `Groups` column to Object Manager table, showing each object's group memberships (and disabled group markers)

## 2026-03-03 13:46 CET
- Added Show Control actions in UI: `Load Show`, `Save Show`, `Save Show As`, and `Create New Show`
- Added server endpoints `POST /api/show/save` and `POST /api/show/new`
- Implemented schema-safe showfile writing with scene/action file generation and validation before save completes

## 2026-03-03 14:05 CET
- Added Groups panel master toggle (`Enable Groups`) to globally enable/disable group-link behavior
- Added hidden virtual `All` group membership model and surfaced it in Object Manager group labels
- Added per-object `Exclude From All` toggle in Object Manager table with runtime API support (`excludeFromAll`)

## 2026-03-03 14:30 CET
- Added panner `Ctrl+drag` override mode to edit only the touched object, ignoring current selection and group-link propagation
- Updated panner help text to document `Ctrl+drag` single-object override behavior

## 2026-03-03 19:00 CET
- Replaced Show Control path text field with a show-selection dropdown populated from runtime showfile discovery
- Added UI feedback status bar for operator-visible success/error/info messages
- Added server endpoint `GET /api/show/list` to enumerate available `show.json` files under `showfiles/`
- Improved object/group auto-naming to use natural numeric progression (for example `obj-3` now advances to `obj-4` instead of `obj-3-2`)
- Added shared ID generation logic for stable incremental naming across both objects and groups

## 2026-03-03 19:06 CET
- Added Scene Manager controls in Show Control: scene dropdown with `Load Scene`, `Save Scene`, and `Save Scene As`
- Added scene persistence endpoints (`POST /api/scene/:id/save`, `POST /api/scene/:id/save-as`) and runtime scene-save methods
- Updated show-save internals to support scene persistence without always forcing active-scene capture (`capture_runtime_scene` option)

## 2026-03-03 19:15 CET
- Fixed Node server/UI mismatch by adding GET /api/show/list in apps/control-server/src/main.mjs (prevents repeated 'show list failed: Not found').

## 2026-03-03 19:15 CET
- Fixed group color-link UX in apps/ui/public/app.js: group color now applies to member visuals only when 'Color' is enabled in linked parameters.

## 2026-03-03 19:42 CET
- Added Action Manager tab with action select/transport controls, create/save/save-as/delete flows, enable/disable toggle, on-end action chaining selector, and editable OSC start/stop/abort trigger paths.
- Added action LFO editor in UI (object parameter, waveform, rate, depth, offset, phase) with add/remove/clear operations.
- Added backend action lifecycle APIs:
  - `POST /api/action/create`
  - `POST /api/action/:id/update`
  - `POST /api/action/:id/save-as`
  - `POST /api/action/:id/delete`
- Extended runtime action model with `enabled`, `onEndActionId`, and `lfos`, plus richer status payload (`show.actionsById`, `runningActionDetails`).
- Added action on-complete chaining behavior and disabled-action start protection for API/OSC triggers.
- Extended action schema (`showfiles/_schema/action.schema.json`) to validate `enabled`, `on_end_action_id`, and `lfos`.

## 2026-03-03 19:31 CET
- Added Group Manager page with full group overview table, inline name/color/enabled editing, and direct delete actions wired to existing group update/delete APIs.

## 2026-03-03 19:42 CET
- Added Group Manager editor panel with editable Name, Color, Linked Params, and Members, plus save/delete wiring in the Group Manager tab.

## 2026-03-03 19:46 CET
- Compacted Group Manager editor layout: moved save/delete to top row, tightened field/link density, and made members section collapsible with live member/link counts.
