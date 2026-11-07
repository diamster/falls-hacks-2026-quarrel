"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useRoomClient } from "@/lib/room-client";
import { getTheme } from "@/themes";
import { themeStyles } from "@/themes/styles";
import { LeaveRoomControl } from "./room-controls";
import { PixelButton, PixelIcon } from "./ui";
import styles from "./share-invite.module.css";

export function ShareInvite({ code, issue }: { code: string | null; issue: "missing" | "invalid" | null }) {
  const session = useRoomClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");
  const inFlight = useRef(false);
  const savedRoom = session.room;
  const sameRoom = Boolean(code && savedRoom?.code === code);
  const savedName = savedRoom?.players.find(player => player.slot === savedRoom.you)?.name;
  const theme = getTheme(sameRoom ? savedRoom?.themeId : undefined);
  const busy = submitting || session.pending;
  const error = localError || session.error;
  const nameValid = Boolean(name.trim()) && Array.from(name.trim()).length <= 32 && !/[\u0000-\u001f\u007f]/.test(name);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code || !nameValid || session.loading || savedRoom || session.offline || busy || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setLocalError("");
    try {
      if (await session.join(code, name.trim())) {
        // The API must establish membership first. The invitation is a lookup
        // code, never a player identity or authority to enter the room.
        router.replace(`/?room=${encodeURIComponent(code)}`);
      }
    } catch {
      setLocalError("We couldn’t join this room. Please try again.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return <div className={styles.shell} style={themeStyles(theme)} data-theme={theme.id}>
    <Link className={styles.brand} href="/?start=1" aria-label="quarrel.io home"><span className={styles.brandMark}><PixelIcon name="chat"/></span>quarrel.io</Link>
    <main className={styles.card} aria-labelledby="invite-title">
      <div className={styles.heading}>
        <span className={styles.seal} aria-hidden="true"><PixelIcon name="gavel"/></span>
        <p className={styles.eyebrow}>{code ? "YOU’RE INVITED · PRIVATE ROOM" : "ROOM INVITATION"}</p>
        <h1 id="invite-title" className={code ? styles.code : styles.invalidTitle}>{code ?? "Check your invitation"}</h1>
      </div>
      {!code ? <div className={styles.content}>
        <p>{issue === "missing" ? "This link is missing its room code. Ask your friend to send the complete invitation." : "This invitation’s room code isn’t valid. Ask your friend to copy and send the invitation again."}</p>
      </div> : <div className={styles.content}>
        {(error || session.offline) && <div className={styles.error} role="alert"><p>{error || "We couldn’t connect to your room. Please try reconnecting."}</p>{session.offline && <PixelButton tone="cream" disabled={busy || session.loading} onClick={() => { void session.refresh(); }}>Try reconnecting</PixelButton>}</div>}
        {session.loading ? <p className={styles.status} role="status">Checking for your saved seat…</p>
          : sameRoom && savedRoom ? <div className={styles.saved}>
            <p>You already have a seat in this room{savedName ? <> as <strong>{savedName}</strong></> : ""}.</p>
            <Link className={styles.openRoom} href={`/?room=${encodeURIComponent(savedRoom.code)}`}>Open room<PixelIcon name="arrow"/></Link>
          </div>
            : savedRoom ? <div className={styles.saved}>
              <h2>You have another room saved</h2>
              <p>You’re currently in <strong>{savedRoom.code}</strong>. Resume it, or leave that seat before joining this invitation.</p>
              <Link className={styles.resume} href={`/?room=${encodeURIComponent(savedRoom.code)}`}>Resume your room<PixelIcon name="arrow"/></Link>
              <LeaveRoomControl key={savedRoom.id} pending={busy} offline={session.offline} label="Leave current room" onLeave={() => session.leaveRoom(savedRoom.id)}/>
              <p className={styles.note}>This invitation will stay here while you decide.</p>
            </div>
              : <form className={styles.form} onSubmit={event => { void join(event); }} aria-label="Join invited room" aria-busy={busy} aria-describedby="invite-note">
                <p>Choose a display name and take your seat.</p>
                <label className={styles.field} htmlFor="invite-name">Your display name<input id="invite-name" name="name" autoComplete="nickname" maxLength={32} required value={name} disabled={busy || session.offline} onChange={event => setName(Array.from(event.target.value).slice(0, 32).join(""))} placeholder="What should we call you?"/></label>
                <PixelButton className={styles.join} tone="orange" type="submit" disabled={!nameValid || busy || session.offline}>{busy ? "Joining…" : "Join room"}<PixelIcon name="arrow"/></PixelButton>
                <p id="invite-note" className={styles.note}>Your name is shown to the other player. No account needed.</p>
              </form>}
      </div>}
      <footer className={styles.footer}><Link href="/?start=1">Back to start</Link><span>Two voices. A fair hearing.</span></footer>
    </main>
  </div>;
}
