"use client";

import { useState, type FormEvent } from "react";
import type { ArgumentPhase, DebateSnapshot } from "@/lib/debate-types";
import type { PlayerSlot, RoomSnapshot } from "@/lib/room-types";
import type { ThemeConfig } from "@/themes";
import { PixelButton, PixelIcon, SectionHeading } from "./ui";

export const roundLabels: Record<ArgumentPhase, string> = {
  opening: "Opening statements", rebuttal: "Rebuttals", questions: "Judge questions",
};
const roundPhases: ArgumentPhase[] = ["opening", "rebuttal", "questions"];
const codepointLength = (text: string) => Array.from(text).length;
const limitText = (text: string, max: number) => Array.from(text).slice(0, max).join("");

export function debateAnnouncement(theme: ThemeConfig, debate: DebateSnapshot, speaker: string): string {
  const key = debate.phase === "verdict" ? "complete" : debate.phase === "setup"
    ? debate.topic && !debate.approvedB ? "awaitingApproval" : "setup"
    : debate.phase === "opening" && debate.turnIndex === 0 ? "introduction" : debate.phase;
  return theme.judge.debateDialogue[key].replaceAll("{speaker}", speaker).replaceAll("{topic}", debate.topic ?? "the agreed topic");
}

export function formatTurnTime(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
}

export function DebateProgress({ phase }: { phase: DebateSnapshot["phase"] }) {
  const active = phase === "verdict" ? 3 : roundPhases.indexOf(phase as ArgumentPhase);
  return <ol className="debate-progress" aria-label="Debate rounds">
    {roundPhases.map((item, index) => <li key={item} aria-current={index === active ? "step" : undefined} data-complete={index < active}>
      <span>{index < active ? "✓" : index + 1}</span><div><strong>{roundLabels[item]}</strong><small>{index < active ? "Complete" : index === active ? "In progress" : item === "questions" ? "30 seconds each" : "45 seconds each"}</small></div>
    </li>)}
  </ol>;
}

type SetupActions = {
  onPropose: (topic: string, positionA: string, positionB: string, revision: number) => Promise<boolean>;
  onApprove: (revision: number) => Promise<boolean>;
  onRequestChanges: (message: string, revision: number) => Promise<boolean>;
  onStart: (revision: number) => Promise<boolean>;
};

export function DebateSetup({ room, debate, pending, offline, ...actions }: {
  room: RoomSnapshot; debate: DebateSnapshot; pending: boolean; offline: boolean;
} & SetupActions) {
  // Re-mount the draft only when the saved proposal changes, not on presence or readiness updates.
  const proposalKey = JSON.stringify([room.id, debate.topic, debate.positionA, debate.positionB]);
  return <section className="debate-setup pixel-panel" aria-labelledby="debate-setup-title">
    <SectionHeading eyebrow="BEFORE THE FIRST ROUND"><span id="debate-setup-title">Agree on the question</span></SectionHeading>
    <DebateSetupForm key={proposalKey} room={room} debate={debate} pending={pending} offline={offline} {...actions}/>
  </section>;
}

