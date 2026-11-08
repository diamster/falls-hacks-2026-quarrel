import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { roomRoute } from "@/server/room-api";
import { attachSpeechReceipts, verifySpeechReceipt } from "@/server/speech-receipts";
import type { LawyerPublicMessage } from "@/lib/lawyer-types";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), refreshSession: vi.fn(), signInAnonymously: vi.fn(), createClient: vi.fn(), after: vi.fn(), cachedSpeech: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.createClient }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: mock.after }));
vi.mock("@/server/speech-provider", async original => ({ ...await original<typeof import("@/server/speech-provider")>(), cachedSpeech: mock.cachedSpeech }));
const roomId = "00000000-0000-4000-8000-000000000001", debateId = "00000000-0000-4000-8000-000000000002", messageId = "00000000-0000-4000-8000-000000000003";
const scope = { userId: "verified-a", roomId, debateId, themeId: "courtroom" };
const message: LawyerPublicMessage = { id: messageId, label: "S1-P1L1M1", kind: "argument", slot: "A", subtopic: 1, status: "complete", text: "The saved lawyer presentation.", rawText: "PRIVATE DRAFT", source: "ai", createdAt: "2026-11-07T00:00:00Z", completedAt: "2026-11-07T00:00:01Z" };
const secret = "unit-test-speech-secret-1234567890";
const cookie = "quarrel_access=signed-a; quarrel_refresh=refresh-a";
function token() { return attachSpeechReceipts([message], scope)[0].speechToken!; }
function req(body: unknown = { debateId, messageId, speechToken: token() }, options: { cookie?: string; origin?: string; roomId?: string } = {}) {
  return new NextRequest("http://localhost:3000/api/rooms/lawyer/speech", { method: "POST", headers: { "content-type": "application/json", origin: options.origin ?? "http://localhost:3000", cookie: options.cookie ?? cookie, "x-quarrel-room-id": options.roomId ?? roomId }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "http://localhost:54321"); vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable"); vi.stubEnv("JUDGE_SERVER_SECRET", secret);
  mock.createClient.mockReturnValue({ auth: mock, rpc: mock.rpc });
  mock.getUser.mockResolvedValue({ data: { user: { id: scope.userId } }, error: null });
  mock.cachedSpeech.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
  mock.rpc.mockResolvedValue({ data: { id: roomId, themeId: scope.themeId, lawyer: { debateId, history: [message], consultations: [{ text: "PRIVATE CONSULTATION" }] } }, error: null });
});

