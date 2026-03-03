# TODO

## Critical
- [ ] Confirm official ART OSC address map and parameter ranges from Amadeus docs/support.
- [ ] Lock transport decisions: OSC ports, host failover strategy, heartbeat behavior.
- [ ] Define hard safety rules for live mode (rate limits, clamp ranges, E-stop behavior).

## Build Foundation
- [x] Initialize git repo for `Amadeus_Panner` and commit baseline.
- [x] Add runnable local dev runtime (`python3 apps/control-server/server.py`) and launcher script.
- [ ] Decide long-term runtime stack (keep Python or migrate to TypeScript workspace).
- [x] Implement JSON Schema validation gate before show/action load.
- [ ] Add persistent event log and crash-safe state snapshots.

## Runtime Features
- [ ] Implement OSC out queue with retry, de-dup, and ack timeout handling.
- [x] Implement OSC in router for feedback + trigger endpoints.
- [ ] Implement scene recall with atomic apply and rollback-on-fail.
- [x] Implement baseline action timeline player with start/stop/abort.
- [x] Add baseline Action Manager (create/save/save-as/delete), action enable/disable, on-end chaining, and per-object LFO modulation.
- [ ] Update action manager to support start value, end value, runtime, and slope.
- [ ] Expand movement types (design pending), e.g. random panner and physics bounce-to-position.
- [ ] Add object-specific triggers that execute object-specific actions.
- [ ] Add external timecode sync option for action clock.

## UI
- [x] Build baseline perspective 3D panner with camera orbit/zoom and object drag.
- [ ] Elevate 3D panner to production-grade (Three.js or equivalent) with improved depth cues and controls.
- [x] Build baseline scene manager and action trigger panels.
- [x] Add object manager page with add, rename, type, remove, clear, and color controls.
- [x] Add multi-object selection and simultaneous parameter editing.
- [x] Add object groups with linkable shared parameters.
- [ ] Tune drag edge behavior near clamp limits to improve perceived smoothness at room boundaries.
- [ ] Review and smooth Shift mode transition during object drag under fast pointer movement.
- [ ] Increase opacity of non-selected objects.
- [ ] Add action recorder/editor UI (timeline editing).
- [ ] Add iPad interaction QA (touch hit targets, orientation, kiosk mode).
- [x] Add baseline developer event log overlay for OSC traffic.

## Quality
- [ ] Add unit tests for state reducers, action scheduler, and OSC mapping.
- [ ] Add integration tests for OSC loopback and scene/action triggers.
- [ ] Add soak test profile (8h run) with memory and timing checks.
