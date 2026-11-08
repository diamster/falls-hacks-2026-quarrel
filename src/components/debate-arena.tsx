import { BackgroundAsset, BenchAsset, CharacterAsset } from "@/themes/assets";
import type { CharacterPosition, ThemeConfig } from "@/themes";
import { PixelCharacter, JudgeCharacter } from "./pixel-character";
import { PixelIcon } from "./ui";
import type { CharacterState } from "@/lib/preview";
import styles from "./debate-arena.module.css";

export type ArenaParticipants = Record<CharacterPosition, { name: string; characterId?: string | null }>;

/** Two speaking positions can later receive round-specific team representatives. */
export function DebateArena({ theme, players, dialogue, dialogueKey, paused, roomCode, turn, judgeState, judgeLabel, counsel }: {
  theme: ThemeConfig; players: ArenaParticipants; dialogue: string; dialogueKey: string;
  paused: boolean; roomCode?: string;
  turn?: { label: string; time: string; activeSlot: CharacterPosition | null; complete: boolean };
  judgeState?: CharacterState; judgeLabel?: string;
  /** Optional role layout keeps legacy previews and waiting rooms unchanged. */
  counsel?: Record<CharacterPosition, CharacterState>;
}) {
  return <section className={`courtroom pixel-panel debate-arena${counsel ? ` ${styles.counselScene}` : ""}`} aria-label={theme.environmentLabel} data-theme={theme.id} data-paused={paused} data-role-layout={counsel ? "lawyer-led" : undefined}>
    <BackgroundAsset assetId={theme.assets.background} className="jungle-backdrop"/>
    <div className="court-vignette"/>
    <div className="court-room-code"><span className="status-dot"/> ROOM <strong>{roomCode ?? "— — —"}</strong><span className="demo-tag">PRIVATE</span></div>
    <div className="turn-timer" aria-label={turn ? `${turn.label}: ${turn.time}` : "Waiting room: debate not started"}><PixelIcon name="clock"/><strong>{turn?.time ?? "LOBBY"}</strong><span>{turn?.label ?? "TAKE YOUR SEAT"}</span></div>
    <div className="judge-speech" data-bubble={theme.ui.speechBubble} data-paused={paused} role="status" aria-live="polite" aria-atomic="true" tabIndex={turn ? 0 : undefined}>
      <div className="speech-heading"><span className="status-dot"/>{theme.judge.displayName.toUpperCase()}<span>{judgeLabel ?? (turn ? "SCRIPTED HOST" : dialogueKey.includes("sample") ? "SAMPLE LINE" : "LOBBY GREETING")}</span></div>
      <p key={dialogueKey} className="speech-text">{dialogue}</p>
    </div>
    <div className="court-characters">
      {counsel ? <Witness theme={theme} slot="A" player={players.A} paused={paused}/> : <PixelCharacter theme={theme} slot="A" displayName={players.A.name} characterId={players.A.characterId} state={turn?.activeSlot === "A" ? "speaking" : turn?.activeSlot ? "listening" : "idle"} paused={paused}/>}
      <JudgeCharacter theme={theme} state={judgeState ?? (turn?.complete ? "thinking" : "speaking")} interactive={Boolean(judgeState)} paused={paused}/>
      {counsel ? <Witness theme={theme} slot="B" player={players.B} paused={paused}/> : <PixelCharacter theme={theme} slot="B" displayName={players.B.name} characterId={players.B.characterId} state={turn?.activeSlot === "B" ? "speaking" : turn?.activeSlot ? "listening" : "idle"} paused={paused}/>}
      {counsel && (["A", "B"] as const).map(slot => <div key={slot} className={styles.lawyer} data-role="lawyer" data-slot={slot} data-state={counsel[slot]} data-speaking={counsel[slot] === "speaking"} data-paused={paused} aria-label={`${theme.lawyers[slot].displayName}, Player ${slot}’s lawyer`}>
        <div className={styles.lawyerSprite}><CharacterAsset assetId={theme.lawyers[slot].assetId} label={theme.lawyers[slot].description}/></div>
        <div className={styles.lawyerName}><strong>{theme.lawyers[slot].displayName}</strong><span>Lawyer {slot}</span></div>
        <span className="sr-only">{theme.lawyers[slot].displayName}: {counsel[slot]}</span>
      </div>)}
    </div>
    <div className="judge-bench"><BenchAsset assetId={theme.assets.bench}/><div className="bench-label">{theme.judge.displayName.toUpperCase()}<span>{theme.ui.benchCaption}</span></div></div>
    <div className="court-caption"><PixelIcon name="spark"/><span>{theme.ui.tagline}</span><PixelIcon name="spark"/></div>
  </section>;
}

function Witness({ theme, slot, player, paused }: { theme: ThemeConfig; slot: CharacterPosition; player: ArenaParticipants[CharacterPosition]; paused: boolean }) {
  return <div className={styles.witness} data-role="player" data-slot={slot} aria-label={`Player ${slot} witness stand`}>
    <div className={styles.stand} aria-hidden="true"/>
    <PixelCharacter theme={theme} slot={slot} displayName={player.name} characterId={player.characterId} state="listening" paused={paused}/>
  </div>;
}
