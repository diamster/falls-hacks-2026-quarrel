import type { ThemeId } from "../../types";
import { toGrey, type PixelCanvas } from "./grid";
import type { DrawOptions, PixelCharacter, Reaction } from "./types";

/*
 * The eight original Stage 5 lawyers redrawn on the pixel grid. Palettes are
 * copied from src/themes/art/sidekicks.tsx (which stays untouched) so the
 * remasters keep each lawyer's identity: suit, hair, accent and props.
 */

type Colors = { ink: string; suit: string; edge: string; accent: string; paper: string; skin: string; light: string; shade: string; hair: string; hairLight: string };
const courtA: Colors = { ink: "#302d35", suit: "#304b62", edge: "#658598", accent: "#d6aa5d", paper: "#fff0d4", skin: "#d6a17c", light: "#f2c8a0", shade: "#a56d53", hair: "#62697a", hairLight: "#bac1c3" };
const courtB: Colors = { ink: "#332c35", suit: "#784760", edge: "#b77a8e", accent: "#e2bc79", paper: "#fff0d8", skin: "#a66d4f", light: "#d39870", shade: "#744636", hair: "#322832", hairLight: "#62434a" };
const heroA: Colors = { ink: "#182b3d", suit: "#296875", edge: "#59b5b1", accent: "#f1c365", paper: "#f7eacb", skin: "#d4966b", light: "#f2c397", shade: "#9a614e", hair: "#243446", hairLight: "#486175" };
const heroB: Colors = { ink: "#21273b", suit: "#62518f", edge: "#9d84c3", accent: "#74d6cf", paper: "#f0e6c9", skin: "#9d674f", light: "#c8916f", shade: "#694336", hair: "#2e2847", hairLight: "#645175" };
const noirA: Colors = { ink: "#232323", suit: "#424242", edge: "#777777", accent: "#bcbcbc", paper: "#f0f0f0", skin: "#b6b6b6", light: "#dedede", shade: "#848484", hair: "#383838", hairLight: "#686868" };
const noirB: Colors = { ink: "#242424", suit: "#a7a7a7", edge: "#d4d4d4", accent: "#585858", paper: "#f2f2f2", skin: "#9d9d9d", light: "#c9c9c9", shade: "#707070", hair: "#303030", hairLight: "#5e5e5e" };
const toucan: Colors = { ink: "#243f35", suit: "#36705a", edge: "#65a17e", accent: "#e8ae54", paper: "#fff0c9", skin: "#35494a", light: "#58716b", shade: "#263b3c", hair: "#293e40", hairLight: "#58746d" };
const capybara: Colors = { ink: "#354239", suit: "#307e80", edge: "#72b8a5", accent: "#de9269", paper: "#fff0cf", skin: "#ac7850", light: "#d8a273", shade: "#79553b", hair: "#79553b", hairLight: "#c49564" };

type Look = {
  hair?: "short" | "curls" | "long";
  glasses?: boolean;
  visor?: boolean;
  cape?: boolean;
  striped?: boolean;
  digital?: boolean;
  badges?: boolean;
  head?: "human" | "toucan" | "capybara";
};

const frames: Readonly<Record<Reaction, number>> = { idle: 2, talk: 2, think: 3, cheer: 2 };

function body(c: PixelCanvas, p: Colors, look: Look, { reaction, frame }: DrawOptions) {
  if (look.cape) {
    for (let y = 27; y <= 50; y++) {
      const spread = Math.floor((y - 27) / 6);
      c.rect(12 - spread, y, 24 + spread * 2, 1, y > 46 ? p.ink : p.edge);
    }
  }
  if (look.hair === "long") c.round(14, 8, 20, 22, p.hair, 2);
  // Legs and shoes.
  c.rect(17, 44, 5, 8, p.suit).rect(26, 44, 5, 8, p.suit).rect(21, 44, 1, 8, p.ink).rect(26, 44, 1, 8, p.ink);
  c.round(15, 51, 8, 3, p.ink, 1).round(25, 51, 8, 3, p.ink, 1);
  // Jacket, lapels, shirt and tie.
  c.round(14, 27, 20, 19, p.suit, 2);
  if (look.striped) for (const x of [16, 19, 29, 32]) c.rect(x, 33, 1, 11, p.edge);
  c.rect(15, 29, 2, 14, p.edge);
  c.dots([[19, 27], [20, 28], [21, 29], [21, 30], [22, 31], [22, 32], [28, 27], [27, 28], [26, 29], [26, 30], [25, 31], [25, 32]], p.edge);
  c.rect(21, 27, 6, 2, p.paper).rect(22, 29, 4, 2, p.paper).rect(23, 31, 2, 1, p.paper);
  c.rect(23, 29, 2, 1, p.accent).rect(23, 30, 2, 7, p.accent).px(23, 37, p.accent);
  c.rect(15, 44, 18, 1, p.ink);
  if (look.badges) c.rect(15, 28, 3, 2, p.accent).rect(31, 28, 3, 2, p.accent);
  c.px(29, 33, p.accent);
  c.rect(21, 25, 6, 3, p.skin);

  // Left arm (viewer's left): down, or raised in a cheer.
  if (reaction === "cheer") {
    for (let i = 0; i <= 6; i++) c.rect(12 - i, 30 - i, 4, 1, p.suit);
    c.round(4 - (frame % 2), 18, 5, 5, p.skin, 1);
  } else {
    c.round(11, 29, 4, 14, p.suit, 1).round(11, 42, 4, 3, p.skin, 1);
  }
  // Right arm holding the casebook.
  c.round(33, 29, 4, 10, p.suit, 1);
  c.round(27, 34, 9, 11, p.ink, 1).rect(28, 35, 7, 9, p.accent).rect(29, 36, 5, 7, look.digital ? p.edge : p.paper);
  c.rect(30, 38, 3, 1, p.ink).rect(30, 40, 2, 1, p.ink).round(33, 38, 3, 3, p.skin, 1);
}

