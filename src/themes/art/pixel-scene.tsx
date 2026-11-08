import { memo } from "react";

/*
 * Pixel-grid scenery for the debate screen.
 *
 * The technique follows the pixel cast on the `pixelart` branch
 * (src/themes/art/pixel/grid.ts): every shape is painted into a grid of whole
 * cells, then emitted as integer-aligned horizontal runs. There are no curves,
 * no opacity and no gradients; light and shade are dithered with a checker
 * of two palette colours, so the scenery reads as pixel art at any size.
 *
 * Backdrops are 240 × 110 cells, drawn at four viewBox units per cell to keep
 * the existing 960 × 440 scene coordinates. The original SVG backgrounds in
 * backgrounds.tsx and the original Jungle art in components/pixel-art.tsx are
 * unchanged and still used by the lobby previews and /preview.
 */

export type SceneThemeId = "courtroom" | "jungle" | "superhero" | "detective";

const W = 240;
const H = 110;

class Grid {
  readonly cells: string[];
  constructor(readonly w: number, readonly h: number) { this.cells = new Array<string>(w * h).fill(""); }
  px(x: number, y: number, c: string) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = c; return this; }
  get(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.cells[y * this.w + x] : ""; }
  rect(x: number, y: number, w: number, h: number, c: string) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c); return this; }
  /** Checkerboard of two colours: the pixel-art way to shade without transparency. */
  dither(x: number, y: number, w: number, h: number, a: string, b: string) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, (i + j) % 2 ? a : b); return this; }
  /** Sparse dither: one cell in four, for soft light. */
  sparse(x: number, y: number, w: number, h: number, c: string) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i % 2 === 0 && j % 2 === 0) this.px(i + (j % 4 ? 1 : 0), j, c); return this; }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.px(x, y, c);
    }
    return this;
  }
  /** Mirror the left half onto the right, for symmetric rooms. */
  mirror(fromX = 0, toX = this.w / 2) { for (let y = 0; y < this.h; y++) for (let x = fromX; x < toX; x++) { const c = this.get(x, y); if (c) this.px(this.w - 1 - x, y, c); } return this; }
}

/** Integer runs grouped by colour: one <path> per colour keeps the DOM small. */
function toPaths(g: Grid) {
  const byColor = new Map<string, string[]>();
  for (let y = 0; y < g.h; y++) {
    let x = 0;
    while (x < g.w) {
      const c = g.cells[y * g.w + x];
      let end = x + 1;
      while (end < g.w && g.cells[y * g.w + end] === c) end++;
      if (c) { const parts = byColor.get(c) ?? []; parts.push(`M${x} ${y}h${end - x}v1h-${end - x}z`); byColor.set(c, parts); }
      x = end;
    }
  }
  return [...byColor.entries()].map(([color, parts]) => ({ color, d: parts.join("") }));
}

