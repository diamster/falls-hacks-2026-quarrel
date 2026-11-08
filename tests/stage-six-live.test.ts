import { describe, expect, it, vi } from "vitest";
import { generateLawyerResult } from "@/server/judge-engine";
import type { LawyerJob, LawyerPublicMessage } from "@/lib/lawyer-types";

// Explicit opt-in: two synthetic jobs, one primary-model request per job.
// No keys, prompts, output text, or provider error bodies are logged.
const live = process.env.RUN_LIVE_STAGE6_TESTS === "true";
let quotaBlocked = false;
const message = (label: string, slot: "A" | "B" | null, subtopic: number, text: string): LawyerPublicMessage => ({
  id: label, label, slot, subtopic, text, source: "ai", status: "complete", kind: slot ? "argument" : "judge_summary",
  createdAt: "2030-01-01T00:00:00Z", completedAt: "2030-01-01T00:00:01Z",
  ...(slot ? { rawText: "PRIVATE_DRAFT_MUST_NOT_BE_EVIDENCE" } : {}),
});
const job: LawyerJob = {
  id: "synthetic-stage6-jury", kind: "jury", mode: "ai", slot: null, playerText: null,
  context: {
    themeId: "courtroom", topic: "Should university libraries extend evening hours?", totalSeconds: 120, currentSubtopic: 2,
    players: [
      { slot: "A", name: "Alex", position: "Extend hours to support students with evening classes." },
      { slot: "B", name: "Sam", position: "Keep current hours until staffing costs are assessed." },
    ],
    subtopics: [
      { ordinal: 1, question: "How would access affect students?", secondsPerPlayer: 60 },
      { ordinal: 2, question: "How should staffing and access be balanced?", secondsPerPlayer: 60 },
    ],
    messages: [
      message("S1-P1L1M1", "A", 1, "Students with evening classes need a shared place to study afterward; later hours could help them."),
      message("S1-P2L2M1", "B", 1, "We do not yet know how many students would use later hours; measure demand before committing."),
      message("S1-J", null, 1, "A explains an access need; B identifies missing demand data. Neither supplied usage evidence."),
      message("S2-P1L1M1", "A", 2, "A short trial could measure evening demand before a long-term commitment."),
      message("S2-P2L2M1", "B", 2, "A trial should first have a staffing budget so current services are not reduced."),
      message("S2-J", null, 2, "Both discuss a trial; A emphasizes measuring demand and B asks for a staffing budget. Costs remain unverified."),
    ],
    consultations: [{ id: "private", subtopic: 2, playerText: "PRIVATE_CONSULTATION_MUST_NOT_BE_EVIDENCE", text: "Private advice", source: "ai", status: "complete", createdAt: "2030-01-01T00:00:00Z" }],
  },
};

async function callOnce(request: LawyerJob) {
  const fetchOriginal = globalThis.fetch;
  let calls = 0;
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
    calls++;
    const body = String(args[1]?.body);
    if (request.kind === "jury") expect(body).not.toMatch(/PRIVATE_DRAFT_MUST_NOT_BE_EVIDENCE|PRIVATE_CONSULTATION_MUST_NOT_BE_EVIDENCE/);
    const response = await fetchOriginal(...args);
    if (response.status === 429) quotaBlocked = true;
    if (request.kind === "jury") {
      const payload = await response.clone().json().catch(() => null);
      const output = payload?.candidates?.[0]?.content?.parts?.filter((part: { thought?: boolean }) => !part.thought).map((part: { text?: string }) => part.text ?? "").join("");
      let parsed; try { parsed = JSON.parse(output); } catch { parsed = null; }
      const verdict = parsed?.verdict;
      const outcomeLanguage = /\b(?:player|side|team)\s*[ab]\s+(?:wins?|won|is\s+(?:the\s+)?winner|has\s+won)\b|\b(?:winner\s+is|declare\s+(?:a\s+)?winner|final\s+verdict\s*:)\b|\b(?:score|points?)\s*[:=]\s*\d/i;
      const fields = [parsed?.text, verdict?.reasoning, verdict?.strongestArguments?.A, verdict?.strongestArguments?.B, ...(verdict?.weaknesses?.A ?? []), ...(verdict?.weaknesses?.B ?? []), ...(verdict?.perSubtopic?.map((item: { text?: string }) => item.text) ?? []), verdict?.compromise];
      const labels = new Set(request.context.messages.map(item => item.label));
      console.log("LIVE_STAGE6_JURY_METADATA", JSON.stringify({ status: response.status,
        stop: payload?.candidates?.[0]?.finishReason === "STOP", parsed: !!parsed,
        keysMatch: Object.keys(verdict ?? {}).sort().join(",") === ["decision", "reasoning", "strongestArguments", "weaknesses", "perSubtopic", "compromise"].sort().join(","),
        length: fields.map(value => typeof value === "string" ? Array.from(value).length : value === null ? null : "invalid"),
        outcomeLanguage: fields.map(value => typeof value === "string" && outcomeLanguage.test(value)),
        unknownLabelCount: (fields.join("\n").match(/\bS\d+-(?:P[12]L[12]M\d+|J)\b/g) ?? []).filter(label => !labels.has(label)).length,
        ownReferences: ["A", "B"].map(slot => request.context.messages.some(message => message.slot === slot && verdict?.strongestArguments?.[slot]?.includes(message.label))),
        subtopicOrdinals: verdict?.perSubtopic?.map((item: { ordinal?: number }) => typeof item.ordinal === "number" ? item.ordinal : null),
      }));
    }
    return response;
  });
  vi.stubEnv("GEMINI_FALLBACK_MODEL", "");
  try {
    const result = await generateLawyerResult(request);
    expect(result.source).toBe("ai");
    expect(calls).toBe(1);
    return result;
  } finally { spy.mockRestore(); vi.unstubAllEnvs(); }
}

describe.skipIf(!live)("Stage 6A live Gemini reliability smoke", () => {
  it("rewrites the reported short argument within the strict size bound", async () => {
    const original = "Overpopulation and resources are limited";
    const result = await callOnce({ ...job, id: "synthetic-stage6-short", kind: "lawyer", slot: "A", playerText: original });
    expect(result.text).not.toBe(original);
    expect(Array.from(result.text).length).toBeLessThanOrEqual(Math.floor(Array.from(original).length * 1.5));
  }, 15_000);

  it("produces a rich public-evidence verdict with saved summaries", async context => {
    if (quotaBlocked) context.skip();
    const result = await callOnce(job);
    expect(result.verdict).toMatchObject({ topic: job.context.topic, positionA: job.context.players[0].position, positionB: job.context.players[1].position });
    expect(["A", "B", "tie", "inconclusive"]).toContain(result.verdict?.decision);
    expect(result.verdict?.perSubtopic).toHaveLength(2);
    expect(result.verdict?.strongestArguments?.A).toMatch(/S[12]-P1L1M1/);
    expect(result.verdict?.strongestArguments?.B).toMatch(/S[12]-P2L2M1/);
    expect(result.verdict?.weaknesses).toHaveProperty("A");
    expect(result.verdict?.weaknesses).toHaveProperty("B");
    expect(result.verdict).toHaveProperty("compromise");
  }, 15_000);
});
