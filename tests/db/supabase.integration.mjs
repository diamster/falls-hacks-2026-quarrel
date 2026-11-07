/** Real Supabase integration test; no mocks. Creates three anonymous test sessions.
 * Run after migrations with node --env-file=.env.local tests/db/supabase.integration.mjs
 * Required: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_ equivalents).
 * Local only by default; QUARREL_ALLOW_REMOTE_TESTS=true explicitly permits a
 * disposable hosted test project. Never run against a production project.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url && key, "Configure the Supabase URL and publishable key before this test.");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)
  || process.env.QUARREL_ALLOW_REMOTE_TESTS === "true", "Use a local or explicitly permitted disposable test project.");

const clients = [];
async function player() {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(client);
  const { data, error } = await client.auth.signInAnonymously();
  assert.equal(error, null, "Anonymous sign-in must be enabled.");
  assert.ok(data.session);
  await client.realtime.setAuth(data.session.access_token);
  return { client, session: data.session };
}
async function rpc(client, name, params) {
  const { data, error } = await client.rpc(name, params);
  assert.equal(error, null, `${name}: ${error?.message}`);
  return data;
}
let count = 0;
function pass(message) { count++; console.log(`PASS ${count}: ${message}`); }

try {
  const [a, b, c] = await Promise.all([player(), player(), player()]);
  const room = await rpc(a.client, "create_quarrel_room", { p_name: "Integration Lion" });
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(room.you, "A");
  pass("Creator receives a six-character code and slot A.");

  const race = await Promise.all([b, c].map(p => p.client.rpc("join_quarrel_room", {
    p_code: room.code, p_name: "Integration Zebra"
  })));
  assert.equal(race.filter(result => !result.error).length, 1);
  assert.equal(race.filter(result => result.error?.message === "ROOM_FULL").length, 1);
  const winner = race[0].error ? c : b;
  const outsider = race[0].error ? b : c;
  pass("Two concurrent joiners produce exactly one winner and one ROOM_FULL rejection.");

  const joined = await rpc(winner.client, "get_quarrel_room");
  assert.equal(joined.you, "B");
  assert.deepEqual(joined.players.map(p => p.name), ["Integration Lion", "Integration Zebra"]);
  pass("Both player names and slots are persisted.");

  const outsiderRows = await outsider.client.from("quarrel_players").select("*").eq("room_id", room.id);
  assert.equal(outsiderRows.error, null);
  assert.deepEqual(outsiderRows.data, []);
  const anonymous = createClient(url, key, { auth: { persistSession: false } });
  clients.push(anonymous);
  const publicRead = await anonymous.from("quarrel_rooms").select("*");
  assert.ok(publicRead.error, "Unauthenticated directory access must fail.");
  pass("RLS hides participants from outsiders; unauthenticated room reads fail.");

  let received = false;
  const subscription = a.client.channel(`integration-${room.id}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quarrel_players", filter: `room_id=eq.${room.id}` },
      payload => { if (payload.new.slot === "B" && payload.new.ready === true) received = true; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime subscribe timed out")), 15000);
    subscription.subscribe(status => {
      if (status === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(timeout); reject(new Error(`Realtime ${status}`)); }
    });
  });
  await rpc(winner.client, "set_quarrel_ready", { p_ready: true });
  const until = Date.now() + 10000;
  while (!received && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(received, "A must receive B's readiness through Supabase Realtime.");
  pass("Supabase Realtime delivers peer readiness to the authorized member.");

  const malicious = await winner.client.from("quarrel_players").update({ ready: true }).eq("room_id", room.id).eq("slot", "A");
  assert.ok(malicious.error, "Direct peer update must fail.");
  const forgedRPC = await winner.client.rpc("set_quarrel_ready", { p_ready: true, p_user_id: a.session.user.id });
  assert.ok(forgedRPC.error, "RPC must not accept a browser-supplied player identity.");
  assert.equal((await rpc(a.client, "get_quarrel_room")).players[0].ready, false);
  pass("Direct peer mutation and forged player-ID RPC cannot change A's readiness.");

  assert.equal((await rpc(a.client, "set_quarrel_ready", { p_ready: true })).bothReady, true);
  pass("Both ready produces a shared start confirmation.");

  const recovered = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(recovered);
  const restored = await recovered.auth.setSession({ access_token: a.session.access_token, refresh_token: a.session.refresh_token });
  assert.equal(restored.error, null);
  assert.equal((await rpc(recovered, "get_quarrel_room")).you, "A");
  pass("The existing Supabase session recovers its original slot in a fresh client.");

  const invalid = await outsider.client.rpc("join_quarrel_room", { p_code: "bad", p_name: "Invalid" });
  assert.equal(invalid.error?.message, "INVALID_CODE");
  pass("Invalid code is rejected.");

  // No client sends heartbeats during this wait. One fresh heartbeat proves that
  // only the authenticated caller reconnects and a stale peer blocks start.
  await new Promise(resolve => setTimeout(resolve, 36000));
  const disconnected = await rpc(a.client, "heartbeat_quarrel_room");
  assert.equal(disconnected.players[0].connected, true);
  assert.equal(disconnected.players[1].connected, false);
  assert.equal(disconnected.bothReady, false);
  pass("A stale peer disconnects after 35 seconds; one heartbeat only reconnects its sender.");
  console.log(`All ${count} real Supabase integration checks passed.`);
} finally {
  await Promise.all(clients.map(client => client.removeAllChannels()));
}
