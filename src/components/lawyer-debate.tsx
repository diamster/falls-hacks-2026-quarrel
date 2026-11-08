"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LawyerDebateSnapshot, LawyerPublicMessage } from "@/lib/lawyer-types";
import type { PlayerSlot, RoomSnapshot } from "@/lib/room-types";
import type { ThemeConfig } from "@/themes";
import { DebateArena } from "./debate-arena";
import { DebateHistoryPanel } from "./debate-history-panel";
import { formatTurnTime } from "./debate-ui";
import { PixelButton, PixelIcon, SectionHeading } from "./ui";
import styles from "./lawyer-debate.module.css";
import { SavedVerdict } from "./lawyer-results";
import { SpeechMessageControls, SpeechToolbar, useCharacterSpeech } from "./character-speech";

const length = (text: string) => Array.from(text).length;
const trimTo = (text: string, maximum: number) => Array.from(text).slice(0, maximum).join("");
const slots: PlayerSlot[] = ["A", "B"];

type SetupActions = {
  onPropose: (topic: string, totalSeconds: number, revision: number) => Promise<boolean>;
  onPosition: (text: string, revision: number) => Promise<boolean>;
  onPlan: (regenerate: boolean) => Promise<boolean>;
  onStart: (revision: number, planGeneration: number) => Promise<boolean>;
};

export function LawyerSetup({ room, pending, offline, ...actions }: { room: RoomSnapshot; pending: boolean; offline: boolean } & SetupActions) {
  const [topicEdited, setTopicEdited] = useState(false);
  const [positionEdited, setPositionEdited] = useState(false);
  const debate = room.lawyer;
  if (!debate || debate.startedAt) return null;
  const busy = pending || offline || (debate.phase === "planning" && !debate.planReady);
  const ownPosition = room.you === "A" ? debate.positionA : debate.positionB;
  const ownConfirmed = room.you === "A" ? debate.confirmedA : debate.confirmedB;
  const readyToPlan = Boolean(debate.topic && debate.confirmedA && debate.confirmedB && room.bothReady);
  const connected = slots.every(slot => room.players.some(player => player.slot === slot && player.connected));
  const canStart = readyToPlan && debate.planReady && connected && !topicEdited && !positionEdited;
  return <section className={`pixel-panel ${styles.setup}`} aria-labelledby="lawyer-setup-title">
    <SectionHeading eyebrow="YOUR TOPIC. TWO INDEPENDENT POSITIONS."><span id="lawyer-setup-title">Prepare your debate</span></SectionHeading>
    <div className={styles.setupBody}>
      {room.you === "A" ? <TopicForm key={`${room.id}:${debate.topic}:${debate.totalSeconds}`} debate={debate} disabled={busy} onPropose={actions.onPropose} onEdited={setTopicEdited}/> : <div className={styles.topicReview}><p className="eyebrow">THE HOST’S QUESTION</p><h3>{debate.topic ?? "Waiting for the host to propose a topic"}</h3>{debate.topic && <p>{debate.totalSeconds / 60} minutes of writing time per player. AI processing uses neither clock.</p>}</div>}
      {debate.topic ? <>
        <PositionForm key={`${room.id}:${ownPosition ?? ""}`} position={ownPosition} confirmed={ownConfirmed} revision={debate.revision} disabled={busy} onPosition={actions.onPosition} onEdited={setPositionEdited}/>
        <div className={styles.positions} aria-label="Confirmed positions">{slots.map(slot => <div key={slot}><p className="eyebrow">{room.players.find(player => player.slot === slot)?.name ?? `Player ${slot}`} · PLAYER {slot}{slot === room.you ? " · YOU" : ""}</p><p data-readable-text>{(slot === "A" ? debate.positionA : debate.positionB) ?? "Position not submitted yet."}</p><span>{(slot === "A" ? debate.confirmedA : debate.confirmedB) ? "Position confirmed" : "Waiting for confirmation"}</span></div>)}</div>
      </> : <p className={styles.help}>The topic comes first. Each player will then write their own position.</p>}
      <div className={styles.plan} aria-live="polite">
        <h3>The debate plan</h3>
        {debate.phase === "planning" && !debate.planReady ? <p role="status">The planner is dividing your topic into focused questions. Both clocks are paused.</p> : debate.planReady ? <ol>{debate.subtopics.map(item => <li key={item.ordinal}><span>{item.ordinal}</span><div><strong data-readable-text>{item.question}</strong><small>{formatTurnTime(item.secondsPerPlayer)} per player · {item.openerSlot} opens{item.source !== "ai" ? ` · ${item.source === "demo" ? "Demo plan" : "Fallback plan"}` : ""}</small></div></li>)}</ol> : <p>{readyToPlan ? "Both positions are confirmed and both players are ready. Preparing your shared plan…" : "Submit your own position and choose Ready. The planner starts once both players have confirmed their positions and readiness."}</p>}
        {room.you === "A" && debate.planReady && <PixelButton tone="cream" disabled={busy || debate.regenerationUsed || !readyToPlan || topicEdited || positionEdited} onClick={() => { void actions.onPlan(true); }}>{debate.regenerationUsed ? "Plan regeneration used" : "Regenerate plan once"}</PixelButton>}
      </div>
      <div className={styles.startRow}><p className={styles.help}>{canStart ? "Both players are ready. Review the plan, then the host can start." : debate.planReady && !connected ? "Both players must be connected before starting." : "The debate begins only when both players are ready and the host starts it."}</p>{room.you === "A" && <PixelButton tone="orange" disabled={busy || !canStart} onClick={() => { void actions.onStart(debate.revision, debate.planGeneration); }}>Start debate<PixelIcon name="arrow"/></PixelButton>}</div>
    </div>
  </section>;
}

