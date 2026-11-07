"use client";

import { useRoomClient } from "@/lib/room-client";
import { getTheme } from "@/themes";
import { themeStyles } from "@/themes/styles";
import { useDisplayPreferences } from "./display-preferences";
import { ThemeSelector } from "./theme-selector";
import { PixelButton, PixelIcon, SectionHeading } from "./ui";
import "./settings-page.css";

export function SettingsPage() {
  const session = useRoomClient();
  const { preferences, updatePreferences, storageAvailable } = useDisplayPreferences();
  const room = session.room;
  const theme = getTheme(room?.themeId);
  const locked = Boolean(room?.themeLocked || room?.debate?.startedAt);
  const roomHref = room ? `/?room=${encodeURIComponent(room.code)}` : "/?start=1";
  return <div className="theme-shell settings-shell" data-theme={theme.id} style={themeStyles(theme)}>
    <a className="skip-link" href="#settings-content">Skip to settings</a>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="/?start=1" aria-label="quarrel.io home"><span className="brand-mark"><PixelIcon name="chat"/></span><span>quarrel<span className="brand-dot">.</span>io</span></a>
      <nav aria-label="Main navigation"><a href={roomHref}>{room ? "Back to room" : "Back to start"}</a><a href="/settings" aria-current="page" className="nav-current">Settings</a></nav>
    </div></header>
    <main id="settings-content" className="app-shell settings-content" tabIndex={-1}>
      <div className="settings-introduction"><p className="eyebrow">MAKE YOURSELF COMFORTABLE</p><h1>Settings</h1><p>Your display preferences are personal. The room’s setting is shared with your opponent.</p></div>
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
          <p className="settings-save-note" role="status">{storageAvailable ? "Display preferences are saved in this browser." : "Browser storage is unavailable. Your preferences still apply in this tab, but may reset when you leave."}</p>
        </div>
      </section>
      <a className="settings-return pixel-button pixel-button--cream" href={roomHref}>{room ? "Return to your room" : "Return to start"}<PixelIcon name="arrow"/></a>
    </main>
  </div>;
}