/* ---------------------------------------------------------------- Courtroom */
function courtroom() {
  const g = new Grid(W, H);
  const p = { plaster: "#ead9b6", plasterShade: "#dcc59c", mould: "#5b3824", mouldLight: "#b88457", wood: "#8b5a36", woodDark: "#6e4329", woodLight: "#a8714a", column: "#d9c29a", columnShade: "#bfa47a", glass: "#a9cfd8", glassLight: "#d3e8ea", curtain: "#7a2f3a", curtainLight: "#9b4150", gold: "#d6aa5d", goldDark: "#a97f3c", floor: "#7a4a2c", floorDark: "#68401f", seam: "#4f2f1c", carpet: "#8c2f39", carpetDark: "#6f2430", rail: "#5f3b23" };
  // plaster wall with dithered shade under the moulding
  g.rect(0, 0, W, 44, p.plaster).dither(0, 6, W, 3, p.plaster, p.plasterShade);
  g.rect(0, 0, W, 5, p.mould).rect(0, 5, W, 1, p.mouldLight);
  // wainscot panels
  g.rect(0, 44, W, 36, p.wood).rect(0, 44, W, 2, p.mouldLight).rect(0, 46, W, 1, p.woodDark);
  for (let x = 4; x < W; x += 26) { g.rect(x, 50, 20, 24, p.woodDark).rect(x + 1, 51, 18, 22, p.wood).rect(x + 1, 51, 18, 1, p.woodLight).rect(x + 1, 51, 1, 22, p.woodLight); }
  // tall windows with curtains (left half, mirrored)
  g.rect(14, 9, 30, 32, p.mould).rect(16, 11, 26, 28, p.glass).dither(16, 11, 26, 6, p.glass, p.glassLight).rect(28, 11, 2, 28, p.mould).rect(16, 24, 26, 2, p.mould).rect(13, 40, 32, 2, p.mouldLight);
  for (let y = 8; y < 44; y++) { const sway = y % 6 < 3 ? 0 : 1; g.rect(8 + sway, y, 6, 1, p.curtain).px(9 + sway, y, p.curtainLight); g.rect(44 - sway, y, 6, 1, p.curtain).px(47 - sway, y, p.curtainLight); }
  g.rect(6, 6, 46, 3, p.goldDark).rect(6, 6, 46, 1, p.gold);
  // columns
  for (const cx of [62]) { g.rect(cx, 6, 10, 38, p.column).rect(cx + 7, 6, 3, 38, p.columnShade).rect(cx - 2, 6, 14, 3, p.mouldLight).rect(cx - 2, 41, 14, 3, p.mouldLight); for (let x = cx + 2; x < cx + 7; x += 2) g.rect(x, 9, 1, 32, p.columnShade); }
  g.mirror(0, 120);
  // emblem: scales of justice above the bench
  g.rect(119, 9, 2, 22, p.goldDark).rect(104, 12, 32, 2, p.gold).rect(118, 8, 4, 3, p.gold);
  for (const sx of [104, 130]) { g.rect(sx + 2, 14, 1, 7, p.goldDark).rect(sx - 1, 21, 9, 2, p.gold).rect(sx, 23, 7, 1, p.goldDark); }
  g.rect(112, 31, 16, 3, p.gold).rect(112, 33, 16, 1, p.goldDark);
  // the bar: a low balustrade where the floor begins
  g.rect(0, 74, W, 2, p.mouldLight).rect(0, 76, W, 4, p.rail);
  for (let x = 2; x < W; x += 8) g.rect(x, 76, 2, 4, p.woodLight);
  // floorboards and a carpet runner to the bench
  for (let y = 80; y < H; y += 4) { g.rect(0, y, W, 4, (y / 4) % 2 ? p.floor : p.floorDark).rect(0, y + 3, W, 1, p.seam); for (let x = (y * 7) % 31; x < W; x += 31) g.px(x, y + 1, p.seam).px(x, y + 2, p.seam); }
  g.rect(96, 80, 48, H - 80, p.carpet).dither(96, 80, 2, H - 80, p.carpet, p.carpetDark).dither(142, 80, 2, H - 80, p.carpet, p.carpetDark).rect(98, 80, 44, 1, p.carpetDark);
  return g;
}

/* ------------------------------------------------------------------ Jungle */
function jungle() {
  const g = new Grid(W, H);
  const p = { sky: "#8fd3e8", skyLow: "#b9e5dc", sun: "#ffe08a", sunEdge: "#ffd06a", far: "#6fb48a", farDark: "#5a9f78", mid: "#3c7f57", midLight: "#4f9a6a", near: "#2f6b48", nearDark: "#245639", trunk: "#8a5a34", trunkDark: "#6b4426", frond: "#3f8f50", frondLight: "#6cbf6a", vine: "#2f7a43", flower: "#f27a7a", flowerCore: "#ffd36a", plank: "#b07a43", plankDark: "#93612f", seam: "#6f4521", water: "#5fb7c9" };
  g.rect(0, 0, W, 50, p.sky).dither(0, 26, W, 6, p.sky, p.skyLow).rect(0, 32, W, 18, p.skyLow);
  g.ellipse(196, 15, 9, 9, p.sunEdge).ellipse(196, 15, 7.5, 7.5, p.sun);
  // stepped canopy layers, far to near
  const ridge = (base: number, amp: number, period: number, color: string, shade: string) => { for (let x = 0; x < W; x++) { const top = base - Math.round(amp * (1 + Math.sin(x / period) * Math.cos(x / (period * 2.3)))) ; g.rect(x, top, 1, 80 - top, color); if (x % 3 === 0) g.px(x, top + 1, shade); } };
  ridge(34, 6, 9, p.far, p.farDark);
  ridge(46, 8, 7, p.mid, p.midLight);
  ridge(60, 6, 5, p.near, p.nearDark);
  // palms (left half, mirrored)
  for (let y = 18; y < 80; y++) { const lean = Math.floor((80 - y) / 14); g.rect(18 + lean, y, 4, 1, y % 3 ? p.trunk : p.trunkDark); }
  const fronds: Array<[number, number]> = [[-14, 3], [-10, -2], [-4, -4], [4, -4], [10, -2], [14, 3]];
  for (const [dx, dy] of fronds) for (let t = 0; t <= 8; t++) { const x = 23 + Math.round(dx * t / 8), y = 17 + Math.round(dy * t / 8) + (t > 5 ? t - 5 : 0); g.rect(x, y, 2, 2, t % 2 ? p.frond : p.frondLight); }
  // vines
  for (const vx of [44, 70, 92]) { const len = 14 + (vx % 9); for (let y = 0; y < len; y++) g.px(vx + (y % 4 === 0 ? 1 : 0), y, p.vine); g.rect(vx - 1, len, 3, 2, p.frond); }
  // flowers in the near bushes
  for (const [fx, fy] of [[34, 66], [52, 70], [84, 64]] as const) g.rect(fx, fy, 3, 3, p.flower).px(fx + 1, fy + 1, p.flowerCore);
  g.mirror(0, 120);
  // wooden deck
  g.rect(0, 78, W, 2, p.seam);
  for (let y = 80; y < H; y += 5) { g.rect(0, y, W, 5, (y / 5) % 2 ? p.plank : p.plankDark).rect(0, y + 4, W, 1, p.seam); for (let x = (y * 11) % 37; x < W; x += 37) g.rect(x, y, 1, 4, p.seam); }
  return g;
}

