# OSC Scope Draft (ART-Focused)

This file is a scoped contract draft until official Amadeus ART OSC mapping is confirmed.

## Communication Channels
- OSC Out: Control Server -> ART
- OSC In: ART -> Control Server
- UI sync: Control Server <-> UI via WebSocket

## Parameter Groups (Draft)
- Source/object position: `x`, `y`, `z`
- Source/object size/spread: `size`
- Rendering/pan algorithm selector: `algorithm`
- Level controls: `gain`, `mute`
- Scene and preset triggers: `scene_recall`, `preset_recall`
- Action triggers: `action_trigger`, `action_stop`, `action_abort`

## OSC Message Policy
- Include sequence ID on outgoing control messages.
- Apply per-parameter rate limits (for drag updates).
- Normalize float precision before emission.
- Keep a dedup window to avoid repeated redundant sends.

## Inbound OSC Handling
- Accept only allowlisted addresses.
- Reject malformed types.
- Convert inbound addresses to internal event names.
- Write every trigger event to audit log with source IP and timestamp.

## Required Next Step
Replace this draft with an authoritative path/type table from official ART integration documentation.
