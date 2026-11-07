import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { roomRoute } from "@/server/room-api";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), refreshSession: vi.fn(), signInAnonymously: vi.fn(), createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.createClient }));
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
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "public-key");
  mock.createClient.mockReturnValue({ auth: mock, rpc: mock.rpc });
  mock.getUser.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
  mock.refreshSession.mockResolvedValue({ data: { session }, error: null });
  mock.signInAnonymously.mockResolvedValue({ data: { session }, error: null });
  mock.rpc.mockResolvedValue({ data: room, error: null });
});

describe("session-authorized room API", () => {
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
    expect(mock.rpc).toHaveBeenCalledWith("create_quarrel_room", { p_name: "Lion" });
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
