"use client";

import { useEffect, useRef, useState } from "react";
import type { JuryVerdict, LawyerResultDetail, LawyerResultRecord } from "@/lib/lawyer-types";
import type { PlayerSlot } from "@/lib/room-types";
import { getTheme } from "@/themes";
import { PixelButton } from "./ui";
import { SpeechMessageControls } from "./character-speech";
import styles from "./lawyer-debate.module.css";

export function SavedVerdict({ verdict, players }: { verdict: JuryVerdict; players: { slot: PlayerSlot; name: string }[] }) {
  const decision = verdict.decision ?? verdict.outcome;
  const name = (slot: PlayerSlot) => players.find(player => player.slot === slot)?.name ?? `Player ${slot}`;
  const title = decision === "tie" ? "The presented cases are tied" : decision === "inconclusive" ? "The evidence is inconclusive" : decision === "split" ? "Split decision / inconclusive" : `The stronger presented case: ${name(decision)}`;
  return <><h2>{title}</h2>{verdict.topic && <p data-readable-text><strong>Topic:</strong> {verdict.topic}</p>}
    {(verdict.positionA || verdict.positionB) && <div className={styles.positions}>{(["A", "B"] as const).map(slot => <div key={slot}><strong>{name(slot)}’s position</strong><p data-readable-text>{slot === "A" ? verdict.positionA : verdict.positionB}</p></div>)}</div>}
    <p data-readable-text>{verdict.reasoning}</p>
    {verdict.strongestArguments && <div className={styles.positions}>{(["A", "B"] as const).map(slot => <div key={slot}><strong>{name(slot)} · strongest reasoning</strong><p data-readable-text>{verdict.strongestArguments![slot]}</p>{Boolean(verdict.weaknesses?.[slot].length) && <><strong>Weaknesses / unsupported claims</strong><ul>{verdict.weaknesses![slot].map((text, index) => <li key={index} data-readable-text>{text}</li>)}</ul></>}</div>)}</div>}
    <ol>{verdict.perSubtopic.map(item => <li key={item.ordinal}><strong>Subtopic {item.ordinal}</strong><p data-readable-text>{item.text}</p></li>)}</ol>
    {verdict.subtopicSummaries && <details><summary>Judge’s saved subtopic summaries</summary><ol>{verdict.subtopicSummaries.map(item => <li key={item.ordinal}><strong>Subtopic {item.ordinal}</strong><p data-readable-text>{item.text}</p>{item.source !== "ai" && <small>{item.source === "demo" ? "Demo summary" : "Fallback summary"}</small>}</li>)}</ol></details>}
    {verdict.compromise && <section><h3>Possible compromise</h3><p data-readable-text>{verdict.compromise}</p></section>}
    <p className={styles.help}>This evaluates the arguments presented here. It does not decide who is factually or morally right. Private consultations are excluded.</p>
  </>;
}

export type ResultsActions = {
  listResults: (roomId?: string) => Promise<LawyerResultRecord[] | null>;
  getResult: (debateId: string) => Promise<LawyerResultDetail | null>;
};

/** Loading older results never replaces the current room or its running clocks. */
export function PreviousDebates({ listResults, getResult }: ResultsActions) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<LawyerResultRecord[]>([]);
  const [selected, setSelected] = useState<LawyerResultDetail | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  async function browse() {
    if (open) { request.current++; setOpen(false); setLoading(false); return; }
    const id = ++request.current;
    setOpen(true); setLoading(true); setSelected(null); setError("");
    const next = await listResults();
    if (request.current !== id) return;
    if (next) setRecords(next); else setError("Previous results could not be loaded. Close and reopen to try again.");
    setLoading(false);
  }
  async function select(id: string) {
    const token = ++request.current;
    setLoading(true); setError("");
    const next = await getResult(id);
    if (request.current !== token) return;
    if (next) { setSelected(next); setFilter("all"); } else setError("That saved result is unavailable. Try selecting it again.");
    setLoading(false);
  }
  const theme = getTheme(selected?.themeId);
  const messages = selected?.history.filter(message => filter === "all" || (filter === "summaries" ? message.kind === "judge_summary" : message.subtopic === Number(filter))) ?? [];
  return <section className={`pixel-panel ${styles.archive}`} aria-label="Previous debate results">
    <PixelButton tone="cream" aria-expanded={open} onClick={() => { void browse(); }}>{open ? "Close previous debates" : "Previous debates"}</PixelButton>
    {open && <div className={styles.archiveBody}>
      <h2>Previous debates</h2><p className={styles.help}>Your saved public results. Opening a result does not pause an active debate.</p>
      {loading && <p role="status">Loading saved results…</p>}{error && <p role="alert">{error}</p>}
      {!loading && !error && !records.length && <p>No completed debates yet.</p>}
      {records.length > 0 && <label className={styles.historyFilter}>Saved debate<select value={selected?.id ?? ""} disabled={loading} onChange={event => { if (event.target.value) void select(event.target.value); }}><option value="" disabled>Choose a completed debate</option>{records.map(record => <option key={record.id} value={record.id}>{record.topic} · {new Date(record.completedAt).toLocaleString()}</option>)}</select></label>}
      {selected && <article className={styles.verdict} aria-label="Archived verdict"><SavedVerdict verdict={selected.verdict} players={selected.players}/>
        <p className={styles.help}>Result acknowledged: {selected.acknowledgements.A ? "Player A ✓" : "Player A pending"} · {selected.acknowledgements.B ? "Player B ✓" : "Player B pending"}. Acknowledgement does not mean agreement.</p>
        <label className={styles.historyFilter}>Review archived messages<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All public messages</option><option value="summaries">Judge summaries</option>{selected.subtopics.map(subtopic => <option key={subtopic.ordinal} value={subtopic.ordinal}>Subtopic {subtopic.ordinal}: {subtopic.question}</option>)}</select></label>
        <ol className={styles.transcript}>{messages.map(message => <li key={message.id} className={styles.message} data-kind={message.kind} data-slot={message.slot}><strong>{message.kind === "argument" ? `Player ${message.slot} · ${message.slot ? theme.lawyers[message.slot].displayName : "Lawyer"}` : message.kind === "jury_verdict" ? theme.jury.displayName : theme.judge.displayName}</strong><p data-readable-text>{message.text}</p><SpeechMessageControls message={message} roomId={selected.roomId} debateId={selected.id} themeId={selected.themeId}/></li>)}</ol>
      </article>}
    </div>}
  </section>;
}
