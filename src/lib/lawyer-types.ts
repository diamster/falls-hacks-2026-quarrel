import type { PlayerSlot } from "./room-types";

export type LawyerPhase = "setup" | "planning" | "subtopic" | "summary" | "jury" | "complete";
export type LawyerSource = "ai" | "demo" | "fallback";
export type LawyerJobKind = "plan" | "lawyer" | "consult" | "summary" | "jury";
export interface PlannedSubtopic { ordinal: number; question: string; secondsPerPlayer: number }
export interface LawyerSubtopic extends PlannedSubtopic {
  openerSlot: PlayerSlot;
  source: LawyerSource;
  status: "pending" | "active" | "summarizing" | "done";
  remainingMsA: number;
  remainingMsB: number;
}
export interface JuryVerdict {
  outcome: "A" | "B" | "split";
  reasoning: string;
  perSubtopic: { ordinal: number; text: string }[];
  /** Optional only for historical Stage 5 verdicts; Stage 6 validates these. */
  decision?: "A" | "B" | "tie" | "inconclusive";
  topic?: string;
  positionA?: string;
  positionB?: string;
  strongestArguments?: { A: string; B: string };
  weaknesses?: { A: string[]; B: string[] };
  compromise?: string | null;
  /** Copied from canonical saved summaries, never invented by the jury. */
  subtopicSummaries?: { ordinal: number; text: string; source: LawyerSource }[];
}
/** Public presentations only. rawText is supplied only to the owning member. */
export interface LawyerPublicMessage {
  /** Short-lived, participant-bound proof of this saved public speech text. */
  speechToken?: string;
  speechBlocked?: boolean;
  id: string;
  label: string;
  kind: "argument" | "judge_summary" | "announcement" | "jury_verdict";
  subtopic: number | null;
  slot: PlayerSlot | null;
  rawText?: string | null;
  text: string | null;
  source: LawyerSource;
  status: "pending" | "complete";
  createdAt: string;
  completedAt: string | null;
}
/** Never included in opponent snapshots or public AI context. */
export interface LawyerConsultation {
  id: string;
  subtopic: number;
  playerText: string;
  text: string | null;
  source: LawyerSource;
  status: "pending" | "complete";
  createdAt: string;
}
export interface LawyerDebateSnapshot {
  format: "lawyer";
  debateId?: string;
  reliabilityVersion?: number;
  acknowledgements?: { A: string | null; B: string | null };
  rematch?: { A: string | null; B: string | null; nextDebateId: string | null };
  juryStatus?: {
    state: "pending" | "processing" | "retry_wait" | "retry_required" | "complete";
    attempts: number;
    retryAt: string | null;
    errorCode: string | null;
  } | null;
  phase: LawyerPhase;
  topic: string | null;
  totalSeconds: number;
  revision: number;
  positionA: string | null;
  positionB: string | null;
  confirmedA: boolean;
  confirmedB: boolean;
  planReady: boolean;
  regenerationUsed: boolean;
  planGeneration: number;
  subtopics: LawyerSubtopic[];
  currentSubtopic: number | null;
  state: "composing" | "lawyering" | "consulting" | null;
  activeSlot: PlayerSlot | null;
  turnDeadline: string | null;
  remainingMsA: number;
  remainingMsB: number;
  serverNow: string;
  startedAt: string | null;
  history: LawyerPublicMessage[];
  consultations: LawyerConsultation[];
  verdict: JuryVerdict | null;
  ownMessageCount: number;
  ownConsultationCount: number;
  needsWork: boolean;
}
export interface LawyerContext {
  themeId: string;
  topic: string;
  totalSeconds: number;
  players: { slot: PlayerSlot; name: string; position: string }[];
  subtopics: PlannedSubtopic[];
  currentSubtopic: number | null;
  messages: LawyerPublicMessage[];
  /** Only a consultation job can receive its initiator's private history. */
  consultations?: LawyerConsultation[];
}
export interface LawyerJob {
  id: string;
  /** Per-attempt lease identity supplied by the database, never by a player. */
  claimToken?: string;
  debateId?: string;
  kind: LawyerJobKind;
  mode: "ai" | "demo";
  slot: PlayerSlot | null;
  playerText: string | null;
  context: LawyerContext;
}
export interface LawyerResult {
  kind: LawyerJobKind;
  source: LawyerSource;
  text: string;
  subtopics?: PlannedSubtopic[];
  verdict?: JuryVerdict;
}

/** Local display estimate only; PostgreSQL owns clock charging and expiry. */
export function lawyerClockSeconds(debate: LawyerDebateSnapshot, slot: PlayerSlot, serverTimeMs: number): number {
  const stored = slot === "A" ? debate.remainingMsA : debate.remainingMsB;
  const remaining = debate.state === "composing" && debate.activeSlot === slot && debate.turnDeadline
    ? Math.min(stored, Date.parse(debate.turnDeadline) - serverTimeMs) : stored;
  return Number.isFinite(remaining) ? Math.max(0, Math.ceil(remaining / 1000)) : 0;
}

/** Completed, participant-authorized archive; no raw drafts or consultations. */
export interface LawyerResultRecord {
  id: string;
  roomId: string;
  topic: string;
  themeId: string;
  totalSeconds: number;
  startedAt: string;
  completedAt: string;
  verdict: JuryVerdict;
  acknowledgements: { A: string | null; B: string | null };
  rematch: { A: string | null; B: string | null; nextDebateId: string | null };
}
export interface LawyerResultDetail extends LawyerResultRecord {
  positions: { A: string; B: string };
  players: { slot: PlayerSlot; name: string }[];
  history: LawyerPublicMessage[];
  subtopics: (PlannedSubtopic & { summary: string | null })[];
}
