import { PixelCanvas, toGrey } from "./grid";
import type { DrawOptions, PixelCharacter } from "./types";

/*
 * Original mascot sprites, drawn from the team's reference sketches in
 * docs/pixel-art-lab/reference/ without tracing them. The robot keeps the
 * reference's colour tabs, sticker and pie but uses a straight face split;
 * the raccoon's hoodie carries no lettering or logo.
 */

const MIRROR = 47; // cells x and MIRROR - x are mirror images on a 48-wide grid

function mirrorPoints(points: ReadonlyArray<readonly [number, number]>, offsetY = 0) {
  return points.map(([x, y]) => [MIRROR - x, y + offsetY] as const);
}

function shift(points: ReadonlyArray<readonly [number, number]>, dx: number, dy: number) {
  return points.map(([x, y]) => [x + dx, y + dy] as const);
}

function sparkles(c: PixelCanvas, frame: number, color: string) {
  const sets = [[[3, 31], [44, 27]], [[2, 26], [45, 33]]] as const;
  for (const [x, y] of sets[frame % 2]) c.dots([[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]], color);
}

function thoughtDots(c: PixelCanvas, frame: number, color: string) {
  const dots = [[42, 6, 1], [44, 3, 1], [46, 0, 2]] as const;
  dots.slice(0, (frame % 3) + 1).forEach(([x, y, size]) => c.rect(x, y, size, size, color));
}

const pi = {
  ink: "#22262b", green: "#3aa98a", greenLight: "#63c6a6", greenDark: "#2b8a6f",
  blue: "#8fd3dc", blueLight: "#bce9ef", blueDark: "#68b4c1",
  sticker: "#6fe0c0", stickerDark: "#3fb898", navy: "#26318f", pink: "#f07a86", red: "#e23d4c",
  white: "#ffffff", blush: "#ec9aa3", tongue: "#e8707c",
  crust: "#f2b765", crustLight: "#fbd58f", crustDark: "#cf8638", fill: "#e8414e", fillDark: "#b52c3b",
  tin: "#9fc3d8", tinLight: "#d3e8f1", tinDark: "#6f98b6", spark: "#f5c84c",
  cape: "#c9364a", capeDark: "#952536", leaf: "#4caf50", leafDark: "#2f7d38", hat: "#4a4a52", hatBand: "#1f1f24", jabot: "#fff6e6",
} as const;

function drawPie(c: PixelCanvas) {
  // Tin: a trapezoid with fluted stripes.
  for (let i = 0; i < 7; i++) {
    const inset = Math.floor(i * 0.6);
    for (let x = 5 + inset; x <= 42 - inset; x++) c.px(x, 46 + i, x % 4 === 1 ? pi.tinDark : pi.tin);
  }
  c.rect(5, 46, 38, 1, pi.tinLight).rect(9, 52, 30, 1, pi.tinDark);
  // Crust, filling and lattice.
  c.round(4, 39, 40, 7, pi.crust, 2);
  c.rect(7, 40, 34, 4, pi.fill).rect(7, 43, 34, 1, pi.fillDark);
  for (const x of [10, 16, 22, 28, 34]) c.rect(x, 40, 2, 4, pi.crust).rect(x, 40, 1, 4, pi.crustLight);
  c.rect(7, 41, 34, 1, pi.crust);
  for (let x = 6; x <= 41; x += 2) c.px(x, 39, pi.crustLight).px(x + 1, 45, pi.crustDark);
}

