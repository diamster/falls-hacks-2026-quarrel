import type { ThemeId } from "../../types";
import type { PixelCanvas } from "./grid";

export const reactions = ["idle", "talk", "think", "cheer"] as const;
export type Reaction = typeof reactions[number];

export interface DrawOptions {
  theme: ThemeId;
  reaction: Reaction;
  /** Zero-based frame within the reaction; out-of-range values wrap. */
  frame: number;
  /** Small per-theme props (hat, leaf, cape, briefcase…). */
  accessories: boolean;
}

export interface PixelCharacter {
  id: string;
  /** Plain-language description of the drawing, used for accessible labels. */
  description: string;
  /** Number of frames per reaction (2–4). */
  frames: Readonly<Record<Reaction, number>>;
  draw(canvas: PixelCanvas, options: DrawOptions): void;
}
