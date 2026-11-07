import { BackgroundAsset, BenchAsset } from "@/themes/assets";
import type { CharacterPosition, ThemeConfig } from "@/themes";
import { PixelCharacter, JudgeCharacter } from "./pixel-character";
import { PixelIcon } from "./ui";
import type { CharacterState } from "@/lib/preview";

export type ArenaParticipants = Record<CharacterPosition, { name: string; characterId?: string | null }>;

/** Two speaking positions can later receive round-specific team representatives. */
export function DebateArena({ theme, players, dialogue, dialogueKey, paused, roomCode, turn, judgeState, judgeLabel }: {
  theme: ThemeConfig; players: ArenaParticipants; dialogue: string; dialogueKey: string;
  paused: boolean; roomCode?: string;
  turn?: { label: string; time: string; activeSlot: CharacterPosition | null; complete: boolean };
  judgeState?: CharacterState; judgeLabel?: string;
}) {
  return <section className="courtroom pixel-panel debate-arena" aria-label={theme.environmentLabel} data-theme={theme.id} data-paused={paused} data-room={roomCode ? "joined" : "none"}>
    <BackgroundAsset assetId={theme.assets.background} className="jungle-backdrop"/>
    <div className="court-vignette"/>
    <div className="court-room-code"><span className="status-dot"/> ROOM <strong>{roomCode ?? "— — —"}</strong><span className="demo-tag">PRIVATE</span></div>
    <div className="turn-timer" aria-label={turn ? `${turn.label}: ${turn.time}` : "Waiting room: debate not started"}><PixelIcon name="clock"/><strong>{turn?.time ?? "LOBBY"}</strong><span>{turn?.label ?? "TAKE YOUR SEAT"}</span></div>
    {/* The stage holds the bubble and the cast; in the full-screen lobby it is placed between the panels
        and its inner box scales as one unit to the space available. */}
    <div className="court-stage">
      <div className="judge-speech" data-bubble={theme.ui.speechBubble} data-paused={paused} role="status" aria-live="polite" aria-atomic="true" tabIndex={turn ? 0 : undefined}>
        <div className="speech-heading"><span className="status-dot"/>{theme.judge.displayName.toUpperCase()}<span>{judgeLabel ?? (turn ? "SCRIPTED HOST" : dialogueKey.includes("sample") ? "SAMPLE LINE" : "LOBBY GREETING")}</span></div>
        <p key={dialogueKey} className="speech-text">{dialogue}</p>
      </div>
      <div className="court-stage-inner">
        <div className="court-characters">
          <PixelCharacter theme={theme} slot="A" displayName={players.A.name} characterId={players.A.characterId} state={turn?.activeSlot === "A" ? "speaking" : turn?.activeSlot ? "listening" : "idle"} paused={paused}/>
          <JudgeCharacter theme={theme} state={judgeState ?? (turn?.complete ? "thinking" : "speaking")} interactive={Boolean(judgeState)} paused={paused}/>
          <PixelCharacter theme={theme} slot="B" displayName={players.B.name} characterId={players.B.characterId} state={turn?.activeSlot === "B" ? "speaking" : turn?.activeSlot ? "listening" : "idle"} paused={paused}/>
        </div>
        <div className="judge-bench"><BenchAsset assetId={theme.assets.bench}/><div className="bench-label">{theme.judge.displayName.toUpperCase()}<span>{theme.ui.benchCaption}</span></div></div>
      </div>
    </div>
    <div className="court-caption"><PixelIcon name="spark"/><span>{theme.ui.tagline}</span><PixelIcon name="spark"/></div>
  </section>;
}
