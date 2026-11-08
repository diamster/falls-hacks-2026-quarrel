import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { themeIds } from "@/themes";
import { CELL_UNITS, GRID_HEIGHT, GRID_WIDTH, PixelCanvas, colorCount, evenScale, toGrey, toPaths, toRuns } from "@/themes/art/pixel/grid";
import { mascots } from "@/themes/art/pixel/mascots";
import { remasters } from "@/themes/art/pixel/remasters";
import {
  MASCOT_ACCESSORIES, fallbackPixelAssetId, getPixelAsset, isLawyerArtStyle, isPixelAssetId, lawyerArtFor, lawyerArtStyles,
  mascotAssetId, mascotLawyers, pixelAssetIds, renderPixelAsset, resolveLawyerArt,
} from "@/themes/art/pixel/roster";
import { PixelSprite } from "@/themes/art/pixel/pixel-sprite";
import { reactions } from "@/themes/art/pixel/types";
import { PixelLab } from "@/app/pixel-lab/pixel-lab";
import { CharacterAsset } from "@/themes/assets";
import { DisplayPreferencesProvider, displayPreferencesKey } from "@/components/display-preferences";

describe("pixel grid engine", () => {
  it("keeps every cell on whole integer coordinates inside the 48 × 56 grid", () => {
    const canvas = new PixelCanvas();
    expect([canvas.width, canvas.height, CELL_UNITS]).toEqual([GRID_WIDTH, GRID_HEIGHT, 2]);
    canvas.px(1.5, 2, "#ff0000").px(-1, 0, "#ff0000").px(48, 0, "#ff0000").px(0, 56, "#ff0000");
    expect(colorCount(canvas.snapshot())).toBe(0);
    canvas.ellipse(10.3, 10.7, 3.2, 2.6, "#123456").rect(20, 20, 3, 2, "#abcdef");
    for (const run of toRuns(canvas.snapshot())) {
      expect(Number.isInteger(run.x) && Number.isInteger(run.y) && Number.isInteger(run.w)).toBe(true);
      expect(run.w).toBeGreaterThan(0);
    }
  });

  it("rounds corners, clears cells, outlines silhouettes and recolours", () => {
    const canvas = new PixelCanvas(10, 10).round(2, 2, 6, 6, "#aaaaaa", 2);
    expect(canvas.get(2, 2)).toBeNull();
    expect(canvas.get(3, 2)).toBeNull();
    expect(canvas.get(4, 2)).toBe("#aaaaaa");
    expect(canvas.get(2, 4)).toBe("#aaaaaa");
    canvas.outline("#000000");
    expect(canvas.get(4, 1)).toBe("#000000");
    expect(canvas.get(0, 0)).toBeNull();
    canvas.clear(4, 1).mapColors(color => (color === "#aaaaaa" ? "#bbbbbb" : color));
    expect(canvas.get(4, 1)).toBeNull();
    expect(canvas.get(4, 4)).toBe("#bbbbbb");
    expect(canvas.get(-1, -1)).toBeNull();
    expect(canvas.isMouth(-1, 0)).toBe(false);
  });

  it("stamps flashcard rows and rejects unknown palette keys", () => {
    const canvas = new PixelCanvas(4, 2).stamp(0, 0, ["a.b", " a"], { a: "#111111", b: "#222222" });
    expect([canvas.get(0, 0), canvas.get(1, 0), canvas.get(2, 0), canvas.get(1, 1)]).toEqual(["#111111", null, "#222222", "#111111"]);
    expect(() => canvas.stamp(0, 0, ["z"], {})).toThrow('Unknown palette key "z"');
  });

  it("tracks the mouth layer separately and recovers after a drawing error", () => {
    const canvas = new PixelCanvas(4, 4);
    canvas.mouth(() => { canvas.px(1, 1, "#ff0000"); }).px(2, 2, "#00ff00");
    expect(canvas.isMouth(1, 1)).toBe(true);
    expect(canvas.isMouth(2, 2)).toBe(false);
    expect(() => canvas.mouth(() => { throw new Error("boom"); })).toThrow("boom");
    canvas.px(3, 3, "#0000ff");
    expect(canvas.isMouth(3, 3)).toBe(false);
    const snapshot = canvas.snapshot();
    expect(toPaths(snapshot, true)).toHaveLength(1);
    expect(toPaths(snapshot, false).map(path => path.color).sort()).toEqual(["#0000ff", "#00ff00"]);
  });

  it("detects which display sizes give even pixels", () => {
    expect(evenScale(48)).toBe(true);
    expect(evenScale(96)).toBe(true);
    expect(evenScale(144)).toBe(true);
    expect(evenScale(64)).toBe(false);
    expect(evenScale(32)).toBe(false);
    expect(evenScale(32, 3)).toBe(true);
    expect(evenScale(24)).toBe(false);
  });

  it("makes equal-channel greys", () => {
    expect(toGrey("#ffffff")).toBe("#ffffff");
    expect(toGrey("#000000")).toBe("#000000");
    const grey = toGrey("#c8323a");
    expect(grey.slice(1, 3)).toBe(grey.slice(3, 5));
    expect(grey.slice(3, 5)).toBe(grey.slice(5, 7));
  });
});