function DebateSetupForm({ room, debate, pending, offline, onPropose, onApprove, onRequestChanges, onStart }: {
  room: RoomSnapshot; debate: DebateSnapshot; pending: boolean; offline: boolean;
} & SetupActions) {
  const [topic, setTopic] = useState(debate.topic ?? "");
  const [positionA, setPositionA] = useState(debate.positionA ?? "");
  const [positionB, setPositionB] = useState(debate.positionB ?? "");
  const [requesting, setRequesting] = useState(false);
  const [changeMessage, setChangeMessage] = useState("");
  const disabled = pending || offline;
  const agreed = debate.approvedA && debate.approvedB && !debate.changeRequest;
  const canStart = agreed && room.bothReady && debate.revision > 0;
  const changed = topic.trim() !== debate.topic || positionA.trim() !== debate.positionA || positionB.trim() !== debate.positionB;
  const valid = Boolean(topic.trim() && positionA.trim() && positionB.trim());
  async function propose(event: FormEvent) {
    event.preventDefault();
    if (!disabled && valid && changed) await onPropose(topic.trim(), positionA.trim(), positionB.trim(), debate.revision);
  }
  async function request(event: FormEvent) {
    event.preventDefault();
    if (disabled || !changeMessage.trim()) return;
    if (await onRequestChanges(changeMessage.trim(), debate.revision)) { setRequesting(false); setChangeMessage(""); }
  }
  return <div className="debate-setup-body">
    <p className="debate-help">Agree on a topic and opposing positions, then both choose ready. A revised proposal clears both ready confirmations.</p>
    {debate.changeRequest && <div className="proposal-change-note" role="status"><strong>Player B requested changes</strong><p>{debate.changeRequest}</p></div>}
    {room.you === "A" ? <form onSubmit={event => { void propose(event); }} className="proposal-form">
      <label className="debate-field" htmlFor="debate-topic">Debate topic<textarea id="debate-topic" rows={2} required disabled={disabled} value={topic} onChange={event => setTopic(limitText(event.target.value, 240))} placeholder="Should university lectures be recorded?" aria-describedby="topic-limit"/><span id="topic-limit">{codepointLength(topic)} / 240 characters</span></label>
      <div className="proposal-positions">
        <label className="debate-field" htmlFor="position-a">Player A’s position<textarea id="position-a" rows={2} required disabled={disabled} value={positionA} onChange={event => setPositionA(limitText(event.target.value, 160))} placeholder="All lectures should be recorded."/><span>{codepointLength(positionA)} / 160</span></label>
        <label className="debate-field" htmlFor="position-b">Player B’s position<textarea id="position-b" rows={2} required disabled={disabled} value={positionB} onChange={event => setPositionB(limitText(event.target.value, 160))} placeholder="Lecture recording should be optional."/><span>{codepointLength(positionB)} / 160</span></label>
      </div>
      <PixelButton type="submit" tone="cream" disabled={disabled || !valid || !changed}>{pending ? "Saving…" : debate.topic ? "Update proposal" : "Propose topic and positions"}</PixelButton>
    </form> : debate.topic ? <div className="proposal-review">
      <h3>{debate.topic}</h3><PositionSummary debate={debate}/>
      {!agreed && <p className="debate-help">Review both positions. Approve if you agree to debate them, or explain what should change.</p>}
      <div className="debate-actions">
        <PixelButton tone="green" disabled={disabled || agreed || Boolean(debate.changeRequest)} onClick={() => { void onApprove(debate.revision); }}>{agreed ? "Proposal approved" : "Approve topic and positions"}</PixelButton>
        <PixelButton tone="cream" disabled={disabled} aria-expanded={requesting} onClick={() => setRequesting(value => !value)}>{requesting ? "Cancel request" : "Request changes"}</PixelButton>
      </div>
      {requesting && <form className="change-request-form" onSubmit={event => { void request(event); }}>
        <label className="debate-field" htmlFor="proposal-change">What should change?<textarea id="proposal-change" rows={2} autoFocus required disabled={disabled} value={changeMessage} onChange={event => setChangeMessage(limitText(event.target.value, 240))}/><span>{codepointLength(changeMessage)} / 240 characters</span></label>
        <PixelButton type="submit" tone="cream" disabled={disabled || !changeMessage.trim()}>Send change request</PixelButton>
      </form>}
    </div> : <div className="debate-waiting"><PixelIcon name="chat"/><p>Player A is preparing a topic and positions for you to review.</p></div>}
    {debate.topic && <div className="proposal-approval" role="status"><span data-approved={debate.approvedA}>Player A {debate.approvedA ? "approved" : "reviewing"}</span><span data-approved={debate.approvedB}>Player B {debate.approvedB ? "approved" : "reviewing"}</span></div>}
    <div className="debate-start-row">
      <p className="debate-help">{canStart ? "Both players approved the proposal and are ready. Player A can begin." : agreed ? "The proposal is approved. Both players must choose ready before starting." : "The debate stays in setup until both players approve the same proposal and are ready."}</p>
      {room.you === "A" && <PixelButton tone="orange" disabled={disabled || !canStart || changed} onClick={() => { void onStart(debate.revision); }}>Start debate<PixelIcon name="arrow"/></PixelButton>}
    </div>
  </div>;
}

export function PositionSummary({ debate }: { debate: DebateSnapshot }) {
  return <dl className="debate-positions"><div><dt>Player A’s position</dt><dd>{debate.positionA}</dd></div><div><dt>Player B’s position</dt><dd>{debate.positionB}</dd></div></dl>;
}

