/** Stage 4 real HTTP + Cloud Realtime integration. No database reset or admin key.
 * Creates one synthetic room and three anonymous sessions; retained for 24h access.
 * Run against the local Next app connected to the explicitly authorized project:
 * QUARREL_ALLOW_REMOTE_TESTS=true QUARREL_TEST_URL=http://127.0.0.1:3000 \
 * node --env-file=.env.local tests/db/judge.integration.mjs
 * At most four generation jobs: two A chats, one B chat, one question pair.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const origin = process.env.QUARREL_TEST_URL || 'http://127.0.0.1:3000';
const databaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local test app.');
assert.ok(databaseUrl && publishableKey, 'Configure the Supabase URL and publishable key.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname) || (process.env.QUARREL_ALLOW_REMOTE_TESTS === 'true' && new URL(databaseUrl).hostname === 'exjdvtqsalnkghyohyuh.supabase.co'), 'Cloud checks require explicit QUARREL_ALLOW_REMOTE_TESTS=true.');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let count = 0;
function pass(message) { console.log(`PASS ${++count}: ${message}`); }
function browser() {
  const jar = new Map();
  return { jar, async request(path, body, extra = {}) {
    const response = await fetch(`${origin}/api/rooms${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(25_000),
      headers: { origin, 'content-type': 'application/json', cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'); const separator = pair.indexOf('='); jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=strict/i);
    }
    assert.equal(response.headers.get('cache-control'), 'no-store, private');
    return { status: response.status, data: await response.json() };
  } };
}
async function success(player, path, body) {
  const response = await player.request(path, body);
  assert.equal(response.status, 200, `${path}: ${response.data.error || 'unexpected response'}`);
  return response.data.room;
}
async function until(player, predicate, description, timeout = 22_000) {
  const deadline = Date.now() + timeout;
  do {
    const snapshot = await success(player, '/session');
    if (predicate(snapshot)) return snapshot;
    await pause(200);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${description}.`);
}
function directClient(player) {
  return createClient(databaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${player.jar.get('quarrel_access')}` } },
  });
}
const a = browser(), b = browser(), c = browser(), unauthenticated = browser();
const clients = [];
let fixtureId;
const responses = [];
try {
  assert.deepEqual((await a.request('/session')).data, { room: null });
  // Create an intentional legacy fixture through the retained authenticated RPC.
  // New HTTP room creation must use Stage 5, while this regression exercises the
  // saved Stage 4 flow. Never use an admin/service credential to seed the room.
  const fixtureClient = createClient(databaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  clients.push(fixtureClient);
  const signedIn = await fixtureClient.auth.signInAnonymously();
  assert.equal(signedIn.error, null, 'Legacy fixture anonymous sign-in must succeed.');
  assert.ok(signedIn.data.session, 'Legacy fixture needs a verified anonymous session.');
  a.jar.set('quarrel_access', signedIn.data.session.access_token);
  a.jar.set('quarrel_refresh', signedIn.data.session.refresh_token);
  const legacy = await fixtureClient.rpc('create_quarrel_room', { p_name: 'Judge Test Alex' });
  assert.equal(legacy.error, null, 'The retained legacy room-create RPC must succeed.');
  let room = await success(a, '/session'); fixtureId = room.id;
  assert.equal(room.lawyer == null, true, 'Stage 4 fixtures must not be converted into lawyer rooms.');
  room = await success(a, '/theme', { themeId: 'superhero' });
  await success(b, '/join', { code: room.code, name: 'Judge Test Sam' });
  assert.equal((await c.request('/join', { code: room.code, name: 'Judge Test Third' })).status, 409);
  room = await success(a, '/debate/propose', { topic: 'Who should wash the dishes tonight?', positionA: 'Cooking tonight should count toward my chores.', positionB: 'We should consider dishwashing done across the week.', revision: 0 });
  const revision = room.debate.revision;
  await success(b, '/debate/approve', { revision });
  await success(a, '/ready', { ready: true });
  await success(b, '/ready', { ready: true });

  // Register before the start so even fast demo completion emits observed events.
  const realtime = directClient(b); clients.push(realtime);
  await realtime.realtime.setAuth(b.jar.get('quarrel_access'));
  const events = [];
  const channel = realtime.channel(`judge-integration-${fixtureId}`, { config: { postgres_changes_options: { wait: true, timeout: 10_000 } } })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quarrel_rooms', filter: `id=eq.${fixtureId}` }, payload => events.push(payload.new));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Judge Realtime subscription timed out.')), 15_000);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(`Judge Realtime ${status}`)); }
    });
  });
  // Subscription startup must not accidentally leave a stale readiness timestamp.
  await success(a, '/heartbeat', {}); await success(b, '/heartbeat', {});
  room = await success(a, '/debate/start', { revision });
  assert.equal(room.judge.enabled, true); assert.equal(room.judge.maxMessagesPerTurn, 2);
  assert.equal(room.themeLocked, true); assert.equal(room.themeId, 'superhero');
  assert.equal(room.debate.turnIndex, 0); assert.equal(room.debate.activeSlot, 'A');
  const intro = room.judge.messages.find(message => message.kind === 'introduction');
  assert.ok(intro?.text.includes(room.debate.topic), 'Shared introduction includes the agreed topic.');
  assert.deepEqual((await success(b, '/session')).judge.messages, room.judge.messages);
  pass('Cloud-backed create/join/topic approval/readiness/start enable the themed shared judge introduction.');

  const first = { text: 'Can you explain how asking you differs from submitting my official opening?', revision, turnIndex: 0, requestKey: randomUUID() };
  assert.equal((await unauthenticated.request('/judge', first)).status, 401);
  assert.equal((await c.request('/judge', first)).status, 404);
  assert.equal((await b.request('/judge', first)).status, 403);
  assert.equal((await a.request('/judge', { ...first, slot: 'B' })).status, 400);
  assert.equal((await a.request('/judge', { ...first, serverKey: 'forged' })).status, 400);
  assert.equal((await a.request('/judge', first, { origin: 'https://attacker.invalid' })).status, 403);
  const direct = directClient(a); clients.push(direct);
  for (const [name, params] of [
    ['claim_quarrel_judge_work', { p_server_key: 'not-the-server-capability' }],
    ['finish_quarrel_judge_work', { p_id: randomUUID(), p_result: { text: 'Forged answer', source: 'ai', reaction: 'speaking' }, p_server_key: 'not-the-server-capability' }],
    ['begin_quarrel_judge_message', { p_text: first.text, p_revision: revision, p_turn_index: 0, p_request_key: randomUUID(), p_server_key: 'not-the-server-capability' }],
  ]) {
    const result = await direct.rpc(name, params);
    assert.equal(result.error?.message, 'JUDGE_SERVER_UNAUTHORIZED', 'A player JWT alone cannot authorize server-worker writes.');
  }
  const privateRows = await direct.schema('quarrel_private').from('judge_messages').select('*');
  assert.ok(privateRows.error, 'Private judge table cannot be read through the Data API.');
  pass('Active-turn, membership, forgery, origin and server-capability checks protect judge calls and private storage.');

  const originalDeadline = room.debate.turnDeadline;
  const [firstResult, duplicate] = await Promise.all([a.request('/judge', first), a.request('/judge', first)]);
  assert.equal(firstResult.status, 200, firstResult.data.error); assert.equal(duplicate.status, 200, duplicate.data.error);
  const message = firstResult.data.room.judge.messages.find(item => item.playerText === first.text);
  assert.match(message.id, /^[0-9a-f-]{36}$/); assert.notEqual(message.id, first.requestKey, 'Message ID is generated by the database, not the client nonce.');
  assert.equal(duplicate.data.room.judge.messages.filter(item => item.playerText === first.text).length, 1);
  assert.equal(duplicate.data.room.judge.messages.find(item => item.playerText === first.text).id, message.id);
  assert.equal(firstResult.data.room.debate.turnIndex, 0); assert.equal(firstResult.data.room.debate.turnDeadline, originalDeadline);
  assert.deepEqual(firstResult.data.room.debate.history, []);
  const tooSoon = await a.request('/judge', { ...first, text: 'A second immediate request', requestKey: randomUUID() });
  assert.ok([409, 429].includes(tooSoon.status), 'An immediate additional request must be busy or rate limited.');
  assert.match(tooSoon.data.error, /answering|few seconds|wait/i);
  room = await until(a, snapshot => snapshot.judge.messages.some(item => item.id === message.id && item.status === 'complete'), 'first judge answer');
  const firstAnswer = room.judge.messages.find(item => item.id === message.id); responses.push(firstAnswer.source);
  assert.ok(['ai', 'demo', 'fallback'].includes(firstAnswer.source)); assert.ok(firstAnswer.text);
  assert.equal(room.debate.turnIndex, 0); assert.equal(room.debate.turnDeadline, originalDeadline); assert.deepEqual(room.debate.history, []);
  assert.deepEqual((await success(b, '/session')).judge.messages, room.judge.messages);
  const afterReplay = await success(a, '/judge', first);
  assert.equal(afterReplay.judge.messages.filter(item => item.id === message.id).length, 1);
  assert.equal(afterReplay.judge.messages.find(item => item.id === message.id).text, firstAnswer.text);
  // HTTP/demo completion can precede asynchronous Postgres Changes delivery.
  // Wait for the actual stream event; polling does not create substitute events
  // or more requests, and the outer finally always closes the subscription.
  const realtimeDeadline = Date.now() + 10_000;
  while (!events.some(event => typeof event.debate_version === 'number') && Date.now() < realtimeDeadline) {
    await pause(100);
  }
  assert.ok(events.some(event => typeof event.debate_version === 'number'), 'The real room Realtime stream delivered judge invalidations.');
  pass(`Concurrent duplicate requests retain one shared message/answer; ${tooSoon.status === 429 ? 'rate limiting' : 'pending-work rejection'} works and chat leaves official history, turn and deadline unchanged.`);

  // Wait only the remaining server-rate window, never shorten official timers.
  await pause(Math.max(0, 3100 - (Date.parse(room.debate.serverNow) - Date.parse(message.createdAt))));
  const secondText = 'What is one neutral way to compare our different ideas of fairness?';
  room = await success(a, '/judge', { text: secondText, revision, turnIndex: 0, requestKey: randomUUID() });
  const secondId = room.judge.messages.find(item => item.playerText === secondText).id;
  room = await until(a, snapshot => snapshot.judge.messages.some(item => item.id === secondId && item.status === 'complete'), 'second judge answer');
  responses.push(room.judge.messages.find(item => item.id === secondId).source);
  assert.equal(room.judge.messagesUsed, 2);
  const overQuota = await a.request('/judge', { text: 'A third message in the same turn', revision, turnIndex: 0, requestKey: randomUUID() });
  assert.equal(overQuota.status, 429); assert.match(overQuota.data.error, /used your judge messages/);
  pass('The configurable default allowance is enforced at two messages per player turn.');

  const concealed = `PRIVATE_OPENING_${randomUUID().replaceAll('-', '')}`;
  room = await success(a, '/debate/argument', { text: `${concealed}: I cooked dinner tonight and think that should count toward our shared chores.`, revision, turnIndex: 0 });
  assert.equal(room.debate.turnIndex, 1);
  const waitingB = await success(b, '/session');
  assert.ok(!JSON.stringify(waitingB).includes(concealed));
  const rawRoom = await direct.from('quarrel_rooms').select('*').eq('id', fixtureId);
  assert.equal(rawRoom.error, null); assert.ok(!JSON.stringify(rawRoom.data).includes(concealed));
  assert.equal((await a.request('/judge', { text: 'Not my turn', revision, turnIndex: 1, requestKey: randomUUID() })).status, 403);
  const bText = 'Can you compare our opening arguments yet, or are they still private?';
  room = await success(b, '/judge', { text: bText, revision, turnIndex: 1, requestKey: randomUUID() });
  const bId = room.judge.messages.find(item => item.playerText === bText).id;
  room = await until(b, snapshot => snapshot.judge.messages.some(item => item.id === bId && item.status === 'complete'), 'Player B judge answer');
  responses.push(room.judge.messages.find(item => item.id === bId).source);
  assert.equal(room.debate.turnIndex, 1); assert.ok(!JSON.stringify(room).includes(concealed));
  assert.ok(!JSON.stringify(events).includes(concealed), 'Public Realtime payloads must not contain hidden opening text.');
  assert.equal(room.judge.messages.find(item => item.id === bId).slot, 'B');
  room = await success(b, '/debate/argument', { text: 'I washed the dishes every day this week. We should compare total work across the week.', revision, turnIndex: 1 });
  assert.equal(room.debate.phase, 'rebuttal'); assert.equal(room.debate.history.length, 2);
  assert.ok(JSON.stringify(room.debate.history).includes(concealed));
  assert.deepEqual((await success(a, '/session')).debate.history, room.debate.history);
  pass('B can ask during B’s turn; concealed openings remain absent from peer snapshots, shared AI replies, raw room rows and Realtime until simultaneous reveal.');

  room = await success(a, '/debate/argument', { text: 'Cooking took an hour, but we have not agreed how cooking and dishwashing should count.', revision, turnIndex: 2 });
  room = await success(b, '/debate/argument', { text: 'I appreciate cooking. A shared way to count chores could account for our whole week.', revision, turnIndex: 3 });
  assert.equal(room.debate.phase, 'questions'); assert.equal(room.judge.preparingQuestions, true);
  assert.equal(room.debate.activeSlot, null); assert.equal(room.debate.turnDeadline, null);
  const pendingQuestion = room.judge.messages.find(item => item.kind === 'questions'); assert.ok(pendingQuestion);
  // Deterministic database tests exercise rejected submissions while preparing.
  // Do not race a valid answer against a fast worker here: once questions are
  // committed, that answer is legitimately allowed to advance the turn.
  room = await until(a, snapshot => !snapshot.judge.preparingQuestions && snapshot.debate.questions.length === 2, 'saved questions');
  const savedQuestions = room.debate.questions;
  assert.deepEqual(savedQuestions.map(question => question.slot), ['A', 'B']);
  assert.notEqual(savedQuestions[0].text, savedQuestions[1].text);
  assert.ok(savedQuestions.every(question => ['ai', 'demo', 'fallback'].includes(question.source)));
  assert.equal(room.judge.messages.filter(item => item.kind === 'questions').length, 1);
  const completedQuestion = room.judge.messages.find(item => item.id === pendingQuestion.id);
  responses.push(completedQuestion.source);
  assert.equal(Date.parse(room.debate.turnDeadline) - Date.parse(completedQuestion.completedAt), 30_000, 'A gets the full 30 seconds after both questions are saved.');
  assert.deepEqual((await success(b, '/session')).debate.questions, savedQuestions);
  assert.deepEqual((await success(a, '/session')).debate.questions, savedQuestions);
  assert.equal((await success(a, '/session')).judge.messages.filter(item => item.kind === 'questions').length, 1);
  pass('Both questions are generated once, saved identically for both sessions, and only then start the full 30-second answer deadline.');

  room = await success(a, '/debate/argument', { text: 'I would compare time and effort using an arrangement we both choose.', revision, turnIndex: 4 });
  assert.equal(room.debate.turnIndex, 5); assert.equal(room.debate.activeSlot, 'B');
  assert.deepEqual(room.debate.questions, savedQuestions);
  room = await success(b, '/debate/argument', { text: 'I would track chores across the week using the same agreed method for both of us.', revision, turnIndex: 5 });
  assert.equal(room.debate.phase, 'verdict'); assert.equal(room.debate.history.length, 6);
  assert.ok(room.debate.history.every(entry => entry.status === 'submitted'));
  assert.equal(room.debate.turnDeadline, null); assert.equal(room.debate.activeSlot, null);
  assert.equal(Object.hasOwn(room.debate, 'winner'), false);
  const finalB = await success(b, '/session');
  assert.deepEqual(finalB.debate.history, room.debate.history); assert.deepEqual(finalB.judge.messages, room.judge.messages);
  assert.equal((await a.request('/judge', { text: 'A late message', revision, turnIndex: 5, requestKey: randomUUID() })).status, 409);
  assert.equal((await a.request('/theme', { themeId: 'jungle' })).status, 409);
  const outsider = await success(c, '/session'); assert.equal(outsider, null);
  pass('All six official turns finish normally; refreshing both sessions preserves identical judge history, questions and a winner-free placeholder verdict.');
  console.log(`All ${count} Stage 4 HTTP/Cloud checks passed. Response sources: ${responses.join(', ')}.`);
} finally {
  await Promise.all(clients.map(client => client.removeAllChannels()));
  if (fixtureId) console.log(`Retained synthetic test room: ${fixtureId}. Expiry restricts access after 24 hours; it is not physical deletion.`);
}
