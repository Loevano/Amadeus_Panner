# Prototyping and Debug Mode

## Dev Mode Features
- OSC simulator endpoint (loopback) to run UI without ART hardware.
- Traffic monitor panel for OSC in/out with filters.
- State-diff inspector after each command.
- One-click export of debug bundle (logs + current state snapshot).

## Recommended Prototype Workflow
1. Build interaction quickly in p5.js sandbox.
2. Validate gesture behavior and data cadence.
3. Port approved interaction to production Three.js component.
4. Add tests for mapping from UI gesture -> normalized command.

## Crash-Safety Rules
- Write runtime snapshots every N seconds and on scene recall.
- Never mutate showfile source directly in live mode.
- Use append-only logs for operational events.
