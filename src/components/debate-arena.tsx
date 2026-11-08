import { BackgroundAsset, BenchAsset, CharacterAsset } from "@/themes/assets";
import { PixelBackdrop, PixelJuryBox, isSceneTheme } from "@/themes/art/pixel-scene";
import type { CharacterPosition, ThemeConfig } from "@/themes";
import { PixelCharacter, JudgeCharacter } from "./pixel-character";
import { PixelIcon } from "./ui";
import type { CharacterState } from "@/lib/preview";

export type ArenaParticipants = Record<CharacterPosition, { name: string; characterId?: string | null }>;

interface CounselMember { assetId: string; label: string; name: string; role: string; working?: boolean; status?: string }
/** Optional lawyers and jury placed in the scene itself (the debate screen); the lobby and preview omit them. */
export interface ArenaCounsel { lawyers: Record<CharacterPosition, CounselMember>; jury: CounselMember }

/** Two speaking positions can later receive round-specific team representatives. */
export function DebateArena({ theme, players, dialogue, dialogueKey, paused, roomCode, turn, judgeState, judgeLabel, counsel, showTimer = true, spotlight = null, spotlightLabel = "SPEAKING" }: {
  theme: ThemeConfig; players: ArenaParticipants; dialogue: string; dialogueKey: string;
  paused: boolean; roomCode?: string;
  turn?: { label: string; time: string; activeSlot: CharacterPosition | null; complete: boolean };
  judgeState?: CharacterState; judgeLabel?: string;
  counsel?: ArenaCounsel;
  /** Hide the scene's own timer when the page already shows the players' clocks. */
  showTimer?: boolean;
  /** The side whose turn it is (player writing or their lawyer presenting): lit, the other side dimmed. */
  spotlight?: CharacterPosition | null;
  spotlightLabel?: string;
}) {
  return <section className="courtroom pixel-panel debate-arena" aria-label={theme.environmentLabel} data-theme={theme.id} data-paused={paused} data-room={roomCode ? "joined" : "none"} data-counsel={Boolean(counsel)} data-spotlight={spotlight ?? "none"}>
    {isSceneTheme(theme.id) ? <PixelBackdrop theme={theme.id} className="jungle-backdrop pixel-backdrop"/> : <BackgroundAsset assetId={theme.assets.background} className="jungle-backdrop"/>}
    <div className="court-vignette"/>
    <div className="court-room-code"><span className="status-dot"/> ROOM <strong>{roomCode ?? "— — —"}</strong><span className="demo-tag">PRIVATE</span></div>
    {showTimer && <div className="turn-timer" aria-label={turn ? `${turn.label}: ${turn.time}` : "Waiting room: debate not started"}><PixelIcon name="clock"/><strong>{turn?.time ?? "LOBBY"}</strong><span>{turn?.label ?? "TAKE YOUR SEAT"}</span></div>}
    {/* The stage holds the bubble and the cast; in the full-screen lobby it is placed between the panels
        and its inner box scales as one unit to the space available. */}
    <div className="court-stage">
      <div className="judge-speech" data-bubble={theme.ui.speechBubble} data-paused={paused} role="status" aria-live="polite" aria-atomic="true" tabIndex={turn ? 0 : undefined}>
        <div className="speech-heading"><span className="status-dot"/>{theme.judge.displayName.toUpperCase()}<span>{judgeLabel ?? (turn ? "SCRIPTED HOST" : dialogueKey.includes("sample") ? "SAMPLE LINE" : "LOBBY GREETING")}</span></div>
        <p key={dialogueKey} className="speech-text">{dialogue}</p>
      </div>
      <div className="court-stage-inner">
        {counsel && <>
          {(["A", "B"] as const).map(slot => <div key={slot} className={`court-spotlight court-spotlight--${slot}`} aria-hidden="true"/>)}
          {spotlight && <div className={`court-turn-marker court-turn-marker--${spotlight}`} aria-hidden="true"><span>{spotlightLabel}</span></div>}
          <div className="court-jury-stand" aria-hidden="true">{isSceneTheme(theme.id) && <PixelJuryBox theme={theme.id}/>}</div>
        </>}
        <div className="court-characters">
          <PixelCharacter theme={theme} slot="A" displayName={players.A.name} characterId={players.A.characterId} state={turn?.activeSlot === "A" ? "speaking" : turn?.activeSlot ? "listening" : "idle"} paused={paused}/>
          <JudgeCharacter theme={theme} state={judgeState ?? (turn?.complete ? "thinking" : "speaking")} interactive={Boolean(judgeState)} paused={paused}/>
          <PixelCharacter theme={theme} slot="B" displayName={players.B.name} characterId={players.B.characterId} state={turn?.activeSlot === "B" ? "speaking" : turn?.activeSlot ? "listening" : "idle"} paused={paused}/>
        </div>
        {counsel && <>
          {(["A", "B"] as const).map(slot => { const lawyer = counsel.lawyers[slot]; return <figure key={slot} className={`court-counsel court-counsel--${slot}`} data-working={Boolean(lawyer.working)}>
            {lawyer.working && <span className="court-counsel-busy">{lawyer.status ?? "Working…"}</span>}
            <CharacterAsset assetId={lawyer.assetId} label={lawyer.label}/>
            <figcaption><strong>{lawyer.name}</strong><span>{lawyer.role}</span></figcaption>
          </figure>; })}
          <figure className="court-jury" data-working={Boolean(counsel.jury.working)}>
            <CharacterAsset assetId={counsel.jury.assetId} label={counsel.jury.label}/>
            <figcaption><strong>{counsel.jury.name}</strong><span>{counsel.jury.status ?? counsel.jury.role}</span></figcaption>
          </figure>
        </>}
        <div className="judge-bench"><BenchAsset assetId={theme.assets.bench}/><div className="bench-label">{theme.judge.displayName.toUpperCase()}<span>{theme.ui.benchCaption}</span></div></div>
      </div>
    </div>
    <div className="court-caption"><PixelIcon name="spark"/><span>{theme.ui.tagline}</span><PixelIcon name="spark"/></div>
  </section>;
}
