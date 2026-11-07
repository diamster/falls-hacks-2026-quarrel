export const themeIds = ["jungle", "superhero", "detective", "courtroom"] as const;
export type ThemeId = typeof themeIds[number];
export type CharacterPosition = "A" | "B";

export interface PlayerCharacterConfig {
  /** Stable within this theme. Never use a display name as identity. */
  id: string;
  displayName: string;
  roleLabel: string;
  assetId: string;
  description: string;
}

export interface ThemePalette {
  canvas: string; paper: string; panel: string; ink: string; muted: string;
  border: string; accent: string; accentInk: string; secondary: string; header: string;
}

export interface SidekickCharacterConfig {
  id: string;
  displayName: string;
  assetId: string;
  description: string;
  /** Voice only. The shared AI engine owns factual and evaluation constraints. */
  personality: string;
  dialogueStyle: string;
}

export interface ThemeConfig {
  id: ThemeId;
  displayName: string;
  description: string;
  environmentLabel: string;
  palette: ThemePalette;
  assets: { background: ThemeId; bench: ThemeId };
  players: {
    defaults: Readonly<Record<CharacterPosition, string>>;
    characters: Readonly<Record<string, PlayerCharacterConfig>>;
  };
  lawyers: Readonly<Record<CharacterPosition, SidekickCharacterConfig>>;
  jury: SidekickCharacterConfig & { neutralityPolicy: typeof neutralityPolicy };
  judge: {
    id: string; displayName: string; assetId: string; description: string;
    personality: string; dialogueStyle: string;
    /** Presentation only; future evaluation must use the shared core rules. */
    neutralityPolicy: typeof neutralityPolicy;
    dialogue: { welcome: string; lobby: string; ready: string };
    /** Scripted announcements only. {speaker} and {topic} are plain-text substitutions. */
    debateDialogue: Record<"setup" | "awaitingApproval" | "introduction" | "opening" | "rebuttal" | "questions" | "complete", string>;
    samples: ReadonlyArray<{ id: string; label: string; text: string }>;
  };
  animations: {
    idle: { durationMs: number; distancePx: number };
    speaking: { durationMs: number };
    objection: { style: string; implemented: false };
    verdict: { style: string; implemented: false };
  };
  ui: {
    lobbyTitle: string; seatLabel: string; tagline: string; benchCaption: string;
    speechBubble: "pixel-paper" | "comic-panel" | "noir-note" | "formal-paper";
    buttonStyle: "pixel"; font: "pixelify";
  };
}

/** Reusable Stage 4 boundary, not an implemented scoring/evaluation system. */
export const neutralityPolicy = Object.freeze({
  id: "shared-neutrality-v1",
  requirements: Object.freeze([
    "Evaluate arguments using the same core criteria for both sides.",
    "Do not favor a player, character, theme, identity, speaking style or team.",
    "Separate evidence and reasoning from confidence, drama and humor.",
    "Personality changes wording only; it cannot override evaluation rules or determine a winner.",
  ]),
});