function drawPiRobot(c: PixelCanvas, { theme, reaction, frame, accessories }: DrawOptions) {
  const dy = reaction === "cheer" && frame % 2 === 1 ? -1 : 0;
  const decorate = accessories;

  if (decorate && theme === "superhero") {
    for (let y = 9; y <= 33; y++) c.rect(39, y + dy, 3 + Math.floor((y - 9) / 6), 1, y % 5 === 0 ? pi.capeDark : pi.cape);
  }
  // Colour tabs on the left of the head.
  c.rect(5, 9 + dy, 5, 5, pi.navy).rect(5, 14 + dy, 5, 4, pi.pink).rect(5, 18 + dy, 5, 4, pi.red);
  // Head: two halves split by a straight seam.
  c.round(10, 4 + dy, 32, 28, pi.green, 2);
  for (let y = 4 + dy; y < 32 + dy; y++) for (let x = 26; x < 42; x++) if (c.get(x, y)) c.px(x, y, pi.blue);
  c.rect(12, 5 + dy, 14, 1, pi.greenLight).rect(11, 6 + dy, 1, 22, pi.greenLight).rect(27, 5 + dy, 13, 1, pi.blueLight);
  c.rect(12, 30 + dy, 14, 1, pi.greenDark).rect(27, 30 + dy, 13, 1, pi.blueDark).rect(40, 7 + dy, 1, 22, pi.blueDark);
  c.rect(26, 5 + dy, 1, 26, pi.ink);
  // Sticker (a gold badge for the superhero theme).
  const sticker = decorate && theme === "superhero" ? ["#f1c365", "#c99a3d"] : [pi.sticker, pi.stickerDark];
  c.rect(33, 8 + dy, 5, 4, sticker[0]).rect(33, 11 + dy, 5, 1, sticker[1]).rect(37, 8 + dy, 1, 4, sticker[1]);

  // Brows, eyes and blush.
  const thinking = reaction === "think";
  c.rect(18, (thinking ? 12 : 13) + dy, 3, 1, pi.ink).rect(31, 13 + dy, 3, 1, pi.ink);
  if (thinking) c.px(34, 12 + dy, pi.ink);
  const blink = reaction === "idle" && frame % 2 === 1;
  if (reaction === "cheer") {
    c.dots(shift([[16, 21], [17, 20], [18, 19], [19, 18], [20, 19], [21, 20], [22, 21]], 0, dy), pi.ink);
    c.dots(shift([[30, 21], [31, 20], [32, 19], [33, 19], [34, 20], [35, 21]], 0, dy), pi.ink);
  } else if (blink) {
    c.rect(16, 20 + dy, 7, 1, pi.ink).rect(30, 20 + dy, 6, 1, pi.ink);
  } else {
    const look = thinking ? -1 : 0;
    c.ellipse(19.5, 19.5 + dy, 3.5, 3.5, pi.ink).round(30, 17 + dy, 6, 6, pi.ink, 1);
    c.rect(17 + (thinking ? 1 : 0), 17 + dy + look, 2, 2, pi.white).px(21, 21 + dy, pi.white);
    c.rect(31 + (thinking ? 1 : 0), 18 + dy + look, 2, 2, pi.white).px(34, 21 + dy, pi.white);
  }
  c.rect(13, 25 + dy, 2, 1, pi.blush).rect(37, 25 + dy, 2, 1, pi.blush);

  // Mouth: a small line that opens when talking or cheering.
  c.mouth(() => {
    if (reaction === "talk" && frame % 2 === 0) c.rect(24, 25 + dy, 4, 2, pi.ink).rect(25, 26 + dy, 2, 1, pi.tongue);
    else if (reaction === "cheer") c.rect(23, 25 + dy, 6, 1, pi.ink).rect(24, 26 + dy, 4, 1, pi.ink).rect(25, 26 + dy, 2, 1, pi.tongue);
    else c.rect(24, 26 + dy, 4, 1, pi.ink);
  });

  // Base and pie.
  c.rect(12, 32 + dy, 28, 3, pi.ink);
  drawPie(c);

  if (decorate && theme === "courtroom") c.rect(25, 35 + dy, 2, 3, pi.jabot);
  if (decorate && theme === "jungle") {
    c.rect(25, 1 + dy, 1, 3, pi.leafDark).rect(21, 0 + dy, 4, 2, pi.leaf).rect(26, 0 + dy, 4, 2, pi.leaf).px(22, 0 + dy, pi.leafDark).px(28, 1 + dy, pi.leafDark);
  }
  if (decorate && theme === "detective") {
    c.round(17, 0 + dy, 18, 4, pi.hat, 1).rect(17, 2 + dy, 18, 1, pi.hatBand).rect(12, 3 + dy, 28, 2, pi.hat);
  }

  c.outline(pi.ink);

  // Stick legs into the pie and stick arms with loop hands, drawn over the outline.
  for (const x of [17, 21, 30, 34]) c.rect(x, 35 + dy, 1, 4 - dy, pi.ink);
  const arm: ReadonlyArray<readonly [number, number]> = reaction === "cheer"
    // Raised arms swing below and outside the colour tabs so they stay visible.
    ? [[8, 27], [7, 26], [6, 25], [5, 24], [4, 23], [2, 20], [3, 20], [1, 20], [1, 21], [3, 21], [1, 22], [2, 22], [3, 22]]
    : [[8, 26], [7, 27], [6, 28], [5, 28], [4, 27], [3, 24], [4, 24], [5, 24], [3, 25], [5, 25], [3, 26], [4, 26], [5, 26]];
  c.dots(shift(arm, 0, dy), pi.ink).dots(mirrorPoints(arm, dy), pi.ink);

  if (reaction === "cheer") sparkles(c, frame, pi.spark);
  if (thinking) thoughtDots(c, frame, pi.ink);
  if (theme === "detective") c.mapColors(toGrey);
}

