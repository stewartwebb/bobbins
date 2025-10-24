# BafaChat WebRTC Signaling Design

## Goals
- Provide a reliable signaling channel for establishing peer-to-peer (P2P) or Selective Forwarding Unit (SFU) media sessions inside audio/video channels.
- Integrate with existing authentication, permissions, and channel membership models.
- Allow the web client to negotiate WebRTC offers/answers, exchange ICE candidates, and manage participant presence/state changes (mute, camera, screen share, layout preferences).
- Keep the design flexible enough to support both direct P2P rooms (<6 participants) and an SFU backend if we add one later.

## High-Level Architecture
```
Browser ──(REST: join)──▶ BafaChat API ──┐
Browser ◀─(REST: join)───               │
Browser ──(WebSocket: signaling)───▶ Signaling Hub ──▶ (optional) SFU/Media server
Browser ◀─(WebSocket events)──────────◀──────────────┘
```

1. **Auth**: Clients authenticate with the existing JWT. Authorization ensures only server members join channels.
2. **Channel Join**: A new REST endpoint issues a short-lived signaling session token plus configuration (STUN/TURN list, room ID, participant state).
3. **Signaling Transport**: We extend the existing WebSocket hub with channel-specific rooms and typed events for WebRTC negotiation and participant state.
4. **Media Plan**: Initially peer connections are mesh (browser ↔ browser). We can later swap to SFU without changing the signaling contract by adding optional `sfu_endpoint` fields.

## Entities
- **Participant**: User within a channel, tracks `user_id`, `display_name`, `role` (owner/member), `media_state` (mic/cam/screen).
- **AV Channel Session**: Represents a specific audio/video channel occupancy session. Maintains participant list and metadata (active speakers, layout hints).
- **Signaling Session Token**: Short-lived (e.g., 2 minutes) bearer token allowing the client to use WebSocket for a specific channel.

## API Surface

### REST

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/channels/{channelID}/webrtc/join` | Auth required. Validates membership/permissions, returns signaling session token + TURN/STUN config + current participant roster. |
| `POST` | `/channels/{channelID}/webrtc/leave` | Optional. Explicitly leave an active session (fallback if socket closes uncleanly). |

**Join Response**
```json
{
  "data": {
    "session_token": "<opaque>",
    "expires_at": "2025-10-24T18:25:43Z",
    "channel": {"id": 17, "type": "audio", "name": "Chatter"},
    "participant": {
      "user_id": 42,
      "display_name": "stew",
      "role": "owner",
      "media_state": {
        "mic": "off",
        "camera": "off",
        "screen": "off"
      }
    },
    "participants": [ /* other active participants */ ],
    "iceservers": [
      {"urls": ["stun:stun.l.google.com:19302"]},
      {"urls": ["turn:turn.bafachat.com"], "username": "abc", "credential": "xyz"}
    ],
    "sfu": null
  }
}
```

### WebSocket Signaling
Clients connect to `/ws?token=<JWT>` as today, then emit a `session.authenticate` to bind a signaling session:

```json
{
  "type": "session.authenticate",
  "data": {
    "session_token": "<opaque>",
    "channel_id": 17
  }
}
```

If accepted, the hub replies:
```json
{ "type": "session.ready", "data": { "channel_id": 17 } }
```

#### Signaling Event Types

| Type | Direction | Payload | Notes |
| --- | --- | --- | --- |
| `session.authenticate` | client → server | `session_token`, `channel_id` | Binds socket to channel session. |
| `session.ready` | server → client | `channel_id` | Acknowledges join. |
| `session.error` | server → client | `code`, `message` | Any authentication or validation issue. |
| `participant.joined` | server → all | participant descriptor | Broadcast when someone joins. |
| `participant.left` | server → all | `user_id`, `reason` | Broadcast on leave/disconnect. |
| `participant.updated` | client ↔ server | `media_state`, `metadata` | Changes in mute/camera/screen, layout preference (stage focus). |
| `webrtc.offer` | client ↔ server | `target_user_id`, `sdp`, `mid?`, `session_id` | Forwarded to target participant. |
| `webrtc.answer` | client ↔ server | same fields | Reply to offer. |
| `webrtc.ice_candidate` | client ↔ server | `target_user_id`, `candidate`, `sdpMid?`, `sdpMLineIndex?` | ICE trickle. |
| `webrtc.end_session` | client → server | `session_id` | Optional request to tear down connection. |

The server acts as relay—no need to inspect SDP beyond logging metrics. When using SFU, `target_user_id` becomes `null` and the server/SFU handles distribution.

#### Participant Descriptor
```json
{
  "user_id": 42,
  "display_name": "stew",
  "role": "owner",
  "media_state": {
    "mic": "on",
    "camera": "off",
    "screen": "off"
  },
  "session_id": "42-4bc1",
  "last_seen": "2025-10-24T18:25:43Z"
}
```

## Server Responsibilities
1. **Auth & Permissions**: Ensure `session_token` corresponds to current JWT user, channel membership, and channel type (`audio`). Only owners may manage special actions (mute others, stage).
2. **Presence Tracking**: Maintain in-memory map `channelID -> participants`. Clean up on socket close or leave endpoint.
3. **Forwarding**: Relay WebRTC offers/answers/ICE to target participants. If target offline, respond with `session.error`.
4. **State Persistence**: For now, keep ephemeral in-memory state. Optionally persist active sessions in Redis for horizontal scaling.
5. **TURN/TURN Credentials**: Generate ephemeral TURN credentials (e.g., via REST to coturn) during join response.
6. **Metrics & Logging**: Capture join/leave events, negotiation durations, failure reasons.

## Client Responsibilities
- Call `join` endpoint before opening signaling socket, store roster and configuration.
- After `session.ready`, create peer connections: for mesh, iterate over `participants` and exchange offers. Use `session_id` for stable ordering.
- Update server with `participant.updated` when muting, toggling camera, or selecting stage focus. UI listens for server broadcasts to update tiles.

## Error Handling
- On invalid session token: server emits `session.error` with `code = "auth.invalid"`. Client should retry join flow.
- On permission change (e.g., kicked): server sends `session.error` `code = "session.revoked"` then `participant.left` and closes socket.
- On network issues: client should retry WebSocket connection, re-authenticate using latest `session_token`.

## Scaling Considerations
- **Horizontal Scaling**: Introduce Redis pub/sub for hub replication (fan out `participant.*` and `webrtc.*` events).
- **SFU Integration**: Add optional `sfu` block in join response with URL/token. Event types remain; offers will target SFU instead of peers.
- **Recording/Streaming**: Later add `session.record.start` events that only owners can trigger.

## Open Questions
- TURN provisioning: do we manage our own coturn or use a managed service? Needs decision for credential generation.
- Persistence: do we need reconnect resilience (remembering participants for 30s)? Could be added with Redis.
- Moderation: should owners force-mute others? If yes, extend `participant.updated` with `source_user_id` and enforce server-side.

This design can be implemented incrementally: start with join endpoint + auth, extend WebSocket hub with new event types, and finally build client-side negotiation/state management.
