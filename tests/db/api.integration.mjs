// Real HTTP tests: separate cookie jars, real Next routes, real Supabase Auth/DB.
// No mocked fetch, database, identity, or RLS. No credentials are logged.
import assert from 'node:assert/strict';
const origin = process.env.QUARREL_TEST_URL || 'http://127.0.0.1:3001';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local disposable test app.');
function browser() {
  const jar = new Map();
  return { jar, async request(path, body, headers = {}) {
    const response = await fetch(`${origin}/api/rooms${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { origin, 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1));
      assert.match(value, /HttpOnly/i); assert.match(value, /SameSite=strict/i);
    }
    assert.equal(response.headers.get('cache-control'), 'no-store, private');
    return { status: response.status, data: await response.json() };
  } };
}
const a = browser(), b = browser(), c = browser();
assert.deepEqual((await a.request('/session')).data, { room: null });
const created = await a.request('', { name: 'API Lion' });
assert.equal(created.status, 200, created.data.error);
assert.match(created.data.room.code, /^[A-HJ-NP-Z2-9]{6}$/);
assert.equal(created.data.room.you, 'A');
console.log('PASS create: six-character code, lion slot, HttpOnly cookies, no caching');
const joined = await b.request('/join', { code: created.data.room.code.toLowerCase(), name: 'API Zebra' });
assert.equal(joined.status, 200, joined.data.error); assert.equal(joined.data.room.you, 'B');
assert.deepEqual(joined.data.room.players.map(p => p.name), ['API Lion', 'API Zebra']);
assert.equal((await c.request('/join', { code: created.data.room.code, name: 'Third player' })).status, 409);
assert.equal((await c.request('/join', { code: 'ZZZZZZ', name: 'Third player' })).status, 404);
assert.deepEqual((await c.request('/session')).data, { room: null });
console.log('PASS join, full-room rejection, nonexistent code, outsider has no room details');
assert.equal((await a.request('/ready', { ready: true })).status, 200);
let snapshot = (await b.request('/session')).data.room;
assert.equal(snapshot.players.find(p => p.slot === 'A').ready, true);
assert.equal(snapshot.players.find(p => p.slot === 'B').ready, false);
assert.equal((await b.request('/ready', { ready: true })).data.room.bothReady, true);
assert.equal((await a.request('/session')).data.room.bothReady, true);
console.log('PASS readiness synchronizes, both-ready confirmation visible from both sessions');
// Simulate a refreshed page (same cookies) then an expired access token.
for (const player of [a, b]) {
  assert.equal((await player.request('/session')).data.room.code, created.data.room.code);
  player.jar.set('quarrel_access', 'expired-token');
  const restored = await player.request('/session');
  assert.equal(restored.status, 200, restored.data.error);
  assert.equal(restored.data.room.code, created.data.room.code);
  assert.notEqual(player.jar.get('quarrel_access'), 'expired-token');
}
console.log('PASS refresh recovery and actual token renewal retain each player seat');
for (const field of ['playerId', 'user_id', 'slot']) {
  assert.equal((await a.request('/ready', { ready: false, [field]: 'B' })).status, 400);
}
assert.equal((await a.request('/ready', { ready: false }, { origin: 'https://attacker.invalid' })).status, 403);
const intruder = browser(); intruder.jar.set('quarrel_access', 'forged-player-token');
assert.equal((await intruder.request('/ready', { ready: false })).status, 401);
assert.equal((await browser().request('/ready', { ready: false })).status, 401);
snapshot = (await b.request('/session')).data.room;
assert.ok(snapshot.players.every(p => p.ready));
console.log('PASS forged peer IDs, forged sessions, absent sessions, and cross-origin writes rejected; readiness unchanged');
console.log('All real application API checks passed. Test rooms expire after 24 hours.');
