"use client";

import { useEffect, useRef } from "react";
import { useRoomClient } from "@/lib/room-client";
import { getTheme } from "@/themes";
import { themeStyles } from "@/themes/styles";
import { isLawyerArtStyle } from "@/themes/art/pixel/roster";
import { useDisplayPreferences } from "./display-preferences";
import { ThemeSelector } from "./theme-selector";
import { PixelButton, PixelIcon, SectionHeading } from "./ui";
import "./settings-page.css";

type RoomSession = ReturnType<typeof useRoomClient>;

/** Shared room theme and personal display preferences, used by the Settings popup and the /settings page. */
export function SettingsPanel({ session }: { session: RoomSession }) {
  const { preferences, updatePreferences, storageAvailable } = useDisplayPreferences();
  const room = session.room;
  const theme = getTheme(room?.themeId);
  const locked = Boolean(room?.themeLocked || room?.debate?.startedAt);
  return <>
    <section className="settings-room" aria-labelledby="room-settings-title">
      <div className="settings-section-label"><h2 id="room-settings-title">Shared room settings</h2><span>{room ? `Room ${room.code} · Player ${room.you}` : "No room selected"}</span></div>
      {session.loading ? <p className="settings-status pixel-panel" role="status">Checking your room…</p> : <>
        {session.error && <div className="room-error" role="alert"><p>{session.error}</p>{session.offline && <PixelButton tone="cream" onClick={() => { void session.refresh(); }}>Try reconnecting</PixelButton>}</div>}
        <ThemeSelector selectedId={theme.id} hasRoom={Boolean(room)} canEdit={room?.you === "A" && !session.offline} pending={session.pending} locked={locked} onSelect={id => { void session.setTheme(id); }}/>
        <p className="settings-help">{locked ? "The debate has started, so its theme is locked. Your personal display preferences below can still change." : room ? "Theme changes update both players’ setting and character personalities. Your room and player seat stay saved while you visit Settings." : "Preview the four settings here. Create a room first to choose the setting for both players."}</p>
        {room && <p className="settings-help" role="status">{session.offline ? "Room connection lost. Theme changes are unavailable until you reconnect." : session.live ? "Live room updates connected." : "Connecting live updates. The room is checked every 10 seconds."}</p>}
      </>}
    </section>
    <section className="pixel-panel settings-personal" aria-labelledby="personal-settings-title">
      <SectionHeading eyebrow="ONLY ON THIS BROWSER"><span id="personal-settings-title">Personal display</span></SectionHeading>
      <div className="settings-body">
        <p>These controls change your view only. They never pause debate clocks, change another player’s view, or affect how arguments are evaluated.</p>
        <label className="settings-checkbox"><input type="checkbox" checked={preferences.pauseAnimations} onChange={event => updatePreferences({ pauseAnimations: event.target.checked })}/><span><strong>Pause artwork animations</strong><small>Keep characters and decorative animation still.</small></span></label>
        <label className="settings-checkbox"><input type="checkbox" checked={preferences.reducedMotion} onChange={event => updatePreferences({ reducedMotion: event.target.checked })}/><span><strong>Reduce motion</strong><small>Remove movement and transitions. Your device’s reduced-motion preference is also respected.</small></span></label>
        <label className="settings-select" htmlFor="display-text-size"><span><strong>Dialogue and transcript text size</strong><small>Make messages and writing areas easier to read.</small></span><select id="display-text-size" value={preferences.textSize} onChange={event => updatePreferences({ textSize: event.target.value === "large" ? "large" : "standard" })}><option value="standard">Standard</option><option value="large">Large</option></select></label>
          <label className="settings-select" htmlFor="display-lawyer-art"><span><strong>Lawyer artwork</strong><small>Choose how lawyers look on your screen. Your opponent and the AI are not affected.</small></span><select id="display-lawyer-art" value={preferences.lawyerArt} onChange={event => updatePreferences({ lawyerArt: isLawyerArtStyle(event.target.value) ? event.target.value : "theme" })}><option value="theme">Theme default</option><option value="classic">Original drawings</option><option value="remaster">Pixel remaster</option><option value="mascot">Mascots</option></select></label>
        <p className="settings-save-note" role="status">{storageAvailable ? "Display preferences are saved in this browser." : "Browser storage is unavailable. Your preferences still apply in this tab, but may reset when you leave."}</p>
      </div>
    </section>
  </>;
}

/** Settings as a modal popup over the current screen; the room and its clocks keep running underneath. */
export function SettingsDialog({ open, onClose, session }: { open: boolean; onClose: () => void; session: RoomSession }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="settings-dialog pixel-panel" aria-labelledby="settings-dialog-title" onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    {open && <div className="settings-dialog-inner">
      <div className="settings-dialog-heading">
        <div><p className="eyebrow">MAKE YOURSELF COMFORTABLE</p><h2 id="settings-dialog-title">Settings</h2></div>
        <button type="button" className="dialog-close" aria-label="Close settings" onClick={onClose}><PixelIcon name="close"/></button>
      </div>
      <p className="settings-dialog-intro">Your display preferences are personal. The room’s setting is shared with your opponent.</p>
      <SettingsPanel session={session}/>
      <PixelButton tone="cream" className="settings-dialog-done" onClick={onClose}>Done</PixelButton>
    </div>}
  </dialog>;
}

/** Direct /settings links keep working as a full page. */
export function SettingsPage() {
  const session = useRoomClient();
  const room = session.room;
  const theme = getTheme(room?.themeId);
  const roomHref = room ? `/?room=${encodeURIComponent(room.code)}` : "/?start=1";
  return <div className="theme-shell settings-shell" data-theme={theme.id} style={themeStyles(theme)}>
    <a className="skip-link" href="#settings-content">Skip to settings</a>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="/?start=1" aria-label="quarrel.io home"><span className="brand-mark"><PixelIcon name="chat"/></span><span>quarrel<span className="brand-dot">.</span>io</span></a>
      <nav aria-label="Main navigation"><a href={roomHref}>{room ? "Back to room" : "Back to start"}</a><a href="/settings" aria-current="page" className="nav-current">Settings</a></nav>
    </div></header>
    <main id="settings-content" className="app-shell settings-content" tabIndex={-1}>
      <div className="settings-introduction"><p className="eyebrow">MAKE YOURSELF COMFORTABLE</p><h1>Settings</h1><p>Your display preferences are personal. The room’s setting is shared with your opponent.</p></div>
      <SettingsPanel session={session}/>
      <a className="settings-return pixel-button pixel-button--cream" href={roomHref}>{room ? "Return to your room" : "Return to start"}<PixelIcon name="arrow"/></a>
    </main>
  </div>;
}
