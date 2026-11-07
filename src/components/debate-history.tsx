import { CharacterSprite } from "./pixel-art";
import { SectionHeading } from "./ui";
import { characters, type DebateEntry } from "@/lib/preview";

export function DebateHistory({entries}: {entries: DebateEntry[]}) {
  return <section className="history-panel pixel-panel" aria-labelledby="history-title">
    <SectionHeading aside={<span className="panel-counter">{String(entries.length).padStart(2,"0")} ENTRIES</span>}><span id="history-title">The debate so far</span></SectionHeading>
    <ol className="history-list" aria-label="Local debate history">
      {entries.map(entry=><li key={entry.id} className={`history-entry history-entry--${characters[entry.speaker].color}`}>
        <div className="history-avatar"><CharacterSprite character={entry.speaker}/></div><div><div className="entry-meta"><strong>{characters[entry.speaker].name}</strong><span>{characters[entry.speaker].stance}</span><span className="entry-tag">{entry.tag}</span></div><p>{entry.text}</p></div>
      </li>)}
    </ol>
    <div className="history-footnote">A practice transcript. New entries stay in this tab.</div>
  </section>;
}
