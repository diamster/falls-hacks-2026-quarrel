import { CharacterAsset } from "@/themes/assets";
import { resolvePlayerCharacter, type CharacterPosition, type ThemeConfig } from "@/themes";
import { isAnimatedState, type CharacterState } from "@/lib/preview";

/** Character IDs select assets; a seat is positioning, never player identity. */
export function PixelCharacter({ theme, slot, characterId, displayName, state = "idle", paused = false }: {
  theme: ThemeConfig; slot: CharacterPosition; characterId?: string | null;
  displayName?: string; state?: CharacterState; paused?: boolean;
}) {
  const character = resolvePlayerCharacter(theme, slot, characterId);
  const name = displayName ?? character.displayName;
  return <div className={`character character--${slot === "A" ? "lion" : "zebra"}`} data-character-id={character.id} data-state={state} data-motion={isAnimatedState(state) ? state : "idle"} data-paused={paused}>
    <div className="character-sprite"><CharacterAsset assetId={character.assetId} label={character.description}/></div>
    <div className="character-nameplate"><strong title={name}>{name}</strong><span>Player {slot}</span></div>
    <span className="sr-only">{name}: {state}{!isAnimatedState(state) ? ", placeholder using idle pose" : ""}</span>
  </div>;
}

export function JudgeCharacter({ theme, state = "idle", paused = false, interactive = false }: { theme: ThemeConfig; state?: CharacterState; paused?: boolean; interactive?: boolean }) {
  const animated = isAnimatedState(state) || (interactive && ["listening", "thinking", "questioning", "surprised"].includes(state));
  return <div className="character character--lemur" data-judge-id={theme.judge.id} data-state={state} data-motion={animated ? state : "idle"} data-interactive={interactive} data-paused={paused}>
    <div className="character-sprite"><CharacterAsset assetId={theme.judge.assetId} label={theme.judge.description}/></div>
    <span className="sr-only">{theme.judge.displayName}: {state}{!animated ? ", placeholder using idle pose" : ""}</span>
  </div>;
}
