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
import { GameMenu } from "./game-menu";
import { SettingsDialog } from "./settings-page";
import { PixelButton, PixelIcon, SectionHeading } from "./ui";
import { useDisplayPreferences } from "./display-preferences";
import "./stage-five-app.css";
import { CharacterSpeechProvider } from "./character-speech";
import { PreviousDebates } from "./lawyer-results";

export function StageFiveApp() {
  const session = useRoomClient();
  const { preferences } = useDisplayPreferences();
  const [view, setView] = useState<"auto" | "start" | "room">("auto");
  const [initialCode, setInitialCode] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const layout = room && debate && started ? "game" : "lobby";
  // Decided during render (not in an effect) so the game's first frame already carries the animation class.
  const [seenLayout, setSeenLayout] = useState<{ layout: "game" | "lobby"; entering: boolean } | null>(null);
  if (!session.loading && view !== "auto" && seenLayout?.layout !== layout) setSeenLayout({ layout, entering: layout === "game" && seenLayout?.layout === "lobby" });
  const enteringGame = layout === "game" && Boolean(seenLayout?.entering);
  const settingsLabel = "Preview themes in Settings";

  const brand = <a className="brand" href="/?start=1" onClick={home} aria-label="Quarrel home"><span className="brand-mark"><PixelIcon name="chat"/></span><span>Quarrel</span></a>;
  const header = <header className="site-header"><div className="header-inner">{brand}<nav aria-label="Main navigation"><a href="/?start=1" onClick={home}>{room ? "Back to start" : "Start"}</a><button type="button" aria-haspopup="dialog" onClick={openSettings}>Settings</button></nav></div></header>;
  const error = session.error && <div className="room-error" role="alert"><p>{session.error}</p>{session.offline && <button onClick={() => { void session.refresh(); }}>Try reconnecting</button>}</div>;
  const settings = <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} session={session}/>;

  // In a game there is no header: just the logo and a menu over the courtroom. The game fills the viewport;
  // arriving from the lobby in this tab plays a short zoom into the courtroom.
  const speechProps = { roomId: room?.id ?? null, debateId: debate?.debateId ?? null, themeId: theme.id, messages: debate?.history ?? [] };
  if (room && debate && started) return <CharacterSpeechProvider {...speechProps}><div className={`theme-shell stage-five-shell game-shell${enteringGame ? " game-shell--entering" : ""}`} data-theme={theme.id} style={themeStyles(theme)}>
    <a className="skip-link" href="#courtroom-content">Skip to courtroom</a>
    <div className="game-overlay">
      {brand}
      <div className="game-overlay-actions"><button type="button" className="game-history-toggle" aria-pressed={historyOpen} aria-controls="debate-history-drawer" onClick={() => setHistoryOpen(open => !open)}>History<PixelIcon name={historyOpen ? "close" : "chat"}/></button>
      <GameMenu roomCode={room.code} onSettings={openSettings} onHome={() => navigate("start")}>
        <RoomLobby room={room} theme={theme} pending={session.pending} offline={session.offline} live={session.live} onReady={ready => { void session.setReady(ready); }} onLeave={() => leave(room.id)}/>
      </GameMenu></div>
    </div>
    <main id="courtroom-content" className="game-stage" tabIndex={-1}>
      {error}
      <LawyerDebateView room={room} theme={theme} clocks={session.lawyerClocks} pending={session.pending} offline={session.offline} paused={paused} onSend={session.sendToLawyer} onConsult={session.consultLawyer} onAcknowledge={session.acknowledgeResults} onRematch={session.requestRematch} onRetryJury={session.retryJury} historyOpen={historyOpen} onHistoryOpenChange={setHistoryOpen}/>
    </main>
    {settings}
  </div></CharacterSpeechProvider>;

  // Before a debate starts, the theme's scene fills the screen and the controls float over it in two
  // columns: your seat on the left, the debate setup and the setting on the right.
  const roomPanel = session.loading || view === "auto" ? <section className="room-panel pixel-panel room-loading" role="status">Checking for your seat…</section>
    : room ? <RoomLobby key={room.id} room={room} theme={theme} readOnly={!debate} pending={session.pending} offline={session.offline} live={session.live} onReady={ready => { void session.setReady(ready); }} onLeave={() => leave(room.id)}/>
    : session.room ? <section className="room-panel pixel-panel"><SectionHeading eyebrow="WELCOME BACK">Your room is saved</SectionHeading><div className="room-panel-body saved-room-body"><p>Your previous room and record remain available.</p><strong>{session.room.code}</strong><PixelButton onClick={() => navigate("room")}>Resume room<PixelIcon name="arrow"/></PixelButton><LeaveRoomControl pending={session.pending} offline={session.offline} onLeave={() => leave(session.room!.id)} label="Create or join another room"/></div></section>
    : <RoomEntry theme={theme} pending={session.pending} initialCode={initialCode} onCreate={name => { void session.create(name).then(success => { if (success) setView("room"); }); }} onJoin={(code, name) => { void session.join(code, name).then(success => { if (success) setView("room"); }); }}/>;
  return <CharacterSpeechProvider {...speechProps}><div className="theme-shell theme-shell--fit stage-five-shell" data-theme={theme.id} style={themeStyles(theme)}>
    <a className="skip-link" href="#courtroom-content">Skip to courtroom</a>
    {header}
    <main id="courtroom-content" className="app-shell lobby-shell" tabIndex={-1}>
      <section className="topic-bar lobby-title" aria-label="Room lobby">
        {debate?.topic ? <div className="topic-copy"><p className="eyebrow">TODAY’S QUESTION</p><h1>{debate.topic}</h1></div> : <h1 className="lobby-wordmark">Quarrel</h1>}
        <section className="room-confirmation room-confirmation--inline" aria-live="polite" aria-atomic="true">
          {debate?.topic && <h2>{`${debate.totalSeconds / 60} minutes of writing time each`}</h2>}
          <p>{room ? "Each player writes and confirms their own position. The host starts once the plan is ready." : "Create or join a room, set a topic and your positions, then both choose ready."}</p>
        </section>
      </section>
      {error}
      <div className="lobby-column lobby-column--left">
        {roomPanel}
        {!session.loading && view !== "auto" && <PreviousDebates listResults={session.listResults} getResult={session.getResult}/>}
        {room && !debate && <section className="pixel-panel stage-five-legacy"><h2>Earlier debate record</h2><p>This room keeps its original theme and history. Create a new room to use personal lawyers, subtopics and the jury.</p></section>}
      </div>
      <DebateArena theme={theme} players={players} dialogue={lobbyDialogue} dialogueKey={`${theme.id}:${room?.id}:${debate?.phase}:${debate?.planReady}`} judgeState="speaking" judgeLabel="YOUR NEUTRAL JUDGE" paused={paused} roomCode={room?.code} showTimer={false}/>
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
    </main>
    {settings}
  </div></CharacterSpeechProvider>;
}