describe("signed public speech receipts", () => {
  it("signs only the saved public text and does not include the private draft", () => {
    const receipt = verifySpeechReceipt(token(), { ...scope, messageId });
    expect(receipt.text).toBe(message.text); expect(receipt.role).toBe("lawyerA");
    expect(JSON.stringify(receipt)).not.toContain("PRIVATE");
  });
  it.each(["pending", "complete"] as const)("never signs private or unknown message kinds (%s)", status => {
    for (const kind of ["consult", "unknown"]) {
      expect(attachSpeechReceipts([{ ...message, kind, status } as LawyerPublicMessage], scope)[0].speechToken).toBeUndefined();
    }
  });
  it("handles pending, empty, invalid IDs/themes and unavailable signing config without secrets", () => {
    for (const item of [{ ...message, status: "pending" }, { ...message, text: "" }, { ...message, text: "\u0001" }, { ...message, id: "invalid" }, { ...message, slot: null }, { ...message, text: "x".repeat(4001) }]) {
      expect(attachSpeechReceipts([item as LawyerPublicMessage], scope)[0].speechToken).toBeUndefined();
    }
    expect(attachSpeechReceipts([message], { ...scope, themeId: "invalid" })[0].speechToken).toBeUndefined();
    expect(attachSpeechReceipts([message], { ...scope, roomId: "invalid" })[0].speechToken).toBeUndefined();
    vi.stubEnv("JUDGE_SERVER_SECRET", "");
    expect(attachSpeechReceipts([message], scope)[0].speechToken).toBeUndefined();
    expect(() => verifySpeechReceipt("token", { ...scope, messageId })).toThrow(/configuration/);
  });
  it("assigns B and judge roles from stored message kind/slot only", () => {
    for (const [kind, slot, role] of [["argument", "B", "lawyerB"], ["judge_summary", null, "judge"], ["announcement", null, "judge"], ["jury_verdict", null, "judge"]] as const) {
      const result = attachSpeechReceipts([{ ...message, kind, slot }], scope)[0];
      expect(verifySpeechReceipt(result.speechToken!, { ...scope, messageId }).role).toBe(role);
    }
  });
  it("signs only completed saved final announcement text for the judge voice", () => {
    const final = { ...message, kind: "jury_verdict" as const, slot: null, text: "The jury has completed its review. Both sides raised valid concerns.", rawText: "PRIVATE DRAFT" };
    const complete = attachSpeechReceipts([final], scope)[0];
    expect(verifySpeechReceipt(complete.speechToken!, { ...scope, messageId })).toMatchObject({ role: "judge", text: final.text });
    expect(JSON.stringify(verifySpeechReceipt(complete.speechToken!, { ...scope, messageId }))).not.toContain("PRIVATE");
    expect(attachSpeechReceipts([{ ...final, status: "pending" }], scope)[0].speechToken).toBeUndefined();
    expect(attachSpeechReceipts([{ ...final, text: "I will hurt you" }], scope)[0]).toMatchObject({ speechBlocked: true });
  });
  it("marks unsuitable unchanged fallbacks as blocked for every playback provider", () => {
    const result = attachSpeechReceipts([{ ...message, text: "I will hurt you", source: "fallback" }], scope)[0];
    expect(result.speechToken).toBeUndefined(); expect(result.speechBlocked).toBe(true);
  });
  it("blocks unsafe browser fallback even when receipt signing is unavailable", () => {
    const unsafe = { ...message, text: "I will hurt you", source: "fallback" as const, speechToken: "stale-token" };
    for (const configuredScope of [scope, { ...scope, themeId: "unknown" }, { ...scope, roomId: "legacy-id" }]) {
      const tagged = attachSpeechReceipts([unsafe], configuredScope)[0];
      expect(tagged.speechBlocked).toBe(true); expect(tagged.speechToken).toBeUndefined();
    }
    vi.stubEnv("JUDGE_SERVER_SECRET", "");
    const tagged = attachSpeechReceipts([unsafe], scope)[0];
    expect(tagged.speechBlocked).toBe(true); expect(tagged.speechToken).toBeUndefined();
    const safe = attachSpeechReceipts([{ ...message, speechToken: "stale-token" }], scope)[0];
    expect(safe.speechBlocked).toBeUndefined(); expect(safe.speechToken).toBeUndefined(); expect(safe.text).toBe(message.text);
  });
  it("rejects tampering, stale receipts, another player and another message/room/debate", () => {
    const signed = token();
    for (const altered of ["x", signed + "x", "A" + signed.slice(1), "x".repeat(32001)]) expect(() => verifySpeechReceipt(altered, { ...scope, messageId })).toThrow();
    for (const field of ["userId", "roomId", "debateId", "messageId"] as const) expect(() => verifySpeechReceipt(signed, { ...scope, messageId, [field]: "someone-else" })).toThrow();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60 * 60_000 + 1);
    expect(() => verifySpeechReceipt(signed, { ...scope, messageId })).toThrow(/Refresh/);
  });
  it("strictly checks signed schema/version/expiry and content, not just the MAC", () => {
    const value = verifySpeechReceipt(token(), { ...scope, messageId });
    const signingKey = createHmac("sha256", secret).update("quarrel.io/stage6b/public-speech/v1").digest();
    const sign = (payload: unknown) => { const encoded = Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload)).toString("base64url"); return encoded + "." + createHmac("sha256", signingKey).update(encoded).digest("base64url"); };
    for (const payload of [null, [], "invalid JSON", { ...value, v: 2 }, { ...value, extra: true }, { ...value, role: "jury" }, { ...value, themeId: "missing" }, { ...value, text: "" }, { ...value, expires: Date.now() + 7200000 }]) expect(() => verifySpeechReceipt(sign(payload), { ...scope, messageId })).toThrow();
    expect(() => verifySpeechReceipt(sign({ ...value, text: "I will hurt you" }), { ...scope, messageId })).toThrow(/unavailable/);
  });
});

