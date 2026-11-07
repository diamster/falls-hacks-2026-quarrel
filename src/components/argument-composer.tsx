import { PixelButton, PixelIcon, SectionHeading } from "./ui";
import type { FormEvent } from "react";

export function ArgumentComposer({draft, onDraft, onSubmit, onObjection, notice}: {draft: string; onDraft: (value:string)=>void; onSubmit: (event:FormEvent<HTMLFormElement>)=>void; onObjection: ()=>void; notice:string}) {
  return <section className="composer-panel pixel-panel" aria-labelledby="composer-title">
    <SectionHeading aside={<span className="writing-as"><span className="status-dot"/> AS LEO</span>}><span id="composer-title">Make your case.</span></SectionHeading>
    <form onSubmit={onSubmit}>
      <label htmlFor="argument" className="sr-only">Your practice argument</label>
      <textarea id="argument" value={draft} onChange={event=>onDraft(event.target.value.slice(0,500))} maxLength={500} placeholder="The floor is yours. What’s your take?" aria-describedby="composer-help argument-count"/>
      <div className="composer-meta"><p id="composer-help">Local preview · no judging or turn rules</p><span id="argument-count">{draft.length}/500</span></div>
      <div className="composer-actions"><PixelButton tone="orange" type="button" onClick={onObjection}><span className="objection-symbol">!</span>Objection!</PixelButton><PixelButton type="submit" disabled={!draft.trim()}>Submit<PixelIcon name="arrow"/></PixelButton></div>
      <p className="composer-notice" role="status" aria-live="polite">{notice || "Try the controls. Every good debate starts somewhere."}</p>
    </form>
  </section>;
}