function face(c: PixelCanvas, p: Colors, { reaction, frame }: DrawOptions, eyeY = 15, mouthY = 22) {
  const brow = p.hair;
  c.rect(17, eyeY - 2 - (reaction === "think" ? 1 : 0), 4, 1, brow).rect(27, eyeY - 2, 4, 1, brow);
  if (reaction === "cheer") {
    c.dots([[17, eyeY + 2], [18, eyeY + 1], [19, eyeY + 1], [20, eyeY + 2]], p.ink).dots([[27, eyeY + 2], [28, eyeY + 1], [29, eyeY + 1], [30, eyeY + 2]], p.ink);
  } else if (reaction === "idle" && frame % 2 === 1) {
    c.rect(18, eyeY + 2, 3, 1, p.ink).rect(27, eyeY + 2, 3, 1, p.ink);
  } else {
    const up = reaction === "think" ? -1 : 0;
    c.rect(18, eyeY + up, 2, 3, p.ink).rect(28, eyeY + up, 2, 3, p.ink).px(18, eyeY + up, "#ffffff").px(28, eyeY + up, "#ffffff");
  }
  c.mouth(() => {
    if (reaction === "talk" && frame % 2 === 0) c.rect(21, mouthY - 1, 6, 3, p.ink).rect(22, mouthY + 1, 4, 1, "#c8616b");
    else if (reaction === "cheer") c.rect(20, mouthY - 1, 8, 1, p.ink).rect(21, mouthY, 6, 1, p.ink).rect(22, mouthY, 4, 1, p.paper);
    else c.rect(21, mouthY, 6, 1, p.ink);
  });
}

function humanHead(c: PixelCanvas, p: Colors, look: Look, options: DrawOptions) {
  c.rect(12, 15, 2, 4, p.skin).rect(34, 15, 2, 4, p.skin);
  c.round(14, 6, 20, 20, p.skin, 3);
  c.round(17, 8, 13, 8, p.light, 2);
  c.rect(31, 10, 2, 13, p.shade);
  c.rect(23, 18, 2, 2, p.shade);
  face(c, p, options);
  if (look.hair === "curls") {
    for (const [x, y] of [[15, 7], [19, 4.5], [24, 3.5], [29, 4.5], [33, 7], [14, 11], [34, 11]] as const) c.ellipse(x, y, 3, 3, p.hair);
    c.dots([[18, 3], [23, 2], [28, 3], [32, 6]], p.hairLight);
  } else {
    c.round(13, 3, 22, 7, p.hair, 2).rect(13, 9, 3, 6, p.hair).rect(32, 9, 3, 5, p.hair).rect(16, 9, 8, 2, p.hair);
    c.rect(17, 4, 8, 1, p.hairLight).rect(15, 5, 2, 1, p.hairLight);
  }
  if (look.glasses) {
    c.rect(16, 14, 6, 1, p.accent).rect(26, 14, 6, 1, p.accent).rect(16, 18, 6, 1, p.accent).rect(26, 18, 6, 1, p.accent);
    c.rect(16, 14, 1, 5, p.accent).rect(21, 14, 1, 5, p.accent).rect(26, 14, 1, 5, p.accent).rect(31, 14, 1, 5, p.accent).rect(22, 15, 4, 1, p.accent);
  }
  if (look.visor) {
    // The visor hides the eyes, so its glow dims to show a blink.
    const blink = options.reaction === "idle" && options.frame % 2 === 1;
    c.rect(15, 13, 18, 5, "#29596f").rect(16, 14, 16, 2, blink ? "#5aa8a0" : "#93e7d9").rect(17, 14, 3, 1, blink ? "#93e7d9" : "#e4fff3");
  }
}

