# Control Server

Runtime entrypoint:
- `python3 apps/control-server/server.py`

Responsibilities:
- Receive UI intents.
- Validate and normalize commands.
- Emit OSC to ART.
- Receive OSC feedback/triggers.
- Publish runtime updates to UI clients via server-sent events.

This is the safety-critical runtime path.
