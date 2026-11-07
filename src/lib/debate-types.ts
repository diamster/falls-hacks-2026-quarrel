import type { PlayerSlot } from "./room-types";

export type DebatePhase = "setup" | "opening" | "rebuttal" | "questions" | "verdict";
export type ArgumentPhase = Exclude<DebatePhase, "setup" | "verdict">;

export interface DebateEntry {
  id: string;
  slot: PlayerSlot;
  phase: ArgumentPhase;
  turnIndex: number;
  text: string | null;
  submittedAt: string | null;
  status: "submitted" | "expired";
}

/** Saved once before either timed answer begins. */
export interface DebateQuestion {
  slot: PlayerSlot;
  id: string;
  text: string;
  source: "placeholder" | "ai" | "demo" | "fallback";
}

/** A member-filtered database snapshot, never a browser-authorized transition. */
export interface DebateSnapshot {
  phase: DebatePhase;
  topic: string | null;
  positionA: string | null;
  positionB: string | null;
  revision: number;
  approvedA: boolean;
  approvedB: boolean;
  changeRequest: string | null;
  activeSlot: PlayerSlot | null;
  turnIndex: number | null;
  turnDeadline: string | null;
  serverNow: string;
  startedAt: string | null;
  history: DebateEntry[];
  questions: DebateQuestion[];
}

export interface ServerClock {
  serverTimeMs: number;
  receivedAt: number;
}

/** Use monotonic elapsed time, so changing a device's wall clock cannot extend a turn. */
export function remainingTurnSeconds(deadline: string | null | undefined, clock: ServerClock | null, monotonicNow: number): number {
  if (!deadline || !clock) return 0;
  const remaining = Date.parse(deadline) - clock.serverTimeMs - Math.max(0, monotonicNow - clock.receivedAt);
  return Number.isFinite(remaining) ? Math.max(0, Math.ceil(remaining / 1000)) : 0;
}
