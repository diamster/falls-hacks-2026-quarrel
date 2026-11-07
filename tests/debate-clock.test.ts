import { describe, expect, it } from "vitest";
import { remainingTurnSeconds } from "@/lib/debate-types";

describe("server-anchored debate countdown", () => {
  const clock = { serverTimeMs: Date.parse("2026-11-07T18:00:00Z"), receivedAt: 1000 };
  const deadline = "2026-11-07T18:00:45Z";
  it("uses server time and monotonic elapsed time, with whole seconds remaining", () => {
    expect(remainingTurnSeconds(deadline, clock, 1000)).toBe(45);
    expect(remainingTurnSeconds(deadline, clock, 2400)).toBe(44);
    expect(remainingTurnSeconds(deadline, clock, 45_999)).toBe(1);
    expect(remainingTurnSeconds(deadline, clock, 46_000)).toBe(0);
    expect(remainingTurnSeconds(deadline, clock, 86_000)).toBe(0);
  });
  it("does not invent time without a verified clock or valid deadline", () => {
    expect(remainingTurnSeconds(deadline, null, 1000)).toBe(0);
    expect(remainingTurnSeconds(null, clock, 1000)).toBe(0);
    expect(remainingTurnSeconds("invalid", clock, 1000)).toBe(0);
    expect(remainingTurnSeconds(deadline, clock, 0)).toBe(45);
  });
});
