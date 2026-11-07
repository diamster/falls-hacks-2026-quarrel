import { CharacterSprite } from "./pixel-art";
import { PixelButton, PixelIcon } from "./ui";
import { characters, characterStates, isAnimatedState, judgeDialogue, type CharacterId, type CharacterState, type CharacterStates } from "@/lib/preview";

export function PreviewControls({selected, onSelect, states, onState, dialogueIndex, onDialogue, paused, onPause, onReset}: {
  selected: CharacterId; onSelect: (id: CharacterId)=>void;
  states: CharacterStates; onState: (state: CharacterState)=>void;
  dialogueIndex: number; onDialogue: (index: number)=>void;
  paused: boolean; onPause: ()=>void; onReset: ()=>void;
}) {
  const state = states[selected];
  return <aside className="preview-panel pixel-panel" aria-labelledby="preview-heading">
    <div className="preview-panel-title"><PixelIcon name="spark"/><div><span className="eyebrow">MAKE A LITTLE SCENE</span><h2 id="preview-heading">Director’s booth</h2></div><span className="tiny-label">01</span></div>
    <div className="preview-panel-body">
      <p className="muted preview-intro">Try a pose. Give the judge a line.</p>
      <fieldset className="character-picker"><legend className="field-label">01 <span>Choose a character</span></legend><div className="character-options">
        {(Object.keys(characters) as CharacterId[]).map(id=><button key={id} type="button" className={`character-option ${selected === id ? "is-selected" : ""}`} aria-pressed={selected === id} onClick={()=>onSelect(id)}>
          <CharacterSprite character={id}/><span>{characters[id].species}</span>
        </button>)}
      </div></fieldset>
      <div className="state-control"><label htmlFor="character-state" className="field-label">02 <span>Character state</span></label>
        <select id="character-state" value={state} onChange={event=>onState(event.target.value as CharacterState)}>{characterStates.map(value=><option key={value} value={value}>{value.charAt(0).toUpperCase()+value.slice(1)}{!isAnimatedState(value) ? " (placeholder)" : ""}</option>)}</select>
        <p className="state-caption" role="status"><span className={`state-indicator ${isAnimatedState(state) ? "" : "state-indicator--placeholder"}`}/>{characters[selected].name} · {isAnimatedState(state) ? `${state} animation` : `${state} placeholder · idle pose`}</p>
      </div>
      <div className="dialogue-control"><label htmlFor="judge-dialogue" className="field-label">03 <span>Give Moki a line</span></label>
        <select id="judge-dialogue" value={dialogueIndex} onChange={event=>onDialogue(Number(event.target.value))}>{judgeDialogue.map((line,index)=><option key={line.label} value={index}>{line.label}</option>)}</select>
        <div className="dialogue-pagination"><button type="button" aria-label="Previous judge dialogue" onClick={()=>onDialogue((dialogueIndex-1+judgeDialogue.length)%judgeDialogue.length)}>←</button><span>SAMPLE {dialogueIndex+1} / {judgeDialogue.length}</span><button type="button" aria-label="Next judge dialogue" onClick={()=>onDialogue((dialogueIndex+1)%judgeDialogue.length)}>→</button></div>
      </div>
      <div className="preview-actions"><PixelButton tone="cream" onClick={onPause} aria-pressed={paused}><PixelIcon name={paused ? "play" : "pause"}/>{paused ? "Resume motion" : "Pause motion"}</PixelButton><button type="button" className="reset-button" onClick={onReset}><PixelIcon name="reset"/>Reset preview</button></div>
    </div>
  </aside>;
}
