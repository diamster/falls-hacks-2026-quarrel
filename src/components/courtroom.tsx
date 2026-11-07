import { Character } from "./character";
import { JungleBackdrop, JudgeBench } from "./pixel-art";
import { PixelIcon } from "./ui";
import type { CharacterStates } from "@/lib/preview";

export function Courtroom({states, dialogue, dialogueIndex, paused, roomCode, playerNames, multiplayer = false}: {states: CharacterStates; dialogue: string; dialogueIndex: number; paused: boolean; roomCode?: string; playerNames?: {lion: string; zebra: string}; multiplayer?: boolean}) {
  return <section className="courtroom pixel-panel" aria-label="Tropical pixel-art courtroom" data-paused={paused}>
    <JungleBackdrop className="jungle-backdrop"/>
    <div className="court-vignette"/>
    <div className="court-room-code"><span className="status-dot"/> ROOM <strong>{multiplayer ? roomCode ?? "— — —" : "JNGL-42"}</strong><span className="demo-tag">{multiplayer ? "PRIVATE" : "DEMO"}</span></div>
    <div className="turn-timer" aria-label={multiplayer ? "Waiting room: debate not started" : "Turn timer placeholder: one minute"}><PixelIcon name="clock"/><strong>{multiplayer ? "LOBBY" : "01:00"}</strong><span>{multiplayer ? "TAKE YOUR SEAT" : "DEMO TIMER"}</span></div>
    <div className="judge-speech" data-paused={paused} role="status" aria-live="polite" aria-atomic="true">
      <div className="speech-heading"><span className="status-dot"/> JUDGE MOKI <span>{multiplayer ? "LOBBY GREETING" : "NEUTRAL · AI PREVIEW"}</span></div>
      <p key={dialogueIndex} className="speech-text">{dialogue}</p>
    </div>
    <div className="court-characters">
      <Character id="lion" state={states.lion} paused={paused} displayName={playerNames?.lion} hideStance={multiplayer}/>
      <Character id="lemur" state={states.lemur} paused={paused}/>
      <Character id="zebra" state={states.zebra} paused={paused} displayName={playerNames?.zebra} hideStance={multiplayer}/>
    </div>
    <div className="judge-bench"><JudgeBench/><div className="bench-label">JUDGE MOKI<span>THE JUNGLE COURT</span></div></div>
    <div className="court-caption"><PixelIcon name="leaf"/><span>A fair hearing. A wild setting.</span><PixelIcon name="leaf"/></div>
  </section>;
}
