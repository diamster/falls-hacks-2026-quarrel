"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { DebateArena } from "./debate-arena";
import { ThemeSelector } from "./theme-selector";
import { PixelButton, PixelIcon, SectionHeading } from "./ui";
import { CharacterAsset } from "@/themes/assets";
import { getTheme, resolvePlayerCharacter, type ThemeConfig } from "@/themes";
import { themeStyles } from "@/themes/styles";
import { getGameMode } from "@/lib/game-modes";
import { useRoomClient } from "@/lib/room-client";
import type { RoomSnapshot } from "@/lib/room-types";
import { DebateComplete, DebateHistory, DebateProgress, DebateSetup, DebateTurnPanel, PositionSummary, debateAnnouncement, formatTurnTime, roundLabels } from "./debate-ui";

export function RoomEntry({ pending, initialCode, onCreate, onJoin, theme = getTheme() }: {
  pending: boolean; initialCode: string; theme?: ThemeConfig;
  onCreate: (name: string) => void; onJoin: (code: string, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [mode, setMode] = useState<"create" | "join">(initialCode ? "join" : "create");
  useEffect(() => { if (initialCode) { setCode(initialCode); setMode("join"); } }, [initialCode]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !name.trim() || (mode === "join" && !/^[A-Z0-9]{6}$/.test(code))) return;
    if (mode === "create") onCreate(name.trim()); else onJoin(code, name.trim());
  }
  return <section className="room-panel pixel-panel" aria-labelledby="room-entry-title">
    <SectionHeading eyebrow={theme.ui.seatLabel}>Meet in a private room</SectionHeading>
    <div className="room-panel-body">
      <p id="room-entry-title" className="room-intro">Two players. One invitation. No account needed.</p>
      <div className="room-mode-switch" aria-label="Room action">
        <button type="button" aria-pressed={mode === "create"} disabled={pending} onClick={() => setMode("create")}>Create a room</button>
        <button type="button" aria-pressed={mode === "join"} disabled={pending} onClick={() => setMode("join")}>Join a room</button>
      </div>
      <form onSubmit={submit}>
        <label className="room-field" htmlFor="player-name">Your display name<input id="player-name" name="name" autoComplete="nickname" maxLength={32} required value={name} onChange={event => setName(event.target.value.slice(0, 32))} disabled={pending} placeholder="How should we call you?"/></label>
        {mode === "join" && <label className="room-field" htmlFor="join-code">Six-character room code<input id="join-code" name="room" autoComplete="off" autoCapitalize="characters" spellCheck={false} minLength={6} maxLength={6} required pattern="[A-Z0-9]{6}" value={code} onChange={event => setCode(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6))} disabled={pending} placeholder="ABC234"/></label>}
        <PixelButton tone="orange" type="submit" disabled={pending || !name.trim() || (mode === "join" && code.length !== 6)}>{pending ? "Finding your seat…" : mode === "create" ? "Create private room" : "Join private room"}<PixelIcon name="arrow"/></PixelButton>
        <p className="room-fine-print">{mode === "create" ? `You’ll be Player A. Invite a friend to join as Player B.` : "You’ll join as Player B. The room holds exactly two players."}</p>
      </form>
    </div>
  </section>;
}

