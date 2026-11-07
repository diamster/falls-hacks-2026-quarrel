import type { CSSProperties } from "react";
import type { ThemeConfig } from "./types";

/** A single palette bridge keeps presentation independent of multiplayer logic. */
export function themeStyles(theme: ThemeConfig): CSSProperties {
  const p = theme.palette;
  return {
    "--ink": p.ink, "--muted": p.muted, "--line": p.border,
    "--paper": p.paper, "--green": p.secondary, "--gold": p.accent,
    "--theme-canvas": p.canvas, "--theme-panel": p.panel,
    "--theme-accent": p.accent, "--theme-accent-ink": p.accentInk,
    "--theme-secondary": p.secondary, "--theme-header": p.header,
    "--theme-idle-duration": `${theme.animations.idle.durationMs}ms`,
    "--theme-idle-distance": `${-theme.animations.idle.distancePx}px`,
    "--theme-speaking-duration": `${theme.animations.speaking.durationMs}ms`,
  } as CSSProperties;
}