function TopicForm({ debate, disabled, onPropose, onEdited }: { debate: LawyerDebateSnapshot; disabled: boolean; onPropose: SetupActions["onPropose"]; onEdited: (edited: boolean) => void }) {
  const [topic, setTopic] = useState(debate.topic ?? "");
  const [totalSeconds, setTotalSeconds] = useState(debate.totalSeconds);
  const changed = topic.trim() !== debate.topic || totalSeconds !== debate.totalSeconds;
  useEffect(() => { onEdited(Boolean(debate.topic && changed)); }, [changed, debate.topic, onEdited]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || !topic.trim() || !changed) return;
    await onPropose(topic.trim(), totalSeconds, debate.revision);
  }
  return <form className={styles.form} onSubmit={event => { void submit(event); }}>
    <label className="debate-field" htmlFor="lawyer-topic">Debate topic<textarea id="lawyer-topic" value={topic} rows={2} disabled={disabled} required onChange={event => setTopic(trimTo(event.target.value, 240))} placeholder="Should university lectures be mandatory?"/><span>{length(topic)} / 240 characters</span></label>
    <label className={styles.duration} htmlFor="lawyer-duration">Writing time per player<select id="lawyer-duration" value={totalSeconds} disabled={disabled} onChange={event => setTotalSeconds(Number(event.target.value))}>{[120, 240, 360, 600].map(seconds => <option value={seconds} key={seconds}>{seconds / 60} minutes each</option>)}</select><small>Split across all subtopics. AI processing time is additional and never charged to either player.</small></label>
    <PixelButton tone="cream" type="submit" disabled={disabled || !topic.trim() || !changed}>{debate.topic ? "Update topic and time" : "Save topic and time"}</PixelButton>
  </form>;
}

function PositionForm({ position, confirmed, revision, disabled, onPosition, onEdited }: { position: string | null; confirmed: boolean; revision: number; disabled: boolean; onPosition: SetupActions["onPosition"]; onEdited: (edited: boolean) => void }) {
  const [text, setText] = useState(position ?? "");
  const changed = text.trim() !== position || !confirmed;
  useEffect(() => { onEdited(Boolean(position && changed)); }, [changed, position, onEdited]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!disabled && text.trim() && changed) await onPosition(text.trim(), revision);
  }
  return <form className={styles.form} onSubmit={event => { void submit(event); }}>
    <label className="debate-field" htmlFor="your-position">Your position<textarea id="your-position" value={text} rows={3} disabled={disabled} required onChange={event => setText(trimTo(event.target.value, 600))} placeholder="Write the position you want to argue, in your own words."/><span>{length(text)} / 600 characters · visible to both players after you confirm</span></label>
    <PixelButton type="submit" tone="green" disabled={disabled || !text.trim() || !changed}>{confirmed ? "Update my position" : "Confirm my position"}</PixelButton>
    <p className={styles.help}>Only you can edit your position. Changes require both players to confirm readiness again.</p>
  </form>;
}

