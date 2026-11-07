import { jungle } from "./jungle";
import { superhero } from "./superhero";
import { detective } from "./detective";
import { courtroom } from "./courtroom";
import type { CharacterPosition, ThemeConfig, ThemeId } from "./types";

export * from "./types";
export const themes: readonly ThemeConfig[] = [jungle, superhero, detective, courtroom];
export const themeRegistry: Readonly<Record<ThemeId, ThemeConfig>> = { jungle, superhero, detective, courtroom };
export const DEFAULT_THEME_ID: ThemeId = "courtroom";
export function isThemeId(id: unknown): id is ThemeId {
  return typeof id === "string" && Object.hasOwn(themeRegistry, id);
}
/** Safe at the rendering boundary; invalid writes are rejected by the API/DB. */
export function getTheme(id: unknown = DEFAULT_THEME_ID): ThemeConfig {
  return isThemeId(id) ? themeRegistry[id] : themeRegistry[DEFAULT_THEME_ID];
}
export function resolvePlayerCharacter(theme: ThemeConfig, slot: CharacterPosition, characterId?: string | null) {
  return characterId && Object.hasOwn(theme.players.characters, characterId)
    ? theme.players.characters[characterId]
    : theme.players.characters[theme.players.defaults[slot]];
}
