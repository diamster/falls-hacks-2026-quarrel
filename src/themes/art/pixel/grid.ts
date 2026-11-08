/**
 * Pixel grid engine for the mascot and remastered lawyer sprites.
 *
 * Every sprite is drawn into a fixed 48 × 56 grid of whole cells and rendered
 * at the cast's existing two-unit scale (viewBox 96 × 112). Coordinates are
 * always integers, so no cell can be drawn at half size, overlap a neighbour
 * or be antialiased into a different width. Uneven pixels on screen can then
 * only come from the display size of the SVG, which `evenScale` checks.
 */

export const GRID_WIDTH = 48;
export const GRID_HEIGHT = 56;
/** Each grid cell is two viewBox units, matching the existing sprites. */
export const CELL_UNITS = 2;

type Cell = { color: string; mouth: boolean } | null;

export class PixelCanvas {
  readonly width: number;
  readonly height: number;
  private cells: Cell[];
  private mouthMode = false;

  constructor(width = GRID_WIDTH, height = GRID_HEIGHT) {
    this.width = width;
    this.height = height;
    this.cells = new Array<Cell>(width * height).fill(null);
  }

  inside(x: number, y: number) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): string | null {
    return this.inside(x, y) ? this.cells[y * this.width + x]?.color ?? null : null;
  }

  isMouth(x: number, y: number) {
    return this.inside(x, y) && this.cells[y * this.width + x]?.mouth === true;
  }

  px(x: number, y: number, color: string) {
    if (this.inside(x, y)) this.cells[y * this.width + x] = { color, mouth: this.mouthMode };
    return this;
  }

  clear(x: number, y: number) {
    if (this.inside(x, y)) this.cells[y * this.width + x] = null;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) this.px(col, row, color);
    return this;
  }

  /** Rectangle with its four corner cells removed: the standard pixel-art round-off. */
  round(x: number, y: number, w: number, h: number, color: string, corner = 1) {
    this.rect(x, y, w, h, color);
    for (let i = 0; i < corner; i++) {
      const span = corner - i;
      for (let j = 0; j < span; j++) {
        this.clear(x + j, y + i).clear(x + w - 1 - j, y + i).clear(x + j, y + h - 1 - i).clear(x + w - 1 - j, y + h - 1 - i);
      }
    }
    return this;
  }

  /** Filled ellipse measured from cell centres; cx/cy may sit between cells. */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, color);
      }
    }
    return this;
  }

  /** Cells listed as [x, y] pairs. */
  dots(points: ReadonlyArray<readonly [number, number]>, color: string) {
    for (const [x, y] of points) this.px(x, y, color);
    return this;
  }

  /**
   * Stamp a small hand-drawn "flashcard": rows of characters where each
   * character is a palette key and "." is transparent.
   */
  stamp(x: number, y: number, rows: readonly string[], palette: Readonly<Record<string, string>>) {
    rows.forEach((row, dy) => [...row].forEach((key, dx) => {
      if (key !== "." && key !== " ") {
        const color = palette[key];
        if (!color) throw new Error(`Unknown palette key "${key}"`);
        this.px(x + dx, y + dy, color);
      }
    }));
    return this;
  }

  /** Draw inside this callback becomes part of the `.sprite-mouth` animation group. */
  mouth(draw: () => void) {
    this.mouthMode = true;
    try { draw(); } finally { this.mouthMode = false; }
    return this;
  }

  /** One-cell exterior outline around everything drawn so far. */
  outline(color: string) {
    const targets: Array<[number, number]> = [];
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      if (this.get(x, y) !== null) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) targets.push([x, y]);
    }
    for (const [x, y] of targets) this.px(x, y, color);
    return this;
  }

  /** Recolour every drawn cell, e.g. to make a noir variant. */
  mapColors(map: (color: string) => string) {
    this.cells = this.cells.map(cell => cell && { ...cell, color: map(cell.color) });
    return this;
  }

  snapshot(): PixelSnapshot {
    const rows: string[][] = [];
    const mouthRows: boolean[][] = [];
    for (let y = 0; y < this.height; y++) {
      rows.push([]); mouthRows.push([]);
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[y * this.width + x];
        rows[y].push(cell?.color ?? "");
        mouthRows[y].push(cell?.mouth === true);
      }
    }
    return { width: this.width, height: this.height, rows, mouthRows };
  }
}

export interface PixelSnapshot {
  width: number;
  height: number;
  /** Hex colour per cell; "" is transparent. */
  rows: string[][];
  mouthRows: boolean[][];
}

export interface PixelRun { x: number; y: number; w: number; color: string; mouth: boolean }

/** Horizontal runs of identical cells. Every run is integer-aligned by construction. */
export function toRuns(snapshot: PixelSnapshot): PixelRun[] {
  const runs: PixelRun[] = [];
  snapshot.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const color = row[x];
      const mouth = snapshot.mouthRows[y][x];
      let end = x + 1;
      while (end < row.length && row[end] === color && snapshot.mouthRows[y][end] === mouth) end++;
      if (color) runs.push({ x, y, w: end - x, color, mouth });
      x = end;
    }
  });
  return runs;
}

/** Paths grouped by colour and row band, so each element stays small and readable in devtools. */
export function toPaths(snapshot: PixelSnapshot, mouth: boolean): Array<{ key: string; color: string; d: string }> {
  const groups = new Map<string, { color: string; parts: string[] }>();
  for (const run of toRuns(snapshot)) {
    if (run.mouth !== mouth) continue;
    const key = `${run.color}-${Math.floor(run.y / 8)}`;
    const group = groups.get(key) ?? { color: run.color, parts: [] };
    group.parts.push(`M${run.x} ${run.y}h${run.w}v1h-${run.w}z`);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, color: group.color, d: group.parts.join("") }));
}

/** Count of distinct colours: a readability budget check for small sprites. */
export function colorCount(snapshot: PixelSnapshot) {
  return new Set(snapshot.rows.flat().filter(Boolean)).size;
}

/**
 * True when a sprite displayed `cssWidth` pixels wide maps each grid cell to a
 * whole number of device pixels. Fractional mappings are what make some
 * pixels look wider than their neighbours.
 */
export function evenScale(cssWidth: number, devicePixelRatio = 1, gridWidth = GRID_WIDTH) {
  const devicePixelsPerCell = (cssWidth * devicePixelRatio) / gridWidth;
  return Number.isInteger(Math.round(devicePixelsPerCell * 1000) / 1000) && devicePixelsPerCell >= 1;
}

/** Luminance-preserving greyscale with equal channels, as the noir theme requires. */
export function toGrey(hex: string) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16), g = parseInt(value.slice(2, 4), 16), b = parseInt(value.slice(4, 6), 16);
  const level = Math.round(0.299 * r + 0.587 * g + 0.114 * b).toString(16).padStart(2, "0");
  return `#${level}${level}${level}`;
}
