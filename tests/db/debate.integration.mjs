/** Real Stage 3 Auth, database and Realtime integration; no admin privileges.
 * Run after the Stage 3 migration:
 * QUARREL_ALLOW_REMOTE_TESTS=true node --env-file=.env.local tests/db/debate.integration.mjs
 * Remote execution is restricted to the authorized quarrel development project.
 * Creates three anonymous users and one room; these fixtures remain afterward.
 * One opening deliberately takes its real 45 seconds. No clock/deadline overrides.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url && key, "Configure the Supabase URL and publishable key before this test.");
const target = new URL(url);
const local = ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname);
assert.ok(local || (process.env.QUARREL_ALLOW_REMOTE_TESTS === "true"
  && target.protocol === "https:"
  && target.hostname === "exjdvtqsalnkghyohyuh.supabase.co"),
"Use local Supabase or explicitly opt in to the authorized quarrel development project.");
assert.ok(key.startsWith("sb_publishable_") || (() => {
  try { return JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role === "anon"; }
  catch { return false; }
})(), "Only a publishable/legacy anon key may run these authorization checks.");

const clients = [];
let checks = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function pass(message) { console.log(`PASS ${++checks}: ${message}`); }
function newClient() {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(client);
  return client;
}
async function player() {
  const client = newClient();
  const { data, error } = await client.auth.signInAnonymously();
  assert.equal(error, null, "Anonymous sign-in must be enabled; do not weaken Auth limits to run tests.");
  assert.ok(data.session, "An authenticated anonymous session is required.");
  await client.realtime.setAuth(data.session.access_token);
  return { client, session: data.session };
}
async function rpc(client, name, params) {
  const { data, error } = await client.rpc(name, params);
  assert.equal(error, null, `${name}: ${error?.message}`);
  return data;
}
async function rejects(client, name, params, expected) {
  const { data, error } = await client.rpc(name, params);
  assert.ok(error, `${name} must reject this request.`);
  assert.equal(data, null, "A failed mutation must not return private room data.");
  if (expected) assert.ok(expected.includes(error.message), `${name}: unexpected ${error.message}`);
}
const snapshot = client => rpc(client, "get_quarrel_room");
const revisionArgs = room => ({ p_revision: room.debate.revision });
const turnArgs = room => ({ ...revisionArgs(room), p_turn_index: room.debate.turnIndex });
function assertAbsent(value, secret, context) {
  assert.equal(JSON.stringify(value).includes(secret), false, `${context} exposed a concealed opening.`);
}
async function recovered(session) {
  const client = newClient();
  const result = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  assert.equal(result.error, null, "Existing credentials must restore the same participant.");
  return client;
}
async function subscribe(client, roomId, events) {
  const channel = client.channel(`stage3-${roomId}-${randomUUID()}`, {
    config: { postgres_changes_options: { wait: true, timeout: 10000 } },
  }).on("postgres_changes", { event: "UPDATE", schema: "public", table: "quarrel_rooms", filter: `id=eq.${roomId}` },
    event => events.push(event));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Debate Realtime subscription timed out.")), 15000);
    channel.subscribe(status => {
      if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
      if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        clearTimeout(timeout); reject(new Error(`Debate Realtime ${status}`));
      }
    });
  });
  return channel;
}
async function waitForRoomVersion(events, version) {
  const until = performance.now() + 10000;
  const received = () => events.some(event => Number(event.new.debate_version) >= Number(version));
  while (!received() && performance.now() < until) await sleep(100);
  assert.ok(received(), "An authorized peer must receive the actual argument's room-change version, not only polling or an earlier event.");
}
function assertTurn(room, phase, index, slot) {
  assert.equal(room.debate.phase, phase);
  assert.equal(room.debate.turnIndex, index);
  assert.equal(room.debate.activeSlot, slot);
  assert.ok(Number.isFinite(Date.parse(room.debate.serverNow)));
  assert.ok(Number.isFinite(Date.parse(room.debate.turnDeadline)));
}

try {
  const [a, b, outsider] = await Promise.all([player(), player(), player()]);
  let room = await rpc(a.client, "create_quarrel_room", { p_name: "Stage3 Host" });
  console.log(`FIXTURES ${JSON.stringify({ roomId: room.id, userIds: [a.session.user.id, b.session.user.id, outsider.session.user.id] })}`);
  assert.equal(room.debate.phase, "setup");
  assert.equal(room.debate.revision, 0);
  assert.equal(room.themeLocked, false);
  await rpc(b.client, "join_quarrel_room", { p_code: room.code, p_name: "Stage3 Guest" });
  await rpc(a.client, "set_quarrel_theme", { p_theme_id: "detective" });
  const peerEvents = [], outsiderEvents = [];
  await Promise.all([subscribe(b.client, room.id, peerEvents), subscribe(outsider.client, room.id, outsiderEvents)]);
  pass("Two authenticated seats share a setup room; a third session remains an outsider.");

  const proposal = { p_topic: "Should campus libraries open later?", p_position_a: "Extend evening opening hours.", p_position_b: "Keep the current opening hours.", p_revision: 0 };
  await rejects(b.client, "propose_quarrel_debate", proposal, ["HOST_ONLY"]);
  await rejects(outsider.client, "propose_quarrel_debate", proposal, ["ROOM_NOT_FOUND"]);
  await rejects(newClient(), "propose_quarrel_debate", proposal);
  await rpc(a.client, "set_quarrel_ready", { p_ready: true });
  await rpc(b.client, "set_quarrel_ready", { p_ready: true });
  room = await rpc(a.client, "propose_quarrel_debate", proposal);
  assert.equal(room.debate.revision, 1);
  assert.equal(room.debate.topic, proposal.p_topic);
  assert.equal(room.debate.approvedA, true);
  assert.equal(room.debate.approvedB, false);
  assert.ok(room.players.every(player => !player.ready), "A new proposal requires fresh readiness.");
  await rejects(a.client, "start_quarrel_debate", revisionArgs(room));
  pass("Only the host proposes; the proposal resets readiness and requires the guest's approval.");

  const request = "Please limit the proposal to examination weeks.";
  room = await rpc(b.client, "request_quarrel_debate_changes", { p_message: request, ...revisionArgs(room) });
  assert.equal(room.debate.changeRequest, request);
  assert.equal(room.debate.approvedB, false);
  await rejects(b.client, "approve_quarrel_debate", revisionArgs(room));
  await rejects(a.client, "start_quarrel_debate", revisionArgs(room));
  const previousRevision = room.debate.revision;
  room = await rpc(a.client, "propose_quarrel_debate", { ...proposal, p_topic: "Should campus libraries open later during examination weeks?", p_revision: previousRevision });
  assert.ok(room.debate.revision > previousRevision);
  assert.equal(room.debate.changeRequest, null);
  assert.equal(room.debate.approvedB, false);
  await rejects(b.client, "approve_quarrel_debate", { p_revision: previousRevision });
  await rejects(a.client, "propose_quarrel_debate", { ...proposal, p_revision: previousRevision });
  room = await rpc(b.client, "approve_quarrel_debate", revisionArgs(room));
  assert.equal(room.debate.approvedA, true);
  assert.equal(room.debate.approvedB, true);
  await rejects(a.client, "start_quarrel_debate", revisionArgs(room));
  await rpc(a.client, "set_quarrel_ready", { p_ready: true });
  room = await rpc(b.client, "set_quarrel_ready", { p_ready: true });
  await rejects(b.client, "start_quarrel_debate", revisionArgs(room), ["HOST_ONLY"]);
  pass("Guest change requests block start/approval until a new proposal; stale revisions cannot approve or overwrite it.");

  const hostCopy = await recovered(a.session);
  const starts = await Promise.all([a.client, hostCopy].map(client => client.rpc("start_quarrel_debate", revisionArgs(room))));
  assert.equal(starts.filter(result => !result.error).length, 1, "Concurrent host requests must start exactly once.");
  room = await snapshot(a.client);
  assertTurn(room, "opening", 0, "A");
  assert.equal(room.themeLocked, true);
  assert.equal(room.themeId, "detective");
  const startedAt = room.debate.startedAt;
  assert.ok(Number.isFinite(Date.parse(startedAt)));
  const duration = Date.parse(room.debate.turnDeadline) - Date.parse(room.debate.serverNow);
  assert.ok(duration > 35000 && duration <= 45000, "Opening uses a real server-issued 45-second deadline.");
  await rejects(a.client, "set_quarrel_theme", { p_theme_id: "jungle" }, ["THEME_LOCKED"]);
  await rejects(b.client, "set_quarrel_ready", { p_ready: false }, ["DEBATE_STARTED"]);
  await rejects(a.client, "propose_quarrel_debate", { ...proposal, ...revisionArgs(room) });
  await rejects(b.client, "request_quarrel_debate_changes", { p_message: "Too late", ...revisionArgs(room) });
  await rejects(b.client, "submit_quarrel_argument", { p_text: "Not my turn", ...turnArgs(room) });
  const beforeAdvance = room.debate.turnDeadline;
  const earlyAdvance = await rpc(b.client, "advance_quarrel_debate", turnArgs(room));
  assertTurn(earlyAdvance, "opening", 0, "A");
  assert.equal(earlyAdvance.debate.turnDeadline, beforeAdvance, "Early advance must not shorten or reset a turn.");
  pass("Start is atomic across the same user's sessions, locks setup/theme, and pre-deadline advance cannot skip a turn.");

  await rejects(a.client, "submit_quarrel_argument", { p_text: " \n ", ...turnArgs(room) });
  await rejects(a.client, "submit_quarrel_argument", { p_text: "🌴".repeat(2001), ...turnArgs(room) });
  const openingMarker = `CONCEALED-${randomUUID()}`;
  const openingPrefix = `${openingMarker}: Later hours provide quiet exam study space. `;
  const openingA = openingPrefix + "🌴".repeat(2000 - [...openingPrefix].length);
  assert.equal([...openingA].length, 2000, "The accepted limit is Unicode code points, not UTF-16 code units.");
  const submitParams = { p_text: openingA, ...turnArgs(room) };
  const attempts = await Promise.all([a.client, hostCopy].map(client => client.rpc("submit_quarrel_argument", submitParams)));
  assert.equal(attempts.filter(result => !result.error).length, 1, "Concurrent duplicate arguments must produce one submission.");
  room = await snapshot(a.client);
  assertTurn(room, "opening", 1, "B");
  assert.equal(room.debate.history.filter(entry => entry.text === openingA).length, 1);
  const hidden = await snapshot(b.client);
  assertAbsent(hidden, openingMarker, "Peer snapshot");
  const directRoom = await b.client.from("quarrel_rooms").select("*").eq("id", room.id);
  assert.equal(directRoom.error, null);
  assert.equal(directRoom.data.length, 1, "Authorized direct reads must really exercise the room row.");
  await waitForRoomVersion(peerEvents, directRoom.data[0].debate_version);
  assertAbsent(directRoom.data, openingMarker, "Direct room row");
  assertAbsent(peerEvents, openingMarker, "Room Realtime payload");
  for (const client of [b.client, outsider.client]) {
    for (const table of ["debates", "debate_entries"]) {
      const privateRead = await client.schema("quarrel_private").from(table).select("*");
      assert.ok(privateRead.error, "Private debate storage must not be queryable through the Data API.");
      assert.equal(privateRead.data, null);
    }
  }
  assert.equal(outsiderEvents.length, 0, "Nonmembers must not receive room updates.");
  await rejects(a.client, "submit_quarrel_argument", { p_text: "Another A turn", ...turnArgs(room) });
  await rejects(a.client, "submit_quarrel_argument", submitParams);
  await rejects(b.client, "submit_quarrel_argument", { p_text: "Forged identity", ...turnArgs(room), p_user_id: a.session.user.id });
  await rejects(outsider.client, "submit_quarrel_argument", { p_text: "Outsider", ...turnArgs(room) }, ["ROOM_NOT_FOUND"]);
  await rejects(outsider.client, "advance_quarrel_debate", turnArgs(room), ["ROOM_NOT_FOUND"]);
  const outsiderRead = await outsider.client.from("quarrel_rooms").select("*").eq("id", room.id);
  assert.equal(outsiderRead.error, null);
  assert.deepEqual(outsiderRead.data, []);
  pass("Opening is stored once and concealed from peer snapshots, direct rows, private storage and actual Realtime events; identity/turn bypasses fail.");

  const guestCopy = await recovered(b.session);
  const refreshed = await snapshot(guestCopy);
  assert.equal(refreshed.you, "B");
  assert.equal(refreshed.debate.startedAt, startedAt);
  assert.equal(refreshed.debate.turnDeadline, room.debate.turnDeadline);
  assertAbsent(refreshed, openingMarker, "Recovered peer session");
  pass("Refresh restores the same seat, phase and deadline without revealing the opponent's pending opening.");

  // Calibrate elapsed waiting from the database timestamp, not the local wall
  // clock. Keep the players connected without changing the production deadline.
  const timing = await snapshot(b.client);
  const end = performance.now() + Date.parse(timing.debate.turnDeadline) - Date.parse(timing.debate.serverNow) + 300;
  let nextHeartbeat = performance.now();
  console.log("WAIT: letting B's real 45-second opening deadline expire.");
  while (performance.now() < end) {
    if (performance.now() >= nextHeartbeat) {
      await Promise.all([a.client, b.client].map(client => rpc(client, "heartbeat_quarrel_room")));
      nextHeartbeat = performance.now() + 10000;
    }
    await sleep(Math.min(1000, Math.max(1, end - performance.now())));
  }
  const lateText = `LATE-${randomUUID()}`;
  await rejects(b.client, "submit_quarrel_argument", { p_text: lateText, ...turnArgs(timing) });
  room = await rpc(a.client, "advance_quarrel_debate", turnArgs(timing));
  assertTurn(room, "rebuttal", 2, "A");
  assert.deepEqual(room.debate.history.map(entry => [entry.turnIndex, entry.slot, entry.status]), [[0, "A", "submitted"], [1, "B", "expired"]]);
  assert.equal(room.debate.history[0].text, openingA);
  assert.equal(room.debate.history[1].text, null);
  assertAbsent(room, lateText, "Expired submission history");
  const peerRevealed = await snapshot(b.client);
  assert.equal(peerRevealed.debate.history[0].text, openingA, "Both opening results reveal after both opening turns finish.");
  const expectedNextDeadline = Date.parse(timing.debate.turnDeadline) + 45000;
  assert.equal(Date.parse(room.debate.turnDeadline), expectedNextDeadline, "A missed turn advances from its old server deadline, not the late client's arrival.");
  const repeatedAdvance = await rpc(b.client, "advance_quarrel_debate", turnArgs(timing));
  assertTurn(repeatedAdvance, "rebuttal", 2, "A");
  assert.equal(repeatedAdvance.debate.turnDeadline, room.debate.turnDeadline, "A second client's overdue timer must not skip or restart the next turn.");
  pass("Actual deadline expiry rejects late text, records one expired opening, reveals both results and preserves server deadline chaining.");

  for (const [turnIndex, phase, slot, text] of [
    [2, "rebuttal", "A", "Extra staffing costs can be limited to the short examination period."],
    [3, "rebuttal", "B", "Existing study rooms may meet demand without expanding all library services."],
    [4, "questions", "A", "I would measure late-night attendance and student access before extending the pilot."],
    [5, "questions", "B", "Evidence of unmet demand and a feasible staffing plan could change my view."],
  ]) {
    assertTurn(room, phase, turnIndex, slot);
    if (phase === "questions") {
      assert.equal(room.debate.questions.length, 2);
      assert.deepEqual(room.debate.questions.map(question => question.slot).sort(), ["A", "B"]);
      for (const question of room.debate.questions) {
        assert.equal(question.source, "placeholder");
        assert.ok(question.id && question.text.trim(), "Both slots need explicit placeholder questions.");
      }
    }
    const active = slot === "A" ? a.client : b.client;
    const inactive = slot === "A" ? b.client : a.client;
    await rejects(inactive, "submit_quarrel_argument", { p_text: "Wrong turn", ...turnArgs(room) });
    const prior = turnArgs(room);
    room = await rpc(active, "submit_quarrel_argument", { p_text: text, ...prior });
    assert.equal(room.debate.history.filter(entry => entry.turnIndex === turnIndex).length, 1);
    if (turnIndex === 3 || turnIndex === 4) {
      const completed = room.debate.history.find(entry => entry.turnIndex === turnIndex);
      assert.equal(Date.parse(room.debate.turnDeadline) - Date.parse(completed.submittedAt), 30000,
        "Each question turn must receive exactly 30 seconds from the preceding accepted server submission.");
    }
    await rejects(active, "submit_quarrel_argument", { p_text: text, ...prior });
  }
  assert.equal(room.debate.phase, "verdict");
  assert.equal(room.debate.activeSlot, null);
  assert.equal(room.debate.turnDeadline, null);
  assert.equal(room.debate.history.length, 6);
  assert.deepEqual(room.debate.history.map(entry => entry.turnIndex), [0, 1, 2, 3, 4, 5]);
  assert.equal(room.debate.history.filter(entry => entry.status === "submitted").length, 5);
  assert.equal(room.debate.history.filter(entry => entry.status === "expired").length, 1);
  assert.equal(room.debate.startedAt, startedAt);
  assert.equal(room.themeLocked, true);
  const finalPeer = await snapshot(guestCopy);
  assert.deepEqual(finalPeer.debate.history, room.debate.history);
  assert.equal(finalPeer.debate.phase, "verdict");
  await rejects(a.client, "start_quarrel_debate", revisionArgs(room));
  await rejects(b.client, "submit_quarrel_argument", { p_text: "After completion", p_turn_index: 5, ...revisionArgs(room) });
  assert.equal(outsiderEvents.length, 0);
  pass("All six turns finish in order with placeholder questions, no duplicate history, shared completion and no restart/post-completion submissions.");
  console.log(`All ${checks} real Stage 3 integration checks passed. Fixtures remain; no admin cleanup or schema changes were performed.`);
} finally {
  await Promise.all(clients.map(client => client.removeAllChannels()));
}
