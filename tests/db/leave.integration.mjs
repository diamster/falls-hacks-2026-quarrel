/** Real HTTP regression for leaving a saved room and starting fresh.
 * Uses three synthetic anonymous sessions and four retained rooms. No admin
 * credentials, data reset, or forced deadlines are involved. New-room readiness
 * may reserve one planner job; the complete legacy fixture makes no AI calls.
 * Run only after the leave-room migration is applied to the configured backend:
 * QUARREL_ALLOW_REMOTE_TESTS=true QUARREL_TEST_URL=http://127.0.0.1:3000 \
 * node --env-file=.env.local tests/db/leave.integration.mjs
 */
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const origin = process.env.QUARREL_TEST_URL || 'http://127.0.0.1:3000';
const databaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local test app.');
assert.ok(databaseUrl && publishableKey, 'Configure the intended Supabase URL.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname) || (process.env.QUARREL_ALLOW_REMOTE_TESTS === 'true' && new URL(databaseUrl).hostname === 'exjdvtqsalnkghyohyuh.supabase.co'), 'Cloud checks require explicit QUARREL_ALLOW_REMOTE_TESTS=true.');

function browser() {
  const jar = new Map();
  return { jar, async request(path, body, extra = {}) {
    const response = await fetch(`${origin}/api/rooms${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(25_000),
      headers: { origin, 'content-type': 'application/json', cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(';'); const index = pair.indexOf('=');
      jar.set(pair.slice(0, index), pair.slice(index + 1));
      assert.match(value, /HttpOnly/i); assert.match(value, /SameSite=strict/i);
    }
    assert.equal(response.headers.get('cache-control'), 'no-store, private');
    return { status: response.status, data: await response.json() };
  } };
}
async function success(player, path, body, headers) {
  const result = await player.request(path, body, headers);
  assert.equal(result.status, 200, `${path || '/create'}: ${result.data.error || 'unexpected response'}`);
  return result.data.room;
}
function subject(player) {
  // This decode compares test identity before/after, never authorizes an action.
  // Actual authorization still runs through Auth and PostgreSQL on every call.
  const payload = player.jar.get('quarrel_access')?.split('.')[1];
  assert.ok(payload, 'An authenticated session cookie must remain present.');
  const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).sub;
  assert.ok(typeof value === 'string' && value, 'The test session has a subject.');
  return value;
}
const scope = roomId => ({ 'x-quarrel-room-id': roomId });
let checks = 0;
function pass(message) { console.log(`PASS ${++checks}: ${message}`); }
const fixtures = [];
const a = browser(), b = browser(), c = browser(), unauthenticated = browser();

try {
  assert.deepEqual((await a.request('/session')).data, { room: null });
  const original = await success(a, '', { name: 'Leave Test Alex' }); fixtures.push(original.id);
  const originalSubject = subject(a);
  await success(b, '/join', { code: original.code, name: 'Leave Test Sam' });
  await success(a, '/theme', { themeId: 'detective' }, scope(original.id));
  let proposed = await success(a, '/lawyer/topic', {
    topic: 'Should our shared garden grow herbs or flowers?', totalSeconds: 120, revision: 0,
  }, scope(original.id));
  proposed = await success(a, '/lawyer/position', { position: 'Herbs provide ingredients for cooking.', revision: proposed.lawyer.revision }, scope(original.id));
  await success(b, '/lawyer/position', { position: 'Flowers add color and support pollinators.', revision: proposed.lawyer.revision }, scope(original.id));
  await success(a, '/ready', { ready: true }, scope(original.id));
  await success(b, '/ready', { ready: true }, scope(original.id));
  const beforeLeave = await success(b, '/session');
  assert.equal(beforeLeave.bothReady, true);
  pass('Two real sessions create/join a room and agree on a saved proposal.');

  assert.equal((await unauthenticated.request('/leave', { roomId: original.id })).status, 401);
  assert.equal((await a.request('/leave', { roomId: original.id }, { origin: 'https://attacker.invalid' })).status, 403);
  for (const body of [{}, { roomId: 'not-a-room' }, { roomId: original.id, userId: 'victim' }, { roomId: original.id, slot: 'B' }]) {
    assert.equal((await a.request('/leave', body)).status, 400);
  }
  assert.equal((await success(a, '/session')).id, original.id);
  assert.equal((await success(b, '/session')).bothReady, true);
  pass('Absent identity, cross-origin requests and forged leave fields cannot remove a seat.');

  const departure = await a.request('/leave', { roomId: original.id }, scope(original.id));
  assert.equal(departure.status, 200, departure.data.error);
  assert.deepEqual(departure.data, { room: null });
  assert.ok(subject(a) === originalSubject, 'Leaving must preserve the anonymous identity.');
  assert.ok(a.jar.get('quarrel_refresh'), 'Leaving must retain session recovery.');
  assert.equal(await success(a, '/session'), null);
  assert.equal(await success(a, '/leave', { roomId: original.id }, scope(original.id)), null, 'Retrying leave without a new room is harmless.');
  const remaining = await success(b, '/session');
  assert.equal(remaining.id, original.id);
  assert.equal(remaining.themeId, beforeLeave.themeId);
  assert.equal(remaining.lawyer.topic, beforeLeave.lawyer.topic);
  assert.equal(remaining.lawyer.positionA, beforeLeave.lawyer.positionA);
  assert.equal(remaining.lawyer.positionB, beforeLeave.lawyer.positionB);
  assert.equal(remaining.lawyer.revision, beforeLeave.lawyer.revision);
  assert.deepEqual(remaining.lawyer.history, beforeLeave.lawyer.history);
  assert.equal(remaining.bothReady, false);
  assert.equal(remaining.players.length, 2, 'Departed slots stay reserved for their original record.');
  assert.deepEqual(remaining.players.map(player => player.name), ['Leave Test Alex', 'Leave Test Sam']);
  assert.equal(remaining.players.find(player => player.slot === 'A').connected, false);
  assert.equal(remaining.players.find(player => player.slot === 'A').ready, false);
  assert.equal(remaining.players.find(player => player.slot === 'B').ready, true);
  assert.equal((await success(b, '/join', { code: original.code, name: 'Leave Test Sam' })).id, original.id, 'The remaining peer can still recover their seat.');
  const closed = await c.request('/join', { code: original.code, name: 'Leave Test Third' });
  assert.equal(closed.status, 409);
  assert.match(closed.data.error, /player has left|closed/i);
  assert.equal(await success(c, '/session'), null);
  pass('Leaving retains identity, peer access, names and the proposal, but disconnects the old seat and closes its invitation.');

  const fresh = await success(a, '', { name: 'Leave Test Alex Again' }); fixtures.push(fresh.id);
  assert.notEqual(fresh.id, original.id);
  assert.notEqual(fresh.code, original.code);
  assert.equal(fresh.you, 'A');
  assert.equal(fresh.themeId, 'courtroom');
  assert.ok(subject(a) === originalSubject, 'Creating another room must reuse the existing identity.');
  assert.equal((await success(a, '/session')).id, fresh.id, 'Refreshing recovers the newly created room.');
  pass('The same browser creates a different room without clearing cookies or allocating another anonymous account.');

  const staleLeave = await a.request('/leave', { roomId: original.id });
  assert.equal(staleLeave.status, 409);
  assert.equal(staleLeave.data.code, 'STALE_ROOM');
  for (const [path, body] of [
    ['/ready', { ready: true }], ['/theme', { themeId: 'courtroom' }], ['/heartbeat', {}],
    ['/lawyer/argument', { text: 'An old tab must not submit this in the new room.', revision: 0, subtopic: 1, requestKey: '22222222-2222-4222-8222-222222222222' }],
  ]) {
    const stale = await a.request(path, body, scope(original.id));
    assert.equal(stale.status, 409, `${path} must reject the previous room scope.`);
    assert.equal(stale.data.code, 'STALE_ROOM');
  }
  const unchanged = await success(a, '/session');
  assert.equal(unchanged.id, fresh.id);
  assert.equal(unchanged.themeId, 'courtroom');
  assert.equal(unchanged.players[0].ready, false);
  assert.equal(unchanged.debate?.history?.length ?? 0, 0);
  assert.equal((await success(b, '/session')).id, original.id);
  pass('Late leave requests and stale-tab readiness, theme, heartbeat and argument writes cannot affect the new room.');

  assert.equal(await success(a, '/leave', { roomId: fresh.id }, scope(fresh.id)), null);
  const invitation = await success(c, '', { name: 'Leave Test New Host' }); fixtures.push(invitation.id);
  const joined = await success(a, '/join', { code: invitation.code, name: 'Leave Test Alex Guest' });
  assert.equal(joined.id, invitation.id); assert.equal(joined.you, 'B');
  assert.ok(subject(a) === originalSubject, 'Joining after departure must preserve the original identity.');
  assert.equal((await success(a, '/session')).id, invitation.id);
  const invitationTopic = await success(c, '/lawyer/topic', { topic: 'Should the campus garden grow herbs?', totalSeconds: 120, revision: 0 }, scope(invitation.id));
  await success(a, '/lawyer/position', { position: 'Flowers would provide more color.', revision: invitationTopic.lawyer.revision }, scope(invitation.id));
  const changed = await success(a, '/ready', { ready: true }, scope(invitation.id));
  assert.equal(changed.players.find(player => player.slot === 'B').ready, true);
  assert.equal((await success(c, '/session')).players.find(player => player.slot === 'B').ready, true);
  assert.equal((await a.request('/leave', { roomId: original.id }, scope(invitation.id))).status, 409);
  assert.equal((await success(a, '/session')).id, invitation.id);
  pass('The same browser can instead join a new invitation, refresh as Player B, and synchronize readiness normally.');

  // Keep a complete historical debate regression. Existing members create a
  // legacy fixture through its authenticated RPC, never via admin SQL.
  await success(c, '/leave', { roomId: invitation.id }, scope(invitation.id));
  await success(b, '/leave', { roomId: original.id }, scope(original.id));
  const legacyClient = createClient(databaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${c.jar.get('quarrel_access')}` } },
  });
  const legacyCreated = await legacyClient.rpc('create_quarrel_room', { p_name: 'Historical Host' });
  assert.equal(legacyCreated.error, null, 'Legacy room fixture uses a verified player JWT.');
  const legacy = legacyCreated.data; fixtures.push(legacy.id);
  assert.equal(legacy.lawyer == null, true);
  await success(b, '/join', { code: legacy.code, name: 'Historical Guest' });
  let oldRoom = await success(c, '/debate/propose', { topic: 'Should our garden grow herbs or flowers?', positionA: 'Grow herbs for cooking.', positionB: 'Grow flowers for pollinators.', revision: 0 });
  const revision = oldRoom.debate.revision;
  await success(b, '/debate/approve', { revision });
  await success(c, '/ready', { ready: true }); await success(b, '/ready', { ready: true });
  const started = await legacyClient.rpc('start_quarrel_debate', { p_revision: revision });
  assert.equal(started.error, null, 'The retained Stage 3 start must work without AI.');
  for (let turnIndex = 0; turnIndex < 6; turnIndex++) {
    oldRoom = await success(turnIndex % 2 === 0 ? c : b, '/debate/argument', { text: `Historical argument ${turnIndex + 1}: consider shared garden needs.`, revision, turnIndex });
  }
  assert.equal(oldRoom.debate.phase, 'verdict');
  const history = oldRoom.debate.history;
  assert.equal(history.length, 6);
  await success(c, '/leave', { roomId: legacy.id }, scope(legacy.id));
  const preserved = await success(b, '/session');
  assert.deepEqual(preserved.debate.history, history);
  assert.equal(preserved.debate.phase, 'verdict');
  assert.equal(preserved.lawyer == null, true);
  assert.equal(preserved.players.find(player => player.slot === 'A').connected, false);
  pass('Leaving a complete legacy debate preserves all six submitted turns and the peer’s historical access.');
  console.log(`All ${checks} leave/new-room HTTP integration checks passed. At most one Stage 5 planner job; legacy fixture used no AI.`);
} finally {
  if (fixtures.length) console.log(`Retained synthetic rooms: ${fixtures.join(', ')}. Expiry is an access rule, not physical deletion.`);
}
