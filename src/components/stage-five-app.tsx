"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { useRoomClient } from "@/lib/room-client";
import { getTheme } from "@/themes";
import { themeStyles } from "@/themes/styles";
import { DebateArena } from "./debate-arena";
import { DebateHistory } from "./debate-ui";
import { JudgeConversation } from "./judge-panel";
import { LawyerDebateView, LawyerSetup } from "./lawyer-debate";
import { LeaveRoomControl, RoomEntry, RoomLobby } from "./room-controls";
import { SettingsDialog } from "./settings-page";
import { PixelButton, PixelIcon, SectionHeading } from "./ui";
import { useDisplayPreferences } from "./display-preferences";
import "./stage-five-app.css";

export function StageFiveApp() {
  const session = useRoomClient();
  const { preferences, updatePreferences } = useDisplayPreferences();
  const [view, setView] = useState<"auto" | "start" | "room">("auto");
  const [initialCode, setInitialCode] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const paused = preferences.pauseAnimations || preferences.reducedMotion;
  const players = { A: { name: room?.players.find(player => player.slot === "A")?.name ?? "Player A" }, B: { name: room?.players.find(player => player.slot === "B")?.name ?? "Player B" } };
  const lobbyDialogue = !room ? "Welcome. Create a private room or join your friend. Your own lawyer will help you present your case."
    : !debate ? "This earlier debate record is preserved. Start a new room to debate with personal lawyers."
    : debate.planReady ? "Your subtopic plan is ready. Review it together; the host starts when you are both ready."
    : debate.phase === "planning" ? "The planner is preparing balanced questions for both positions."
    : !debate.topic ? "Host, set the topic and writing time. Each participant then writes their own position."
    : "Review each other's positions and confirm readiness. Your lawyers will help present your arguments.";
  const openSettings = () => setSettingsOpen(true);
  const settingsLabel = "Preview themes in Settings";

  const header = <header className="site-header"><div className="header-inner"><a className="brand" href="/?start=1" onClick={home} aria-label="quarrel.io home"><span className="brand-mark"><PixelIcon name="chat"/></span><span>quarrel<span className="brand-dot">.</span>io</span></a><div className="header-divider"/><span className="brand-caption">YOUR VOICE.<br/>A FAIR HEARING.</span><nav aria-label="Main navigation"><a href="/?start=1" onClick={home}>{room ? "Back to start" : "Start"}</a><button type="button" aria-haspopup="dialog" onClick={openSettings}>Settings</button><a href="/preview">Art preview ↗</a></nav><div className="stage-badge">STAGE 05 <span>/ YOUR LAWYER SIDEKICK</span></div></div></header>;
  const error = session.error && <div className="room-error" role="alert"><p>{session.error}</p>{session.offline && <button onClick={() => { void session.refresh(); }}>Try reconnecting</button>}</div>;
  const settings = <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} session={session}/>;
  const footer = (controls?: ReactNode) => <footer className="site-footer"><span>{theme.ui.tagline}</span>{controls}<span>Digital Sidekick · Stage 5 · Personal lawyers, neutral judge and jury</span></footer>;

  if (room && debate && started) return <div className="theme-shell stage-five-shell" data-theme={theme.id} style={themeStyles(theme)}>
    <a className="skip-link" href="#courtroom-content">Skip to courtroom</a>
    {header}
    <main id="courtroom-content" className="app-shell stage-five-debate" tabIndex={-1}>
      {error}
      <LawyerDebateView room={room} theme={theme} clocks={session.lawyerClocks} pending={session.pending} offline={session.offline} paused={paused} onSend={session.sendToLawyer} onConsult={session.consultLawyer}/>
      <details className="stage-five-room-details"><summary>Room connection, invitation and leave controls</summary><RoomLobby room={room} theme={theme} pending={session.pending} offline={session.offline} live={session.live} onReady={ready => { void session.setReady(ready); }} onLeave={() => leave(room.id)}/></details>
      {footer()}
    </main>
    {settings}
  </div>;

  // Before a debate starts, the theme's scene fills the screen and the controls float over it in two
  // columns: your seat on the left, the debate setup and the setting on the right.
  const roomPanel = session.loading || view === "auto" ? <section className="room-panel pixel-panel room-loading" role="status">Checking for your seat…</section>
    : room ? <RoomLobby key={room.id} room={room} theme={theme} readOnly={!debate} pending={session.pending} offline={session.offline} live={session.live} onReady={ready => { void session.setReady(ready); }} onLeave={() => leave(room.id)}/>
    : session.room ? <section className="room-panel pixel-panel"><SectionHeading eyebrow="WELCOME BACK">Your room is saved</SectionHeading><div className="room-panel-body saved-room-body"><p>Your previous room and record remain available.</p><strong>{session.room.code}</strong><PixelButton onClick={() => navigate("room")}>Resume room<PixelIcon name="arrow"/></PixelButton><LeaveRoomControl pending={session.pending} offline={session.offline} onLeave={() => leave(session.room!.id)} label="Create or join another room"/></div></section>
    : <RoomEntry theme={theme} pending={session.pending} initialCode={initialCode} onCreate={name => { void session.create(name).then(success => { if (success) setView("room"); }); }} onJoin={(code, name) => { void session.join(code, name).then(success => { if (success) setView("room"); }); }}/>;
  const pauseButton = <PixelButton tone="cream" className="pause-button" aria-pressed={preferences.pauseAnimations} onClick={() => updatePreferences({ pauseAnimations: !preferences.pauseAnimations })}><PixelIcon name={preferences.pauseAnimations ? "play" : "pause"}/>{preferences.pauseAnimations ? "Resume animation" : "Pause animation"}</PixelButton>;
  return <div className="theme-shell theme-shell--fit stage-five-shell" data-theme={theme.id} style={themeStyles(theme)}>
    <a className="skip-link" href="#courtroom-content">Skip to courtroom</a>
    {header}
    <main id="courtroom-content" className="app-shell lobby-shell" tabIndex={-1}>
      <section className="topic-bar lobby-title" aria-label="Room lobby">
        <p className="lobby-wordmark" aria-hidden="true">quarrel<span>.</span>io</p>
        <div className="topic-copy"><p className="eyebrow">{theme.ui.benchCaption} <span>TWO-PLAYER LOBBY</span></p><h1>{debate?.topic ?? "Every great debate starts with hello."}</h1></div>
        <section className="room-confirmation room-confirmation--inline" aria-live="polite" aria-atomic="true">
          <h2>{debate?.topic ? `${debate.totalSeconds / 60} minutes of writing time each` : "A fair hearing. A shared starting line."}</h2>
          <p>{room ? "Each player writes and confirms their own position. The host starts once the plan is ready." : "Create or join a room, set a topic and your positions, then both choose ready."}</p>
        </section>
      </section>
      {error}
      <div className="lobby-column lobby-column--left">
        {roomPanel}
        {room && !debate && <section className="pixel-panel stage-five-legacy"><h2>Earlier debate record</h2><p>This room keeps its original theme and history. Create a new room to use personal lawyers, subtopics and the jury.</p></section>}
      </div>
      <DebateArena theme={theme} players={players} dialogue={lobbyDialogue} dialogueKey={`${theme.id}:${room?.id}:${debate?.phase}:${debate?.planReady}`} judgeState="speaking" judgeLabel="YOUR NEUTRAL JUDGE" paused={paused} roomCode={room?.code}/>
      <div className="lobby-column lobby-column--right">
        {room && debate && <LawyerSetup room={room} pending={session.pending} offline={session.offline} onPropose={session.proposeLawyerTopic} onPosition={session.setOwnPosition} onPlan={regenerate => session.planDebate(debate.revision, regenerate)} onStart={session.startLawyerDebate}/>}
        <section className="pixel-panel lobby-setting" aria-labelledby="lobby-setting-title">
          <SectionHeading eyebrow="THE SETTING"><span id="lobby-setting-title">{theme.displayName}</span></SectionHeading>
          <div className="lobby-setting-body">
            <p><strong>{theme.judge.displayName}</strong> {theme.judge.personality}</p>
            <PixelButton tone="cream" aria-haspopup="dialog" onClick={openSettings}>{settingsLabel}<PixelIcon name="arrow"/></PixelButton>
          </div>
        </section>
        {room && !debate && room.debate && <DebateHistory debate={room.debate} players={room.players} you={room.you}/>}
        {room && !debate && room.judge?.enabled && <JudgeConversation room={room} theme={theme}/>}
      </div>
      {footer(pauseButton)}
    </main>
    {settings}
  </div>;
}
