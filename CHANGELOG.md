# Changelog

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
