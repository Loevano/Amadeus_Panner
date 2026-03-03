# Architecture

## Requirements
- Deterministic control path for live operation.
- Bidirectional OSC communication.
- Explicit state model: show -> scenes -> object states + actions.
- Separation between operator mode and developer/debug mode.

## Runtime Components
1. UI Client (`apps/ui`)
- Renders 3D space and object inspector.
- Sends intent commands, never raw unvalidated OSC.
- Shows runtime alarms and connection state.

2. Control Server (`apps/control-server`)
- Single source of truth for runtime state.
- Validates all commands against schema + safety limits.
- Bridges UI commands to OSC out.
- Ingests OSC in and publishes normalized events.

3. Showfile Store (`showfiles`)
- Stores show metadata, scene snapshots, and action timelines.
- Loaded via schema validator before activation.

4. Persistent Audit Logs (`logs/changes` and runtime logs)
- Tracks operator actions and system events with timestamps.
- Supports post-show diagnosis and safe reproduction.

## Control Flow
1. Operator input -> UI intent command.
2. Control Server validates command and current mode.
3. Server updates runtime state.
4. Server emits OSC out to ART.
5. ART feedback via OSC in updates runtime state.
6. UI receives updates through WebSocket subscription.

## Stability Pattern
- Fail closed: invalid values are rejected, never forwarded.
- Guard rails: clamp every numeric parameter to configured min/max.
- Idempotency: repeated triggers should not create duplicated side effects.
- Action engine clock: monotonic scheduler with explicit pause/stop/abort.
- Scene recall: atomic transaction with rollback if any step fails.

## iPad Readiness
- Single-page app with responsive landscape-first layout.
- Touch-first controls with minimum 44 px targets.
- Local network mode; no cloud dependency during show.
- Optional offline asset cache for venue network instability.