export function RoomLobby({ room, pending, offline, live, onReady, theme = getTheme(room.themeId) }: {
  room: RoomSnapshot; pending: boolean; offline: boolean; live: boolean; theme?: ThemeConfig; onReady: (ready: boolean) => void;
}) {
  const [copied, setCopied] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => { setShareUrl(`${window.location.origin}/?room=${encodeURIComponent(room.code)}`); }, [room.code]);
  const you = room.players.find(player => player.slot === room.you);
  const started = Boolean(room.debate && room.debate.phase !== "setup");
  async function copy() {
    try { await navigator.clipboard.writeText(shareUrl); setCopied("Invitation copied."); }
    catch { setCopied("Copy the invitation from the link field above."); }
  }
  return <section className="room-panel pixel-panel" aria-labelledby="lobby-title">
    <SectionHeading eyebrow="PRIVATE ROOM"><span id="lobby-title">{theme.ui.lobbyTitle}</span></SectionHeading>
    <div className="room-panel-body">
      <div className="room-code-label"><span className="eyebrow">INVITE WITH CODE</span><strong>{room.code}</strong></div>
      <label className="room-field" htmlFor="share-url">Shareable invitation<input id="share-url" readOnly value={shareUrl} onFocus={event => event.target.select()}/></label>
      <PixelButton tone="cream" className="room-copy" onClick={() => { void copy(); }}>Copy invite link</PixelButton>
      <p className="room-copy-status" role="status">{copied}</p>
      <ul className="room-player-list" aria-label="Room players">
        {getGameMode(room.mode).slots.map(slot => {
          const player = room.players.find(item => item.slot === slot);
          const character = resolvePlayerCharacter(theme, slot, player?.selectedCharacterId);
          return <li key={slot} className="room-player">
            <div className="room-player-art"><CharacterAsset assetId={character.assetId} label={character.description}/></div>
            <div className="room-player-info"><span className="eyebrow">PLAYER {slot} · {character.roleLabel.toUpperCase()}{slot === room.you ? " · YOU" : ""}</span><strong>{player?.name ?? "Waiting for a friend"}</strong><span className="room-connection"><i className={`status-dot ${player?.connected ? "" : "status-dot--offline"}`}/>{player ? player.connected ? "Connected" : "Disconnected" : "Seat available"}</span></div>
            <span className={`room-readiness ${player?.ready ? "is-ready" : ""}`}>{player ? player.ready ? "Ready" : "Not ready" : "—"}</span>
          </li>;
        })}
      </ul>
      {started ? <p className="room-sync-note">{room.debate?.phase === "verdict" ? "All rounds are complete. Your room and record remain available." : "The debate is underway. Your seats and agreed positions are locked."}</p> : <PixelButton tone={you?.ready ? "cream" : "green"} disabled={pending || offline || !you} aria-pressed={you?.ready ?? false} onClick={() => onReady(!you?.ready)}>{pending ? "Updating…" : you?.ready ? "I’m not ready" : "I’m ready"}</PixelButton>}
      <p className="room-sync-note" role="status">{offline ? "Connection lost. Reconnecting…" : live ? "Live room updates connected." : "Connecting live updates. Checking the room every 10 seconds."}</p>
      <p className="room-fine-print">Your seat survives a refresh in this browser. Keep the invitation private. Disconnections appear within about 45 seconds.</p>
    </div>
  </section>;
}