export type LawyerMessageAction = (text: string, revision: number, subtopic: number, requestKey: string) => Promise<boolean>;
export interface LawyerDebateViewProps {
  room: RoomSnapshot;
  theme: ThemeConfig;
  clocks: Record<PlayerSlot, number>;
  pending: boolean;
  offline: boolean;
  paused?: boolean;
  onSend: LawyerMessageAction;
  onConsult: LawyerMessageAction;
  onAcknowledge?: (debateId: string) => Promise<unknown>;
  onRematch?: (debateId: string) => Promise<boolean>;
  onRetryJury?: (debateId: string) => Promise<boolean>;
  /** Controlled history drawer (the game shell puts its toggle next to the menu); uncontrolled when omitted. */
  historyOpen?: boolean;
  onHistoryOpenChange?: (open: boolean) => void;
}

export function LawyerDebateView({ room, theme, clocks, pending, offline, paused = false, onSend, onConsult, onAcknowledge, onRematch, onRetryJury, historyOpen, onHistoryOpenChange }: LawyerDebateViewProps) {
  const speech = useCharacterSpeech();
  const [historyFilter, setHistoryFilter] = useState("all");
  const [ownHistoryOpen, setOwnHistoryOpen] = useState(false);
  const debate = room.lawyer;
  if (!debate) return null;
  const drawerOpen = historyOpen ?? ownHistoryOpen;
  const setDrawerOpen = onHistoryOpenChange ?? setOwnHistoryOpen;
  const speaking = speech.status === "speaking" && speech.active?.debateId === debate.debateId && speech.active?.roomId === room.id && speech.active?.themeId === theme.id ? speech.active : null;
  const judgeSpeaking = speaking?.role === "judge";
  const current = debate.subtopics.find(item => item.ordinal === debate.currentSubtopic);
  const complete = debate.phase === "complete";
  const playerName = (slot: PlayerSlot) => room.players.find(player => player.slot === slot)?.name ?? `Player ${slot}`;
  const messages = [...debate.history].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.label.localeCompare(b.label));
  const last = messages.at(-1);
  const judgeMessage = messages.filter(item => item.status === "complete" && (item.kind === "judge_summary" || item.kind === "announcement")).at(-1);
  const currentSummary = messages.find(item => item.kind === "judge_summary" && item.subtopic === debate.currentSubtopic && item.status === "complete");
  const workingSlot = debate.state === "lawyering" ? messages.findLast(item => item.kind === "argument" && item.status === "pending")?.slot
    : debate.state === "consulting" && debate.consultations.some(item => item.status === "pending") ? room.you : null;
  const thinking = (debate.phase === "summary" && !currentSummary) || debate.phase === "jury";
  const activeName = debate.activeSlot ? playerName(debate.activeSlot) : null;
  const dialogue = judgeSpeaking ? speaking.text : debate.phase === "jury" ? "The jury is reviewing the public debate and the judge’s summaries."
    : complete ? "The jury’s decision is ready."
    : debate.phase === "summary" ? currentSummary?.text ?? "I’m summarizing both sides before we continue."
    : debate.state === "lawyering" && workingSlot ? `${theme.lawyers[workingSlot].displayName} is presenting ${playerName(workingSlot)}’s point. Both clocks are paused.`
    : debate.state === "consulting" ? "A private consultation is under way. Both clocks are paused."
    : debate.state === "composing" && activeName ? `${activeName}, the floor is yours.`
    : "Both sides will be heard in turn.";
  const latestKey = messages.map(item => `${item.id}:${item.status}:${item.completedAt ?? ""}`).join("|") || null;
  const speakingSlot = speaking?.role === "lawyerA" ? "A" : speaking?.role === "lawyerB" ? "B" : null;
  const counsel = {
    lawyers: Object.fromEntries(slots.map(slot => [slot, { assetId: theme.lawyers[slot].assetId, label: theme.lawyers[slot].description, name: theme.lawyers[slot].displayName, role: `Lawyer ${slot}`, working: workingSlot === slot, status: debate.state === "consulting" ? "Private consultation…" : "Preparing the presentation…", speech: speakingSlot === slot ? speaking?.text ?? null : null }])) as Record<PlayerSlot, { assetId: string; label: string; name: string; role: string; working: boolean; status: string; speech: string | null }>,
    jury: { assetId: theme.jury.assetId, label: theme.jury.description, name: theme.jury.displayName, role: "Jury", working: debate.phase === "jury", status: debate.phase === "jury" ? "Deliberating…" : complete ? "Decision delivered" : "Listening" },
  };
  const running = (slot: PlayerSlot) => debate.state === "composing" && debate.activeSlot === slot;
  return <section className={styles.game} aria-label="Lawyer sidekick debate" data-state={debate.state ?? debate.phase} data-history={drawerOpen ? "open" : "closed"}>
    <DebateArena theme={theme} players={{ A: { name: playerName("A"), characterId: room.players.find(player => player.slot === "A")?.selectedCharacterId }, B: { name: playerName("B"), characterId: room.players.find(player => player.slot === "B")?.selectedCharacterId } }} dialogue={dialogue} dialogueKey={judgeSpeaking ? speaking.messageId : `${debate.phase}:${debate.state}:${debate.activeSlot}:${judgeMessage?.id ?? current?.ordinal}`} judgeLabel={thinking ? "REVIEWING BOTH SIDES" : complete ? "DEBATE CONCLUDED" : "NEUTRAL JUDGE"} judgeState={judgeSpeaking ? "speaking" : thinking ? "thinking" : "listening"} paused={paused} roomCode={room.code} showTimer={false} counsel={counsel} turn={{ label: complete ? "DEBATE COMPLETE" : debate.state === "composing" ? `PLAYER ${debate.activeSlot} IS WRITING` : "CLOCKS PAUSED", time: complete ? "DONE" : debate.state === "composing" && debate.activeSlot ? formatTurnTime(clocks[debate.activeSlot]) : "…", activeSlot: debate.state === "composing" ? debate.activeSlot : null, complete }}/>
    <header className={styles.hudTop}>
      <div className={styles.questionCard}>
        <h1 className={styles.topic}>{debate.topic}</h1>
        <div className={styles.questionRow}>
          <ol className={styles.progress} aria-label="Subtopics">{debate.subtopics.map(item => { const state = complete || debate.phase === "jury" || (debate.currentSubtopic !== null && item.ordinal < debate.currentSubtopic) ? "done" : item.ordinal === debate.currentSubtopic ? "current" : "next"; return <li key={item.ordinal} data-state={state} aria-current={state === "current" ? "step" : undefined} title={item.question}><span className="sr-only">Subtopic {item.ordinal}, {state === "done" ? "finished" : state === "current" ? "current" : "upcoming"}: </span>{item.ordinal}</li>; })}</ol>
          <div className={styles.questionText}><p className="eyebrow">{complete ? "DEBATE COMPLETE" : debate.phase === "jury" ? "JURY REVIEW" : `SUBTOPIC ${current?.ordinal ?? "—"} OF ${debate.subtopics.length}`}</p><h2>{complete ? "The jury’s decision" : debate.phase === "jury" ? "The jury is deliberating" : current?.question ?? "Your debate is being prepared"}</h2></div>
        </div>
      </div>
      <div className={styles.versus} aria-label="Player clocks">
        {slots.map(slot => <div key={slot} className={styles.clock} data-slot={slot} data-active={running(slot)} data-expired={clocks[slot] <= 0}>
          <span className={styles.clockName}>{playerName(slot)}{slot === room.you && <em>You</em>}</span>
          <strong role="timer" aria-label={`Player ${slot}: ${clocks[slot]} seconds remaining`}>{formatTurnTime(clocks[slot])}</strong>
          <small>{complete ? "Complete" : clocks[slot] <= 0 ? "Time used" : running(slot) ? "Writing clock running" : "Clock paused"}</small>
        </div>)}
        <span className={styles.vs} aria-hidden="true">VS</span>
      </div>
    </header>
    <div className={styles.hudBottom}>
      {!complete && (debate.phase === "summary" || debate.phase === "jury") && <section className={`pixel-panel ${styles.processing}`} role="status"><PixelIcon name="gavel"/><p data-readable-text>{debate.phase === "summary" ? currentSummary ? "The summary is ready above and saved in the shared record. The next phase will begin shortly." : "Both writing clocks are empty. The judge is preparing a shared summary before the next subtopic." : "All subtopics are finished. The jury is evaluating the publicly presented arguments and summaries."}</p></section>}
      {!complete && debate.phase === "jury" && <JuryRecovery debate={debate} pending={pending} offline={offline} onRetry={onRetryJury}/>}
      {!complete && debate.phase === "subtopic" && <LawyerComposers key={`${room.id}:${debate.revision}:${debate.currentSubtopic}`} room={room} debate={debate} theme={theme} remaining={clocks[room.you]} total={current?.secondsPerPlayer ?? 0} opponentName={playerName(room.you === "A" ? "B" : "A")} pending={pending} offline={offline} onSend={onSend} onConsult={onConsult}/>}
    </div>
    {complete && <div className={styles.results}><JuryDecision debate={debate} room={room} pending={pending} offline={offline} onAcknowledge={onAcknowledge} onRematch={onRematch}/></div>}
    {!onHistoryOpenChange && <button type="button" className={styles.historyToggle} aria-pressed={drawerOpen} aria-controls="debate-history-drawer" onClick={() => setDrawerOpen(!drawerOpen)}>History</button>}
    <div id="debate-history-drawer" className={styles.drawer} data-open={drawerOpen}>
      <div className={styles.drawerTools}><SpeechToolbar/></div>
      <DebateHistoryPanel latestMessageId={latestKey}>
        <label className={styles.historyFilter}>Review messages<select value={historyFilter} onChange={event => setHistoryFilter(event.target.value)}><option value="all">All public messages</option><option value="summaries">Judge summaries</option><option value="verdict">Final verdict</option>{debate.subtopics.map(item => <option key={item.ordinal} value={item.ordinal}>Subtopic {item.ordinal}: {item.question}</option>)}</select></label>
        {messages.length === 0 ? <p className={styles.help}>The shared record will appear here as the debate begins.</p> : <ol className={styles.transcript}>{messages.filter(message => historyFilter === "all" || (historyFilter === "summaries" ? message.kind === "judge_summary" : historyFilter === "verdict" ? message.kind === "jury_verdict" : message.subtopic === Number(historyFilter))).map(message => <PublicMessage key={message.id} message={message} room={room} theme={theme}/>)}</ol>}
        {last?.status === "pending" && <p className={styles.help}>Waiting for the saved presentation. Both writing clocks are paused.</p>}
      </DebateHistoryPanel>
      {debate.phase !== "subtopic" && debate.consultations.length > 0 && <details className={`pixel-panel ${styles.privateComposer}`}><summary><PixelIcon name="chat"/><span>Your private lawyer record<small>Only you. Not part of the jury’s evidence.</small></span></summary><div className={styles.composerBody}><PrivateLawyerHistory debate={debate} theme={theme} slot={room.you}/></div></details>}
    </div>
  </section>;
}

