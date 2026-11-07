import { BackgroundAsset, BenchAsset } from "@/themes/assets";
import type { CharacterPosition, ThemeConfig } from "@/themes";
import { PixelCharacter, JudgeCharacter } from "./pixel-character";
import { PixelIcon } from "./ui";

export type ArenaParticipants = Record<CharacterPosition, { name: string; characterId?: string | null }>;

/** Two speaking positions can later receive round-specific team representatives. */
export function DebateArena({ theme, players, dialogue, dialogueKey, paused, roomCode }: {
  theme: ThemeConfig; players: ArenaParticipants; dialogue: string; dialogueKey: string;
  paused: boolean; roomCode?: string;
}) {
  return <section className="courtroom pixel-panel debate-arena" aria-label={theme.environmentLabel} data-theme={theme.id} data-paused={paused}>
    <BackgroundAsset assetId={theme.assets.background} className="jungle-backdrop"/>
    <div className="court-vignette"/>
    <div className="court-room-code"><span className="status-dot"/> ROOM <strong>{roomCode ?? "— — —"}</strong><span className="demo-tag">PRIVATE</span></div>
    <div className="turn-timer" aria-label="Waiting room: debate not started"><PixelIcon name="clock"/><strong>LOBBY</strong><span>TAKE YOUR SEAT</span></div>
    <div className="judge-speech" data-bubble={theme.ui.speechBubble} data-paused={paused} role="status" aria-live="polite" aria-atomic="true">
      <div className="speech-heading"><span className="status-dot"/>{theme.judge.displayName.toUpperCase()}<span>{dialogueKey.includes("sample") ? "SAMPLE LINE" : "LOBBY GREETING"}</span></div>
      <p key={dialogueKey} className="speech-text">{dialogue}</p>
    </div>
    <div className="court-characters">
      <PixelCharacter theme={theme} slot="A" displayName={players.A.name} characterId={players.A.characterId} paused={paused}/>
      <JudgeCharacter theme={theme} state="speaking" paused={paused}/>
      <PixelCharacter theme={theme} slot="B" displayName={players.B.name} characterId={players.B.characterId} paused={paused}/>
    </div>
    <div className="judge-bench"><BenchAsset assetId={theme.assets.bench}/><div className="bench-label">{theme.judge.displayName.toUpperCase()}<span>{theme.ui.benchCaption}</span></div></div>
    <div className="court-caption"><PixelIcon name="spark"/><span>{theme.ui.tagline}</span><PixelIcon name="spark"/></div>
  </section>;
}