/* --------------------------------------------------------------- Superhero */
function superhero() {
  const g = new Grid(W, H);
  const p = { sky: "#172137", skyLow: "#263148", star: "#b9d7d3", moon: "#d9dbc0", moonShade: "#aeb9b2", b1: "#242f46", b2: "#2a3a52", b3: "#1d2840", window: "#dab674", windowDim: "#7d6f52", beam: "#3a4a63", ledge: "#7a8a98", ledgeDark: "#3f5168", roof: "#4a5a6e", roofLight: "#5d6e83", roofSeam: "#2a364c", vent: "#35485e", ventLight: "#718998", lamp: "#f5cc76" };
  g.rect(0, 0, W, 80, p.sky).dither(0, 30, W, 8, p.sky, p.skyLow).rect(0, 38, W, 42, p.skyLow);
  for (const [sx, sy] of [[12, 6], [40, 14], [66, 4], [90, 18], [140, 8], [160, 22], [212, 10], [228, 26], [30, 26], [118, 3]] as const) g.px(sx, sy, p.star);
  g.ellipse(172, 14, 8, 8, p.moon).ellipse(170, 12, 3, 3, p.moonShade).px(176, 18, p.moonShade);
  // searchlight: a dithered stepped beam, no transparency
  for (let y = 0; y < 76; y++) { const half = 2 + Math.floor((76 - y) / 3); const cx = 150 - Math.floor((76 - y) / 2.4); for (let x = cx - half; x <= cx + half; x++) if ((x + y) % 2 === 0) g.px(x, y, p.beam); }
  // skyline
  const blocks: Array<[number, number, number, string]> = [[0, 40, 24, p.b1], [24, 30, 20, p.b2], [46, 44, 22, p.b3], [70, 32, 24, p.b1], [96, 46, 18, p.b2], [116, 38, 20, p.b3], [138, 28, 22, p.b1], [162, 44, 18, p.b2], [182, 34, 26, p.b3], [210, 42, 30, p.b1]];
  for (const [x, top, w, c] of blocks) {
    g.rect(x, top, w, 78 - top, c).rect(x + 2, top - 3, w - 4, 3, c);
    for (let wy = top + 3; wy < 74; wy += 5) for (let wx = x + 3; wx < x + w - 2; wx += 4) g.rect(wx, wy, 2, 2, (wx * 3 + wy) % 7 === 0 ? p.window : (wx + wy) % 5 === 0 ? p.windowDim : c);
  }
  g.rect(147, 22, 2, 6, p.b1).rect(145, 20, 6, 2, p.b1);
  // rooftop ledge and tiles
  g.rect(0, 74, W, 2, p.ledge).rect(0, 76, W, 4, p.ledgeDark);
  for (let y = 80; y < H; y += 6) for (let x = (y / 6) % 2 ? 0 : -6; x < W; x += 12) g.rect(x, y, 12, 6, p.roof).rect(x, y, 12, 1, p.roofLight).rect(x, y, 1, 6, p.roofLight).rect(x, y + 5, 12, 1, p.roofSeam);
  // rooftop props behind the cast
  g.rect(8, 64, 22, 12, p.vent).rect(8, 64, 22, 2, p.ventLight).rect(10, 68, 18, 1, p.roofSeam).rect(10, 71, 18, 1, p.roofSeam);
  g.rect(214, 50, 2, 26, p.vent).rect(209, 48, 12, 2, p.ventLight).rect(213, 45, 4, 3, p.lamp);
  return g;
}

