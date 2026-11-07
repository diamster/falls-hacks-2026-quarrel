"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { DebateArena } from "./debate-arena";
import { JudgeComposer, JudgeConversation, PreparingJudgeQuestions, useJudgePresentation } from "./judge-panel";
import { ThemeSelector } from "./theme-selector";
import { PixelButton, PixelIcon, SectionHeading } from "./ui";
import { getTheme } from "@/themes";
import { themeStyles } from "@/themes/styles";
import { useRoomClient } from "@/lib/room-client";
import { DebateComplete, DebateHistory, DebateProgress, DebateSetup, DebateTurnPanel, PositionSummary, debateAnnouncement, formatTurnTime, roundLabels } from "./debate-ui";

import { LeaveRoomControl, RoomEntry, RoomLobby } from "./room-controls";
export { LeaveRoomControl, RoomEntry, RoomLobby } from "./room-controls";

/** Retained only for legacy component regression coverage; public entry uses StageFiveApp. */
export function LegacyMultiplayerApp() {
  const session = useRoomClient();
  const [view, setView] = useState<"auto" | "start" | "room">("auto");
  const [initialCode, setInitialCode] = useState("");
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState<{ themeId: string; sampleId: string } | null>(null);
  useEffect(() => { setInitialCode(new URLSearchParams(window.location.search).get("room")?.toUpperCase().slice(0, 6) ?? ""); }, []);
  useEffect(() => {
    const readView = () => {
      const params = new URLSearchParams(window.location.search);
      return params.get("start") === "1" || (!params.has("room") && session.room?.debate?.phase === "verdict") ? "start" : "room";
    };
    if (!session.loading && view === "auto") setView(readView());
    const onPopState = () => setView(readView());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [session.loading, session.room?.debate?.phase, view]);
  useEffect(() => {
    // Explicit room URLs preserve refresh recovery, including completed records.
    if (view === "room" && session.room) window.history.replaceState(window.history.state, "", `/?room=${encodeURIComponent(session.room.code)}`);
  }, [view, session.room?.code]);
  function navigate(next: "start" | "room") {
    window.history.pushState(null, "", next === "start" ? "/?start=1" : `/?room=${encodeURIComponent(session.room!.code)}`);
    setView(next);
    document.getElementById("courtroom-content")?.focus();
  }
  function backToStart(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate("start");
  }
  async function leaveRoom(roomId: string) {
    const success = await session.leaveRoom(roomId);
    if (success) {
      setInitialCode("");
      setPreview(null);
      navigate("start");
    }
    return success;
  }
  const room = view === "room" ? session.room : null;
  const theme = getTheme(room?.themeId);
  const playerA = room?.players.find(player => player.slot === "A");
  const playerB = room?.players.find(player => player.slot === "B");
  const debate = room?.debate;
  const started = Boolean(debate && debate.phase !== "setup");
  const complete = debate?.phase === "verdict";
  const confirmed = Boolean(room?.bothReady && !session.offline);
  const sample = preview?.themeId === theme.id ? theme.judge.samples.find(item => item.id === preview.sampleId) : undefined;
  const speaker = room?.players.find(player => player.slot === debate?.activeSlot)?.name ?? `Player ${debate?.activeSlot ?? "A"}`;
  const dialogue = started && debate ? debateAnnouncement(theme, debate, speaker, { A: playerA?.name ?? "Player A", B: playerB?.name ?? "Player B" }) : sample?.text ?? (confirmed ? theme.judge.dialogue.ready : debate ? debateAnnouncement(theme, debate, speaker, { A: playerA?.name ?? "Player A", B: playerB?.name ?? "Player B" }) : room ? theme.judge.dialogue.lobby : theme.judge.dialogue.welcome);
  const dialogueKey = `${theme.id}-${started ? `${debate?.phase}-${debate?.turnIndex}` : sample ? `sample-${sample.id}` : confirmed ? "ready" : room ? "lobby" : "welcome"}`;
  const roundNumber = debate?.phase === "opening" ? 1 : debate?.phase === "rebuttal" ? 2 : 3;
  const judgePresentation = useJudgePresentation(room, dialogue, dialogueKey, session.judgePending);
  const preparingQuestions = Boolean(room?.judge?.preparingQuestions);
  return <div className={`theme-shell${started ? " stage-three-active" : ""}`} data-theme={theme.id} style={themeStyles(theme)}>
    <a className="skip-link" href="#courtroom-content">Skip to courtroom</a>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="/?start=1" onClick={backToStart} aria-label="quarrel.io home"><span className="brand-mark"><PixelIcon name="chat"/></span><span>quarrel<span className="brand-dot">.</span>io</span></a>
      <div className="header-divider"/><span className="brand-caption">BIG OPINIONS.<br/>FAIR HEARINGS.</span>
      <nav aria-label="Main navigation">{room ? <a href="/?start=1" onClick={backToStart}>Back to start</a> : <a href="#courtroom-content" className="nav-current">The courtroom</a>}<a href="/preview">Art preview ↗</a></nav>
      <div className="stage-badge"><span className="status-dot"/>STAGE 04 <span>/ YOUR AI SIDEKICK</span></div>
    </div></header>
    <main id="courtroom-content" className="app-shell" tabIndex={-1}>
      <section className="topic-bar" aria-label={started ? "Debate topic" : "Room lobby"}><div className="topic-icon"><PixelIcon name="gavel"/></div><div className="topic-copy"><p className="eyebrow">{theme.ui.benchCaption} <span>· {started ? "THE AGREED QUESTION" : "TWO-PLAYER LOBBY"}</span></p><h1>{started ? debate?.topic : "Every great debate starts with hello."}</h1></div><div className="round-placeholder"><span className="eyebrow">{complete ? "COMPLETE" : started ? `ROUND ${roundNumber} OF 3` : "WAITING ROOM"}</span><span>{complete ? "The debate record is ready." : started && debate?.phase !== "setup" ? roundLabels[debate!.phase as keyof typeof roundLabels] : "Find your friend. Take your seat."}</span></div></section>
      {session.error && <div className="room-error" role="alert"><p>{session.error}</p>{session.offline && <button onClick={() => { void session.refresh(); }}>Try reconnecting</button>}</div>}
      {started ? <div className="debate-theme-lock"><PixelIcon name="spark"/><strong>{theme.displayName} · {theme.judge.displayName}</strong><span>Theme locked for this debate</span></div> : <ThemeSelector selectedId={theme.id} hasRoom={Boolean(room)} canEdit={room?.you === "A" && !session.offline} pending={session.pending} locked={Boolean(room?.themeLocked)} onSelect={id => { void session.setTheme(id); }}/>}
      {room && debate?.phase === "setup" && <DebateSetup room={room} debate={debate} pending={session.pending} offline={session.offline} onPropose={session.proposeTopic} onApprove={session.approveTopic} onRequestChanges={session.requestChanges} onStart={session.startDebate}/>}
      {started && debate && <><DebateProgress phase={debate.phase}/><PositionSummary debate={debate}/></>}
      {complete && debate && <DebateComplete debate={debate} interactiveJudge={room?.judge?.enabled}/>}
      <div className="court-layout room-court-layout">
        <div className="arena-column">
          <DebateArena theme={theme} players={{ A: { name: playerA?.name ?? "Player A", characterId: playerA?.selectedCharacterId }, B: { name: playerB?.name ?? "Player B", characterId: playerB?.selectedCharacterId } }} dialogue={judgePresentation.dialogue} dialogueKey={judgePresentation.dialogueKey} judgeState={judgePresentation.state} judgeLabel={judgePresentation.label} paused={paused} roomCode={room?.code} turn={started && debate ? { label: complete ? "ALL ROUNDS COMPLETE" : preparingQuestions ? "PREPARING QUESTIONS" : `ROUND ${roundNumber} · PLAYER ${debate.activeSlot}`, time: complete ? "DONE" : preparingQuestions ? "…" : formatTurnTime(session.remainingSeconds), activeSlot: debate.activeSlot, complete } : undefined}/>
          {preparingQuestions && <PreparingJudgeQuestions/>}
          {started && !complete && !preparingQuestions && room && debate && <DebateTurnPanel key={`${room.id}-${debate.turnIndex}`} room={room} debate={debate} remainingSeconds={session.remainingSeconds} pending={session.pending && !session.judgePending} blocked={session.pending && session.judgePending} offline={session.offline} onSubmit={session.submitArgument}/>}
          {started && !complete && room?.judge?.enabled && debate && <JudgeComposer key={`judge-${room.id}-${debate.turnIndex}`} room={room} theme={theme} pending={session.judgePending} blocked={session.pending && !session.judgePending} offline={session.offline} remainingSeconds={session.remainingSeconds} onAsk={session.askJudge}/>}
          {!started && <section className="judge-preview pixel-panel" aria-label="Judge personality preview">
            <div><p className="eyebrow">MEET {theme.judge.displayName.toUpperCase()}</p><p>{theme.judge.personality}</p></div>
            <label htmlFor="theme-judge-dialogue">Judge dialogue preview<select id="theme-judge-dialogue" aria-label="Judge dialogue preview" value={sample?.id ?? "lobby"} onChange={event => setPreview({ themeId: theme.id, sampleId: event.target.value })}>
              <option value="lobby">Lobby greeting</option>{theme.judge.samples.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select><span>Sample lines in this tab. Live judge conversations begin with the debate.</span></label>
          </section>}
        </div>
        {session.loading || view === "auto" ? <section className="room-panel pixel-panel room-loading" aria-live="polite"><PixelIcon name="leaf"/><p>Checking for your seat…</p></section>
          : room ? <RoomLobby key={room.id} theme={theme} room={room} pending={session.pending} offline={session.offline} live={session.live} onReady={ready => { void session.setReady(ready); }} onLeave={() => leaveRoom(room.id)}/>
          : session.room ? <section className="room-panel pixel-panel" aria-labelledby="saved-room-title">
            <SectionHeading eyebrow="WELCOME BACK"><span id="saved-room-title">Your room is saved</span></SectionHeading>
            <div className="room-panel-body saved-room-body">
              <p>This is the start screen. Your previous room is still available whenever you want to return.</p>
              <div className="room-code-label"><span className="eyebrow">SAVED ROOM</span><strong>{session.room.code}</strong></div>
              <p>{session.room.debate?.phase === "verdict" ? "The debate is complete. Resume to view its record." : "Returning to start does not pause a live debate."}</p>
              <PixelButton tone="green" onClick={() => navigate("room")}>Resume room<PixelIcon name="arrow"/></PixelButton>
              <LeaveRoomControl key={session.room.id} pending={session.pending} offline={session.offline} label="Create or join another room" onLeave={() => leaveRoom(session.room!.id)}/>
            </div>
          </section>
          : <RoomEntry theme={theme} pending={session.pending} initialCode={initialCode} onCreate={name => { void session.create(name).then(success => { if (success) setView("room"); }); }} onJoin={(code, name) => { void session.join(code, name).then(success => { if (success) setView("room"); }); }}/>}
      </div>
      {started && room?.judge?.enabled && <JudgeConversation room={room} theme={theme}/>}
      {started && room && debate && <DebateHistory debate={debate} players={room.players} you={room.you}/>}
      <section className={`room-confirmation pixel-panel ${confirmed ? "is-confirmed" : ""}`} aria-live="polite" aria-atomic="true">
        <PixelIcon name={confirmed ? "spark" : "leaf"}/><div><h2>{started ? "Different views. Equal time." : confirmed ? "Ready to start — both players confirmed!" : "A fair hearing. A shared starting line."}</h2><p>{started ? "Pausing the artwork does not pause the shared turn clock." : confirmed ? "Approve the same topic and positions. Player A chooses when to start." : "Create or join a room, agree on a topic and positions, then both players choose ready."}</p></div>
        <PixelButton tone="cream" aria-pressed={paused} onClick={() => setPaused(value => !value)}><PixelIcon name={paused ? "play" : "pause"}/>{paused ? "Resume animation" : "Pause animation"}</PixelButton>
      </section>
      <footer className="site-footer"><span><PixelIcon name="leaf"/> {theme.ui.tagline}</span><span>Made for Digital Sidekick <span className="footer-star">✦</span> Stage 4 · Your debate sidekick</span></footer>
    </main>
  </div>;
}

export { StageFiveApp as MultiplayerApp } from "./stage-five-app";