export function DebateTurnPanel({ room, debate, remainingSeconds, pending, offline, onSubmit }: {
  room: RoomSnapshot; debate: DebateSnapshot; remainingSeconds: number; pending: boolean; offline: boolean;
  onSubmit: (text: string, revision: number, turnIndex: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const active = room.you === debate.activeSlot;
  const expired = remainingSeconds <= 0;
  const busy = pending || sending;
  const disabled = !active || expired || offline || busy;
  const activeName = room.players.find(player => player.slot === debate.activeSlot)?.name ?? `Player ${debate.activeSlot ?? "—"}`;
  const phase = debate.phase as ArgumentPhase;
  const question = debate.questions.find(item => item.slot === debate.activeSlot);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || !draft.trim() || debate.turnIndex === null) return;
    setSending(true);
    try { if (await onSubmit(draft.trim(), debate.revision, debate.turnIndex)) setDraft(""); }
    finally { setSending(false); }
  }
  return <section className="debate-turn-panel pixel-panel" aria-labelledby="debate-turn-title">
    <SectionHeading eyebrow={`ROUND ${roundPhases.indexOf(phase) + 1} · ${roundLabels[phase].toUpperCase()}`} aside={<div className="debate-deadline" data-urgent={remainingSeconds <= 10} role="timer" aria-label={`${remainingSeconds} seconds remaining`}><PixelIcon name="clock"/>{formatTurnTime(remainingSeconds)}</div>}><span id="debate-turn-title">{expired ? "Time is up" : active ? "Your turn to speak" : `${activeName} has the floor`}</span></SectionHeading>
    <div className="debate-turn-body">
      {phase === "questions" && <div className="debate-question"><span className="eyebrow">SCRIPTED PRACTICE QUESTION · NO AI</span><p>{question?.text ?? "The question is loading from the room."}</p></div>}
      <p className="debate-turn-state" role="status">{offline ? "Connection lost. Your draft stays in this tab, but the shared turn clock keeps running." : expired ? "The deadline has passed. Waiting for the server to confirm the next turn. Unsent text is not submitted automatically." : active ? phase === "opening" ? "Write your opening privately. Both statements are revealed after this round ends." : phase === "rebuttal" ? "Respond to the other player’s opening. The earlier statements are available below." : "Answer the practice question with your own reasoning." : `Waiting for ${activeName}. Your writing turn follows the shared round order.`}</p>
      {active && <form onSubmit={event => { void submit(event); }}>
        <label className="debate-field" htmlFor="debate-argument">{phase === "opening" ? "Your opening statement" : phase === "rebuttal" ? "Your rebuttal" : "Your answer"}<textarea id="debate-argument" rows={7} value={draft} disabled={expired || busy} onChange={event => setDraft(limitText(event.target.value, 2000))} placeholder="Make your point clearly and respectfully…" aria-describedby="argument-note argument-count"/></label>
        <div className="debate-composer-footer"><p id="argument-count">{codepointLength(draft)} / 2,000 characters</p><PixelButton type="submit" tone="orange" disabled={disabled || !draft.trim()}>{busy ? "Submitting…" : expired ? "Turn ended" : "Submit argument"}<PixelIcon name="arrow"/></PixelButton></div>
        <p className="debate-help" id="argument-note">One submission per turn. Submitting ends your turn immediately. Unsent drafts are discarded when the turn changes.</p>
      </form>}
      {!active && !expired && <div className="debate-waiting"><PixelIcon name="clock"/><p>{debate.activeSlot === "A" ? "You’ll write after Player A finishes or their time ends." : "You’ve had your turn in this round. The next round begins when Player B finishes or their time ends."}</p></div>}
    </div>
  </section>;
}

export function DebateHistory({ debate, players, you }: {
  debate: DebateSnapshot; players: RoomSnapshot["players"]; you: PlayerSlot;
}) {
  // The database withholds peer openings; this also keeps the presentation private
  // while a stale or optimistic opening-round snapshot is being reconciled.
  const visible = debate.history.filter(entry => !(debate.phase === "opening" && entry.phase === "opening" && entry.slot !== you));
  return <section className="debate-history pixel-panel" aria-labelledby="debate-history-title">
    <SectionHeading eyebrow="THE SHARED RECORD"><span id="debate-history-title">Debate history</span></SectionHeading>
    <div className="debate-history-body" tabIndex={visible.length ? 0 : undefined}>
      {debate.phase === "opening" && <p className="debate-history-notice">Opening statements stay private until both players submit or their turns expire. Only your own receipt is shown here.</p>}
      {visible.length === 0 ? <p className="debate-help">No visible submissions yet. Completed turns will appear here.</p> : roundPhases.map(phase => {
        const entries = visible.filter(entry => entry.phase === phase).sort((a, b) => a.turnIndex - b.turnIndex);
        return entries.length ? <section className="debate-history-round" aria-label={roundLabels[phase]} key={phase}><h3>{roundLabels[phase]}</h3><ol>{entries.map(entry => <li key={entry.id} className="debate-record" data-expired={entry.status === "expired"}>
          <div className="debate-record-meta"><strong>{players.find(player => player.slot === entry.slot)?.name ?? `Player ${entry.slot}`}</strong><span>Player {entry.slot}{entry.slot === you ? " · You" : ""}</span><span>{entry.status === "expired" ? "Time expired" : debate.phase === "opening" ? "Private receipt" : "Submitted"}</span></div>
          <p>{entry.status === "expired" ? "No argument was submitted before the deadline." : entry.text ?? "Submission recorded."}</p>
        </li>)}</ol></section> : null;
      })}
    </div>
  </section>;
}

export function DebateComplete({ debate }: { debate: DebateSnapshot }) {
  return <section className="debate-complete pixel-panel" aria-labelledby="debate-complete-title"><PixelIcon name="gavel"/><div><p className="eyebrow">THREE ROUNDS COMPLETE</p><h2 id="debate-complete-title">The debate record is complete</h2><p>Both sides have had their turns. Review the topic, positions and submissions below.</p><strong>Verdict placeholder — no winner has been selected.</strong><p className="debate-help">AI judging and scoring are not connected in Stage 3. These scripted proceedings do not evaluate either player.</p></div><div className="debate-complete-count"><strong>{debate.history.filter(entry => entry.status === "submitted").length}</strong><span>submitted turns</span></div></section>;
}
