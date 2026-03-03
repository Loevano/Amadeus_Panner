# Design Decisions

## Recommended Defaults
- Language: TypeScript for compile-time checks on OSC payload shapes.
- 3D engine: Three.js for production panner.
- Prototyping visual sandbox: p5.js only in dev mode.
- Data format: JSON showfiles validated with JSON Schema.
- Runtime mode separation:
  - `live`: strict safety; edits restricted.
  - `program`: scene/action edit enabled.
  - `dev`: simulation, raw diagnostics, and stubs enabled.

## Open Decisions You Should Lock
1. ART failover topology
- Single ART endpoint vs primary/secondary targets.

2. OSC trigger policy
- Edge-triggered vs level-based control addresses.

3. Scene transition behavior
- Hard cut, timed fade, or parameter-specific interpolation.

4. Action timing source
- Internal monotonic clock vs external timecode alignment.

5. Authority model
- Which source wins on conflict: operator UI, OSC trigger, or action engine.

## Non-negotiable Safety Rules
- Never send raw user input directly to OSC.
- Every outgoing payload must pass schema + range checks.
- Maintain explicit emergency stop state in server.
- Require confirmation for destructive scene/action operations.
