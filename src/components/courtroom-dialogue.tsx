import type { LawyerPublicMessage } from "@/lib/lawyer-types";
import type { SpeechRole } from "@/themes/speech";
import type { ThemeConfig } from "@/themes";
import styles from "./courtroom-dialogue.module.css";

export function CourtroomDialogue({ theme, message = null, playbackRole = null }: {
  theme: ThemeConfig; message?: LawyerPublicMessage | null; playbackRole?: SpeechRole | null;
}) {
  const slot = message?.kind === "argument" ? message.slot : null;
  const speaker = slot ? `${theme.lawyers[slot].displayName} (Lawyer ${slot})`
    : message?.kind === "jury_verdict" ? playbackRole === "judge" ? `${theme.judge.displayName} · Jury announcement` : theme.jury.displayName
    : message ? theme.judge.displayName : "The courtroom";
  return <section className={`pixel-panel ${styles.dialogue}`} aria-label="Current courtroom dialogue" data-speaker={slot ?? (message?.kind === "jury_verdict" ? "jury" : "judge")}>
    <div className={styles.heading}><span className="eyebrow">{message ? "PUBLIC DIALOGUE" : "READY WHEN YOU ARE"}</span><strong>{speaker}</strong></div>
    <div key={message?.id ?? "waiting"} className={styles.text} tabIndex={0} role="region" aria-label="Current public message" aria-live="polite" aria-atomic="true">
      <p data-readable-text>{message?.text ?? "Public lawyer presentations and judge announcements will appear here. Your private consultations stay private."}</p>
    </div>
    {message?.source && message.source !== "ai" && message.kind !== "announcement" && <small>{message.source === "demo" ? "Demo dialogue" : "Fallback dialogue"}</small>}
  </section>;
}