describe("speech route boundary", () => {
  it("returns only audio from verified saved text without any DB reads, worker or clock changes", async () => {
    const response = await roomRoute(req(), "speech");
    expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(response.headers.get("cache-control")).toBe("no-store, private"); expect(response.headers.get("vary")).toBe("Cookie");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3, 4]);
    expect(mock.cachedSpeech).toHaveBeenCalledWith(expect.objectContaining({ text: message.text, role: "lawyerA", userId: scope.userId }));
    expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.after).not.toHaveBeenCalled(); expect(mock.signInAnonymously).not.toHaveBeenCalled();
  });
  it.each([{ text: "invented" }, { slot: "B" }, { userId: "other" }, { voice: "custom" }])("rejects browser-provided speech fields %j", async extras => {
    expect((await roomRoute(req({ debateId, messageId, speechToken: token(), ...extras }), "speech")).status).toBe(400);
    expect(mock.cachedSpeech).not.toHaveBeenCalled();
  });
  it("denies anonymous, cross-origin, malformed and unauthorized receipt requests without fallback", async () => {
    expect((await roomRoute(req(undefined, { cookie: "" }), "speech")).status).toBe(401);
    expect((await roomRoute(req(undefined, { origin: "https://evil.example" }), "speech")).status).toBe(403);
    expect((await roomRoute(req({}, { roomId: "invalid" }), "speech")).status).toBe(400);
    for (const body of [{ debateId: "invalid", messageId, speechToken: token() }, { debateId, messageId: "invalid", speechToken: token() }, { debateId, messageId }]) expect((await roomRoute(req(body), "speech")).status).toBe(400);
    const signed = token(); mock.getUser.mockResolvedValue({ data: { user: { id: "verified-b" } }, error: null });
    const denied = await roomRoute(req({ debateId, messageId, speechToken: signed }), "speech");
    expect(denied.status).toBe(403); expect(await denied.json()).toMatchObject({ fallbackAllowed: false }); expect(mock.cachedSpeech).not.toHaveBeenCalled();
  });
  it("preserves refreshed cookies while checking the renewed identity", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    mock.refreshSession.mockResolvedValue({ data: { session: { access_token: "new-access", refresh_token: "new-refresh", user: { id: scope.userId } } }, error: null });
    const response = await roomRoute(req(), "speech");
    expect(response.status).toBe(200); expect(response.cookies.get("quarrel_access")?.value).toBe("new-access"); expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("returns sanitized typed provider recovery without clock mutations", async () => {
    const { SpeechError } = await import("@/server/speech-provider");
    mock.cachedSpeech.mockRejectedValue(new SpeechError(429, "TTS_QUOTA", "Speech unavailable."));
    const response = await roomRoute(req(), "speech"); expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "Speech unavailable.", code: "TTS_QUOTA", fallbackAllowed: true }); expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("attaches receipts to public current/archived snapshots while leaving consultations untouched", async () => {
    const response = await roomRoute(new NextRequest("http://localhost:3000/api/rooms/session", { headers: { cookie } }), "session");
    const data = await response.json(); expect(data.room.lawyer.history[0].speechToken).toBeTypeOf("string");
    expect(data.room.lawyer.consultations).toEqual([{ text: "PRIVATE CONSULTATION" }]);
    mock.rpc.mockResolvedValue({ data: { id: debateId, roomId, themeId: "jungle", history: [message] }, error: null });
    const archive = await roomRoute(new NextRequest(`http://localhost:3000/api/rooms/lawyer/history?debateId=${debateId}`, { headers: { cookie } }), "resultsHistory");
    const record = (await archive.json()).history; expect(verifySpeechReceipt(record.history[0].speechToken, { ...scope, messageId }).themeId).toBe("jungle");
  });
});
