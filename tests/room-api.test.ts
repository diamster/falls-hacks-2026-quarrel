import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { roomRoute } from "@/server/room-api";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), refreshSession: vi.fn(), signInAnonymously: vi.fn(), createClient: vi.fn(), after: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.createClient }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: mock.after }));
const session = { access_token: "signed-token", refresh_token: "refresh-token" };
const room = { id: "room-id", code: "ABC234", you: "A", players: [{ slot: "A", name: "Lion", ready: false, connected: true }], bothReady: false, themeId: "jungle", themeLocked: false, mode: "solo", capacity: 2 };
function req(action: string, body?: unknown, cookie = "", origin = "http://localhost:3000") {
  return new NextRequest(`http://localhost:3000/api/rooms/${action}`, {
    method: action === "session" ? "GET" : "POST",
    headers: { origin, "content-type": "application/json", cookie },
    ...(action === "session" ? {} : { body: JSON.stringify(body) }),
  });
}
const cookie = "quarrel_access=existing-token; quarrel_refresh=old-refresh";
const savedRoomId = "920e0108-fbaa-4317-91fd-048f53678d45";
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "public-key");
  vi.stubEnv("JUDGE_SERVER_SECRET", "test-only-server-capability-value-1234");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("JUDGE_AI_MODE", "auto");
  vi.stubEnv("JUDGE_MAX_MESSAGES_PER_TURN", "2");
  mock.createClient.mockReturnValue({ auth: mock, rpc: mock.rpc });
  mock.getUser.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
  mock.refreshSession.mockResolvedValue({ data: { session }, error: null });
  mock.signInAnonymously.mockResolvedValue({ data: { session }, error: null });
  mock.rpc.mockResolvedValue({ data: room, error: null });
});