const coon = {
  ink: "#2b2d33", fur: "#9ca0a8", furLight: "#c7cad0", furDark: "#6d717a", mask: "#3b3e46",
  cream: "#f4f2ee", eye: "#ffffff", pupil: "#1c1d21", nose: "#1f2024", noseShine: "#5a5c63", tongue: "#e8707c", ear: "#e0a5ab",
  hood: "#c8323a", hoodLight: "#e2505a", hoodDark: "#962530", ring: "#4a4d55",
  case: "#7a4a2c", caseDark: "#4f2f1c", gold: "#e5c579", petal: "#f08a5d", petalCenter: "#f5d76e",
  cape: "#2f8f8c", capeDark: "#1f6563", hat: "#4a4a52", hatBand: "#1f1f24", spark: "#f5c84c",
} as const;

function drawRaccoon(c: PixelCanvas, { theme, reaction, frame, accessories }: DrawOptions) {
  const dy = reaction === "cheer" && frame % 2 === 1 ? -1 : 0;
  const decorate = accessories;
  const wave = reaction === "idle" || reaction === "cheer";
  const armsUp = reaction === "cheer";

  if (decorate && theme === "superhero") {
    for (let y = 27; y <= 48; y++) {
      const spread = Math.floor((y - 27) / 5);
      c.rect(12 - spread, y, 24 + spread * 2, 1, y % 6 === 0 ? coon.capeDark : coon.cape);
    }
  }
  // Striped tail behind the body.
  for (let t = 0; t <= 9; t++) c.ellipse(34 + t * 1.1, 45 - t * 1.5, 3, 3, t === 9 || Math.floor(t / 2) % 2 === 1 ? coon.ring : coon.fur);

  // Legs and feet.
  c.rect(16, 46, 6, 6, coon.fur).rect(26, 46, 6, 6, coon.fur);
  c.round(15, 51, 8, 3, coon.furDark, 1).round(25, 51, 8, 3, coon.furDark, 1);

  // Hoodie body.
  c.round(13, 26 + dy, 22, 21, coon.hood, 2);
  c.rect(14, 28 + dy, 2, 15, coon.hoodLight).rect(32, 28 + dy, 2, 15, coon.hoodDark).rect(14, 44 + dy, 20, 2, coon.hoodDark);
  c.round(18, 37 + dy, 12, 5, coon.hoodDark, 1).rect(19, 37 + dy, 10, 1, coon.hood);
  c.rect(21, 28 + dy, 1, 5, coon.cream).rect(26, 28 + dy, 1, 5, coon.cream).px(21, 33 + dy, coon.furLight).px(26, 33 + dy, coon.furLight);
  c.round(14, 24 + dy, 20, 4, coon.hoodDark, 1);

  // Arms: the viewer's left arm waves; the right arm rests or joins a cheer.
  const raisedArm = (side: 1 | -1, tilt: number) => {
    // Sleeve rises diagonally away from the head so the paw never touches the cheek.
    for (let i = 0; i <= 6; i++) {
      const x = 12 - i;
      c.rect(side === 1 ? x : MIRROR - x - 3, 30 - i + dy, 4, 1, coon.hood);
    }
    const cuffX = side === 1 ? 5 : MIRROR - 8;
    c.rect(cuffX, 23 + dy, 4, 1, coon.hoodDark);
    const pawX = side === 1 ? 4 - tilt : MIRROR - 9 + tilt;
    c.round(pawX, 18 + dy, 6, 5, coon.fur, 1);
    c.dots([[pawX, 17 + dy], [pawX + 2, 17 + dy], [pawX + 4, 17 + dy]], coon.fur);
  };
  const restingArm = (side: 1 | -1) => {
    const x = side === 1 ? 11 : 33;
    c.round(x, 28 + dy, 4, 13, coon.hood, 1).rect(x, 40 + dy, 4, 1, coon.hoodDark).round(x, 41 + dy, 4, 3, coon.fur, 1);
  };
  if (wave) raisedArm(1, frame % 2); else restingArm(1);
  if (armsUp) raisedArm(-1, frame % 2); else restingArm(-1);

  // Ears, head, mask and face.
  const ear = [[14, 3, 2], [13, 4, 4], [13, 5, 5], [13, 6, 5], [13, 7, 6]] as const;
  for (const [x, y, w] of ear) {
    c.rect(x, y + dy, w, 1, coon.furDark).rect(MIRROR - x - w + 1, y + dy, w, 1, coon.furDark);
  }
  c.rect(14, 5 + dy, 2, 2, coon.ear).rect(MIRROR - 15, 5 + dy, 2, 2, coon.ear);
  c.ellipse(24, 15.5 + dy, 13, 10.5, coon.fur);
  c.ellipse(24, 10.5 + dy, 9, 4, coon.furLight);
  c.ellipse(14, 21 + dy, 3, 3, coon.cream).ellipse(34, 21 + dy, 3, 3, coon.cream);
  c.ellipse(17.5, 16 + dy, 5.5, 3.5, coon.mask).ellipse(30.5, 16 + dy, 5.5, 3.5, coon.mask);
  c.rect(23, 8 + dy, 2, 7, coon.furDark);

  const blink = reaction === "idle" && frame % 2 === 1;
  for (const x of [16, 28]) {
    if (reaction === "cheer") c.dots([[x, 16 + dy], [x + 1, 15 + dy], [x + 2, 15 + dy], [x + 3, 16 + dy]], coon.cream);
    else if (blink) c.rect(x, 16 + dy, 4, 1, coon.furLight);
    else {
      const up = reaction === "think" ? -1 : 0;
      c.round(x, 14 + dy, 4, 4, coon.eye, 1).rect(x + 1, 15 + dy + up, 2, 2, coon.pupil).px(x + 1, 15 + dy + up, coon.eye);
    }
  }

  c.ellipse(24, 21.5 + dy, 5, 3.2, coon.cream);
  c.rect(22, 18 + dy, 4, 2, coon.nose).px(23, 18 + dy, coon.noseShine);
  c.mouth(() => {
    c.rect(23, 20 + dy, 2, 1, coon.ink);
    if (reaction === "talk" && frame % 2 === 0) c.rect(22, 21 + dy, 4, 3, coon.ink).rect(23, 23 + dy, 2, 1, coon.tongue);
    else if (reaction === "cheer") c.rect(21, 21 + dy, 6, 2, coon.ink).rect(22, 22 + dy, 4, 1, coon.tongue);
    else c.dots([[21, 21 + dy], [22, 22 + dy], [23, 22 + dy], [24, 22 + dy], [25, 22 + dy], [26, 21 + dy]], coon.ink);
  });

  if (decorate && theme === "courtroom" && !armsUp) {
    c.round(31, 43 + dy, 9, 6, coon.case, 1).rect(31, 45 + dy, 9, 1, coon.caseDark).rect(33, 42 + dy, 5, 1, coon.caseDark).px(35, 45 + dy, coon.gold);
  }
  if (decorate && theme === "jungle") {
    c.dots([[12, 3 + dy], [14, 3 + dy], [13, 2 + dy], [13, 4 + dy]], coon.petal).px(13, 3 + dy, coon.petalCenter);
  }
  if (decorate && theme === "detective") {
    c.round(15, 1 + dy, 18, 5, coon.hat, 1).rect(15, 4 + dy, 18, 1, coon.hatBand).rect(10, 6 + dy, 28, 2, coon.hat);
  }

  c.outline(coon.ink);
  if (reaction === "cheer") sparkles(c, frame, coon.spark);
  if (reaction === "think") thoughtDots(c, frame, coon.ink);
  if (theme === "detective") c.mapColors(toGrey);
}

export const mascots = {
  pi: {
    id: "pi",
    description: "a boxy two-tone robot with colour tabs, big shiny eyes and a lattice pie",
    frames: { idle: 2, talk: 2, think: 3, cheer: 2 },
    draw: drawPiRobot,
  },
  raccoon: {
    id: "raccoon",
    description: "a friendly grey raccoon in a red hoodie, waving",
    frames: { idle: 2, talk: 2, think: 3, cheer: 2 },
    draw: drawRaccoon,
  },
} as const satisfies Record<string, PixelCharacter>;

export type MascotId = keyof typeof mascots;
