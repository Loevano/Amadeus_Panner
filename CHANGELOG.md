# Changelog

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
