"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRoomClient } from "@/lib/room-client";
import { getTheme } from "@/themes";
import { themeStyles } from "@/themes/styles";
import { DebateArena } from "./debate-arena";
import { DebateHistory } from "./debate-ui";
import { JudgeConversation } from "./judge-panel";
import { LawyerDebateView, LawyerSetup } from "./lawyer-debate";
import { LeaveRoomControl, RoomEntry, RoomLobby } from "./room-controls";
import { PixelButton, PixelIcon, SectionHeading } from "./ui";
import { useDisplayPreferences } from "./display-preferences";
import "./stage-five-app.css";
import { CharacterSpeechProvider } from "./character-speech";
import { PreviousDebates } from "./lawyer-results";
import { CourtroomDialogue } from "./courtroom-dialogue";

export function StageFiveApp() {
  const session = useRoomClient();
  const { preferences } = useDisplayPreferences();
  const [view, setView] = useState<"auto" | "start" | "room">("auto");
  const [initialCode, setInitialCode] = useState("");
  useEffect(() => { setInitialCode(new URLSearchParams(window.location.search).get("room")?.toUpperCase().slice(0, 6) ?? ""); }, []);
  useEffect(() => {
    const readView = () => {
      const params = new URLSearchParams(window.location.search);
      const complete = session.room?.lawyer?.phase === "complete" || session.room?.debate?.phase === "verdict";
      return params.get("start") === "1" || (!params.has("room") && complete) ? "start" : "room";
    };
    if (!session.loading && view === "auto") setView(readView());
    const pop = () => setView(readView()); window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [session.loading, session.room?.lawyer?.phase, session.room?.debate?.phase, view]);
  useEffect(() => {
    if (view === "room" && session.room) window.history.replaceState(window.history.state, "", `/?room=${encodeURIComponent(session.room.code)}`);
  }, [view, session.room?.code]);
  function navigate(next: "start" | "room") {
    window.history.pushState(null, "", next === "start" ? "/?start=1" : `/?room=${encodeURIComponent(session.room!.code)}`);
    setView(next); document.getElementById("courtroom-content")?.focus();
  }
  function home(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate("start");
  }
  async function leave(id: string) {
    const success = await session.leaveRoom(id);
    if (success) { setInitialCode(""); navigate("start"); }
    return success;
  }
  const room = view === "room" ? session.room : null;
  const theme = getTheme(room?.themeId);
  const debate = room?.lawyer;
  const started = Boolean(debate?.startedAt);
  const complete = debate?.phase === "complete";
  const paused = preferences.pauseAnimations || preferences.reducedMotion;
  const players = { A: { name: room?.players.find(player => player.slot === "A")?.name ?? "Player A" }, B: { name: room?.players.find(player => player.slot === "B")?.name ?? "Player B" } };
  const lobbyDialogue = !room ? "Welcome. Create a private room or join your friend. Your own lawyer will help you present your case."
    : !debate ? "This earlier debate record is preserved. Start a new room to debate with personal lawyers."
    : debate.planReady ? "Your subtopic plan is ready. Review it together; the host starts when you are both ready."
    : debate.phase === "planning" ? "The planner is preparing balanced questions for both positions."
    : !debate.topic ? "Host, set the topic and writing time. Each participant then writes their own position."
    : "Review each other's positions and confirm readiness. Your lawyers will help present your arguments.";
  return <CharacterSpeechProvider roomId={room?.id ?? null} debateId={debate?.debateId ?? null} themeId={theme.id} messages={debate?.history ?? []}><div className="theme-shell stage-five-shell" data-theme={theme.id} style={themeStyles(theme)}>
    <a className="skip-link" href="#courtroom-content">Skip to courtroom</a>
    <header className="site-header"><div className="header-inner"><a className="brand" href="/?start=1" onClick={home} aria-label="quarrel.io home"><span className="brand-mark"><PixelIcon name="chat"/></span><span>quarrel<span className="brand-dot">.</span>io</span></a><div className="header-divider"/><span className="brand-caption">YOUR VOICE.<br/>A FAIR HEARING.</span><nav aria-label="Main navigation"><a href="/?start=1" onClick={home}>{room ? "Back to start" : "Start"}</a><a href="/settings">Settings</a><a href="/preview">Art preview ↗</a></nav><div className="stage-badge">STAGE 6B <span>/ YOUR LAWYER SIDEKICK</span></div></div></header>
    <main id="courtroom-content" className="app-shell" tabIndex={-1}>
      <section className="topic-bar" aria-label="Debate topic"><div className="topic-icon"><PixelIcon name="gavel"/></div><div className="topic-copy"><p className="eyebrow">{theme.ui.benchCaption} · {complete ? "COMPLETE" : started ? "THE AGREED QUESTION" : "TWO-PLAYER LOBBY"}</p><h1>{debate?.topic ?? "Every great debate starts with hello."}</h1></div><div className="round-placeholder"><span className="eyebrow">{started ? "YOUR VOICE. YOUR LAWYER." : "PRIVATE ROOM"}</span><span>{debate?.topic ? `${debate.totalSeconds / 60} minutes of writing time each` : "No account needed."}</span></div></section>
      {session.error && <div className="room-error" role="alert"><p>{session.error}</p>{session.offline && <button onClick={() => { void session.refresh(); }}>Try reconnecting</button>}</div>}
      <div className="stage-five-setting"><span><strong>{theme.displayName}</strong> · {theme.judge.displayName}{room?.themeLocked ? " · Theme locked" : ""}</span><a href="/settings">{room?.themeLocked ? "Display settings" : "Preview themes in Settings"}<PixelIcon name="arrow"/></a></div>
      {room && debate && !started && <LawyerSetup room={room} pending={session.pending} offline={session.offline} onPropose={session.proposeLawyerTopic} onPosition={session.setOwnPosition} onPlan={regenerate => session.planDebate(debate.revision, regenerate)} onStart={session.startLawyerDebate}/>}
      {room && debate && started ? <><LawyerDebateView room={room} theme={theme} clocks={session.lawyerClocks} pending={session.pending} offline={session.offline} paused={paused} onSend={session.sendToLawyer} onConsult={session.consultLawyer} onAcknowledge={session.acknowledgeResults} onRematch={session.requestRematch} onRetryJury={session.retryJury}/><details className="stage-five-room-details"><summary>Room connection, invitation and leave controls</summary><RoomLobby room={room} theme={theme} pending={session.pending} offline={session.offline} live={session.live} onReady={ready => { void session.setReady(ready); }} onLeave={() => leave(room.id)}/></details></> : <>
        {room && !debate && <section className="pixel-panel stage-five-legacy"><h2>Earlier debate record</h2><p>This room keeps its original theme and history. Create a new room to use personal lawyers, subtopics and the jury.</p></section>}
        <div className="court-layout room-court-layout"><div className="arena-column"><DebateArena counsel={{ A: "idle", B: "idle" }} theme={theme} players={players} dialogue={lobbyDialogue} dialogueKey={`${theme.id}:${room?.id}:${debate?.phase}:${debate?.planReady}`} judgeState="speaking" judgeLabel="YOUR NEUTRAL JUDGE" paused={paused} roomCode={room?.code}/><CourtroomDialogue theme={theme}/></div>
          {session.loading || view === "auto" ? <section className="room-panel pixel-panel room-loading" role="status">Checking for your seat…</section>
            : room ? <RoomLobby key={room.id} room={room} theme={theme} readOnly={!debate} pending={session.pending} offline={session.offline} live={session.live} onReady={ready => { void session.setReady(ready); }} onLeave={() => leave(room.id)}/>
            : session.room ? <section className="room-panel pixel-panel"><SectionHeading eyebrow="WELCOME BACK">Your room is saved</SectionHeading><div className="room-panel-body saved-room-body"><p>Your previous room and record remain available.</p><strong>{session.room.code}</strong><PixelButton onClick={() => navigate("room")}>Resume room<PixelIcon name="arrow"/></PixelButton><LeaveRoomControl pending={session.pending} offline={session.offline} onLeave={() => leave(session.room!.id)} label="Create or join another room"/></div></section>
            : <RoomEntry theme={theme} pending={session.pending} initialCode={initialCode} onCreate={name => { void session.create(name).then(success => { if (success) setView("room"); }); }} onJoin={(code, name) => { void session.join(code, name).then(success => { if (success) setView("room"); }); }}/>}</div>
        {room && !debate && room.debate && <DebateHistory debate={room.debate} players={room.players} you={room.you}/>}
        {room && !debate && room.judge?.enabled && <JudgeConversation room={room} theme={theme}/>}
      </>}
      <PreviousDebates listResults={session.listResults} getResult={session.getResult}/>
      <footer className="site-footer"><span>{theme.ui.tagline}</span><span>Digital Sidekick · Stage 6B · Personal lawyers, neutral judge and jury</span></footer>
    </main>
  </div></CharacterSpeechProvider>;
}
