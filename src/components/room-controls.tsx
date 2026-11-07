"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { getTheme, resolvePlayerCharacter, type ThemeConfig } from "@/themes";
import { CharacterAsset } from "@/themes/assets";
import { getGameMode } from "@/lib/game-modes";
import type { RoomSnapshot } from "@/lib/room-types";
import { PixelButton, PixelIcon, SectionHeading } from "./ui";

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

export function LeaveRoomControl({ pending, offline, onLeave, label = "Leave this room" }: {
  pending: boolean; offline: boolean; onLeave: () => Promise<boolean>; label?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const wasConfirming = useRef(false);
  const descriptionId = useId();
  useEffect(() => {
    if (confirming) container.current?.focus();
    else if (wasConfirming.current) container.current?.querySelector("button")?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  async function confirm() {
    if (pending || offline || leaving) return;
    setLeaving(true);
    try { await onLeave(); } finally { setLeaving(false); }
  }
  if (!confirming) return <div ref={container} className="room-leave"><PixelButton tone="cream" disabled={pending || offline} onClick={() => setConfirming(true)}>{label}</PixelButton></div>;
  return <div ref={container} className="room-leave room-leave-confirmation" role="group" aria-label="Leave room confirmation" aria-describedby={descriptionId} tabIndex={-1}>
    <h3>Leave this room?</h3>
    <p id={descriptionId}>You won’t be able to return to this seat. The debate record stays available to the remaining player. Any active turn timers keep running.</p>
    <p>You can then create or join another room in this browser.</p>
    <div className="room-leave-actions"><PixelButton tone="orange" disabled={pending || offline || leaving} onClick={() => { void confirm(); }}>{leaving ? "Leaving…" : "Leave room"}</PixelButton><PixelButton tone="cream" disabled={pending || leaving} onClick={() => setConfirming(false)}>Cancel</PixelButton></div>
  </div>;
}

export function RoomLobby({ room, pending, offline, live, onReady, onLeave, readOnly = false, theme = getTheme(room.themeId) }: {
  room: RoomSnapshot; pending: boolean; offline: boolean; live: boolean; readOnly?: boolean; theme?: ThemeConfig; onReady: (ready: boolean) => void; onLeave?: () => Promise<boolean>;
}) {
  const [copied, setCopied] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => { setShareUrl(`${window.location.origin}/share/?room=${encodeURIComponent(room.code)}`); }, [room.code]);
  const you = room.players.find(player => player.slot === room.you);
  const started = readOnly || (room.lawyer ? Boolean(room.lawyer.startedAt) : Boolean(room.debate && room.debate.phase !== "setup"));
  async function copy() {
    try { await navigator.clipboard.writeText(shareUrl); setCopied("Invitation copied."); }
    catch { setCopied("Copy the invitation from the link field above."); }
  }
  return <section className="room-panel pixel-panel" aria-labelledby="lobby-title">
    <SectionHeading eyebrow="PRIVATE ROOM"><span id="lobby-title">{theme.ui.lobbyTitle}</span></SectionHeading>
    <div className="room-panel-body">
      <div className="room-code-label"><span className="eyebrow">INVITE WITH CODE</span><strong>{room.code}</strong></div>
      <div className="room-invite-row">
        <label className="room-field" htmlFor="share-url">Shareable invitation<input id="share-url" readOnly value={shareUrl} onFocus={event => event.target.select()}/></label>
        <PixelButton tone="cream" className="room-copy" onClick={() => { void copy(); }}>Copy invite link</PixelButton>
      </div>
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
      {started ? <p className="room-sync-note">{(room.lawyer?.phase === "complete" || room.debate?.phase === "verdict") ? "All rounds are complete. Your room and record remain available." : "The debate is underway. Your seats and agreed positions are locked."}</p> : <PixelButton tone={you?.ready ? "cream" : "green"} disabled={pending || offline || !you || Boolean(room.lawyer && !(room.you === "A" ? room.lawyer.confirmedA : room.lawyer.confirmedB))} aria-pressed={you?.ready ?? false} onClick={() => onReady(!you?.ready)}>{pending ? "Updating…" : you?.ready ? "I’m not ready" : "I’m ready"}</PixelButton>}
      <p className="room-sync-note" role="status">{offline ? "Connection lost. Reconnecting…" : live ? "Live room updates connected." : "Connecting live updates. Checking the room every 10 seconds."}</p>
      <p className="room-fine-print">Your seat survives a refresh in this browser. Keep the invitation private. Disconnections appear within about 45 seconds.</p>
      {onLeave && <LeaveRoomControl pending={pending} offline={offline} onLeave={onLeave}/>}
    </div>
  </section>;
}