describe("mascot and remaster sprites", () => {
  const characters = [...Object.values(mascots), ...Object.values(remasters)];

  it.each(characters.map(character => [character.id, character] as const))("%s draws every reaction frame with a mouth layer", (_, character) => {
    for (const theme of themeIds) for (const accessories of [true, false]) for (const reaction of reactions) {
      const frames = character.frames[reaction];
      expect(frames).toBeGreaterThanOrEqual(2);
      expect(frames).toBeLessThanOrEqual(4);
      const seen = new Set<string>();
      for (let frame = 0; frame < frames; frame++) {
        const canvas = new PixelCanvas();
        character.draw(canvas, { theme, reaction, frame, accessories });
        const snapshot = canvas.snapshot();
        expect(snapshot.mouthRows.flat().some(Boolean)).toBe(true);
        expect(colorCount(snapshot)).toBeGreaterThan(5);
        seen.add(JSON.stringify(snapshot.rows));
      }
      expect(seen.size).toBe(frames);
    }
  });

  it("gives each theme's mascot a distinct accessory and a monochrome noir variant", () => {
    for (const mascot of Object.values(mascots)) {
      const looks = themeIds.map(theme => {
        const canvas = new PixelCanvas();
        mascot.draw(canvas, { theme, reaction: "idle", frame: 0, accessories: true });
        return canvas.snapshot();
      });
      expect(new Set(looks.map(look => JSON.stringify(look.rows))).size).toBe(4);
      const noir = looks[themeIds.indexOf("detective")];
      for (const color of noir.rows.flat().filter(Boolean)) expect(color.slice(1, 3) === color.slice(3, 5) && color.slice(3, 5) === color.slice(5, 7)).toBe(true);
      const plain = new PixelCanvas();
      mascot.draw(plain, { theme: "courtroom", reaction: "idle", frame: 0, accessories: false });
      expect(JSON.stringify(plain.snapshot().rows)).not.toBe(JSON.stringify(looks[themeIds.indexOf("courtroom")].rows));
    }
  });

  it("keeps the noir remasters monochrome", () => {
    for (const remaster of Object.values(remasters).filter(item => item.theme === "detective")) {
      const snapshot = renderPixelAsset(getPixelAsset(remaster.id), "talk");
      for (const color of snapshot.rows.flat().filter(Boolean)) expect(color.slice(1, 3) === color.slice(3, 5) && color.slice(3, 5) === color.slice(5, 7)).toBe(true);
    }
  });
});

describe("pixel roster", () => {
  it("registers every mascot per theme and one remaster for each original lawyer", () => {
    expect(pixelAssetIds).toHaveLength(themeIds.length * Object.keys(mascots).length + 8);
    for (const theme of themeIds) for (const slot of ["A", "B"] as const) {
      const art = lawyerArtFor(theme, slot);
      expect(art.classic).toBe(`${theme}-lawyer-${slot.toLowerCase()}`);
      expect(isPixelAssetId(art.remaster)).toBe(true);
      expect(art.mascot).toBe(mascotAssetId(mascotLawyers[slot], theme));
      expect(getPixelAsset(art.mascot).accessories).toBe(MASCOT_ACCESSORIES);
    }
  });

  it("falls back safely for unknown or prototype IDs", () => {
    expect(isPixelAssetId("__proto__")).toBe(false);
    expect(getPixelAsset("__proto__").assetId).toBe(fallbackPixelAssetId);
  });

  it("wraps frame numbers and caches rendered frames", () => {
    const asset = getPixelAsset(fallbackPixelAssetId);
    expect(renderPixelAsset(asset, "talk", 2)).toBe(renderPixelAsset(asset, "talk", 0));
    expect(renderPixelAsset(asset, "talk", -1)).toBe(renderPixelAsset(asset, "talk", 1));
    expect(renderPixelAsset(asset, "talk", 0, false)).not.toBe(renderPixelAsset(asset, "talk", 0, true));
  });

  it("resolves the viewer's lawyer art choice without touching non-lawyer assets", () => {
    expect(lawyerArtStyles.every(isLawyerArtStyle)).toBe(true);
    expect(isLawyerArtStyle("pixel")).toBe(false);
    expect(isLawyerArtStyle(3)).toBe(false);
    const label = "Emery, an original silver-haired lawyer";
    expect(resolveLawyerArt("courtroom-lawyer-a", label, "theme")).toEqual({ assetId: "courtroom-lawyer-a", label });
    expect(resolveLawyerArt("courtroom-lawyer-a", label, "classic")).toEqual({ assetId: "courtroom-lawyer-a", label });
    expect(resolveLawyerArt("courtroom-rowan", "Judge Rowan", "mascot")).toEqual({ assetId: "courtroom-rowan", label: "Judge Rowan" });
    const remaster = resolveLawyerArt("courtroom-lawyer-a", label, "remaster");
    expect(remaster.assetId).toBe("remaster-courtroom-lawyer-a");
    expect(remaster.label).toMatch(/^Emery, drawn as a pixel lawyer/);
    const mascot = resolveLawyerArt("remaster-courtroom-lawyer-b", "Sage, x", "mascot");
    expect(mascot.assetId).toBe(mascotAssetId(mascotLawyers.B, "courtroom"));
    const back = resolveLawyerArt(mascotAssetId(mascotLawyers.A, "jungle"), "Tavi, a robot", "classic");
    expect(back).toEqual({ assetId: "jungle-lawyer-a", label: "Tavi, drawn as an original toucan lawyer with a golden beak, green jacket and case notes" });
    expect(resolveLawyerArt("jungle-lawyer-a", "", "remaster").label).toBe(remasters["remaster-jungle-lawyer-a"].description);
  });
});

