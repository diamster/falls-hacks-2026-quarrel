import type { ThemeId } from "./types";

export type SpeechRole = "lawyerA" | "lawyerB" | "judge";
export interface SpeechVoiceConfig {
  geminiVoice: string;
  delivery: string;
  rate: number;
  pitch: number;
  lang: string;
  preferredVoiceNames: readonly string[];
  fallbackIndex: number;
}

/** Delivery only: never modifies written arguments, evaluation, or clocks. */
const deliveries: Record<ThemeId, { judge: string; lawyer: string; rate: number }> = {
  courtroom: { judge: "Formal, composed and impartial. Clear pronunciation at a moderate pace.", lawyer: "Confident, professional and clear; persuasive without exaggeration.", rate: 1 },
  jungle: { judge: "Energetic, curious and playful, while remaining neutral and easy to understand.", lawyer: "Lively, enthusiastic and playful; keep every word clearly understandable.", rate: 1.08 },
  superhero: { judge: "Confident, heroic and analytical with light wit; remain impartial.", lawyer: "Bold, determined and slightly dramatic, with clear pronunciation.", rate: 1.02 },
  detective: { judge: "Calm, observant and deliberate with restrained dry humor.", lawyer: "Thoughtful, investigative and restrained, at a slightly slower pace.", rate: 0.9 },
};
const roles: Record<SpeechRole, Pick<SpeechVoiceConfig, "geminiVoice" | "pitch" | "preferredVoiceNames" | "fallbackIndex">> = {
  judge: { geminiVoice: "Kore", pitch: 0.95, preferredVoiceNames: ["Samantha", "Microsoft Aria Online (Natural) - English (United States)"], fallbackIndex: 0 },
  lawyerA: { geminiVoice: "Puck", pitch: 1.08, preferredVoiceNames: ["Daniel", "Microsoft Guy Online (Natural) - English (United States)"], fallbackIndex: 1 },
  lawyerB: { geminiVoice: "Charon", pitch: 0.9, preferredVoiceNames: ["Alex", "Microsoft David - English (United States)"], fallbackIndex: 2 },
};
export function getSpeechVoice(themeId: string, role: SpeechRole): SpeechVoiceConfig {
  const theme = Object.hasOwn(deliveries, themeId) ? deliveries[themeId as ThemeId] : deliveries.courtroom;
  return { ...roles[role], lang: "en-US", rate: theme.rate, delivery: role === "judge" ? theme.judge : theme.lawyer };
}

export function chooseBrowserVoice(voices: readonly SpeechSynthesisVoice[], config: SpeechVoiceConfig): SpeechSynthesisVoice | undefined {
  for (const name of config.preferredVoiceNames) {
    const preferred = voices.find(voice => voice.name === name);
    if (preferred) return preferred;
  }
  const english = voices.filter(voice => voice.lang.toLowerCase().startsWith("en"));
  const available = english.length ? english : voices;
  return available[config.fallbackIndex % Math.max(1, available.length)];
}
