"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { RoomSnapshot } from "@/lib/room-types";
import type { JudgeMessage, JudgeSource } from "@/lib/judge-types";
import type { CharacterState } from "@/lib/preview";
import type { ThemeConfig } from "@/themes";
import { PixelButton, PixelIcon, SectionHeading } from "./ui";

export const judgeSourceLabels: Record<JudgeSource, string> = {
  ai: "AI response", demo: "Demo response", fallback: "Fallback response", scripted: "Round announcement",
};
const questionSourceLabels = { ai: "AI CLARIFICATION", demo: "DEMO CLARIFICATION", fallback: "FALLBACK CLARIFICATION", placeholder: "SCRIPTED CLARIFICATION" };

/** The shared record is authoritative; the short speaking pose is presentation only. */
export function useJudgePresentation(room: RoomSnapshot | null, dialogue: string, dialogueKey: string, pending = false) {
  // A chat can finish after a newer round announcement was inserted. Select by
  // completion time so that saved late replies still receive their speech bubble.
  const latest = room?.judge?.messages.filter(message => message.status === "complete" && message.text)
    .sort((a, b) => Date.parse(a.completedAt ?? a.createdAt) - Date.parse(b.completedAt ?? b.createdAt)).at(-1);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  useEffect(() => {
    if (!latest) { setSpeakingId(null); return; }
    setSpeakingId(latest.id);
    const timer = window.setTimeout(() => setSpeakingId(null), 8000);
    return () => window.clearTimeout(timer);
  }, [latest?.id, latest?.completedAt]);
  if (!room?.judge?.enabled) return { dialogue, dialogueKey, state: undefined, label: undefined };
  const thinking = pending || Boolean(room.judge.pendingRequestId) || room.judge.preparingQuestions;
  if (thinking) return {
    dialogue: room.judge.preparingQuestions ? "I’m preparing a clarification question for each side. Your answer clock starts when the questions are ready." : "I’m considering your question and the discussion so far…",
    dialogueKey: `thinking-${room.judge.pendingRequestId ?? "questions"}`, state: "thinking" as CharacterState,
    label: room.judge.mode === "demo" ? "DEMO · THINKING" : "THINKING",
  };
  if (latest && speakingId === latest.id) return {
    dialogue: latest.text!, dialogueKey: `judge-${latest.id}`, state: latest.reaction as CharacterState,
    label: judgeSourceLabels[latest.source].toUpperCase(),
  };
  const question = room.debate?.phase === "questions" ? room.debate.questions.find(item => item.slot === room.debate?.activeSlot) : undefined;
  return {
    dialogue: question?.text ?? dialogue, dialogueKey: question ? `question-${question.id}` : dialogueKey,
    state: (room.debate?.phase === "verdict" ? "idle" : question ? "questioning" : "listening") as CharacterState,
    label: question ? questionSourceLabels[question.source] : room.debate?.phase === "verdict" ? "DEBATE RECORD" : "LISTENING TO BOTH SIDES",
  };
}

