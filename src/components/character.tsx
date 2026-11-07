import { CharacterSprite } from "./pixel-art";
import { characters, isAnimatedState, type CharacterId, type CharacterState } from "@/lib/preview";

export function Character({id, state, paused = false}: {id: CharacterId; state: CharacterState; paused?: boolean}) {
  const character = characters[id];
  return <div className={`character character--${id}`} data-state={state} data-motion={isAnimatedState(state) ? state : "idle"} data-paused={paused}>
    <div className="character-sprite"><CharacterSprite character={id}/></div>
    {id !== "lemur" && <div className={`character-nameplate nameplate--${character.color}`}>
      <span className="stance-tag">{character.stance}</span><strong>{character.name}</strong><span>{character.role}</span>
    </div>}
    <span className="sr-only">{character.name}: {state}{!isAnimatedState(state) ? ", placeholder using idle pose" : ""}</span>
  </div>;
}