function PublicMessage({ message, room, theme }: { message: LawyerPublicMessage; room: RoomSnapshot; theme: ThemeConfig }) {
  const label = message.kind === "argument" ? `Player ${message.slot} · ${message.slot ? theme.lawyers[message.slot].displayName : "Lawyer"}` : message.kind === "judge_summary" ? `${theme.judge.displayName} · Summary` : message.kind === "jury_verdict" ? `${theme.jury.displayName} · Verdict` : "System announcement";
  const pendingText = message.kind === "jury_verdict" ? "The jury is reviewing the public debate…"
    : message.kind === "judge_summary" ? "The judge is preparing this subtopic’s summary…"
    : message.kind === "announcement" ? "The announcement is being prepared…"
    : "The lawyer is preparing this presentation…";
  return <li className={styles.message} data-kind={message.kind} data-slot={message.slot}>
    <div className={styles.messageMeta}><strong>{label}</strong><span>{message.label}</span></div>
    {message.kind === "argument" && <span className={styles.presentationLabel}>{room.players.find(player => player.slot === message.slot)?.name ?? `Player ${message.slot}`}’s presented argument</span>}
    <p data-readable-text>{message.status === "pending" ? pendingText : message.text ?? "Saved message is loading."}</p>
    {message.kind !== "announcement" && message.status === "complete" && message.source !== "ai" && <small className={styles.source}>{message.source === "demo" ? "Demo presentation" : message.kind === "argument" ? "Unedited fallback · original submitted argument" : "Fallback response"}</small>}
    <SpeechMessageControls message={message}/>
    {message.kind === "argument" && message.slot === room.you && message.rawText && <details className={styles.raw}><summary>Your original draft · hidden from opponent</summary><p data-readable-text>{message.rawText}</p></details>}
  </li>;
}

