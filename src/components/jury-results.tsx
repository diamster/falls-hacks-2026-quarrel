"use client";

import { useEffect, useRef, useState } from "react";
import type { LawyerDebateSnapshot } from "@/lib/lawyer-types";
import type { RoomSnapshot } from "@/lib/room-types";
import type { ThemeConfig } from "@/themes";
import { CharacterAsset } from "@/themes/assets";
import styles from "./jury-results.module.css";

/** Pause before each step of the reveal, in milliseconds. */
const STEP_MS = { intro: 1400, subtopic: 1200, outcome: 1700 } as const;

function prefersStill(element: Element | null) {
  if (element?.closest('[data-reduced-motion="true"], [data-pause-animations="true"]')) return true;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/**
 * The jury's decision as a sequenced reveal in a native modal dialog: the jury
 * steps up, each subtopic's line appears in turn, then the outcome and the
 * reasoning. Skip shows everything at once; reduced motion starts that way.
 * Closing returns to the page, where the full record stays available.
 */
export function JuryResults({ debate, room, theme, onClose }: { debate: LawyerDebateSnapshot; room: RoomSnapshot; theme: ThemeConfig; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const verdict = debate.verdict;
  const lines = verdict?.perSubtopic ?? [];
  // steps: 0 intro, 1..n subtopic lines, n+1 outcome, n+2 reasoning
  const total = lines.length + 3;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (prefersStill(element)) setShown(total);
    if (!element.open) {
      if (typeof element.showModal === "function") element.showModal();
      else element.setAttribute("open", "");
    }
    return () => { if (element.open && typeof element.close === "function") element.close(); };
  }, [total]);

  useEffect(() => {
    if (shown >= total) return;
    const delay = shown === 0 ? STEP_MS.intro : shown <= lines.length ? STEP_MS.subtopic : STEP_MS.outcome;
    const timer = window.setTimeout(() => setShown(value => Math.min(total, value + 1)), delay);
    return () => window.clearTimeout(timer);
  }, [shown, total, lines.length]);

  // Skip disappears when the reveal ends; keep keyboard focus inside the dialog.
  useEffect(() => {
    if (shown >= total && document.activeElement === skipButton.current) closeButton.current?.focus();
  }, [shown, total]);

  if (!verdict) return null;
  const done = shown >= total;
  const winner = verdict.outcome === "A" || verdict.outcome === "B" ? room.players.find(player => player.slot === verdict.outcome)?.name ?? `Player ${verdict.outcome}` : null;
  const source = debate.history.find(item => item.kind === "jury_verdict" && item.status === "complete")?.source;
  const isYou = verdict.outcome === room.you;
  const visible = (step: number) => shown >= step;

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="jury-results-title" data-outcome={verdict.outcome} data-done={done}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className={styles.frame}>
      <header className={styles.header}>
        <div className={styles.jury} data-speaking={!done}><CharacterAsset assetId={theme.jury.assetId} label={theme.jury.description}/></div>
        <div>
          <p className="eyebrow">FINAL JURY DECISION</p>
          <p id="jury-results-title" className={styles.title}>{theme.jury.displayName} has reached a decision</p>
          {source && source !== "ai" && <p className={styles.source}>{source === "demo" ? "Demo verdict" : "Fallback verdict"}, no live AI evaluation</p>}
        </div>
      </header>
      <div className={styles.body}>
        <ol className={styles.lines} aria-label="Each subtopic">
          {lines.map((line, index) => <li key={line.ordinal} className={styles.step} data-shown={visible(index + 1)}>
            <span className={styles.badge}>{line.ordinal}</span>
            <p data-readable-text><strong className="sr-only">Subtopic {line.ordinal}: </strong>{line.text}</p>
          </li>)}
        </ol>
        <section className={`${styles.outcome} ${styles.step}`} data-shown={visible(lines.length + 1)} aria-live="polite">
          {winner && <p className={styles.banner} aria-hidden="true">{winner}</p>}
          {!winner && <p className={styles.banner} aria-hidden="true">Split</p>}
          <h2>{verdict.outcome === "split" ? "Split decision / inconclusive" : `The stronger presented case: ${winner}`}</h2>
          {winner && <p className={styles.personal}>{isYou ? "Your side presented the stronger case." : "The other side presented the stronger case this time."}</p>}
        </section>
        <section className={`${styles.reasoning} ${styles.step}`} data-shown={visible(lines.length + 2)}>
          <h3>Why</h3>
          <p data-readable-text>{verdict.reasoning}</p>
          <p className={styles.fineprint}>This evaluates the arguments presented here. It does not decide who is factually or morally right. Private consultations are excluded.</p>
        </section>
      </div>
      <footer className={styles.footer}>
        {!done && <button ref={skipButton} type="button" className="pixel-button pixel-button--cream" autoFocus onClick={() => setShown(total)}>Skip to the decision</button>}
        <button ref={closeButton} type="button" className="pixel-button pixel-button--orange" autoFocus={done} onClick={onClose}>{done ? "Close and view the record" : "Close"}</button>
      </footer>
    </div>
  </dialog>;
}
