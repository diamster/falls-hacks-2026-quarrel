"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PixelIcon } from "./ui";
import styles from "./debate-history-panel.module.css";

export interface DebateHistoryPanelProps {
  /** Render only the member-filtered public transcript, oldest entry first. */
  children: ReactNode;
  /** Change when a public entry is appended or its pending presentation completes. */
  latestMessageId: string | null;
  currentSubtopic?: string | null;
  title?: string;
}

/** Presentation only: private lawyer conversations belong in a separate panel. */
export function DebateHistoryPanel({ children, latestMessageId, currentSubtopic, title = "Debate history" }: DebateHistoryPanelProps) {
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const previousMessage = useRef(latestMessageId);
  const following = useRef(true);
  const savedScrollTop = useRef(0);
  const focusAfterExpand = useRef(false);
  const [followingLatest, setFollowingLatest] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [unread, setUnread] = useState(false);

  function followNewest(focus = false) {
    const element = viewport.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    savedScrollTop.current = element.scrollTop;
    following.current = true;
    setFollowingLatest(true);
    setUnread(false);
    if (focus) element.focus({ preventScroll: true });
  }

  useEffect(() => {
    const changed = previousMessage.current !== latestMessageId;
    previousMessage.current = latestMessageId;
    if (following.current) followNewest();
    else {
      // Opening the mobile disclosure must not discard the reader's place.
      if (viewport.current) viewport.current.scrollTop = savedScrollTop.current;
      if (changed) setUnread(true);
    }
    if (focusAfterExpand.current && expanded) {
      viewport.current?.focus({ preventScroll: true });
      focusAfterExpand.current = false;
    }
  }, [latestMessageId, expanded]);

  function onScroll() {
    const element = viewport.current;
    if (!element) return;
    savedScrollTop.current = element.scrollTop;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 48;
    following.current = atBottom;
    setFollowingLatest(atBottom);
    if (atBottom) setUnread(false);
  }

  return <aside className={`${styles.panel} pixel-panel`} aria-labelledby={`${id}-title`}>
    <header className={styles.heading}>
      <div><p className="eyebrow">SHARED RECORD</p><h2 id={`${id}-title`}>{title}</h2></div>
      <button className={styles.toggle} type="button" aria-expanded={expanded} aria-controls={`${id}-body`} onClick={() => setExpanded(value => !value)}>
        {expanded ? "Hide history" : "Show history"}<PixelIcon name={expanded ? "close" : "chat"}/>
      </button>
    </header>
    {currentSubtopic && <p className={styles.subtopic}><span className="eyebrow">CURRENT SUBTOPIC</span><strong>{currentSubtopic}</strong></p>}
    <div id={`${id}-body`} className={styles.body} data-expanded={expanded}>
      <div ref={viewport} className={styles.messages} role="log" aria-label="Public debate messages" aria-live={followingLatest ? "polite" : "off"} aria-relevant="additions text" aria-atomic="false" tabIndex={0} onScroll={onScroll}>
        {children}
      </div>
      <p className={styles.footnote}>Shared with both players. Private consultations stay separate.</p>
    </div>
    <div className={styles.updates} aria-live="polite" aria-atomic="true">
      {unread && <button type="button" onClick={() => {
        followNewest(expanded);
        if (!expanded) { focusAfterExpand.current = true; setExpanded(true); }
      }}>New messages · jump to latest<PixelIcon name="arrow"/></button>}
    </div>
  </aside>;
}