function JuryRecovery({ debate, pending, offline, onRetry }: { debate: LawyerDebateSnapshot; pending: boolean; offline: boolean; onRetry?: (debateId: string) => Promise<boolean> }) {
  const status = debate.juryStatus;
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false);
  if (!status || (status.state !== "retry_required" && status.state !== "retry_wait")) return null;
  async function retry() {
    if (retryingRef.current || pending || offline || !debate.debateId || !onRetry) return;
    retryingRef.current = true; setRetrying(true);
    try { await onRetry(debate.debateId); } finally { retryingRef.current = false; setRetrying(false); }
  }
  return <section className={`pixel-panel ${styles.recovery}`} aria-label="Jury recovery"><h3>The jury could not finish this review</h3><p data-readable-text>Your public debate is saved. No verdict has been invented, and both writing clocks remain stopped.</p>{status.state === "retry_wait" ? <p role="status">A retry is scheduled{status.retryAt ? ` for ${new Date(status.retryAt).toLocaleTimeString()}` : " shortly"}.</p> : <><p className={styles.help}>You can retry after the service recovers. The server may ask you to wait briefly between attempts.</p><PixelButton disabled={pending || offline || retrying || !onRetry || !debate.debateId} onClick={() => { void retry(); }}>{retrying ? "Requesting review…" : "Retry jury review"}</PixelButton></>}</section>;
}

