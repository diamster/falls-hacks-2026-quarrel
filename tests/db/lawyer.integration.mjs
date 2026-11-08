/** Stage 5–6A HTTP + authenticated Realtime integration, without admin credentials.
 * Only run after reviewing/applying the Stage 5 migration to the authorized project:
 * QUARREL_ALLOW_REMOTE_TESTS=true QUARREL_TEST_URL=http://127.0.0.1:3000 \
 * node --env-file=.env.local tests/db/lawyer.integration.mjs
 * Uses three isolated cookie jars and one retained synthetic room. The minimum
 * preset means 120 seconds PER PLAYER, so real expiry takes at least four minutes.
 * No clock overrides, resets, SQL seeding, private worker credentials or fake events.
 * At most 10 generation jobs: two plans, one consult, two presentations,
 * up to four summaries (120s / 30s minimum) and one jury result. The local app
 * can run with JUDGE_AI_MODE=demo; actual stored sources are reported explicitly.
 * Stage 6A demo mode deliberately stops at a retryable jury with no fabricated
 * verdict; legacy version-1 completion assertions remain below.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const origin = process.env.QUARREL_TEST_URL || 'http://127.0.0.1:3000';
const appUrl = new URL(origin);
assert.ok(['localhost', '127.0.0.1'].includes(appUrl.hostname) && appUrl.origin === origin, 'Use an exact local test-app origin.');
const databaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
assert.ok(databaseUrl && publishableKey, 'Configure Supabase URL and publishable key.');
const target = new URL(databaseUrl);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) || (process.env.QUARREL_ALLOW_REMOTE_TESTS === 'true' && target.protocol === 'https:' && target.hostname === 'exjdvtqsalnkghyohyuh.supabase.co'), 'Cloud tests require opt-in to the authorized quarrel development project.');
assert.ok(publishableKey.startsWith('sb_publishable_') || (() => {
  try { return JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { return false; }
})(), 'Only a publishable or legacy anon key may run this authorization test.');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const speechEnabled = process.env.QUARREL_TEST_SPEECH === 'true';
const clients = [];
async function speechRequest(player, snapshot, message, token = message.speechToken) {
  return fetch(`${origin}/api/rooms/lawyer/speech`, {
    method: 'POST', signal: AbortSignal.timeout(25000),
    headers: { origin, 'content-type': 'application/json', 'x-quarrel-room-id': snapshot.id,
      cookie: [...player.jar].map(([key, value]) => `${key}=${value}`).join('; ') },
    body: JSON.stringify({ debateId: snapshot.lawyer.debateId, messageId: message.id, speechToken: token }),
  });
}
async function checkSpeech(player, snapshot, message) {
  assert.ok(message.speechToken, 'Only a persisted public message receives speech authorization.');
  const before = await success(player, '/session');
  const response = await speechRequest(player, snapshot, message);
  assert.equal(response.status, 200, 'Live TTS must succeed for this explicitly opted-in check.');
  assert.equal(response.headers.get('content-type'), 'audio/wav');
  assert.equal(response.headers.get('cache-control'), 'no-store, private');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF'); assert.ok(bytes.length > 44);
  const after = await success(player, '/session');
  assert.equal(after.lawyer.turnDeadline, before.lawyer.turnDeadline, 'Speech cannot reset or extend a writing deadline.');
  assert.equal(after.lawyer.activeSlot, before.lawyer.activeSlot, 'Speech cannot hand off a turn.');
  assert.deepEqual(publicHistory(after), publicHistory(before), 'Speech cannot rewrite the saved transcript.');
  const replay = await speechRequest(player, snapshot, message);
  assert.equal(replay.status, 200);
  assert.deepEqual(Buffer.from(await replay.arrayBuffer()), bytes, 'Replay reuses generated audio; it never requests another argument rewrite.');
  return after;
}
const peerEvents = [], outsiderEvents = [];
const sources = new Map();
let fixtureId, checks = 0;
function pass(message) { console.log(`PASS ${++checks}: ${message}`); }
function browser(existingJar) {
  const jar = new Map(existingJar);
  return { jar, async request(path, body, extra = {}) {
    const request = () => fetch(`${origin}/api/rooms${path}`, {
      method: body === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(25_000),
      headers: { origin, 'content-type': 'application/json', cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // A refreshed/temporarily disconnected page retries safe reads and
    // heartbeats. Never blindly retry a create or a non-idempotent mutation.
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { response = await request(); break; }
      catch (error) {
        if (!(body === undefined || path === '/heartbeat') || attempt === 2) throw error;
        await pause(250 * (attempt + 1));
      }
    }
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'); const separator = pair.indexOf('=');
      jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=strict/i);
    }
    assert.equal(response.headers.get('cache-control'), 'no-store, private');
    return { status: response.status, data: await response.json() };
  } };
}
async function success(player, path, body, extra) {
  const result = await player.request(path, body, extra);
  assert.equal(result.status, 200, `${path || '/create'}: ${result.data.error || 'unexpected response'}`);
  return result.data.room;
}
async function until(player, predicate, description, timeout = 25_000) {
  const deadline = Date.now() + timeout;
  do {
    const room = await success(player, '/session');
    if (predicate(room)) return room;
    await pause(200);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${description}.`);
}
function directClient(player) {
  const client = createClient(databaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${player.jar.get('quarrel_access')}` } },
  });
  clients.push(client); return client;
}
async function subscribe(client, player, events) {
  await client.realtime.setAuth(player.jar.get('quarrel_access'));
  const channel = client.channel(`stage5-${fixtureId}-${randomUUID()}`, { config: { postgres_changes_options: { wait: true, timeout: 10_000 } } })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'quarrel_rooms', filter: `id=eq.${fixtureId}` }, payload => events.push(payload.new));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Stage 5 Realtime subscription timed out.')), 15_000);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { clearTimeout(timer); reject(new Error(`Stage 5 Realtime ${status}`)); }
    });
  });
}
async function currentVersion(client) {
  const result = await client.from('quarrel_rooms').select('debate_version').eq('id', fixtureId).single();
  assert.equal(result.error, null, 'A verified room member can read the room invalidation version.');
  assert.ok(Number.isInteger(result.data.debate_version));
  return result.data.debate_version;
}
async function receivedVersion(version) {
  const deadline = Date.now() + 10_000;
  while (!peerEvents.some(event => event.debate_version >= version) && Date.now() < deadline) await pause(100);
  assert.ok(peerEvents.some(event => event.debate_version >= version), 'The peer must receive the actual completed action’s Realtime version.');
}
function publicHistory(room) {
  return room.lawyer.history.map(({ rawText: _ownOnly, speechToken: _personalPlaybackAuthorization, ...message }) => message);
}
function recordSource(id, source) {
  assert.ok(['ai', 'demo', 'fallback'].includes(source), 'Each completed generation identifies its actual source.');
  sources.set(id, source);
}
function assertPeerPrivacy(room, ownSlot, privateMarker) {
  for (const message of room.lawyer.history) {
    if (message.kind === 'argument' && message.slot !== ownSlot) assert.equal(Object.hasOwn(message, 'rawText'), false, 'Opponent rawText must not exist in the member snapshot.');
  }
  if (ownSlot === 'B') {
    assert.deepEqual(room.lawyer.consultations, []);
    assert.equal(room.lawyer.ownConsultationCount, 0);
    assert.equal(JSON.stringify(room).includes(privateMarker), false, 'Private consultation must not leak through any peer snapshot field.');
  }
}
function assertPlan(room) {
  const plan = room.lawyer.subtopics;
  assert.ok(plan.length >= 2 && plan.length <= 4, 'A 120-second plan has 2–4 subtopics of at least 30 seconds.');
  assert.equal(plan.reduce((sum, subtopic) => sum + subtopic.secondsPerPlayer, 0), 120);
  assert.deepEqual(plan.map(subtopic => subtopic.ordinal), plan.map((_, i) => i + 1));
  assert.ok(plan.every(subtopic => subtopic.question && subtopic.question.length <= 200 && subtopic.secondsPerPlayer >= 30));
  assert.deepEqual(plan.map(subtopic => subtopic.openerSlot), plan.map((_, i) => i % 2 === 0 ? 'A' : 'B'));
}
const a = browser(), b = browser(), c = browser();
const scope = () => ({ 'x-quarrel-room-id': fixtureId });
const privateMarker = `PRIVATE_CONSULT_${randomUUID().replaceAll('-', '')}`;
try {
  assert.deepEqual((await a.request('/session')).data, { room: null });
  let room = await success(a, '', { name: 'Lawyer Test Alex' }); fixtureId = room.id;
  const versionTwo = room.lawyer.reliabilityVersion === 2;
  assert.equal(room.themeId, 'courtroom'); assert.equal(room.lawyer.format, 'lawyer');
  assert.equal(room.lawyer.phase, 'setup'); assert.equal(room.capacity, 2);
  await success(b, '/join', { code: room.code.toLowerCase(), name: 'Lawyer Test Sam' });
  assert.equal((await c.request('/join', { code: room.code, name: 'Lawyer Test Third' })).status, 409);
  assert.equal((await c.request('/join', { code: 'ZZZZZZ', name: 'Lawyer Test Third' })).status, 404);
  assert.equal(await success(c, '/session'), null);
  const directA = directClient(a), directB = directClient(b), outsider = directClient(c);
  await Promise.all([subscribe(directB, b, peerEvents), subscribe(outsider, c, outsiderEvents)]);
  pass('New rooms default to Courtroom, two isolated players join, and a third authenticated session cannot join or read the room.');

  assert.equal((await b.request('/lawyer/topic', { topic: 'Guest override', totalSeconds: 120, revision: 0 }, scope())).status, 403);
  assert.equal((await a.request('/ready', { ready: true }, scope())).status, 409);
  room = await success(a, '/lawyer/topic', { topic: 'Should university libraries extend evening hours?', totalSeconds: 120, revision: 0 }, scope());
  assert.equal(room.lawyer.positionA, null); assert.equal(room.lawyer.positionB, null);
  const positionA = 'Extend library hours because students with evening classes need a shared place to study.';
  const positionB = 'Keep current hours and prioritize staffed daytime services because resources are limited.';
  room = await success(a, '/lawyer/position', { position: positionA, revision: room.lawyer.revision }, scope());
  assert.equal(room.lawyer.positionA, positionA); assert.equal(room.lawyer.positionB, null);
  assert.equal((await b.request('/ready', { ready: true }, scope())).status, 409);
  for (const [player, field, value] of [[a, 'slot', 'B'], [b, 'slot', 'A'], [a, 'positionB', 'Override B'], [b, 'positionA', 'Override A'], [a, 'playerId', 'forged']]) {
    assert.equal((await player.request('/lawyer/position', { position: 'Forged position', revision: room.lawyer.revision, [field]: value }, scope())).status, 400);
  }
  room = await success(b, '/lawyer/position', { position: positionB, revision: room.lawyer.revision }, scope());
  assert.equal(room.lawyer.positionA, positionA); assert.equal(room.lawyer.positionB, positionB);
  assert.ok(room.lawyer.confirmedA && room.lawyer.confirmedB);
  const revision = room.lawyer.revision;
  const peerPositions = (await success(a, '/session')).lawyer;
  assert.equal(peerPositions.positionA, positionA); assert.equal(peerPositions.positionB, positionB);
  assert.equal((await a.request('/lawyer/start', { revision, planGeneration: 0 }, scope())).status, 409);
  for (const themeId of ['jungle', 'superhero', 'detective', 'courtroom']) {
    await success(a, '/theme', { themeId }, scope());
    assert.equal((await success(b, '/session')).themeId, themeId);
  }
  assert.equal((await b.request('/theme', { themeId: 'jungle' }, scope())).status, 403);
  assert.equal((await a.request('/theme', { themeId: 'not-a-theme' }, scope())).status, 400);
  pass('Host topic/duration and independently owned positions synchronize; forged peer writes, premature start, guest theme changes and invalid themes are rejected.');

  for (const [name, params] of [
    ['claim_quarrel_lawyer_work', { p_server_key: 'not-the-server-capability' }],
    ['finish_quarrel_lawyer_work', { p_id: randomUUID(), p_result: { kind: 'jury', text: 'Forged outcome', source: 'ai' }, p_server_key: 'not-the-server-capability' }],
    ['prepare_quarrel_lawyer_plan', { p_revision: revision, p_regenerate: false, p_mode: 'ai', p_server_key: 'not-the-server-capability' }],
  ]) {
    const result = await directA.rpc(name, params);
    assert.equal(result.error?.message, 'JUDGE_SERVER_UNAUTHORIZED', 'A player JWT must not authorize model-worker operations.');
    assert.equal(result.data, null);
  }
  for (const table of ['lawyer_debates', 'lawyer_subtopics', 'lawyer_messages']) {
    assert.ok((await directA.schema('quarrel_private').from(table).select('*')).error, 'Private lawyer storage must not be exposed to the Data API.');
  }
  const outsiderRows = await outsider.from('quarrel_rooms').select('*').eq('id', fixtureId);
  assert.equal(outsiderRows.error, null); assert.deepEqual(outsiderRows.data, []);
  pass('Private storage and worker claims/completions require the server capability; room RLS rejects an authenticated outsider.');

  await success(a, '/ready', { ready: true }, scope());
  room = await success(b, '/ready', { ready: true }, scope());
  assert.equal(room.bothReady, true);
  room = await until(a, value => value.lawyer.planReady, 'initial saved plan');
  assertPlan(room); const firstPlan = room.lawyer.subtopics;
  assert.equal(room.lawyer.planGeneration, 0); recordSource('plan-0', firstPlan[0].source);
  const repeatPlans = await Promise.all([a.request('/lawyer/plan', { revision, regenerate: false }, scope()), b.request('/lawyer/plan', { revision, regenerate: false }, scope())]);
  for (const result of repeatPlans) {
    assert.equal(result.status, 200, result.data.error); assert.deepEqual(result.data.room.lawyer.subtopics, firstPlan);
  }
  assert.equal((await b.request('/lawyer/plan', { revision, regenerate: true }, scope())).status, 403);
  await success(a, '/lawyer/plan', { revision, regenerate: true }, scope());
  room = await until(a, value => value.lawyer.planReady && value.lawyer.planGeneration === 1, 'regenerated saved plan');
  assertPlan(room); recordSource('plan-1', room.lawyer.subtopics[0].source);
  assert.equal(room.lawyer.regenerationUsed, true);
  assert.equal((await a.request('/lawyer/plan', { revision, regenerate: true }, scope())).status, 409);
  assert.equal((await a.request('/lawyer/start', { revision, planGeneration: 0 }, scope())).status, 409, 'A stale plan preview must not authorize starting the regenerated plan.');
  assert.deepEqual((await success(b, '/session')).lawyer.subtopics, room.lawyer.subtopics);
  pass('Planner produces a valid saved timed plan once, concurrent retries reuse it, one host regeneration works, and stale preview start is rejected.');

  await success(a, '/heartbeat', {}, scope()); await success(b, '/heartbeat', {}, scope());
  room = await success(a, '/lawyer/start', { revision, planGeneration: 1 }, scope());
  assert.equal(room.lawyer.phase, 'subtopic'); assert.equal(room.lawyer.activeSlot, 'A'); assert.equal(room.lawyer.currentSubtopic, 1);
  assert.equal(room.themeId, 'courtroom'); assert.equal(room.themeLocked, true);
  const initialDeadline = room.lawyer.turnDeadline, initialB = room.lawyer.remainingMsB;
  assert.equal((await a.request('/theme', { themeId: 'jungle' }, scope())).status, 409);
  assert.equal((await a.request('/lawyer/topic', { topic: 'Late change', totalSeconds: 120, revision }, scope())).status, 409);
  assert.equal((await b.request('/lawyer/position', { position: 'Late change', revision }, scope())).status, 409);
  for (const [path, body] of [
    ['/judge', { text: 'Legacy judge chat', revision: 0, turnIndex: 0, requestKey: randomUUID() }],
    ['/debate/argument', { text: 'Legacy direct argument', revision: 0, turnIndex: 0 }],
  ]) assert.equal((await a.request(path, body, scope())).status, 409, 'Old flow mutations must be disabled for a lawyer room.');
  const premature = await success(a, '/lawyer/advance', { revision }, scope());
  assert.equal(premature.lawyer.turnDeadline, initialDeadline, 'Clients cannot advance an unexpired clock.');
  const firstMessage = { text: 'Students leaving evening classes need time to study together in the library.', revision, subtopic: 1, requestKey: randomUUID() };
  assert.equal((await b.request('/lawyer/argument', firstMessage, scope())).status, 403);
  assert.equal((await c.request('/lawyer/argument', firstMessage)).status, 404);
  assert.equal((await browser().request('/lawyer/argument', firstMessage)).status, 401);
  assert.equal((await a.request('/lawyer/argument', { ...firstMessage, slot: 'B' }, scope())).status, 400);
  assert.equal((await a.request('/lawyer/argument', firstMessage, { ...scope(), origin: 'https://attacker.invalid' })).status, 403);
  pass('Start locks topic, positions and theme; inactive, outsider, forged and cross-origin submissions fail, and old judge/argument endpoints cannot bypass the new flow.');

  const consult = { text: `${privateMarker}: Help me organize my point without adding evidence.`, revision, subtopic: 1, requestKey: randomUUID() };
  const consultation = await success(a, '/lawyer/consult', consult, scope());
  assert.equal(consultation.lawyer.state, 'consulting'); assert.equal(consultation.lawyer.turnDeadline, null); assert.equal(consultation.lawyer.activeSlot, null);
  assert.equal(consultation.lawyer.remainingMsB, initialB);
  const consultTime = consultation.lawyer.remainingMsA;
  const consultRow = consultation.lawyer.consultations.find(item => item.playerText === consult.text);
  assert.ok(consultRow); assert.notEqual(consultRow.id, consult.requestKey);
  assert.equal(consultation.lawyer.history.filter(item => item.kind === 'argument').length, 0);
  const replayConsult = await success(a, '/lawyer/consult', consult, scope());
  assert.equal(replayConsult.lawyer.consultations.filter(item => item.id === consultRow.id).length, 1);
  assertPeerPrivacy(await success(b, '/session'), 'B', privateMarker);
  room = await until(a, value => value.lawyer.consultations.some(item => item.id === consultRow.id && item.status === 'complete'), 'private lawyer reply');
  recordSource(consultRow.id, room.lawyer.consultations.find(item => item.id === consultRow.id).source);
  assert.equal(room.lawyer.activeSlot, 'A'); assert.equal(room.lawyer.state, 'composing');
  assert.equal(room.lawyer.remainingMsA, consultTime); assert.equal(room.lawyer.remainingMsB, initialB);
  assert.equal(room.lawyer.history.filter(item => item.kind === 'argument').length, 0);
  assert.ok(Date.parse(room.lawyer.turnDeadline) > Date.parse(room.lawyer.serverNow));
  assertPeerPrivacy(await success(b, '/session'), 'B', privateMarker);
  pass('Private consultation pauses both clocks, resumes the same writer without charging AI time, creates no official argument, and never enters the opponent snapshot.');

  const [submitted, duplicate] = await Promise.all([a.request('/lawyer/argument', firstMessage, scope()), a.request('/lawyer/argument', firstMessage, scope())]);
  assert.equal(submitted.status, 200, submitted.data.error); assert.equal(duplicate.status, 200, duplicate.data.error);
  const pending = [submitted, duplicate].map(result => result.data.room.lawyer).find(debate => debate.state === 'lawyering');
  assert.ok(pending, 'At least the winning reservation response must expose paused pending work.');
  const officialA = pending.history.find(item => item.label === 'S1-P1L1M1');
  assert.ok(officialA); assert.notEqual(officialA.id, firstMessage.requestKey);
  assert.equal(officialA.rawText, firstMessage.text);
  assert.equal(pending.state, 'lawyering'); assert.equal(pending.turnDeadline, null); assert.equal(pending.activeSlot, null);
  assert.equal(duplicate.data.room.lawyer.history.filter(item => item.id === officialA.id).length, 1);
  assert.equal((await a.request('/lawyer/argument', { ...firstMessage, text: 'Changed retry payload' }, scope())).status, 409);
  room = await until(a, value => value.lawyer.history.some(item => item.id === officialA.id && item.status === 'complete'), 'official lawyer A presentation');
  const completedA = room.lawyer.history.find(item => item.id === officialA.id);
  recordSource(completedA.id, completedA.source); assert.ok(completedA.text);
  assert.equal(room.lawyer.activeSlot, 'B'); assert.equal(room.lawyer.remainingMsA, pending.remainingMsA);
  assert.equal(room.lawyer.remainingMsB, pending.remainingMsB);
  assert.ok(Math.abs(Date.parse(room.lawyer.turnDeadline) - Date.parse(completedA.completedAt) - pending.remainingMsB) <= 1, 'B’s clock begins when A’s presentation is saved, with the full stored balance.');
  const peerA = await success(b, '/session'); assertPeerPrivacy(peerA, 'B', privateMarker);
  assert.deepEqual(publicHistory(peerA), publicHistory(room));
  await receivedVersion(await currentVersion(directA));
  pass('Concurrent official retries create one labelled presentation; both clocks stop during processing, B starts on completion, and the actual Realtime version reaches B without A’s rawText.');
  if (speechEnabled) {
    await checkSpeech(a, room, completedA);
    assert.equal((await speechRequest(b, peerA, completedA)).status, 403, 'A speech authorization cannot be used by B.');
    assert.equal((await speechRequest(c, room, completedA)).status, 403, 'An outsider cannot use a participant speech authorization.');
    assert.ok(room.lawyer.consultations.every(item => !Object.hasOwn(item, 'speechToken')), 'Private consultations never receive public playback authorization.');
    pass('Lawyer A speech returns WAV; replay is cached, recipient authorization is isolated, and playback requests do not mutate clocks or text.');
  }


  const secondMessage = { text: 'Library staffing is limited, so I favor improving daytime support before expanding hours.', revision, subtopic: 1, requestKey: randomUUID() };
  const sentB = await success(b, '/lawyer/argument', secondMessage, scope());
  assert.equal(sentB.lawyer.state, 'lawyering'); assert.equal(sentB.lawyer.turnDeadline, null);
  const officialB = sentB.lawyer.history.find(item => item.label === 'S1-P2L2M1'); assert.ok(officialB);
  assert.equal(officialB.rawText, secondMessage.text);
  room = await until(b, value => value.lawyer.history.some(item => item.id === officialB.id && item.status === 'complete'), 'official lawyer B presentation');
  const completedB = room.lawyer.history.find(item => item.id === officialB.id); recordSource(completedB.id, completedB.source);
  assert.equal(room.lawyer.activeSlot, 'A'); assert.equal(room.lawyer.remainingMsA, sentB.lawyer.remainingMsA);
  assert.equal(room.lawyer.remainingMsB, sentB.lawyer.remainingMsB);
  assert.ok(Math.abs(Date.parse(room.lawyer.turnDeadline) - Date.parse(completedB.completedAt) - sentB.lawyer.remainingMsA) <= 1);
  assertPeerPrivacy(await success(a, '/session'), 'A', privateMarker);
  assert.equal((await success(b, '/lawyer/argument', secondMessage, scope())).lawyer.history.filter(item => item.id === officialB.id).length, 1);
  const refreshedA = browser(a.jar), refreshedB = browser(b.jar);
  const recovered = await Promise.all([success(refreshedA, '/session'), success(refreshedB, '/session')]);
  assert.equal(recovered[0].lawyer.turnDeadline, recovered[1].lawyer.turnDeadline);
  assert.equal(recovered[0].lawyer.activeSlot, recovered[1].lawyer.activeSlot);
  assert.deepEqual(publicHistory(recovered[0]), publicHistory(recovered[1]));
  assert.equal(recovered[0].lawyer.consultations[0].id, consultRow.id); assert.deepEqual(recovered[1].lawyer.consultations, []);
  pass('B’s lawyer hands the clock back to A; refresh restores synchronized deadlines/public history and only the owner’s private consultation.');
  if (speechEnabled) {
    await checkSpeech(b, room, completedB);
    pass('Lawyer B speech returns saved-message audio without delaying the opposing player or exposing the private consultation.');
  }


  // Let actual server deadlines elapse. For the first 38 seconds deliberately
  // omit A's heartbeat, while B stays connected. Reads must not refresh liveness
  // or reset clocks. No test writes timestamps, balances, phases or outcomes.
  const waitStarted = Date.now(), finishBy = waitStarted + 300_000, absentUntil = waitStarted + 38_000;
  let lastHeartbeat = 0, sawDisconnected = false, expiredTurnRejected = false;
  const seenSubtopics = new Set([1]), seenSummaries = new Set();
  let lastProgress = '';
  while (Date.now() < finishBy) {
    if (Date.now() - lastHeartbeat >= 10_000) {
      await success(b, '/heartbeat', {}, scope());
      if (Date.now() >= absentUntil) await success(a, '/heartbeat', {}, scope());
      lastHeartbeat = Date.now();
    }
    room = await success(b, '/session');
    const d = room.lawyer;
    assertPeerPrivacy(room, 'B', privateMarker);
    if (room.players.find(player => player.slot === 'A').connected === false) sawDisconnected = true;
    assert.equal(room.themeId, 'courtroom'); assert.equal(room.themeLocked, true);
    for (const subtopic of d.subtopics) {
      if (subtopic.status === 'done' || subtopic.status === 'summarizing') {
        assert.equal(subtopic.remainingMsA, 0); assert.equal(subtopic.remainingMsB, 0, 'A subtopic only ends after both clocks are zero.');
      }
    }
    if (d.phase === 'subtopic' && !seenSubtopics.has(d.currentSubtopic)) {
      assert.equal(d.activeSlot, d.currentSubtopic % 2 === 1 ? 'A' : 'B', 'Openers alternate by subtopic.');
      seenSubtopics.add(d.currentSubtopic);
      const current = d.subtopics.find(item => item.ordinal === d.currentSubtopic);
      assert.ok(Date.parse(d.turnDeadline) - Date.parse(d.serverNow) <= current.secondsPerPlayer * 1000);
      const intro = d.history.find(item => item.kind === 'announcement' && item.label === `S${d.currentSubtopic}-START` && item.status === 'complete');
      assert.ok(intro?.completedAt, 'The subtopic has its canonical saved introduction timestamp.');
      const allocatedMs = current.secondsPerPlayer * 1000;
      assert.equal(current.remainingMsA, allocatedMs); assert.equal(current.remainingMsB, allocatedMs);
      // The server stores the original start time in the introduction, even if
      // compilation/network load delays this poll. Compare that persisted clock
      // allocation, not a promise that a browser observes it within five seconds.
      assert.equal(Date.parse(d.turnDeadline) - Date.parse(intro.completedAt), allocatedMs, 'The next subtopic receives its complete writing clock from the authoritative start.');
      const previousSummary = d.history.find(item => item.kind === 'judge_summary' && item.subtopic === d.currentSubtopic - 1 && item.status === 'complete');
      assert.ok(previousSummary?.completedAt);
      assert.equal(Date.parse(intro.completedAt) - Date.parse(previousSummary.completedAt), 4_000, 'The summary display interval precedes the full writing allocation.');
    }
    if (!expiredTurnRejected && d.phase === 'subtopic' && d.state === 'composing') {
      const expiredSlot = d.remainingMsA === 0 ? 'A' : d.remainingMsB === 0 ? 'B' : null;
      if (expiredSlot) {
        const denied = await (expiredSlot === 'A' ? a : b).request('/lawyer/argument', { text: 'An expired clock must not submit.', revision, subtopic: d.currentSubtopic, requestKey: randomUUID() }, scope());
        assert.ok([403, 409].includes(denied.status)); expiredTurnRejected = true;
      }
    }
    for (const message of d.history.filter(item => item.status === 'complete')) {
      if (message.kind === 'judge_summary') { seenSummaries.add(message.subtopic); recordSource(message.id, message.source); }
      if (message.kind === 'jury_verdict') recordSource(message.id, message.source);
    }
    const progress = `${d.phase}:${d.currentSubtopic}:${d.activeSlot}`;
    if (progress !== lastProgress) {
      console.log(`Observed server phase ${d.phase}, subtopic ${d.currentSubtopic ?? '—'}, active player ${d.activeSlot ?? 'none'}.`);
      lastProgress = progress;
    }
    if (d.phase === 'complete' || (versionTwo && d.phase === 'jury' && d.juryStatus?.state === 'retry_required' && d.juryStatus.errorCode === 'demo_mode')) break;
    await pause(1000);
  }
  const unavailableDemoJury = versionTwo && room.lawyer.phase === 'jury' && room.lawyer.juryStatus?.state === 'retry_required' && room.lawyer.juryStatus.errorCode === 'demo_mode';
  if (versionTwo && process.env.JUDGE_AI_MODE === 'demo') assert.ok(unavailableDemoJury, 'Stage 6A demo mode must not fabricate a final verdict.');
  assert.equal(room.lawyer.phase, unavailableDemoJury ? 'jury' : 'complete', 'Real deadlines must reach a completed verdict or the explicit Stage 6A demo-unavailable state within the bounded test window.');
  assert.ok(sawDisconnected, 'A missed heartbeat is displayed as disconnected while B keeps the room moving.');
  assert.ok(expiredTurnRejected, 'At least one expired player clock was tested against submission.');
  assert.equal(seenSubtopics.size, room.lawyer.subtopics.length);
  assert.equal(seenSummaries.size, room.lawyer.subtopics.length);
  assert.ok(Date.now() - Date.parse(room.lawyer.startedAt) >= 239_000, 'The 120-second per-player preset cannot finish by shortening the four minutes of real writing time.');
  pass('Real deadlines continue through a disconnected player, reject expired submissions, end subtopics only when both clocks are empty, and alternate later openers.');

  const finalA = await success(a, '/session'), finalB = await success(b, '/session');
  assert.deepEqual(publicHistory(finalA), publicHistory(finalB)); assert.deepEqual(finalA.lawyer.verdict, finalB.lawyer.verdict);
  const summaries = finalB.lawyer.history.filter(item => item.kind === 'judge_summary');
  assert.equal(summaries.length, finalB.lawyer.subtopics.length);
  assert.deepEqual(summaries.map(item => item.label), finalB.lawyer.subtopics.map(item => `S${item.ordinal}-J`));
  assert.ok(summaries.every(item => item.status === 'complete' && item.text));
  const verdicts = finalB.lawyer.history.filter(item => item.kind === 'jury_verdict');
  assert.equal(verdicts.length, 1); assert.equal(verdicts[0].label, 'JURY');
  if (unavailableDemoJury) {
    assert.equal(verdicts[0].status, 'pending'); assert.equal(verdicts[0].text, null); assert.equal(verdicts[0].completedAt, null);
    assert.equal(finalA.lawyer.verdict, null); assert.equal(finalB.lawyer.verdict, null);
    assert.deepEqual(finalA.lawyer.juryStatus, finalB.lawyer.juryStatus);
    assert.equal(finalB.lawyer.juryStatus.state, 'retry_required');
    assert.equal(finalB.lawyer.juryStatus.errorCode, 'demo_mode');
    assert.equal(finalB.lawyer.juryStatus.attempts, 1, 'Demo mode is not a temporary provider failure and must not trigger automatic retries.');
    assert.equal(finalB.lawyer.juryStatus.retryAt, null); assert.equal(finalB.lawyer.needsWork, false);
    assert.equal((await a.request(`/lawyer/history?debateId=${finalA.lawyer.debateId}`)).status, 409, 'An unavailable jury cannot be published as completed results.');
  } else {
    assert.equal(verdicts[0].status, 'complete');
    assert.ok(['A', 'B', 'split'].includes(finalB.lawyer.verdict.outcome));
    assert.ok(finalB.lawyer.verdict.reasoning); assert.equal(finalB.lawyer.verdict.perSubtopic.length, summaries.length);
    if (versionTwo) {
      assert.equal(verdicts[0].source, 'ai', 'Stage 6A must not complete a simulated jury verdict.');
      assert.ok(['A', 'B', 'tie', 'inconclusive'].includes(finalB.lawyer.verdict.decision));
    }
  }
  assert.equal(new Set(finalB.lawyer.history.map(item => item.id)).size, finalB.lawyer.history.length);
  assert.equal(new Set(finalB.lawyer.history.map(item => item.label)).size, finalB.lawyer.history.length);
  assert.equal(finalB.lawyer.turnDeadline, null); assert.equal(finalB.lawyer.activeSlot, null);
  assert.equal(finalB.lawyer.history.filter(item => item.kind === 'argument').length, 2);
  assertPeerPrivacy(finalB, 'B', privateMarker); assertPeerPrivacy(finalA, 'A', privateMarker);
  const rawRoom = await directB.from('quarrel_rooms').select('*').eq('id', fixtureId);
  assert.equal(rawRoom.error, null);
  assert.equal(JSON.stringify(rawRoom.data).includes(privateMarker), false);
  assert.equal(JSON.stringify(peerEvents).includes(privateMarker), false);
  assert.equal(JSON.stringify(peerEvents).includes(firstMessage.text), false, 'Realtime must not carry official argument text either.');
  assert.ok(peerEvents.every(event => !Object.hasOwn(event, 'raw_text') && !Object.hasOwn(event, 'history')));
  await receivedVersion(await currentVersion(directA));
  assert.equal(outsiderEvents.length, 0, 'An authenticated outsider must receive no room events.');
  assert.equal(await success(c, '/session'), null);
  const finalRefresh = await success(browser(a.jar), '/session');
  assert.deepEqual(publicHistory(finalRefresh), publicHistory(finalA));
  assert.deepEqual(finalRefresh.lawyer.verdict, finalA.lawyer.verdict);
  assert.deepEqual(finalRefresh.lawyer.consultations, finalA.lawyer.consultations);
  if (unavailableDemoJury) assert.deepEqual(finalRefresh.lawyer.juryStatus, finalA.lawyer.juryStatus);
  const repeatedAdvance = await success(a, '/lawyer/advance', { revision }, scope());
  assert.deepEqual(publicHistory(repeatedAdvance), publicHistory(finalA));
  if (unavailableDemoJury) {
    assert.equal(repeatedAdvance.lawyer.verdict, null);
    assert.deepEqual(repeatedAdvance.lawyer.juryStatus, finalA.lawyer.juryStatus, 'Refresh/advance cannot reserve duplicate unavailable jury work.');
    assert.equal(repeatedAdvance.lawyer.needsWork, false);
  }
  assert.equal((await a.request('/lawyer/argument', { ...firstMessage, requestKey: randomUUID() }, scope())).status, 409);
  assert.ok(sources.size <= 10, 'This scenario must remain within its declared generation-job budget.');
  pass(unavailableDemoJury
    ? 'Every subtopic has one saved summary; Stage 6A demo jury stays retryable with one pending canonical job and no verdict. Refresh and advance preserve it without private transcript or Realtime leaks.'
    : 'Every subtopic has one saved summary and the jury has one shared structured verdict; refresh and retries preserve the final record without private transcript or Realtime leaks.');
  if (speechEnabled) {
    await checkSpeech(b, finalB, summaries[0]);
    pass('The judge speaks a saved canonical summary without regenerating it.');
    if (versionTwo && !unavailableDemoJury) {
      const debateId = finalA.lawyer.debateId;
      const ack = await a.request('/lawyer/acknowledge', { debateId });
      assert.equal(ack.status, 200); assert.ok(ack.data.results.acknowledgements.A); assert.equal(ack.data.results.acknowledgements.B, null);
      const sameAck = await a.request('/lawyer/acknowledge', { debateId });
      assert.equal(sameAck.data.results.acknowledgements.A, ack.data.results.acknowledgements.A);
      const acknowledged = await success(b, '/session');
      assert.equal(acknowledged.lawyer.acknowledgements.A, ack.data.results.acknowledgements.A);
      assert.deepEqual(acknowledged.lawyer.verdict, finalB.lawyer.verdict, 'Acknowledgement does not change the verdict.');
      const waiting = await success(a, '/lawyer/rematch', { debateId }, scope());
      assert.equal(waiting.lawyer.debateId, debateId); assert.ok(waiting.lawyer.rematch.A); assert.equal(waiting.lawyer.rematch.B, null);
      const rematched = await success(b, '/lawyer/rematch', { debateId }, scope());
      assert.notEqual(rematched.lawyer.debateId, debateId); assert.equal(rematched.lawyer.phase, 'setup');
      assert.equal(rematched.themeId, finalB.themeId); assert.equal(rematched.lawyer.positionA, null); assert.equal(rematched.lawyer.positionB, null);
      assert.deepEqual(rematched.lawyer.history, []); assert.deepEqual(rematched.lawyer.consultations, []);
      assert.equal((await success(a, '/session')).lawyer.debateId, rematched.lawyer.debateId);
      const archive = await b.request(`/lawyer/history?debateId=${debateId}`);
      assert.equal(archive.status, 200); assert.deepEqual(archive.data.history.verdict, finalB.lawyer.verdict);
      assert.ok(archive.data.history.history.every(item => !Object.hasOwn(item, 'rawText')));
      assert.equal(JSON.stringify(archive.data.history).includes(privateMarker), false);
      pass('Live saved results acknowledge independently, mutual rematch creates a separate synchronized setup, and earlier public results survive.');
    }
  }
  const counts = Object.fromEntries(['ai', 'demo', 'fallback'].map(source => [source, [...sources.values()].filter(value => value === source).length]));
  console.log(`All ${checks} Stage 5 HTTP/Realtime checks passed. Completed generation sources: ${JSON.stringify(counts)}. Demo/fallback responses do not establish live Gemini success.`);
} finally {
  await Promise.all(clients.map(client => client.removeAllChannels()));
  if (sources.size) console.log(`Observed completed generation sources: ${JSON.stringify(Object.fromEntries(['ai', 'demo', 'fallback'].map(source => [source, [...sources.values()].filter(value => value === source).length])))}.`);
  if (fixtureId) console.log(`Retained synthetic Stage 5 room: ${fixtureId}. Expiry restricts access; it is not physical deletion.`);
}