function toucanHead(c: PixelCanvas, options: DrawOptions) {
  c.round(14, 5, 18, 22, "#253d3e", 3);
  c.round(16, 11, 10, 13, "#fff0c4", 2);
  c.rect(16, 6, 12, 2, "#52736a");
  const blink = options.reaction === "idle" && options.frame % 2 === 1;
  if (blink) c.rect(18, 16, 4, 1, "#24383d");
  else c.round(18, 14, 4, 4, "#ffffff", 1).rect(20, options.reaction === "think" ? 14 : 15, 2, 2, "#24383d");
  // Beak.
  c.round(26, 13, 17, 7, "#eca54b", 2).rect(27, 13, 12, 2, "#ffda70").rect(38, 15, 4, 3, "#df7750").rect(26, 13, 1, 7, "#754b35");
  c.mouth(() => {
    const open = (options.reaction === "talk" && options.frame % 2 === 0) || options.reaction === "cheer";
    c.rect(27, 18, 14, open ? 2 : 1, open ? "#4f4537" : "#754b35");
  });
}

function capybaraHead(c: PixelCanvas, options: DrawOptions) {
  const p = capybara;
  c.round(12, 7, 5, 4, "#d49a72", 1).round(31, 7, 5, 4, "#d49a72", 1);
  c.round(11, 9, 26, 18, p.shade, 4);
  c.round(13, 11, 22, 15, p.skin, 3);
  c.round(16, 12, 15, 6, p.light, 2);
  c.round(17, 18, 14, 8, "#e6bb89", 2);
  c.rect(22, 19, 4, 2, "#6e503d");
  const blink = options.reaction === "idle" && options.frame % 2 === 1;
  c.rect(16, 14, 4, 1, p.shade).rect(28, 14, 4, 1, p.shade);
  if (blink || options.reaction === "cheer") c.rect(16, 16, 4, 1, "#333e35").rect(28, 16, 4, 1, "#333e35");
  else c.rect(17, 15, 3, 3, "#333e35").rect(28, 15, 3, 3, "#333e35").px(17, 15, "#fff1cc").px(28, 15, "#fff1cc");
  c.mouth(() => {
    if (options.reaction === "talk" && options.frame % 2 === 0) c.rect(21, 22, 6, 2, "#79553b");
    else c.dots([[20, 23], [21, 24], [22, 24], [23, 23], [24, 23], [25, 24], [26, 24], [27, 23]], "#79553b");
  });
}

function counsel(p: Colors, look: Look) {
  return (c: PixelCanvas, options: DrawOptions) => {
    body(c, p, look, options);
    if (look.head === "toucan") toucanHead(c, options);
    else if (look.head === "capybara") capybaraHead(c, options);
    else humanHead(c, p, look, options);
    c.outline(p.ink);
    if (options.reaction === "think") {
      const dots = [[39, 8, 1], [41, 5, 1], [43, 2, 2]] as const;
      dots.slice(0, (options.frame % 3) + 1).forEach(([x, y, size]) => c.rect(x, y, size, size, p.ink));
    }
    if (options.reaction === "cheer") {
      const [x, y] = options.frame % 2 === 0 ? [41, 22] : [43, 18];
      c.dots([[x, y], [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]], p.accent);
    }
    if (options.theme === "detective") c.mapColors(toGrey);
  };
}

export interface RemasterCharacter extends PixelCharacter { theme: ThemeId; slot: "A" | "B"; classicAssetId: string }

function remaster(theme: ThemeId, slot: "A" | "B", description: string, p: Colors, look: Look): RemasterCharacter {
  const classicAssetId = `${theme}-lawyer-${slot.toLowerCase()}`;
  return { id: `remaster-${classicAssetId}`, theme, slot, classicAssetId, description, frames, draw: counsel(p, look) };
}

export const remasters: Readonly<Record<string, RemasterCharacter>> = Object.freeze(Object.fromEntries([
  remaster("jungle", "A", "a pixel toucan lawyer with a golden beak, green jacket and case notes", toucan, { head: "toucan" }),
  remaster("jungle", "B", "a pixel capybara lawyer in a turquoise jacket carrying a coral casebook", capybara, { head: "capybara" }),
  remaster("superhero", "A", "a pixel hero lawyer with gold-rimmed glasses, a teal cape and a digital casebook", heroA, { cape: true, glasses: true, digital: true, badges: true }),
  remaster("superhero", "B", "a pixel hero lawyer with curly hair, a glowing visor and a purple cape", heroB, { cape: true, hair: "curls", visor: true, digital: true }),
  remaster("detective", "A", "a pixel noir lawyer in a pinstriped suit", noirA, { striped: true }),
  remaster("detective", "B", "a pixel noir lawyer with long curly hair and round glasses", noirB, { hair: "long", glasses: true }),
  remaster("courtroom", "A", "a pixel lawyer in a navy suit carrying a gold-edged lawbook", courtA, {}),
  remaster("courtroom", "B", "a pixel lawyer with curly hair in a plum suit holding a casebook", courtB, { hair: "curls" }),
].map(character => [character.id, character])));