function JuryDecision({ debate, room, pending, offline, onAcknowledge, onRematch }: { debate: LawyerDebateSnapshot; room: RoomSnapshot; pending: boolean; offline: boolean; onAcknowledge?: (debateId: string) => Promise<unknown>; onRematch?: (debateId: string) => Promise<boolean> }) {
  const [acting, setActing] = useState<"acknowledge" | "rematch" | null>(null);
  const actingRef = useRef(false);
  const verdict = debate.verdict;
  const source = debate.history.find(item => item.kind === "jury_verdict" && item.status === "complete")?.source;
  const peer = room.you === "A" ? "B" : "A";
  async function act(kind: "acknowledge" | "rematch") {
    if (actingRef.current || pending || offline || !debate.debateId) return;
    actingRef.current = true; setActing(kind);
    try { if (kind === "acknowledge") await onAcknowledge?.(debate.debateId); else await onRematch?.(debate.debateId); }
    finally { actingRef.current = false; setActing(null); }
  }
  return <section className={`pixel-panel ${styles.verdict}`} aria-label="Final jury decision"><p className="eyebrow">FINAL JURY DECISION</p>{source && source !== "ai" && <p className={styles.source}>{source === "demo" ? "Demo verdict" : "Fallback verdict"} · no live AI evaluation</p>}{verdict ? <SavedVerdict verdict={verdict} players={room.players}/> : <h2>The saved verdict is loading</h2>}
    {verdict && debate.debateId && <div className={styles.resultActions}>
      <div><h3>Acknowledge the results</h3><p className={styles.help}>Acknowledgement means you have reviewed this result. It does not mean agreement or that your disagreement is resolved.</p><p role="status">{debate.acknowledgements?.[room.you] ? "You acknowledged the results." : "You have not acknowledged yet."} {debate.acknowledgements?.[peer] ? "Your opponent acknowledged." : "Your opponent has not acknowledged yet."}</p><PixelButton tone="cream" disabled={pending || offline || Boolean(acting) || Boolean(debate.acknowledgements?.[room.you]) || !onAcknowledge} onClick={() => { void act("acknowledge"); }}>{acting === "acknowledge" ? "Saving acknowledgement…" : debate.acknowledgements?.[room.you] ? "Results acknowledged" : "Acknowledge results"}</PixelButton></div>
      <div><h3>Another debate together?</h3><p className={styles.help}>Both players must approve. Your theme and seats stay; the new debate gets its own topic, positions and clocks. This result stays saved.</p>{debate.rematch?.[room.you] ? <p role="status">Rematch requested. Waiting for your opponent’s approval.</p> : debate.rematch?.[peer] ? <p role="status">Your opponent requested a rematch. Approve to return both players to setup.</p> : null}<PixelButton disabled={pending || offline || Boolean(acting) || Boolean(debate.rematch?.[room.you]) || !onRematch} onClick={() => { void act("rematch"); }}>{acting === "rematch" ? "Requesting rematch…" : debate.rematch?.[room.you] ? "Waiting for opponent" : debate.rematch?.[peer] ? "Approve rematch" : "Request rematch"}</PixelButton></div>
    </div>}
  </section>;
}

