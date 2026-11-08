import { themeIds, type CharacterPosition, type ThemeId } from "../../types";
import { PixelCanvas, type PixelSnapshot } from "./grid";
import { mascots, type MascotId } from "./mascots";
import { remasters } from "./remasters";
import type { PixelCharacter, Reaction } from "./types";

/** Which mascot stands in for Lawyer A and Lawyer B. Swapping them is this one line. */
export const mascotLawyers: Readonly<Record<CharacterPosition, MascotId>> = Object.freeze({ A: "pi", B: "raccoon" });

/** Small per-theme mascot props: courtroom jabot/briefcase, jungle leaf/flower, superhero cape, detective fedora. */
export const MASCOT_ACCESSORIES = true;

export function mascotAssetId(mascot: MascotId, theme: ThemeId) {
  return `mascot-${mascot}-${theme}`;
}

export interface PixelAsset {
  assetId: string;
  kind: "mascot" | "remaster";
  theme: ThemeId;
  character: PixelCharacter;
  accessories: boolean;
}

const assets: Record<string, PixelAsset> = {};
for (const theme of themeIds) {
  for (const mascot of Object.values(mascots)) {
    const assetId = mascotAssetId(mascot.id, theme);
    assets[assetId] = { assetId, kind: "mascot", theme, character: mascot, accessories: MASCOT_ACCESSORIES };
  }
}
for (const remaster of Object.values(remasters)) {
  assets[remaster.id] = { assetId: remaster.id, kind: "remaster", theme: remaster.theme, character: remaster, accessories: false };
}

export const pixelAssets: Readonly<Record<string, PixelAsset>> = Object.freeze(assets);
export const pixelAssetIds: readonly string[] = Object.freeze(Object.keys(assets));
export const fallbackPixelAssetId = mascotAssetId(mascotLawyers.A, "courtroom");

export function isPixelAssetId(assetId: string) {
  return Object.hasOwn(pixelAssets, assetId);
}

export function getPixelAsset(assetId: string): PixelAsset {
  return isPixelAssetId(assetId) ? pixelAssets[assetId] : pixelAssets[fallbackPixelAssetId];
}

const cache = new Map<string, PixelSnapshot>();

/** Draws one frame of a pixel asset. Results are cached: sprites are pure functions of their inputs. */
export function renderPixelAsset(asset: PixelAsset, reaction: Reaction = "idle", frame = 0, accessories = asset.accessories): PixelSnapshot {
  const count = asset.character.frames[reaction];
  const index = ((Math.trunc(frame) % count) + count) % count;
  const key = `${asset.assetId}|${reaction}|${index}|${accessories}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = new PixelCanvas();
  asset.character.draw(canvas, { theme: asset.theme, reaction, frame: index, accessories });
  const snapshot = canvas.snapshot();
  cache.set(key, snapshot);
  return snapshot;
}

/** Personal, browser-only choice of how lawyers are drawn. It never reaches the room or the AI. */
export const lawyerArtStyles = ["theme", "classic", "remaster", "mascot"] as const;
export type LawyerArtStyle = typeof lawyerArtStyles[number];
export function isLawyerArtStyle(value: unknown): value is LawyerArtStyle {
  return typeof value === "string" && (lawyerArtStyles as readonly string[]).includes(value);
}

type SlotArt = Record<Exclude<LawyerArtStyle, "theme">, string>;

/** Original lawyer descriptions, kept so the "Original drawings" option still has accurate alternative text. */
const classicDescriptions: Readonly<Record<string, string>> = {
  "jungle-lawyer-a": "an original toucan lawyer with a golden beak, green jacket and case notes",
  "jungle-lawyer-b": "an original capybara lawyer in a turquoise waistcoat carrying a coral casebook",
  "superhero-lawyer-a": "an original city advocate with gold spectacles, a teal cape and a case tablet",
  "superhero-lawyer-b": "an original rooftop advocate in violet with a cyan visor and a gold dossier",
  "detective-lawyer-a": "an original monochrome attorney in a pinstriped suit holding a case folder",
  "detective-lawyer-b": "an original monochrome attorney with round spectacles, a light coat and a dossier",
  "courtroom-lawyer-a": "an original silver-haired lawyer in a navy suit carrying a gold-edged lawbook",
  "courtroom-lawyer-b": "an original curly-haired lawyer in a plum blazer holding a cream document folder",
};

const slotArt: SlotArt[] = themeIds.flatMap(theme => (["A", "B"] as const).map(slot => {
  const classic = `${theme}-lawyer-${slot.toLowerCase()}`;
  return { classic, remaster: `remaster-${classic}`, mascot: mascotAssetId(mascotLawyers[slot], theme) };
}));

export function lawyerArtFor(theme: ThemeId, slot: CharacterPosition): Readonly<SlotArt> {
  return slotArt[themeIds.indexOf(theme) * 2 + (slot === "A" ? 0 : 1)];
}

/**
 * Applies the viewer's lawyer art choice to a configured asset ID. Non-lawyer
 * assets (players, judges, juries) pass through unchanged. When the art is
 * swapped, the accessible label keeps the character's name and describes the
 * drawing that is actually shown.
 */
export function resolveLawyerArt(assetId: string, label: string, style: LawyerArtStyle): { assetId: string; label: string } {
  if (style === "theme") return { assetId, label };
  const entry = slotArt.find(art => art.classic === assetId || art.remaster === assetId || art.mascot === assetId);
  if (!entry || entry[style] === assetId) return { assetId, label };
  const next = entry[style];
  const description = style === "classic" ? classicDescriptions[next] : getPixelAsset(next).character.description;
  const name = label.split(",")[0].trim();
  return { assetId: next, label: name ? `${name}, drawn as ${description}` : description };
}
