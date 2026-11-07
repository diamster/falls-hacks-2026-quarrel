"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DebateArena } from "./debate-arena";
import { ThemeSelector } from "./theme-selector";
import { PixelButton, PixelIcon, SectionHeading } from "./ui";
import { CharacterAsset } from "@/themes/assets";
import { getTheme, resolvePlayerCharacter, type ThemeConfig } from "@/themes";
import { themeStyles } from "@/themes/styles";
import { getGameMode } from "@/lib/game-modes";
import { useRoomClient } from "@/lib/room-client";
import type { RoomSnapshot } from "@/lib/room-types";

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
      <PixelButton tone={you?.ready ? "cream" : "green"} disabled={pending || offline || !you} aria-pressed={you?.ready ?? false} onClick={() => onReady(!you?.ready)}>{pending ? "Updating…" : you?.ready ? "I’m not ready" : "I’m ready"}</PixelButton>
      <p className="room-sync-note" role="status">{offline ? "Connection lost. Reconnecting…" : live ? "Live room updates connected." : "Connecting live updates. Checking the room every 10 seconds."}</p>
      <p className="room-fine-print">Your seat survives a refresh in this browser. Keep the invitation private. Disconnections appear within about 45 seconds.</p>
    </div>
  </section>;
}

export function MultiplayerApp() {
  const session = useRoomClient();
  const [initialCode, setInitialCode] = useState("");
  const [paused, setPaused] = useState(false);
  const [preview, setPreview] = useState<{ themeId: string; sampleId: string } | null>(null);
  useEffect(() => { setInitialCode(new URLSearchParams(window.location.search).get("room")?.toUpperCase().slice(0, 6) ?? ""); }, []);
  const room = session.room;
  const theme = getTheme(room?.themeId);
  const playerA = room?.players.find(player => player.slot === "A");
  const playerB = room?.players.find(player => player.slot === "B");
  const confirmed = Boolean(room?.bothReady && !session.offline);
  const sample = preview?.themeId === theme.id ? theme.judge.samples.find(item => item.id === preview.sampleId) : undefined;
  const dialogue = sample?.text ?? (confirmed ? theme.judge.dialogue.ready : room ? theme.judge.dialogue.lobby : theme.judge.dialogue.welcome);
  const dialogueKey = `${theme.id}-${sample ? `sample-${sample.id}` : confirmed ? "ready" : room ? "lobby" : "welcome"}`;
  return <div className="theme-shell" data-theme={theme.id} style={themeStyles(theme)}>
    <a className="skip-link" href="#courtroom-content">Skip to courtroom</a>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="/" aria-label="quarrel.io home"><span className="brand-mark"><PixelIcon name="chat"/></span><span>quarrel<span className="brand-dot">.</span>io</span></a>
      <div className="header-divider"/><span className="brand-caption">BIG OPINIONS.<br/>FAIR HEARINGS.</span>
      <nav aria-label="Main navigation"><a href="#courtroom-content" className="nav-current">The courtroom</a><a href="/preview">Art preview ↗</a></nav>
      <div className="stage-badge"><span className="status-dot"/>STAGE 02.5 <span>/ FOUR WORLDS</span></div>
    </div></header>
    <main id="courtroom-content" className="app-shell" tabIndex={-1}>
      <section className="topic-bar" aria-label="Room lobby"><div className="topic-icon"><PixelIcon name="gavel"/></div><div className="topic-copy"><p className="eyebrow">{theme.ui.benchCaption} <span>· TWO-PLAYER LOBBY</span></p><h1>Every great debate starts with hello.</h1></div><div className="round-placeholder"><span className="eyebrow">WAITING ROOM</span><span>Find your friend. Take your seat.</span></div></section>
      {session.error && <div className="room-error" role="alert"><p>{session.error}</p>{session.offline && <button onClick={() => { void session.refresh(); }}>Try reconnecting</button>}</div>}
      <ThemeSelector selectedId={theme.id} hasRoom={Boolean(room)} canEdit={room?.you === "A" && !session.offline} pending={session.pending} locked={Boolean(room?.themeLocked)} onSelect={id => { void session.setTheme(id); }}/>
      <div className="court-layout room-court-layout">
        <div className="arena-column">
          <DebateArena theme={theme} players={{ A: { name: playerA?.name ?? "Player A", characterId: playerA?.selectedCharacterId }, B: { name: playerB?.name ?? "Player B", characterId: playerB?.selectedCharacterId } }} dialogue={dialogue} dialogueKey={dialogueKey} paused={paused} roomCode={room?.code}/>
          <section className="judge-preview pixel-panel" aria-label="Judge personality preview">
            <div><p className="eyebrow">MEET {theme.judge.displayName.toUpperCase()}</p><p>{theme.judge.personality}</p></div>
            <label htmlFor="theme-judge-dialogue">Judge dialogue preview<select id="theme-judge-dialogue" aria-label="Judge dialogue preview" value={sample?.id ?? "lobby"} onChange={event => setPreview({ themeId: theme.id, sampleId: event.target.value })}>
              <option value="lobby">Lobby greeting</option>{theme.judge.samples.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select><span>Sample lines in this tab. No AI is connected.</span></label>
          </section>
        </div>
        {session.loading ? <section className="room-panel pixel-panel room-loading" aria-live="polite"><PixelIcon name="leaf"/><p>Checking for your seat…</p></section>
          : room ? <RoomLobby theme={theme} room={room} pending={session.pending} offline={session.offline} live={session.live} onReady={ready => { void session.setReady(ready); }}/>
          : <RoomEntry theme={theme} pending={session.pending} initialCode={initialCode} onCreate={name => { void session.create(name); }} onJoin={(code, name) => { void session.join(code, name); }}/>}
      </div>
      <section className={`room-confirmation pixel-panel ${confirmed ? "is-confirmed" : ""}`} aria-live="polite" aria-atomic="true">
        <PixelIcon name={confirmed ? "spark" : "leaf"}/><div><h2>{confirmed ? "Ready to start — both players confirmed!" : "A fair hearing. A shared starting line."}</h2><p>{confirmed ? "Your room is ready. Stage 2.5 ends here; no debate has started." : "Create or join a room, then both players choose ready. Topics, arguments and judging arrive in later stages."}</p></div>
        <PixelButton tone="cream" aria-pressed={paused} onClick={() => setPaused(value => !value)}><PixelIcon name={paused ? "play" : "pause"}/>{paused ? "Resume animation" : "Pause animation"}</PixelButton>
      </section>
      <footer className="site-footer"><span><PixelIcon name="leaf"/> {theme.ui.tagline}</span><span>Made for Digital Sidekick <span className="footer-star">✦</span> Stage 2.5 · Multi-theme lobby</span></footer>
    </main>
  </div>;
}