describe("PixelSprite", () => {
  it("matches the existing sprite contract used by the arena animations", () => {
    render(<PixelSprite assetId={mascotAssetId("raccoon", "courtroom")} label="Sage, a raccoon" className="art" reaction="talk" frame={1}/>);
    const image = screen.getByRole("img", { name: "Sage, a raccoon" });
    expect(image).toHaveAttribute("viewBox", "0 0 96 112");
    expect(image).toHaveAttribute("shape-rendering", "crispEdges");
    expect(image).toHaveAttribute("data-character-asset", "mascot-raccoon-courtroom");
    expect(image).toHaveAttribute("data-pixel-art", "mascot");
    expect(image).toHaveClass("art");
    expect(image.querySelector(".sprite-body > g")).toHaveAttribute("transform", "scale(2)");
    expect(image.querySelector(".sprite-mouth path")).toBeInTheDocument();
    expect(image.querySelectorAll("path").length).toBeGreaterThan(10);
    for (const path of image.querySelectorAll("path")) expect(path.getAttribute("d")).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
  });

  it("renders an unknown asset with the fallback art", () => {
    render(<PixelSprite assetId="nope" label="Fallback"/>);
    expect(screen.getByRole("img", { name: "Fallback" })).toHaveAttribute("data-character-asset", fallbackPixelAssetId);
  });
});

describe("Pixel Lab page", () => {
  it("renders lineups, flashcards, size checks and the audit, and responds to its controls", () => {
    vi.useFakeTimers();
    try {
      render(<PixelLab/>);
      expect(screen.getByRole("heading", { name: "Pixel Lab" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Courtroom lawyer lineup" })).toBeInTheDocument();
      expect(screen.getAllByText("Even pixels").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Uneven pixels").length).toBeGreaterThan(0);
      expect(screen.getAllByRole("row")).toHaveLength(pixelAssetIds.length + 1);
      fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "jungle" } });
      expect(screen.getByRole("heading", { name: "Jungle lawyer lineup" })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Reaction"), { target: { value: "cheer" } });
      fireEvent.click(screen.getByLabelText("Swap lawyer A and B (preview only)"));
      fireEvent.click(screen.getByLabelText("Theme accessories"));
      fireEvent.click(screen.getByLabelText("Dark backdrop"));
      fireEvent.click(screen.getByLabelText("Play frames"));
      act(() => { vi.advanceTimersByTime(900); });
      fireEvent.click(screen.getByLabelText("Play frames"));
      fireEvent(window, new Event("resize"));
      expect(screen.getAllByRole("img").length).toBeGreaterThan(20);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("lawyer artwork preference", () => {
  function showLawyer(lawyerArt: string | null) {
    window.localStorage.clear();
    if (lawyerArt) window.localStorage.setItem(displayPreferencesKey, JSON.stringify({ lawyerArt }));
    return render(<DisplayPreferencesProvider>
      <CharacterAsset assetId="courtroom-lawyer-a" label="Emery, an original lawyer"/>
      <CharacterAsset assetId="courtroom-rowan" label="Judge Rowan"/>
    </DisplayPreferencesProvider>);
  }

  it.each([
    [null, "courtroom-lawyer-a", "Emery, an original lawyer"],
    ["classic", "courtroom-lawyer-a", "Emery, an original lawyer"],
    ["remaster", "remaster-courtroom-lawyer-a", /^Emery, drawn as a pixel lawyer/],
    ["mascot", "mascot-pi-courtroom", /^Emery, drawn as a boxy two-tone robot/],
    ["not-a-style", "courtroom-lawyer-a", "Emery, an original lawyer"],
  ] as const)("with %s shows %s and leaves the judge unchanged", (style, assetId, name) => {
    showLawyer(style);
    expect(screen.getByRole("img", { name })).toHaveAttribute("data-character-asset", assetId);
    expect(screen.getByRole("img", { name: "Judge Rowan" })).toHaveAttribute("data-character-asset", "courtroom-rowan");
  });

  it("uses the configured art outside the preferences provider", () => {
    render(<CharacterAsset assetId={mascotAssetId("raccoon", "jungle")} label="Fern, a raccoon"/>);
    expect(screen.getByRole("img", { name: "Fern, a raccoon" })).toHaveAttribute("data-pixel-art", "mascot");
  });
});