export function JudgeComposer({ room, theme, pending, blocked = false, offline, remainingSeconds, onAsk }: {
  room: RoomSnapshot; theme: ThemeConfig; pending: boolean; blocked?: boolean; offline: boolean; remainingSeconds: number;
  onAsk: (text: string, revision: number, turnIndex: number, requestKey: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const request = useRef<{ text: string; key: string } | null>(null);
  const debate = room.debate;
  const judge = room.judge;
  const active = Boolean(debate && debate.activeSlot === room.you && debate.turnIndex !== null && debate.turnDeadline && debate.phase !== "setup" && debate.phase !== "verdict");
  const remainingMessages = Math.max(0, (judge?.maxMessagesPerTurn ?? 2) - (judge?.messagesUsed ?? 0));
  const thinking = sending || pending || Boolean(judge?.pendingRequestId);
  const disabled = !judge?.enabled || !active || remainingSeconds <= 0 || remainingMessages === 0 || offline || thinking || blocked || judge.preparingQuestions;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || inFlight.current || !draft.trim() || !debate || debate.turnIndex === null) return;
    const text = draft.trim();
    if (!request.current || request.current.text !== text) request.current = { text, key: crypto.randomUUID() };
    inFlight.current = true;
    setSending(true);
    try {
      if (await onAsk(text, debate.revision, debate.turnIndex, request.current.key)) { setDraft(""); request.current = null; }
    } finally { inFlight.current = false; setSending(false); }
  }
  return <section className="judge-composer pixel-panel" aria-labelledby="judge-composer-title">
    <SectionHeading eyebrow="A SEPARATE CONVERSATION"><span id="judge-composer-title">Ask {theme.judge.displayName}</span></SectionHeading>
    <div className="judge-composer-body">
      <p className="judge-privacy-note">Both players can see messages to the judge. Asking does not submit your argument or end your turn.</p>
      {debate?.phase === "opening" && <p className="debate-help">Your official opening stays private. Share only what you want both players to read here.</p>}
      <form onSubmit={event => { void submit(event); }}>
        <label className="debate-field" htmlFor="judge-message">Message to the judge<textarea id="judge-message" rows={3} value={draft} disabled={disabled} onChange={event => setDraft(Array.from(event.target.value).slice(0, 600).join(""))} aria-describedby="judge-message-note judge-message-count" placeholder="Ask a question, explain a point, or request clarification…"/></label>
        <div className="debate-composer-footer"><p id="judge-message-count">{Array.from(draft).length} / 600 characters · {remainingMessages} of {judge?.maxMessagesPerTurn ?? 2} messages left</p><PixelButton tone="green" type="submit" disabled={disabled || !draft.trim()}>{thinking ? "Judge is thinking…" : "Ask Judge"}<PixelIcon name="chat"/></PixelButton></div>
      </form>
      <p className="debate-help" id="judge-message-note" role="status">{offline ? "Reconnect to ask the judge. The turn clock keeps running." : judge?.preparingQuestions ? "Clarification questions are being prepared for both players." : thinking ? "The judge is responding. Your official argument and turn clock remain separate." : !active ? "You can ask the judge during your own turn." : remainingSeconds <= 0 ? "Your turn has expired. Wait for the next turn." : remainingMessages === 0 ? "You’ve used your judge messages for this turn. You can still submit your official argument." : "Ask about either side’s reasoning. Leave a few seconds between messages; your turn clock keeps running."}</p>
      {judge?.mode === "demo" && <p className="judge-mode-note">Demo judge: responses follow local rules rather than a live AI model.</p>}
    </div>
  </section>;
}

export function JudgeConversation({ room, theme }: { room: RoomSnapshot; theme: ThemeConfig }) {
  return <section className="judge-conversation pixel-panel" aria-labelledby="judge-conversation-title">
    <SectionHeading eyebrow="SHARED WITH BOTH PLAYERS"><span id="judge-conversation-title">Conversation with {theme.judge.displayName}</span></SectionHeading>
    <div className="judge-conversation-body" role="log" aria-label="Judge conversation" aria-live="polite" tabIndex={room.judge?.messages.length ? 0 : undefined}>
      {!room.judge?.messages.length ? <p className="debate-help">The judge’s announcements and your conversations will appear here.</p> : <ol>{room.judge.messages.map(message => <JudgeConversationEntry key={message.id} room={room} theme={theme} message={message}/>)}</ol>}
    </div>
  </section>;
}

function JudgeConversationEntry({ room, theme, message }: { room: RoomSnapshot; theme: ThemeConfig; message: JudgeMessage }) {
  const player = room.players.find(item => item.slot === message.slot);
  return <li className="judge-conversation-entry" data-status={message.status}>
    {message.playerText && <div className="judge-player-message"><div className="judge-message-meta"><strong>{player?.name ?? `Player ${message.slot}`}</strong><span>Player {message.slot}{message.slot === room.you ? " · You" : ""} · Asked the judge</span></div><p>{message.playerText}</p></div>}
    <div className="judge-reply-message"><div className="judge-message-meta"><strong>{theme.judge.displayName}</strong><span>{message.status === "pending" ? "Thinking…" : judgeSourceLabels[message.source]}</span></div><p>{message.status === "pending" ? "Considering the question…" : message.text}</p>{message.source === "fallback" && message.status === "complete" && <small>The live response was unavailable. A safe fallback kept the discussion moving.</small>}</div>
  </li>;
}

export function PreparingJudgeQuestions() {
  return <section className="judge-preparing pixel-panel" role="status"><PixelIcon name="chat"/><div><h2>The judge is preparing your questions</h2><p>Both players will receive one question based on the discussion. Each 30-second answer turn starts after the questions are saved.</p></div></section>;
}
