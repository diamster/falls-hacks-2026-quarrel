import type { PlayerSlot } from "./room-types";
import type { DebateSnapshot } from "./debate-types";

export type JudgeSource = "ai" | "demo" | "fallback" | "scripted";
export type JudgeReaction = "speaking" | "questioning" | "surprised" | "listening";
export interface JudgeMessage {
  id: string;
  kind: "introduction" | "transition" | "chat" | "questions";
  slot: PlayerSlot | null;
  turnIndex: number | null;
  playerText: string | null;
  text: string | null;
  status: "pending" | "complete";
  source: JudgeSource;
  reaction: JudgeReaction;
  createdAt: string;
  completedAt: string | null;
}
export interface JudgeSnapshot {
  enabled: boolean;
  mode: "ai" | "demo";
  messages: JudgeMessage[];
  pendingRequestId: string | null;
  messagesUsed: number;
  maxMessagesPerTurn: number;
  needsWork: boolean;
  preparingQuestions: boolean;
}
/** Obtained only through the authenticated server worker; never browser input. */
export interface JudgeContext {
  topic: string;
  phase: DebateSnapshot["phase"];
  themeId: string;
  players: { slot: PlayerSlot; name: string; position: string }[];
  arguments: DebateSnapshot["history"];
  questions: DebateSnapshot["questions"];
  conversation: JudgeMessage[];
}
export interface JudgeJob {
  id: string;
  mode?: "ai" | "demo";
  kind: "chat" | "questions";
  slot: PlayerSlot | null;
  turnIndex: number | null;
  playerText: string | null;
  context: JudgeContext;
}
export interface JudgeResult {
  text: string;
  reaction: JudgeReaction;
  source: "ai" | "demo" | "fallback";
  questions?: { slot: PlayerSlot; text: string; source: "ai" | "demo" | "fallback" }[];
}
