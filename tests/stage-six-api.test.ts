import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as history } from "@/app/api/rooms/lawyer/history/route";
import { POST as acknowledge } from "@/app/api/rooms/lawyer/acknowledge/route";
import { POST as rematch } from "@/app/api/rooms/lawyer/rematch/route";
import { POST as retry } from "@/app/api/rooms/lawyer/retry/route";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), refreshSession: vi.fn(), signInAnonymously: vi.fn(), createClient: vi.fn(), after: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.createClient }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: mock.after }));
const debateId = "54c6c3a5-8ea2-4b4a-9b84-c694241047ec";
const roomId = "920e0108-fbaa-4317-91fd-048f53678d45";
const cookie = "quarrel_access=member-token; quarrel_refresh=member-refresh";
const result = { id: debateId, topic: "Campus transit", history: [{ kind: "argument", text: "Fund buses", slot: "A" }], acknowledgements: { A: null, B: null } };
const room = { id: roomId, code: "ABC234", lawyer: { debateId, phase: "complete", needsWork: false } };
function read(query = "", session = cookie) {
  return new NextRequest(`http://localhost:3000/api/rooms/lawyer/history${query}`, { headers: { cookie: session } });
}
function write(path: string, body: unknown = { debateId }, options: { cookie?: string; origin?: string; roomId?: string | null } = {}) {
  return new NextRequest(`http://localhost:3000/api/rooms/lawyer/${path}`, {
    method: "POST", headers: {
      origin: options.origin ?? "http://localhost:3000", "content-type": "application/json", cookie: options.cookie ?? cookie,
      ...(options.roomId === null ? {} : { "x-quarrel-room-id": options.roomId ?? roomId }),
    }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "public-key");
  vi.stubEnv("JUDGE_SERVER_SECRET", "server-only-test-capability");
  vi.stubEnv("GEMINI_API_KEY", "");
  mock.createClient.mockReturnValue({ auth: mock, rpc: mock.rpc });
  mock.getUser.mockResolvedValue({ data: { user: { id: "verified-member" } }, error: null });
  mock.refreshSession.mockResolvedValue({ data: { session: { access_token: "renewed-member", refresh_token: "renewed-refresh" } }, error: null });
  mock.rpc.mockResolvedValue({ data: room, error: null });
});

describe("Stage 6A results and rematch API", () => {
  it("retrieves a participant-authorized archive without Realtime credentials or running work", async () => {
    mock.rpc.mockResolvedValue({ data: result, error: null });
    const response = await history(read(`?debateId=${debateId}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ history: result });
    expect(mock.getUser).toHaveBeenCalledWith("member-token");
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("get_quarrel_lawyer_results", { p_debate_id: debateId });
    expect(mock.after).not.toHaveBeenCalled();
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("vary")).toBe("Cookie");
  });
  it.each([["", null], [`?roomId=${roomId}`, roomId]])("lists only authorized historical results for %s", async (query, filter) => {
    mock.rpc.mockResolvedValue({ data: [result], error: null });
    expect(await (await history(read(query ?? ""))).json()).toEqual({ history: [result] });
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("list_quarrel_lawyer_results", { p_room_id: filter });
  });
  it.each(["?debateId=bad", "?debateId=", "?roomId=bad", `?debateId=${debateId}&debateId=${debateId}`, `?debateId=${debateId}&roomId=${roomId}`, "?userId=victim"])("rejects ambiguous or forged archive query %s", async query => {
    expect((await history(read(query))).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.getUser).not.toHaveBeenCalled();
  });
  it("never allocates an identity to read private results", async () => {
    expect((await history(read(`?debateId=${debateId}`, ""))).status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
  });
  it("refreshes the existing member identity while fetching an archive", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    mock.rpc.mockResolvedValue({ data: result, error: null });
    const response = await history(read(`?debateId=${debateId}`));
    expect(response.status).toBe(200);
    expect(response.cookies.get("quarrel_access")?.value).toBe("renewed-member");
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
  });
  it("acknowledges only the authenticated player without declaring agreement or requiring a current room", async () => {
    mock.rpc.mockResolvedValue({ data: { ...result, acknowledgements: { A: "2026-11-07T23:00:00Z", B: null } }, error: null });
    const response = await acknowledge(write("acknowledge", { debateId }, { roomId: null }));
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("acknowledge_quarrel_lawyer_results", { p_debate_id: debateId });
    expect(await response.json()).toEqual({ results: { ...result, acknowledgements: { A: "2026-11-07T23:00:00Z", B: null } } });
    expect(mock.after).not.toHaveBeenCalled();
  });
  it.each([["rematch", rematch, "request_quarrel_lawyer_rematch"], ["retry", retry, "retry_quarrel_lawyer_jury"]] as const)("sends %s through authenticated membership and the expected room/debate guards", async (path, handler, rpc) => {
    const response = await handler(write(path));
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith(rpc, { p_debate_id: debateId });
    expect(mock.createClient).toHaveBeenLastCalledWith("http://localhost:54321", "public-key", expect.objectContaining({ global: { headers: { Authorization: "Bearer member-token", "x-quarrel-room-id": roomId } } }));
    expect((await response.json()).room).toEqual(room);
  });
  it.each([["rematch", rematch], ["retry", retry]] as const)("requires a room guard for %s", async (path, handler) => {
    expect((await handler(write(path, { debateId }, { roomId: null }))).status).toBe(400);
    expect((await handler(write(path, { debateId }, { roomId: "bad" }))).status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([["rematch", rematch], ["retry", retry], ["acknowledge", acknowledge]] as const)("rejects missing sessions, cross-origin writes and forged authority for %s", async (path, handler) => {
    expect((await handler(write(path, { debateId }, { cookie: "" }))).status).toBe(401);
    expect((await handler(write(path, { debateId }, { origin: "https://attacker.test" }))).status).toBe(403);
    for (const body of [{}, { debateId: "wrong" }, { debateId, playerId: "victim" }, { debateId, slot: "B" }, { debateId, accepted: true }, { debateId, winner: "A" }]) {
      expect((await handler(write(path, body))).status).toBe(400);
    }
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.signInAnonymously).not.toHaveBeenCalled();
  });
  it.each([["RESULTS_NOT_FOUND", 404], ["RESULTS_NOT_READY", 409], ["REMATCH_NOT_READY", 409], ["JURY_RETRY_NOT_READY", 409], ["JURY_RETRY_RATE_LIMITED", 429], ["STALE_LAWYER_CLAIM", 409], ["UNAUTHORIZED", 401], ["internal SQL detail", 503]])("maps %s safely", async (message, status) => {
    mock.rpc.mockResolvedValue({ data: null, error: { message } });
    const response = await retry(write("retry"));
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("internal SQL detail");
  });
  it("returns a recoverable stale-debate code without deleting the player's session", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "STALE_DEBATE" } });
    const response = await rematch(write("rematch"));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "STALE_DEBATE" });
    expect(response.cookies.getAll()).toHaveLength(0);
  });
  it("schedules a reserved retry without invoking AI synchronously or exposing server credentials", async () => {
    mock.rpc.mockResolvedValue({ data: { ...room, lawyer: { phase: "jury", needsWork: true } }, error: null });
    const response = await retry(write("retry"));
    expect(response.status).toBe(200);
    expect(mock.after).toHaveBeenCalledTimes(1);
    expect(await response.text()).not.toContain("server-only-test-capability");
    vi.stubEnv("JUDGE_SERVER_SECRET", "");
    mock.rpc.mockClear();
    expect((await retry(write("retry"))).status).toBe(503);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