describe("session-authorized room API", () => {
  it("leaves the expected room without clearing cookies, allocating a new identity or exposing a room", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: null });
    const response = await roomRoute(req("leave", { roomId: savedRoomId }, cookie), "leave");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ room: null });
    expect(mock.getUser).toHaveBeenCalledWith("existing-token");
    expect(mock.rpc).toHaveBeenCalledWith("leave_quarrel_room", { p_expected_room_id: savedRoomId });
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
    expect(response.cookies.getAll()).toHaveLength(0);
  });
  it.each([{}, { roomId: null }, { roomId: "wrong" }, { roomId: savedRoomId, userId: "victim" }])("rejects malformed or forged leave requests %j", async body => {
    expect((await roomRoute(req("leave", body, cookie), "leave")).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("requires an authenticated same-origin leave request", async () => {
    expect((await roomRoute(req("leave", { roomId: savedRoomId }), "leave")).status).toBe(401);
    expect((await roomRoute(req("leave", { roomId: savedRoomId }, cookie, "https://other.example"), "leave")).status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("forwards the expected room guard to PostgreSQL without replacing verified identity", async () => {
    const request = req("ready", { ready: true }, cookie);
    request.headers.set("x-quarrel-room-id", savedRoomId);
    await roomRoute(request, "ready");
    expect(mock.createClient).toHaveBeenLastCalledWith("http://localhost:54321", "public-key", expect.objectContaining({
      global: { headers: { Authorization: "Bearer existing-token", "x-quarrel-room-id": savedRoomId } },
    }));
  });
  it("rejects malformed scope headers and returns a recoverable stale-room code", async () => {
    const request = req("ready", { ready: true }, cookie);
    request.headers.set("x-quarrel-room-id", "not-a-uuid");
    expect((await roomRoute(request, "ready")).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.rpc.mockResolvedValue({ data: null, error: { message: "STALE_ROOM" } });
    const stale = await roomRoute(req("leave", { roomId: savedRoomId }, cookie), "leave");
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "STALE_ROOM" });
    expect(stale.cookies.getAll()).toHaveLength(0);
  });
  it("explains that invitations to departed rooms are closed", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "ROOM_CLOSED" } });
    const response = await roomRoute(req("join", { name: "Sam", code: "ABC234" }, cookie), "join");
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/player has left/);
  });
  it("returns an empty session without allocating an account or exposing credentials", async () => {
    const response = await roomRoute(req("session"), "session");
    expect(await response.json()).toEqual({ room: null });
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("vary")).toBe("Cookie");
  });
  it("creates a room with a trimmed name and protected session cookies", async () => {
    const response = await roomRoute(req("", { name: "  Lion  " }), "create");
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("create_quarrel_lawyer_room", { p_name: "Lion" });
    expect((await response.json()).realtime).toEqual({ url: "http://localhost:54321", key: "public-key", accessToken: "signed-token" });
    for (const item of response.cookies.getAll()) expect(item).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/api/rooms", maxAge: 604800 });
  });
  it("sets Secure cookies for HTTPS", async () => {
    const request = new NextRequest("https://quarrel.test/api/rooms", { method: "POST", headers: { origin: "https://quarrel.test", "content-type": "application/json" }, body: '{"name":"Lion"}' });
    expect((await roomRoute(request, "create")).cookies.get("quarrel_access")?.secure).toBe(true);
  });
  it("accepts the exact loopback Host origin despite NextURL normalization", async () => {
    const request = new NextRequest("http://127.0.0.1:3001/api/rooms", { method: "POST", headers: { host: "127.0.0.1:3001", origin: "http://127.0.0.1:3001", "content-type": "application/json" }, body: '{"name":"Lion"}' });
    expect((await roomRoute(request, "create")).status).toBe(200);
  });
  it("normalizes a join code and derives identity only from a verified session", async () => {
    await roomRoute(req("join", { name: "Zebra", code: " abc234 " }, cookie), "join");
    expect(mock.getUser).toHaveBeenCalledWith("existing-token");
    expect(mock.rpc).toHaveBeenCalledWith("join_quarrel_room", { p_name: "Zebra", p_code: "ABC234" });
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
  });
  it("only submits the caller's boolean readiness and never sends a player ID", async () => {
    await roomRoute(req("ready", { ready: true }, cookie), "ready");
    expect(mock.rpc).toHaveBeenCalledWith("set_quarrel_ready", { p_ready: true });
    await roomRoute(req("heartbeat", {}, cookie), "heartbeat");
    expect(mock.rpc).toHaveBeenLastCalledWith("heartbeat_quarrel_room", {});
  });
  it.each(["playerId", "user_id", "slot", "roomId"])("rejects a forged %s field before authentication or mutation", async field => {
    const response = await roomRoute(req("ready", { ready: true, [field]: "victim" }, cookie), "ready");
    expect(response.status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.getUser).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes and mutations without a session", async () => {
    expect((await roomRoute(req("ready", { ready: true }, cookie, "https://attacker.test"), "ready")).status).toBe(403);
    expect((await roomRoute(req("ready", { ready: true }), "ready")).status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([null, [], "x", { ready: "true" }, { ready: null }, {}])("rejects invalid readiness payload %j", async body => {
    expect((await roomRoute(req("ready", body, cookie), "ready")).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(["", " ", "x".repeat(33), "bad\nname", 42])("rejects invalid names %j", async name => {
    expect((await roomRoute(req("", { name }), "create")).status).toBe(400);
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
  });
  it.each(["bad", "OOOOOO", "!!!!!!", 123456])("rejects invalid code %j", async code => {
    expect((await roomRoute(req("join", { name: "Zebra", code }), "join")).status).toBe(400);
  });
  it("rejects malformed, wrong-content-type and oversized bodies", async () => {
    for (const [body, headers, status] of [
      ["{", { "content-type": "application/json" }, 400],
      ["{}", { "content-type": "text/plain" }, 415],
      ["{}", { "content-type": "application/json", "content-length": "9999" }, 413],
      [JSON.stringify({ name: "x".repeat(1100) }), { "content-type": "application/json" }, 413],
    ] as const) {
      const request = new NextRequest("http://localhost:3000/api/rooms", { method: "POST", headers: { origin: "http://localhost:3000", ...headers }, body });
      expect((await roomRoute(request, "create")).status).toBe(status);
    }
  });
  it("refreshes an expired access token and retains the recovered identity", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, message: "expired" } });
    const response = await roomRoute(req("session", undefined, cookie), "session");
    expect(response.status).toBe(200);
    expect(mock.refreshSession).toHaveBeenCalledWith({ refresh_token: "old-refresh" });
    expect(response.cookies.get("quarrel_refresh")?.value).toBe("refresh-token");
    expect(mock.rpc).toHaveBeenCalledWith("get_quarrel_room", {});
  });
  it("recovers with only a refresh cookie", async () => {
    expect((await roomRoute(req("session", undefined, "quarrel_refresh=old-refresh"), "session")).status).toBe(200);
    expect(mock.getUser).not.toHaveBeenCalled();
  });
  it("clears invalid sessions without silently assigning a different identity", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    mock.refreshSession.mockResolvedValue({ data: { session: null }, error: { status: 400 } });
    const response = await roomRoute(req("ready", { ready: true }, cookie), "ready");
    expect(response.status).toBe(401);
    expect(response.cookies.getAll().every(item => item.maxAge === 0)).toBe(true);
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
    expect((await roomRoute(req("session", undefined, "quarrel_access=forged"), "session")).status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([["ROOM_FULL", 409], ["ROOM_NOT_FOUND", 404], ["ROOM_EXPIRED", 410], ["ALREADY_IN_ROOM", 409], ["internal SQL details", 503]])("maps %s without leaking internal details", async (message, status) => {
    mock.rpc.mockResolvedValue({ data: null, error: { message } });
    const response = await roomRoute(req("join", { name: "Zebra", code: "ABC234" }), "join");
    expect(response.status).toBe(status);
    expect(response.cookies.get("quarrel_refresh")?.value).toBe("refresh-token");
    expect(JSON.stringify(await response.json())).not.toContain("internal SQL details");
  });
  it("handles missing configuration, Auth failure and unavailable backend", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    expect((await roomRoute(req("session"), "session")).status).toBe(503);
    vi.stubEnv("SUPABASE_URL", "http://localhost:54321");
    mock.signInAnonymously.mockResolvedValue({ data: { session: null }, error: {} });
    expect((await roomRoute(req("", { name: "Lion" }), "create")).status).toBe(503);
    mock.getUser.mockRejectedValue(new Error("secret transport details"));
    const response = await roomRoute(req("session", undefined, cookie), "session");
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
  it("does not issue a realtime token to a player without room membership", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: null });
    expect(await (await roomRoute(req("session", undefined, cookie), "session")).json()).toEqual({ room: null });
  });
  it.each([0, 429, 500, undefined])("preserves recovery cookies during Auth outage status %s", async status => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { status } });
    const response = await roomRoute(req("session", undefined, cookie), "session");
    expect(response.status).toBe(503);
    expect(response.cookies.getAll()).toHaveLength(0);
    expect(mock.refreshSession).not.toHaveBeenCalled();
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    mock.refreshSession.mockResolvedValue({ data: { session: null }, error: { status } });
    const renewal = await roomRoute(req("session", undefined, cookie), "session");
    expect(renewal.status).toBe(503);
    expect(renewal.cookies.getAll()).toHaveLength(0);
  });
  it.each(["jungle", "superhero", "detective", "courtroom"])("accepts canonical theme %s through the authenticated RPC", async themeId => {
    const response = await roomRoute(req("theme", { themeId }, cookie), "theme");
    expect(response.status).toBe(200);
    expect(mock.getUser).toHaveBeenCalledWith("existing-token");
    expect(mock.rpc).toHaveBeenCalledWith("set_quarrel_theme", { p_theme_id: themeId });
    expect((await response.json()).room).toEqual(room);
  });
  it.each([undefined, null, "", "Jungle", "unknown", "__proto__", 2, {}, []])("rejects invalid theme %j before a database call", async themeId => {
    const response = await roomRoute(req("theme", { themeId }, cookie), "theme");
    expect(response.status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.getUser).not.toHaveBeenCalled();
  });
  it.each(["playerId", "user_id", "slot", "themeLocked", "mode", "capacity"])("theme writes reject forged %s authority or future-mode fields", async field => {
    expect((await roomRoute(req("theme", { themeId: "detective", [field]: "A" }, cookie), "theme")).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([["HOST_ONLY", 403], ["THEME_LOCKED", 409], ["INVALID_THEME", 400]])("maps database theme error %s", async (message, status) => {
    mock.rpc.mockResolvedValue({ data: null, error: { message } });
    const response = await roomRoute(req("theme", { themeId: "detective" }, cookie), "theme");
    expect(response.status).toBe(status);
    expect((await response.json()).error).toEqual(expect.any(String));
  });
  it("does not create a new anonymous identity for unauthorized theme mutations", async () => {
    expect((await roomRoute(req("theme", { themeId: "detective" }), "theme")).status).toBe(401);
    expect((await roomRoute(req("theme", { themeId: "detective" }, cookie, "https://attacker.test"), "theme")).status).toBe(403);
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe("Stage 3 debate API boundaries", () => {
  it.each([
    ["propose", { topic: " Campus transit ", positionA: " Fund buses ", positionB: " Fund cycling ", revision: 2 }, "propose_quarrel_debate", { p_topic: "Campus transit", p_position_a: "Fund buses", p_position_b: "Fund cycling", p_revision: 2 }],
    ["approve", { revision: 2 }, "approve_quarrel_debate", { p_revision: 2 }],
    ["changes", { message: " Narrow the scope ", revision: 2 }, "request_quarrel_debate_changes", { p_message: "Narrow the scope", p_revision: 2 }],
    ["start", { revision: 2 }, "start_quarrel_judged_debate", expect.objectContaining({ p_revision: 2, p_mode: "demo", p_message_limit: 2, p_server_key: "test-only-server-capability-value-1234", p_lines: expect.objectContaining({ themeId: "jungle" }) })],
    ["argument", { text: " A reason.\nA second reason. ", revision: 2, turnIndex: 0 }, "submit_quarrel_argument", { p_text: "A reason.\nA second reason.", p_revision: 2, p_turn_index: 0 }],
    ["advance", { revision: 2, turnIndex: 5 }, "advance_quarrel_debate", { p_revision: 2, p_turn_index: 5 }],
  ] as const)("maps %s to its verified-session RPC", async (action, body, rpc, params) => {
    const response = await roomRoute(req(action, body, cookie), action);
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith(rpc, params);
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
  });

  it.each([undefined, null, -1, 0.5, "1", 2_147_483_647])("rejects invalid revision %j", async revision => {
    expect((await roomRoute(req("approve", { revision }, cookie), "approve")).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([undefined, null, -1, 6, 0.5, "0"])("rejects invalid turn index %j", async turnIndex => {
    expect((await roomRoute(req("argument", { text: "A reason", revision: 1, turnIndex }, cookie), "argument")).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { topic: "", positionA: "Yes", positionB: "No", revision: 0 },
    { topic: "x".repeat(241), positionA: "Yes", positionB: "No", revision: 0 },
    { topic: "Bad\ntopic", positionA: "Yes", positionB: "No", revision: 0 },
    { topic: "Transit", positionA: null, positionB: "No", revision: 0 },
    { topic: "Transit", positionA: "Yes", positionB: "x".repeat(161), revision: 0 },
    { topic: "Transit", positionA: "Yes", positionB: " YES ", revision: 0 },
  ])("rejects invalid proposals before authentication", async body => {
    expect((await roomRoute(req("propose", body, cookie), "propose")).status).toBe(400);
    expect(mock.getUser).not.toHaveBeenCalled();
  });
  it.each(["", " ", "x".repeat(2001), "bad\u0000text", 2])("rejects invalid argument %j", async text => {
    expect((await roomRoute(req("argument", { text, revision: 1, turnIndex: 0 }, cookie), "argument")).status).toBe(400);
  });
  it("accepts the full Unicode argument limit while bounding request bytes", async () => {
    const text = "🌴".repeat(2000);
    expect((await roomRoute(req("argument", { text, revision: 1, turnIndex: 0 }, cookie), "argument")).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("submit_quarrel_argument", { p_text: text, p_revision: 1, p_turn_index: 0 });
    expect((await roomRoute(req("argument", { text: "x".repeat(17000), revision: 1, turnIndex: 0 }, cookie), "argument")).status).toBe(413);
    expect((await roomRoute(req("changes", { message: "x".repeat(241), revision: 1 }, cookie), "changes")).status).toBe(400);
  });
  it.each(["playerId", "user_id", "slot", "deadline", "phase", "roomId"])("rejects forged submission field %s", async field => {
    expect((await roomRoute(req("argument", { text: "Forged", revision: 1, turnIndex: 0, [field]: "B" }, cookie), "argument")).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("requires the existing player session and exact origin for debate actions", async () => {
    expect((await roomRoute(req("start", { revision: 1 }), "start")).status).toBe(401);
    expect((await roomRoute(req("start", { revision: 1 }, cookie, "https://other.test"), "start")).status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
  });
  it.each(["STALE_REVISION", "STALE_TURN", "DEBATE_STARTED", "DEBATE_NOT_READY", "TURN_EXPIRED", "ALREADY_SUBMITTED"])("returns a safe conflict for %s", async message => {
    mock.rpc.mockResolvedValue({ data: null, error: { message } });
    const response = await roomRoute(req("argument", { text: "A reason", revision: 1, turnIndex: 0 }, cookie), "argument");
    expect(response.status).toBe(409);
    expect((await response.json()).error).toEqual(expect.any(String));
  });
});

describe("Stage 4 judge API boundary", () => {
  const requestKey = "24c35381-6e66-4f0f-9185-6b586e417057";
  const message = { text: "  Can you explain the other side?  ", revision: 2, turnIndex: 0, requestKey };
  it("reserves a message with verified identity and server-only capability", async () => {
    const result = await roomRoute(req("judge", message, cookie), "judge");
    expect(result.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("begin_quarrel_judge_message", { p_text: "Can you explain the other side?", p_revision: 2, p_turn_index: 0, p_request_key: requestKey, p_server_key: "test-only-server-capability-value-1234" });
    expect(await result.text()).not.toContain("test-only-server-capability");
    expect(mock.after).not.toHaveBeenCalled();
  });
  it("schedules persisted work after responding rather than trusting a browser result", async () => {
    mock.rpc.mockResolvedValue({ data: { ...room, judge: { needsWork: true } }, error: null });
    const result = await roomRoute(req("judge", message, cookie), "judge");
    expect(result.status).toBe(200); expect(mock.after).toHaveBeenCalledWith(expect.any(Function));
  });
  it.each(["", " ", "x".repeat(601), "bad\u0000text", null])("rejects invalid judge text", async text => {
    expect((await roomRoute(req("judge", { ...message, text }, cookie), "judge")).status).toBe(400);
    expect(mock.getUser).not.toHaveBeenCalled();
  });
  it("counts Unicode messages and caps the raw request", async () => {
    expect((await roomRoute(req("judge", { ...message, text: "🌴".repeat(600) }, cookie), "judge")).status).toBe(200);
    expect((await roomRoute(req("judge", { ...message, text: "x".repeat(9000) }, cookie), "judge")).status).toBe(413);
  });
  it.each(["", "not-a-uuid", null])("requires an idempotency nonce", async requestKey => {
    expect((await roomRoute(req("judge", { ...message, requestKey }, cookie), "judge")).status).toBe(400);
  });
  it.each(["slot", "playerId", "response", "phase", "serverKey", "limit"])("rejects injected %s authority", async field => {
    expect((await roomRoute(req("judge", { ...message, [field]: "injected" }, cookie), "judge")).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("requires the session, exact origin and configured worker capability", async () => {
    expect((await roomRoute(req("judge", message), "judge")).status).toBe(401);
    expect((await roomRoute(req("judge", message, cookie, "https://other.test"), "judge")).status).toBe(403);
    vi.stubEnv("JUDGE_SERVER_SECRET", "");
    expect((await roomRoute(req("judge", message, cookie), "judge")).status).toBe(503);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([["JUDGE_LIMIT_REACHED",429],["JUDGE_RATE_LIMITED",429],["JUDGE_BUSY",409],["JUDGE_PREPARING_QUESTIONS",409],["JUDGE_SERVER_UNAUTHORIZED",503]])("returns a safe %s response", async (message,status) => {
    mock.rpc.mockResolvedValue({ data:null, error:{message} });
    expect((await roomRoute(req("judge", {text:"Explain",revision:1,turnIndex:0,requestKey},cookie),"judge")).status).toBe(status);
  });
  it("uses the stored theme and configured mode when starting the judge", async () => {
    vi.stubEnv("GEMINI_API_KEY", "server-only-test-api-key");
    vi.stubEnv("JUDGE_MAX_MESSAGES_PER_TURN", "3");
    mock.rpc.mockResolvedValue({data:{...room,themeId:"detective"},error:null});
    const result=await roomRoute(req("start",{revision:2},cookie),"start");
    expect(mock.rpc).toHaveBeenLastCalledWith("start_quarrel_judged_debate", expect.objectContaining({p_mode:"ai",p_message_limit:3,p_lines:expect.objectContaining({themeId:"detective"})}));
    expect(await result.text()).not.toContain("server-only-test-api-key");
  });
  it("rejects missing rooms or database errors before judged start", async () => {
    mock.rpc.mockResolvedValueOnce({data:null,error:null});
    expect((await roomRoute(req("start",{revision:1},cookie),"start")).status).toBe(404);
    mock.rpc.mockResolvedValueOnce({data:null,error:{message:"ROOM_EXPIRED"}});
    expect((await roomRoute(req("start",{revision:1},cookie),"start")).status).toBe(410);
  });
});

describe("Stage 5 verified-player actions", () => {
  const nonce = "537bc570-0f8d-49f8-bc74-0f0e02e616af";
  it.each([
    ["lawyerTopic", { topic: " Campus transit ", totalSeconds: 120, revision: 0 }, "propose_quarrel_lawyer_topic", { p_topic: "Campus transit", p_total_seconds: 120, p_revision: 0 }],
    ["lawyerPosition", { position: " My own position ", revision: 1 }, "set_quarrel_lawyer_position", { p_position: "My own position", p_revision: 1 }],
    ["lawyerPlan", { revision: 2, regenerate: true }, "prepare_quarrel_lawyer_plan", { p_revision: 2, p_regenerate: true, p_mode: "demo", p_server_key: "test-only-server-capability-value-1234" }],
    ["lawyerStart", { revision: 2, planGeneration: 1 }, "start_quarrel_lawyer_debate", { p_revision: 2, p_plan_generation: 1 }],
    ["lawyerSend", { text: " A reason ", revision: 2, subtopic: 1, requestKey: nonce }, "submit_quarrel_lawyer_argument", { p_text: "A reason", p_revision: 2, p_subtopic: 1, p_request_key: nonce }],
    ["lawyerConsult", { text: " Private advice ", revision: 2, subtopic: 1, requestKey: nonce }, "consult_quarrel_lawyer", { p_text: "Private advice", p_revision: 2, p_subtopic: 1, p_request_key: nonce }],
    ["lawyerAdvance", { revision: 2 }, "advance_quarrel_lawyer_debate", { p_revision: 2 }],
  ] as const)("maps %s to checked RPC arguments", async (action, body, rpc, args) => {
    expect((await roomRoute(req(action, body, cookie), action)).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith(rpc, args);
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
  });
  it.each([
    ["lawyerTopic", "topic", 240, { revision: 1, totalSeconds: 120 }, "propose_quarrel_lawyer_topic", "p_topic"],
    ["lawyerPosition", "position", 600, { revision: 1 }, "set_quarrel_lawyer_position", "p_position"],
    ["lawyerSend", "text", 600, { revision: 1, subtopic: 1, requestKey: nonce }, "submit_quarrel_lawyer_argument", "p_text"],
    ["lawyerConsult", "text", 600, { revision: 1, subtopic: 1, requestKey: nonce }, "consult_quarrel_lawyer", "p_text"],
  ] as const)("accepts the full Unicode limit for %s while enforcing character and byte bounds", async (action, field, limit, base, rpc, parameter) => {
    const value = "🌴".repeat(limit);
    expect((await roomRoute(req(action, { ...base, [field]: value }, cookie), action)).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith(rpc, expect.objectContaining({ [parameter]: value }));
    mock.rpc.mockClear();
    expect((await roomRoute(req(action, { ...base, [field]: `${value}🌴` }, cookie), action)).status).toBe(400);
    expect((await roomRoute(req(action, { ...base, [field]: "x".repeat(9000) }, cookie), action)).status).toBe(413);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([0, 60, 121, 601, "120", null])("rejects unapproved duration %j", async totalSeconds => {
    expect((await roomRoute(req("topic", { topic: "Topic", totalSeconds, revision: 0 }, cookie), "lawyerTopic")).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(["slot", "playerId", "positionB", "deadline", "outcome"])("cannot inject %s into own position", async field => {
    expect((await roomRoute(req("position", { position: "Own position", revision: 1, [field]: "B" }, cookie), "lawyerPosition")).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(["", "x".repeat(601), "bad\u0000text"])("rejects invalid own positions %j", async position => {
    expect((await roomRoute(req("position", { position, revision: 1 }, cookie), "lawyerPosition")).status).toBe(400);
  });
  it.each([{ subtopic: 0 }, { subtopic: 6 }, { subtopic: "1" }, { text: "x".repeat(601) }, { requestKey: "bad" }, { revision: -1 }])("rejects malformed lawyer send %j", async patch => {
    expect((await roomRoute(req("argument", { text: "Point", revision: 1, subtopic: 1, requestKey: nonce, ...patch }, cookie), "lawyerSend")).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("requires an exact plan generation and a boolean regeneration decision", async () => {
    expect((await roomRoute(req("start", { revision: 1 }, cookie), "lawyerStart")).status).toBe(409);
    expect((await roomRoute(req("plan", { revision: 1, regenerate: "yes" }, cookie), "lawyerPlan")).status).toBe(400);
  });
  it("reserves planning only after both positions and readiness, then schedules persisted work", async () => {
    mock.rpc.mockResolvedValueOnce({ data: { ...room, bothReady: true, lawyer: { phase: "setup", confirmedA: true, confirmedB: true, revision: 3 } }, error: null })
      .mockResolvedValueOnce({ data: { ...room, lawyer: { phase: "planning", needsWork: true } }, error: null });
    const response = await roomRoute(req("ready", { ready: true }, cookie), "ready");
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("prepare_quarrel_lawyer_plan", expect.objectContaining({ p_revision: 3, p_regenerate: false }));
    expect(mock.after).toHaveBeenCalledTimes(1);
    mock.rpc.mockResolvedValue({ data: null, error: null }); await mock.after.mock.calls[0][0]();
    expect(mock.rpc).toHaveBeenCalledWith("claim_quarrel_lawyer_work", expect.any(Object));
  });
  it("keeps a successful readiness response when another request already reserved the plan", async () => {
    mock.rpc.mockResolvedValueOnce({ data: { ...room, bothReady: true, lawyer: { phase: "setup", confirmedA: true, confirmedB: true, revision: 3 } }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "STALE_REVISION" } });
    expect((await roomRoute(req("ready", { ready: true }, cookie), "ready")).status).toBe(200);
    expect(mock.after).not.toHaveBeenCalled();
  });
  it("does not expose worker capability in planner responses", async () => {
    const response = await roomRoute(req("plan", { revision: 1, regenerate: false }, cookie), "lawyerPlan");
    expect(await response.text()).not.toContain("test-only-server-capability-value-1234");
    vi.stubEnv("JUDGE_SERVER_SECRET", "");
    expect((await roomRoute(req("plan", { revision: 1, regenerate: false }, cookie), "lawyerPlan")).status).toBe(503);
  });
});