/* --------------------------------------------------------------- Detective */
function detective() {
  const g = new Grid(W, H);
  // equal-channel greys only: the noir theme is strictly greyscale
  const p = { wall: "#5c5c5c", wallDark: "#4d4d4d", wallLight: "#6b6b6b", trim: "#2e2e2e", trimLight: "#808080", night: "#1f1f1f", city: "#363636", cityLight: "#8a8a8a", rain: "#7a7a7a", blind: "#a3a3a3", blindDark: "#6e6e6e", frame: "#262626", cork: "#7d7d7d", corkDark: "#686868", note: "#d6d6d6", pin: "#f0f0f0", string: "#bdbdbd", lamp: "#e6e6e6", glow: "#8f8f8f", floor: "#3b3b3b", floorDark: "#333333", seam: "#242424", shadow: "#454545" };
  g.rect(0, 0, W, 80, p.wall).dither(0, 0, W, 4, p.wall, p.wallDark);
  for (let x = 0; x < W; x += 12) g.rect(x, 4, 1, 40, p.wallDark);
  g.rect(0, 44, W, 36, p.wallDark).rect(0, 44, W, 2, p.trimLight).rect(0, 46, W, 1, p.trim);
  for (let x = 6; x < W; x += 30) g.rect(x, 50, 24, 24, p.trim).rect(x + 1, 51, 22, 22, p.wallDark).rect(x + 1, 51, 22, 1, p.wallLight);
  // window with half-open blinds and rain over a night city (left)
  g.rect(12, 6, 48, 36, p.frame).rect(14, 8, 44, 32, p.night);
  for (const [bx, top, bw] of [[14, 22, 8], [23, 16, 7], [31, 26, 9], [41, 19, 6], [48, 24, 10]] as const) { g.rect(bx, top, bw, 40 - top, p.city); for (let wy = top + 2; wy < 39; wy += 4) for (let wx = bx + 1; wx < bx + bw - 1; wx += 3) if ((wx + wy) % 3 === 0) g.px(wx, wy, p.cityLight); }
  for (let i = 0; i < 26; i++) { const rx = 15 + (i * 7) % 42, ry = 8 + (i * 11) % 26; g.px(rx, ry, p.rain).px(rx, ry + 1, p.rain); }
  for (let y = 8; y < 22; y += 2) g.rect(14, y, 44, 1, p.blind).rect(14, y + 1, 44, 1, p.blindDark);
  g.rect(35, 8, 1, 34, p.frame).rect(10, 42, 52, 2, p.trimLight);
  // evidence board with pinned notes and string (right)
  g.rect(176, 8, 52, 32, p.frame).rect(178, 10, 48, 28, p.cork).dither(178, 10, 48, 28, p.cork, p.corkDark);
  const notes: Array<[number, number]> = [[182, 13], [198, 16], [214, 12], [186, 27], [206, 26]];
  for (const [nx, ny] of notes) g.rect(nx, ny, 8, 7, p.note).px(nx + 3, ny, p.pin);
  for (let t = 0; t <= 16; t++) { g.px(185 + t, 14 + Math.round(t * 3 / 16), p.string); g.px(202 + t / 1.4, 17 + Math.round(t * 10 / 16), p.string); }
  // hanging lamp and its dithered light pool
  g.rect(119, 0, 2, 12, p.trim).rect(112, 12, 16, 4, p.trim).rect(114, 16, 12, 2, p.lamp);
  for (let y = 18; y < 44; y++) { const half = 6 + Math.floor((y - 18) / 2); for (let x = 120 - half; x < 120 + half; x++) if ((x + y) % 2 === 0) g.px(x, y, p.glow); }
  // coat rack silhouette
  g.rect(88, 20, 2, 58, p.trim).rect(84, 20, 10, 2, p.trim).rect(85, 76, 8, 2, p.trim).rect(81, 22, 6, 18, p.shadow).rect(80, 24, 1, 14, p.shadow);
  // floorboards with a pool of lamplight
  g.rect(0, 78, W, 2, p.trim);
  for (let y = 80; y < H; y += 4) { g.rect(0, y, W, 4, (y / 4) % 2 ? p.floor : p.floorDark).rect(0, y + 3, W, 1, p.seam); for (let x = (y * 13) % 29; x < W; x += 29) g.px(x, y + 1, p.seam).px(x, y + 2, p.seam); }
  g.sparse(84, 82, 72, 10, p.shadow);
  return g;
}

