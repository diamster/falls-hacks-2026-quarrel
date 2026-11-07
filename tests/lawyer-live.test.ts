import { describe, expect, it, vi } from "vitest";
import { generateLawyerResult } from "@/server/judge-engine";
import { validateLawyerResult } from "@/server/lawyer-policy";
import type { LawyerJob } from "@/lib/lawyer-types";

// Explicit opt-in, exactly two synthetic calls. Never prints input, output,
// provider bodies, request URLs/headers, environment values or credentials.
const live = process.env.RUN_LIVE_LAWYER_TESTS === "true";
const base: LawyerJob = {
  id: "synthetic-stage5-live", kind: "lawyer", mode: "ai", slot: "A",
  playerText: "Students leaving evening classes need time to study together in the library.",
  context: {
    themeId: "courtroom", topic: "Should university libraries extend evening hours?", totalSeconds: 120,
    players: [
      { slot: "A", name: "Alex", position: "Extend library hours because students with evening classes need a shared place to study." },
      { slot: "B", name: "Sam", position: "Keep current hours and prioritize staffed daytime services because resources are limited." },
    ],
    subtopics: [
      { ordinal: 1, question: "How would later library access affect students?", secondsPerPlayer: 60 },
      { ordinal: 2, question: "How should limited staffing and student access be balanced?", secondsPerPlayer: 60 },
    ], currentSubtopic: 1, messages: [],
  },
};
type Observation = { status: number | null; durationMs: number; finishReason: string | null; jsonParsed: boolean; outputLength: number | null; allowedLength: number; validResult: boolean; error: string | null };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

async function inspect(job: LawyerJob) {
  const observation: Observation = { status: null, durationMs: 0, finishReason: null, jsonParsed: false, outputLength: null,
    allowedLength: job.kind === "lawyer" ? Math.min(900, Math.floor(Array.from(job.playerText ?? "").length * 1.5)) : 900,
    validResult: false, error: null };
  const realFetch = globalThis.fetch;
  let calls = 0;
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
    calls++;
    const started = performance.now();
    try {
      const response = await realFetch(...args);
      observation.status = response.status;
      const payload: unknown = await response.clone().json().catch(() => null);
      const candidate = record(payload) && Array.isArray(payload.candidates) ? payload.candidates[0] : null;
      if (record(candidate)) {
        // Provider-controlled strings are reduced to known metadata labels.
        observation.finishReason = ["STOP", "MAX_TOKENS", "SAFETY", "RECITATION", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(String(candidate.finishReason)) ? String(candidate.finishReason) : "UNKNOWN";
        const content = candidate.content;
        if (record(content) && Array.isArray(content.parts)) {
          const output = content.parts.filter(part => record(part) && typeof part.text === "string" && !part.thought).map(part => part.text).join("");
          let parsed: unknown;
          try { parsed = JSON.parse(output); observation.jsonParsed = true; } catch { parsed = null; }
          if (record(parsed) && typeof parsed.text === "string") observation.outputLength = Array.from(parsed.text).length;
          observation.validResult = validateLawyerResult(parsed, job) !== null;
        }
      }
      return response;
    } catch (error) {
      const name = error instanceof Error ? error.name : "Unknown";
      observation.error = ["AbortError", "TimeoutError", "TypeError"].includes(name) ? name : "NetworkError";
      throw error;
    } finally { observation.durationMs = Math.round(performance.now() - started); }
  });
  try {
    const result = await generateLawyerResult(job);
    console.log("LIVE_STAGE5_METADATA", JSON.stringify({ kind: job.kind, ...observation, source: result.source, calls }));
    expect(calls, "Each role may issue exactly one provider request; no hidden retries.").toBe(1);
    expect(result.source, "The live smoke requires validated AI output, not a fallback response.").toBe("ai");
    expect(observation.validResult).toBe(true);
    expect(Boolean(result.text.trim())).toBe(true);
  } finally { spy.mockRestore(); }
}

describe.skipIf(!live)("Stage 5 live lawyer and private consultation (explicit opt-in)", () => {
  it("presents the original meaning within the strict 1.5× length limit", async () => { await inspect(base); }, 20_000);
  it("provides a validated concise private consultation", async () => {
    await inspect({ ...base, id: "synthetic-stage5-consult", kind: "consult", playerText: "Help me organize my point about students with evening classes without adding evidence.", context: { ...base.context, consultations: [] } });
  }, 20_000);
});