function PrivateLawyerHistory({ debate, theme, slot }: { debate: LawyerDebateSnapshot; theme: ThemeConfig; slot: PlayerSlot }) {
  return <div className={styles.privateHistory} role="log" aria-label="Your private lawyer consultations" aria-live="polite">{debate.consultations.length ? debate.consultations.map(message => <article key={message.id}><p className="eyebrow">YOU · SUBTOPIC {message.subtopic}</p><p data-readable-text>{message.playerText}</p><p className="eyebrow">{theme.lawyers[slot].displayName}</p><p data-readable-text>{message.status === "pending" ? "Your lawyer is thinking…" : message.text ?? "The saved reply is loading."}</p>{message.status === "complete" && message.source !== "ai" && <small>{message.source === "demo" ? "Demo reply" : "Fallback reply"}</small>}</article>) : <p className={styles.help}>Ask for help organizing your point or understanding the other side. This private conversation does not submit an argument.</p>}</div>;
}

function LawyerComposers({ room, debate, theme, remaining, total, opponentName, pending, offline, onSend, onConsult }: { room: RoomSnapshot; debate: LawyerDebateSnapshot; theme: ThemeConfig; remaining: number; total: number; opponentName: string; pending: boolean; offline: boolean; onSend: LawyerMessageAction; onConsult: LawyerMessageAction }) {
  const [argument, setArgument] = useState("");
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState<"argument" | "consult" | null>(null);
  const [notice, setNotice] = useState("");
  const requests = useRef<{ argument: { text: string; key: string } | null; consult: { text: string; key: string } | null }>({ argument: null, consult: null });
  const acting = useRef(false);
  const active = room.you === debate.activeSlot;
  const composing = debate.state === "composing";
  const disabled = pending || offline || sending !== null || !active || !composing || remaining <= 0;
  const publicCapped = debate.ownMessageCount >= 12;
  const privateCapped = debate.ownConsultationCount >= 2;
  async function send(event: FormEvent, kind: "argument" | "consult") {
    event.preventDefault();
    const text = (kind === "argument" ? argument : question).trim();
    if (disabled || acting.current || !text || debate.currentSubtopic === null || (kind === "argument" ? publicCapped : privateCapped)) return;
    const saved = requests.current[kind];
    const request = saved?.text === text ? saved : { text, key: crypto.randomUUID() };
    requests.current[kind] = request;
    acting.current = true; setSending(kind); setNotice("");
    try {
      const success = await (kind === "argument" ? onSend : onConsult)(text, debate.revision, debate.currentSubtopic, request.key);
      if (success) { if (kind === "argument") setArgument(""); else setQuestion(""); requests.current[kind] = null; }
      else setNotice("Your draft is still here. Check the room connection, then try again.");
    } finally { acting.current = false; setSending(null); }
  }
  const status = offline ? "Connection lost. Your writing clock keeps running; your draft stays in this tab."
    : debate.state === "lawyering" ? "The lawyer is presenting the submitted argument. Neither player’s clock runs during this work."
    : debate.state === "consulting" ? "A private lawyer consultation is in progress. Both clocks are paused; the same player resumes afterward."
    : remaining <= 0 ? "Your writing time for this subtopic is used. The subtopic finishes when both clocks are empty."
    : active ? "Your clock runs while you write. Presenting an argument stops your clock while your lawyer works, then gives your opponent the floor."
    : "Your opponent is writing. Your clock is paused until it is your turn.";
  const yourTurn = active && composing && remaining > 0;
  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const placeholder = yourTurn ? `Your point for ${theme.lawyers[room.you].displayName}…` : remaining <= 0 ? "Your time for this subtopic is used" : debate.state === "lawyering" ? "A lawyer is presenting…" : debate.state === "consulting" ? "Private consultation…" : `${opponentName} is writing…`;
  return <div className={styles.composers}>
    <section className={`pixel-panel ${styles.publicComposer}`} aria-labelledby="present-argument-title" data-active={yourTurn} data-low={yourTurn && remaining <= 10}>
      <form className={styles.composerBody} onSubmit={event => { void send(event, "argument"); }}>
        <h3 id="present-argument-title" className="sr-only">Make your point</h3>
        <p className="sr-only" role="status">{status}</p>
        <div className={styles.timeTrack} aria-hidden="true"><span style={{ width: `${fraction * 100}%` }}/></div>
        <div className={styles.inputRow}>
          <span className={styles.yourClock} aria-hidden="true">{formatTurnTime(remaining)}</span>
          <label className={`debate-field ${styles.argumentField}`} htmlFor="lawyer-argument"><span className="sr-only">Argument for my lawyer</span><textarea id="lawyer-argument" data-readable-text rows={1} value={argument} disabled={!active || !composing || sending !== null || remaining <= 0} onChange={event => setArgument(trimTo(event.target.value, 600))} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={placeholder}/></label>
          <span className={styles.counter} aria-label={`${length(argument)} of 600 characters, ${debate.ownMessageCount} of 12 presentations this subtopic`}>{length(argument)}/600</span>
          <PixelButton type="submit" tone="orange" disabled={disabled || !argument.trim() || publicCapped}>{sending === "argument" ? "Sending to your lawyer…" : "Present my argument"}<PixelIcon name="arrow"/></PixelButton>
        </div>
        {publicCapped && <p role="status" className={styles.help}>You’ve reached this subtopic’s presentation limit. Your remaining writing clock still runs on your turn.</p>}
        {notice && <p role="status" className={styles.help}>{notice}</p>}
      </form>
    </section>
    <details className={`pixel-panel ${styles.privateComposer}`}>
      <summary><PixelIcon name="chat"/><span>Ask my lawyer privately<small>Only you and your lawyer. Never jury evidence.</small></span></summary>
      <div className={styles.composerBody}>
        <PrivateLawyerHistory debate={debate} theme={theme} slot={room.you}/>
        <form className={styles.form} onSubmit={event => { void send(event, "consult"); }}>
          <label className="debate-field" htmlFor="lawyer-consultation">Private message to my lawyer<textarea id="lawyer-consultation" data-readable-text rows={3} value={question} disabled={!active || !composing || sending !== null || remaining <= 0} onChange={event => setQuestion(trimTo(event.target.value, 600))}/><span>{length(question)} / 600 characters · {debate.ownConsultationCount} / 2 consultations this subtopic</span></label>
          <PixelButton type="submit" tone="cream" disabled={disabled || !question.trim() || privateCapped}>{sending === "consult" ? "Consulting your lawyer…" : "Ask my lawyer privately"}</PixelButton>
          {privateCapped && <p className={styles.help}>You’ve used both private consultations for this subtopic.</p>}
        </form>
      </div>
    </details>
  </div>;
}
