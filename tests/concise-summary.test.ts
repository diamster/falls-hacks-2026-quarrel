import { afterEach, describe, expect, it, vi } from "vitest";
import type { LawyerJob } from "@/lib/lawyer-types";
import { themes } from "@/themes";
import { generateLawyerResult } from "@/server/judge-engine";
import { deterministicLawyerResult, lawyerContext, lawyerInstructions, lawyerResponseSchema, validateLawyerResult } from "@/server/lawyer-policy";

function summaryJob(): LawyerJob {
  return { id: "summary", kind: "summary", mode: "ai", slot: null, playerText: null, context: {
    themeId: "courtroom", topic: "Should lectures be mandatory?", totalSeconds: 120, currentSubtopic: 1,
    players: [{ slot: "A", name: "Alex", position: "Require lectures." }, { slot: "B", name: "Sam", position: "Allow independent learning." }],
    subtopics: [{ ordinal: 1, question: "How does attendance affect learning?", secondsPerPlayer: 60 }, { ordinal: 2, question: "What flexibility is needed?", secondsPerPlayer: 60 }],
    messages: ["A", "B"].map((slot, index) => ({ id: slot, label: `S1-P${index + 1}L${index + 1}M1`, kind: "argument" as const, slot: slot as "A" | "B", subtopic: 1, text: index ? "Students can learn independently." : "Attendance encourages participation.", rawText: "PRIVATE_DRAFT", status: "complete" as const, source: "ai" as const, createdAt: "2030-01-01T00:00:00Z", completedAt: "2030-01-01T00:00:01Z" })),
    consultations: [{ id: "private", subtopic: 1, playerText: "PRIVATE_CONSULTATION", text: "PRIVATE_ADVICE", source: "ai", status: "complete", createdAt: "2030-01-01T00:00:00Z" }],
  } };
}
const concise = "Player A argues that required attendance encourages participation and creates shared opportunities to learn. Player B emphasizes flexibility for students who learn effectively on their own. Their disagreement concerns whether a universal attendance rule improves learning enough to justify limiting individual choice; neither claim is independently verified.";
const words = (text: string) => text.trim().split(/\s+/u).length;
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("concise subtopic summaries", () => {
  it.each(themes)("keeps $displayName personality and neutrality under the same brief limit", theme => {
    const job = summaryJob(); job.context.themeId = theme.id;
    const prompt = lawyerInstructions(job);
    expect(prompt).toContain(theme.judge.personality);
    expect(prompt).toContain("2–3 short sentences"); expect(prompt).toContain("never more than 70 words");
    expect(prompt).toContain("both sides comparable attention"); expect(prompt).toContain("Do not name or imply a winner");
    expect(lawyerResponseSchema(job).properties.text).toMatchObject({ maxLength: 700 });
    expect(validateLawyerResult({ text: concise }, job)).toMatchObject({ source: "ai", text: concise });
  });
  it("enforces the word/character/sentence limits without clipping either side", () => {
    const job = summaryJob();
    const seventy = `${Array(69).fill("word").join(" ")}. Second.`;
    expect(words(seventy)).toBe(70); expect(validateLawyerResult({ text: seventy }, job)).not.toBeNull();
    expect(validateLawyerResult({ text: `Extra ${seventy}` }, job)).toBeNull();
    expect(validateLawyerResult({ text: `${"x".repeat(695)}. Second.` }, job)).toBeNull();
    expect(validateLawyerResult({ text: "One. Two. Three. Four." }, job)).toBeNull();
    expect(validateLawyerResult({ text: "One sentence only." }, job)).toBeNull();
  });
  it.each(["demo", "fallback"] as const)("keeps %s short and balanced, with no private text or fabricated assessment", source => {
    const job = summaryJob();
    const result = deterministicLawyerResult(job, source);
    expect(words(result.text)).toBeLessThanOrEqual(70);
    expect(result.text).toContain("Attendance encourages participation");
    expect(result.text).toContain("Students can learn independently");
    expect(result.text).toContain("unresolved"); expect(result.text).not.toContain("PRIVATE_");
    expect(validateLawyerResult({ text: result.text }, job)).not.toBeNull();
    const context = JSON.stringify(lawyerContext(job)); expect(context).not.toContain("PRIVATE_");
  });
  it("does not cut long arguments before a qualifying ending or invent missing submissions", () => {
    const job = summaryJob();
    job.context.messages[0].text = "Attendance may seem desirable because it supports many different kinds of useful classroom interaction and creates shared experiences but must not be compulsory.";
    job.context.messages = job.context.messages.slice(0, 1);
    const result = deterministicLawyerResult(job, "fallback");
    expect(result.text).toContain("Player A submitted 1 public argument");
    expect(result.text).toContain("Player B made no public submission");
    expect(result.text).not.toContain("Attendance may seem desirable");
    expect(words(result.text)).toBeLessThanOrEqual(70);
  });
  it("reduces only summary generation tokens and preserves the full jury contract", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-text-key"); vi.stubEnv("JUDGE_AI_MODE", "auto");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.1-flash-lite"); vi.stubEnv("GEMINI_FALLBACK_MODEL", "");
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ text: concise }) }] } }] })));
    vi.stubGlobal("fetch", request);
    const job = summaryJob(); expect((await generateLawyerResult(job)).source).toBe("ai");
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).generationConfig.maxOutputTokens).toBe(512);
    const jury = { ...job, kind: "jury" as const };
    expect(lawyerResponseSchema(jury).properties.text).toMatchObject({ maxLength: 2400 });
    expect(lawyerInstructions(jury)).toContain("reasoning <=1800");
    expect(lawyerInstructions(jury)).not.toContain("never more than 70 words");
    // A malformed mocked jury reply remains unavailable, never a fake verdict.
    await expect(generateLawyerResult(jury)).rejects.toBeInstanceOf(Error);
    expect(JSON.parse(String(request.mock.calls[1][1]?.body)).generationConfig.maxOutputTokens).toBe(4096);
  });
  it("saves a labelled concise fallback when the provider ignores the length constraint", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-text-key"); vi.stubEnv("JUDGE_AI_MODE", "auto"); vi.stubEnv("GEMINI_FALLBACK_MODEL", "");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ text: `${"word ".repeat(80)}. Second.` }) }] } }] }))));
    const result = await generateLawyerResult(summaryJob());
    expect(result.source).toBe("fallback"); expect(words(result.text)).toBeLessThanOrEqual(70);
    expect(result.text).toContain("Player A"); expect(result.text).toContain("Player B");
  });
});