const painters: Record<SceneThemeId, () => Grid> = { courtroom, jungle, superhero, detective };
const cache = new Map<SceneThemeId, ReturnType<typeof toPaths>>();
function pathsFor(theme: SceneThemeId) {
  let paths = cache.get(theme);
  if (!paths) { paths = toPaths(painters[theme]()); cache.set(theme, paths); }
  return paths;
}

/** Decorative pixel backdrop for a theme; 240 × 110 cells shown at 960 × 440 units. */
export const PixelBackdrop = memo(function PixelBackdrop({ theme, className = "" }: { theme: SceneThemeId; className?: string }) {
  return <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" shapeRendering="crispEdges" aria-hidden="true" data-pixel-backdrop={theme}>
    {pathsFor(theme).map(path => <path key={path.color} d={path.d} fill={path.color}/>)}
  </svg>;
});

/* ---------------------------------------------------------------- Jury box */
const BOX_W = 72;
const BOX_H = 60;
const boxPalettes: Record<SceneThemeId, { top: string; face: string; frame: string; light: string; dark: string; plate: string }> = {
  courtroom: { top: "#b88457", face: "#8b5a36", frame: "#6e4329", light: "#a8714a", dark: "#4f2f1c", plate: "#d6aa5d" },
  jungle: { top: "#c99258", face: "#a06a37", frame: "#7b4f27", light: "#bb8148", dark: "#5c3a1c", plate: "#e8ae54" },
  superhero: { top: "#82909b", face: "#4a5a6e", frame: "#2a364c", light: "#617589", dark: "#1d2840", plate: "#74d6cf" },
  detective: { top: "#8a8a8a", face: "#4f4f4f", frame: "#2e2e2e", light: "#666666", dark: "#222222", plate: "#bdbdbd" },
};
function juryBox(theme: SceneThemeId) {
  const p = boxPalettes[theme];
  const g = new Grid(BOX_W, BOX_H);
  g.rect(0, 0, BOX_W, 3, p.top).rect(0, 3, BOX_W, 1, p.dark);
  g.rect(1, 4, BOX_W - 2, 18, p.face);
  for (let x = 3; x < BOX_W - 4; x += 17) g.rect(x, 7, 14, 12, p.frame).rect(x + 1, 8, 12, 10, p.face).rect(x + 1, 8, 12, 1, p.light);
  g.rect(BOX_W / 2 - 6, 9, 12, 4, p.plate);
  // raised stand down to the floor, mostly hidden behind the cast
  g.rect(3, 22, BOX_W - 6, BOX_H - 22, p.frame).rect(3, 22, BOX_W - 6, 1, p.dark);
  for (let x = 6; x < BOX_W - 6; x += 10) g.rect(x, 23, 2, BOX_H - 23, p.dark);
  g.rect(0, BOX_H - 3, BOX_W, 3, p.dark);
  return toPaths(g);
}
const boxCache = new Map<SceneThemeId, ReturnType<typeof toPaths>>();

/** The jury's raised stand; the jurors' own rail sits on its top edge. */
export function PixelJuryBox({ theme, className = "" }: { theme: SceneThemeId; className?: string }) {
  let paths = boxCache.get(theme);
  if (!paths) { paths = juryBox(theme); boxCache.set(theme, paths); }
  return <svg className={className} viewBox={`0 0 ${BOX_W} ${BOX_H}`} shapeRendering="crispEdges" aria-hidden="true" data-jury-box={theme}>
    {paths.map(path => <path key={path.color} d={path.d} fill={path.color}/>)}
  </svg>;
}

export const isSceneTheme = (id: string): id is SceneThemeId => id in painters;