export function MultiplayerApp() {
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
  const dialogue = started && debate ? debateAnnouncement(theme, debate, speaker) : sample?.text ?? (confirmed ? theme.judge.dialogue.ready : debate ? debateAnnouncement(theme, debate, speaker) : room ? theme.judge.dialogue.lobby : theme.judge.dialogue.welcome);
  const dialogueKey = `${theme.id}-${started ? `${debate?.phase}-${debate?.turnIndex}` : sample ? `sample-${sample.id}` : confirmed ? "ready" : room ? "lobby" : "welcome"}`;
  const roundNumber = debate?.phase === "opening" ? 1 : debate?.phase === "rebuttal" ? 2 : 3;
  return <div className={`theme-shell${started ? " stage-three-active" : ""}`} data-theme={theme.id} style={themeStyles(theme)}>
    <a className="skip-link" href="#courtroom-content">Skip to courtroom</a>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="/?start=1" onClick={backToStart} aria-label="quarrel.io home"><span className="brand-mark"><PixelIcon name="chat"/></span><span>quarrel<span className="brand-dot">.</span>io</span></a>
      <div className="header-divider"/><span className="brand-caption">BIG OPINIONS.<br/>FAIR HEARINGS.</span>
      <nav aria-label="Main navigation">{room ? <a href="/?start=1" onClick={backToStart}>Back to start</a> : <a href="#courtroom-content" className="nav-current">The courtroom</a>}<a href="/preview">Art preview ↗</a></nav>
      <div className="stage-badge"><span className="status-dot"/>STAGE 03 <span>/ THREE ROUNDS</span></div>
    </div></header>
    <main id="courtroom-content" className="app-shell" tabIndex={-1}>
      <section className="topic-bar" aria-label={started ? "Debate topic" : "Room lobby"}><div className="topic-icon"><PixelIcon name="gavel"/></div><div className="topic-copy"><p className="eyebrow">{theme.ui.benchCaption} <span>· {started ? "THE AGREED QUESTION" : "TWO-PLAYER LOBBY"}</span></p><h1>{started ? debate?.topic : "Every great debate starts with hello."}</h1></div><div className="round-placeholder"><span className="eyebrow">{complete ? "COMPLETE" : started ? `ROUND ${roundNumber} OF 3` : "WAITING ROOM"}</span><span>{complete ? "The debate record is ready." : started && debate?.phase !== "setup" ? roundLabels[debate!.phase as keyof typeof roundLabels] : "Find your friend. Take your seat."}</span></div></section>
      {session.error && <div className="room-error" role="alert"><p>{session.error}</p>{session.offline && <button onClick={() => { void session.refresh(); }}>Try reconnecting</button>}</div>}
      {started ? <div className="debate-theme-lock"><PixelIcon name="spark"/><strong>{theme.displayName} · {theme.judge.displayName}</strong><span>Theme locked for this debate</span></div> : <ThemeSelector selectedId={theme.id} hasRoom={Boolean(room)} canEdit={room?.you === "A" && !session.offline} pending={session.pending} locked={Boolean(room?.themeLocked)} onSelect={id => { void session.setTheme(id); }}/>}
      {room && debate?.phase === "setup" && <DebateSetup room={room} debate={debate} pending={session.pending} offline={session.offline} onPropose={session.proposeTopic} onApprove={session.approveTopic} onRequestChanges={session.requestChanges} onStart={session.startDebate}/>}
      {started && debate && <><DebateProgress phase={debate.phase}/><PositionSummary debate={debate}/></>}
      {complete && debate && <DebateComplete debate={debate}/>}
      <div className="court-layout room-court-layout">
        <div className="arena-column">
          <DebateArena theme={theme} players={{ A: { name: playerA?.name ?? "Player A", characterId: playerA?.selectedCharacterId }, B: { name: playerB?.name ?? "Player B", characterId: playerB?.selectedCharacterId } }} dialogue={dialogue} dialogueKey={dialogueKey} paused={paused} roomCode={room?.code} turn={started && debate ? { label: complete ? "ALL ROUNDS COMPLETE" : `ROUND ${roundNumber} · PLAYER ${debate.activeSlot}`, time: complete ? "DONE" : formatTurnTime(session.remainingSeconds), activeSlot: debate.activeSlot, complete } : undefined}/>
          {started && !complete && room && debate && <DebateTurnPanel key={`${room.id}-${debate.turnIndex}`} room={room} debate={debate} remainingSeconds={session.remainingSeconds} pending={session.pending} offline={session.offline} onSubmit={session.submitArgument}/>}
          {!started && <section className="judge-preview pixel-panel" aria-label="Judge personality preview">
            <div><p className="eyebrow">MEET {theme.judge.displayName.toUpperCase()}</p><p>{theme.judge.personality}</p></div>
            <label htmlFor="theme-judge-dialogue">Judge dialogue preview<select id="theme-judge-dialogue" aria-label="Judge dialogue preview" value={sample?.id ?? "lobby"} onChange={event => setPreview({ themeId: theme.id, sampleId: event.target.value })}>
              <option value="lobby">Lobby greeting</option>{theme.judge.samples.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select><span>Sample lines in this tab. No AI is connected.</span></label>
          </section>}
        </div>
        {session.loading || view === "auto" ? <section className="room-panel pixel-panel room-loading" aria-live="polite"><PixelIcon name="leaf"/><p>Checking for your seat…</p></section>
          : room ? <RoomLobby theme={theme} room={room} pending={session.pending} offline={session.offline} live={session.live} onReady={ready => { void session.setReady(ready); }}/>
          : session.room ? <section className="room-panel pixel-panel" aria-labelledby="saved-room-title">
            <SectionHeading eyebrow="WELCOME BACK"><span id="saved-room-title">Your room is saved</span></SectionHeading>
            <div className="room-panel-body saved-room-body">
              <p>This is the start screen. Your previous room is still available whenever you want to return.</p>
              <div className="room-code-label"><span className="eyebrow">SAVED ROOM</span><strong>{session.room.code}</strong></div>
              <p>{session.room.debate?.phase === "verdict" ? "The debate is complete. Resume to view its record." : "Returning to start does not pause a live debate."}</p>
              <PixelButton tone="green" onClick={() => navigate("room")}>Resume room<PixelIcon name="arrow"/></PixelButton>
              <p className="room-fine-print">For a fresh room, use a separate browser or private window. This browser keeps your saved seat.</p>
            </div>
          </section>
          : <RoomEntry theme={theme} pending={session.pending} initialCode={initialCode} onCreate={name => { void session.create(name).then(success => { if (success) setView("room"); }); }} onJoin={(code, name) => { void session.join(code, name).then(success => { if (success) setView("room"); }); }}/>}
      </div>
      {started && room && debate && <DebateHistory debate={debate} players={room.players} you={room.you}/>}
      <section className={`room-confirmation pixel-panel ${confirmed ? "is-confirmed" : ""}`} aria-live="polite" aria-atomic="true">
        <PixelIcon name={confirmed ? "spark" : "leaf"}/><div><h2>{started ? "Different views. Equal time." : confirmed ? "Ready to start — both players confirmed!" : "A fair hearing. A shared starting line."}</h2><p>{started ? "Pausing the artwork does not pause the shared turn clock." : confirmed ? "Approve the same topic and positions. Player A chooses when to start." : "Create or join a room, agree on a topic and positions, then both players choose ready."}</p></div>
        <PixelButton tone="cream" aria-pressed={paused} onClick={() => setPaused(value => !value)}><PixelIcon name={paused ? "play" : "pause"}/>{paused ? "Resume animation" : "Pause animation"}</PixelButton>
      </section>
      <footer className="site-footer"><span><PixelIcon name="leaf"/> {theme.ui.tagline}</span><span>Made for Digital Sidekick <span className="footer-star">✦</span> Stage 3 · Scripted debate flow</span></footer>
    </main>
  </div>;
}
