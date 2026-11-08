/** Focused real HTTP Stage 6A boundaries. No admin SQL, forced clocks or AI calls.
 * Uses three synthetic cookie sessions and one retained room on the authorized
 * Supabase project. Run after applying the reviewed Stage 6A migration:
 * QUARREL_ALLOW_REMOTE_TESTS=true QUARREL_TEST_URL=http://127.0.0.1:3003 \
 * node --env-file=.env.local tests/db/stage6a.integration.mjs
 * Completed-verdict/rematch races are covered separately by the SQL suite.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const origin = process.env.QUARREL_TEST_URL || 'http://127.0.0.1:3003';
const app = new URL(origin);
assert.ok(['localhost', '127.0.0.1'].includes(app.hostname) && app.origin === origin, 'Use an exact local test origin.');
assert.ok(process.env.SUPABASE_URL, 'Configure the intended Supabase URL.');
const target = new URL(process.env.SUPABASE_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname)
  || (process.env.QUARREL_ALLOW_REMOTE_TESTS === 'true' && target.protocol === 'https:' && target.hostname === 'exjdvtqsalnkghyohyuh.supabase.co'), 'Cloud checks require opt-in to the authorized project.');

function browser(existingJar) {
  const jar = new Map(existingJar);
  return { jar, async request(path, body, extra = {}) {
    const response = await fetch(`${origin}/api/rooms${path}`, {
      method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(25_000),
      headers: { origin, 'content-type': 'application/json', cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(';'); const separator = pair.indexOf('=');
      jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      assert.match(value, /HttpOnly/i); assert.match(value, /SameSite=strict/i);
    }
    assert.equal(response.headers.get('cache-control'), 'no-store, private');
    assert.ok(response.headers.get('vary')?.split(',').map(value => value.trim().toLowerCase()).includes('cookie'), 'Private responses must vary by Cookie; Next.js may add its own routing values.');
    return { status: response.status, data: await response.json() };
  } };
}
let checks = 0;
function pass(message) { console.log(`PASS ${++checks}: ${message}`); }
async function success(player, path, body, headers) {
  const response = await player.request(path, body, headers);
  assert.equal(response.status, 200, `${path || '/create'}: ${response.data.error || 'unexpected response'}`);
  return response.data;
}

const a = browser(), b = browser(), outsider = browser(), anonymous = browser();
let room = (await success(a, '', { name: 'Stage 6A HTTP Alex' })).room;
const roomId = room.id, debateId = room.lawyer.debateId;
const scope = { 'x-quarrel-room-id': roomId };
assert.equal(room.lawyer.reliabilityVersion, 2);
assert.match(debateId, /^[0-9a-f-]{36}$/);
assert.equal(room.themeId, 'courtroom'); assert.equal(room.you, 'A');
const guest = (await success(b, '/join', { code: room.code, name: 'Stage 6A HTTP Sam' })).room;
assert.equal(guest.you, 'B'); assert.equal(guest.lawyer.debateId, debateId);
assert.equal((await outsider.request('/join', { code: room.code, name: 'Stage 6A HTTP Third' })).status, 409);
pass('Real anonymous sessions create and join the version-2 room; a third player cannot join.');

room = (await success(a, '/lawyer/topic', { topic: 'Should our campus library open later?', totalSeconds: 120, revision: room.lawyer.revision }, scope)).room;
room = (await success(a, '/lawyer/position', { position: 'Extend evening hours for commuters.', revision: room.lawyer.revision }, scope)).room;
const aPosition = room.lawyer.positionA;
assert.equal(room.lawyer.positionB, null);
assert.equal((await b.request('/lawyer/position', { position: 'Forged position', revision: room.lawyer.revision, slot: 'A' }, scope)).status, 400);
room = (await success(b, '/lawyer/position', { position: 'Keep current hours and fund daytime spaces.', revision: room.lawyer.revision }, scope)).room;
assert.equal(room.lawyer.positionA, aPosition);
const hostView = (await success(a, '/session')).room;
assert.equal(hostView.lawyer.positionB, room.lawyer.positionB);
assert.equal(hostView.lawyer.confirmedA, true); assert.equal(hostView.lawyer.confirmedB, true);
assert.equal((await a.request('/lawyer/position', { position: 'Own edit', positionB: 'Forged peer edit', revision: room.lawyer.revision }, scope)).status, 400);
pass('Each player sets only their own position; both snapshots agree and forged peer ownership is rejected.');

for (const player of [a, b]) {
  const listed = await success(player, '/lawyer/history');
  assert.deepEqual(listed, { history: [] });
  assert.equal((await player.request(`/lawyer/history?debateId=${debateId}`)).status, 409);
  assert.equal((await player.request('/lawyer/acknowledge', { debateId })).status, 409);
  assert.equal((await player.request('/lawyer/rematch', { debateId }, scope)).status, 409);
  assert.equal((await player.request('/lawyer/retry', { debateId }, scope)).status, 409);
}
assert.equal((await outsider.request(`/lawyer/history?debateId=${debateId}`)).status, 404);
assert.equal((await outsider.request('/lawyer/acknowledge', { debateId })).status, 404);
assert.equal((await anonymous.request('/lawyer/history')).status, 401);
assert.equal((await anonymous.request('/lawyer/acknowledge', { debateId })).status, 401);
pass('Unfinished results cannot be acknowledged, rematched or retried; outsiders cannot retrieve the record.');

for (const path of ['/lawyer/rematch', '/lawyer/retry', '/lawyer/acknowledge']) {
  assert.equal((await a.request(path, { debateId }, { ...scope, origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await a.request(path, { debateId, playerId: 'victim' }, scope)).status, 400);
  assert.equal((await anonymous.request(path, { debateId }, scope)).status, 401);
}
for (const path of ['/lawyer/rematch', '/lawyer/retry']) {
  assert.equal((await a.request(path, { debateId })).status, 400);
  const stale = await a.request(path, { debateId }, { 'x-quarrel-room-id': randomUUID() });
  assert.equal(stale.status, 409); assert.equal(stale.data.code, 'STALE_ROOM');
}
assert.equal((await a.request('/lawyer/retry', { debateId: randomUUID() }, scope)).data.code, 'STALE_DEBATE');
assert.equal((await a.request(`/lawyer/history?debateId=${debateId}&debateId=${debateId}`)).status, 400);
assert.equal((await a.request('/lawyer/history?debateId=bad')).status, 400);
pass('Origin, identity, exact body fields, room/debate stale guards and archive query validation hold over real HTTP.');

const refreshed = browser(b.jar);
refreshed.jar.set('quarrel_access', 'expired-test-token');
const recovered = (await success(refreshed, '/session')).room;
assert.equal(recovered.id, roomId); assert.equal(recovered.you, 'B');
assert.equal(recovered.lawyer.debateId, debateId);
assert.equal(recovered.lawyer.positionA, aPosition);
assert.equal(recovered.lawyer.positionB, room.lawyer.positionB);
assert.notEqual(refreshed.jar.get('quarrel_access'), 'expired-test-token');
assert.equal(recovered.lawyer.verdict, null); assert.equal(recovered.lawyer.phase, 'setup');
pass('A fresh browser cookie jar and real token renewal recover the same debate and positions without a verdict or reset.');

// Preserve the synthetic record; release only these test players' current seats.
assert.deepEqual(await success(a, '/leave', { roomId }, scope), { room: null });
assert.deepEqual(await success(refreshed, '/leave', { roomId }, scope), { room: null });
console.log(`All ${checks} Stage 6A HTTP smoke checks passed. No model requests, clock overrides, schema changes or data deletion.`);
