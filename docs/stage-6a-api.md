# Stage 6A backend API

These routes prepare results and rematches for a later UI stage. Stage 6A adds no page, button, layout or browser-state changes. Apply the reviewed Stage 6A migration before running this branch against Supabase Cloud. Never deploy this branch against a database missing its versioned RPCs.

All routes use the existing verified anonymous player session cookies. Do not send a player ID, user ID or slot. The database checks recorded participant identity, room membership and debate state; knowing a room or debate ID is not authorization. Responses are private and uncached.

## Read previous results

`GET /api/rooms/lawyer/history`

Returns `{ "history": [...] }`, listing up to 100 most recent completed debate records available to the authenticated participant. Optional `?roomId=<UUID>` filters the list to one room. Older records remain addressable by their debate ID.

`GET /api/rooms/lawyer/history?debateId=<UUID>`

Returns `{ "history": { ... } }` for one completed debate, including its topic, positions, public presentations, subtopic summaries, final verdict, acknowledgement timestamps and rematch status. The record's stable `id` is the `debateId` used by other routes. Its public history is chronologically ordered. Original drafts and private consultations are excluded. These reads remain available to recorded participants after leaving a room and return no Realtime token. Unknown, unfinished or unauthorized records produce a safe error.

Use only one optional query parameter (`roomId` or `debateId`), once. Invalid or repeated parameters are rejected.

## Acknowledge results

`POST /api/rooms/lawyer/acknowledge`

```json
{ "debateId": "<completed-debate UUID>" }
```

Returns `{ "results": { ... } }`. This records only the caller's acknowledgement timestamp. Repeating the request is safe. Acknowledgement means the player has acknowledged the result, **not** that they agree with it or that the dispute is resolved. This action also works for the caller's earlier results after leaving the room.

## Request or approve a rematch

`POST /api/rooms/lawyer/rematch`

```json
{ "debateId": "<completed-debate UUID>" }
```

Include `x-quarrel-room-id: <current-room UUID>`. The first player's request records their approval. The second player's approval creates a new debate within the same room. Identities and theme remain, while topic, positions, readiness, clocks and AI work reset. Prior results stay archived. Repeated or simultaneous requests cannot create multiple successor debates. Returns the existing `{ "room": ..., "realtime": ... }` room envelope.

## Retry an unavailable jury

`POST /api/rooms/lawyer/retry`

```json
{ "debateId": "<current-debate UUID>" }
```

Include `x-quarrel-room-id: <current-room UUID>`. Only a current participant may retry an eligible, unfinished jury job. The database enforces eligibility and cooldown; a request cannot replace an already persisted verdict. The response returns the room envelope immediately and schedules claimed work on the server. Both player clocks remain stopped during jury processing.

## Request and error conventions

POST routes require `Content-Type: application/json`, the exact same-site `Origin`, session cookies, and only the documented body fields. Rematch and retry additionally require the room header. A debate ID and room header protect against stale tabs; neither substitutes for authenticated identity.

Typical statuses: `400` malformed input, `401` expired/missing session, `403` cross-origin or unauthorized action, `404` unavailable result, `409` stale/not-ready state, `429` retry cooldown, and `503` temporary service/configuration failure. `STALE_DEBATE` and `STALE_ROOM` include a recoverable `code`; refresh the saved room rather than silently retrying against a new debate. Never expose provider error details or server credentials to clients.

Room creation now calls `create_quarrel_lawyer_room_v2`, and the worker uses the versioned Stage 6A claim/completion APIs. Earlier application deployments retain their Stage 5 paths while the migration is rolled out.

## Focused HTTP smoke test

With the reviewed migration applied and this branch running locally, use:

```sh
QUARREL_ALLOW_REMOTE_TESTS=true QUARREL_TEST_URL=http://127.0.0.1:3003 \
  npm run test:stage6a
```

This test passed against the authorized Supabase Cloud project on 2026-11-07. It exercises real session cookies, room creation/joining, independent position ownership, unfinished-result guards, archive authorization, Origin validation, stale room/debate rejection and token recovery. It makes no model requests and does not alter clocks, schema or existing data. Completed verdict/rematch lifecycle checks are handled by the separate database suite.
