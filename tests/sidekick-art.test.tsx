import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { themes, neutralityPolicy } from "@/themes";
import { CharacterAsset } from "@/themes/assets";
import { SidekickSprite, sidekickAssetIds } from "@/themes/art/sidekicks";

describe("Stage 5 original lawyer and jury artwork", () => {
  it("registers exactly two lawyers and one jury asset per theme with stable, distinct IDs", () => {
    const configured = themes.flatMap(theme => [theme.lawyers.A, theme.lawyers.B, theme.jury]);
    expect(configured).toHaveLength(12);
    expect(new Set(configured.map(character => character.id)).size).toBe(12);
    expect(new Set(configured.map(character => character.assetId)).size).toBe(12);
    expect(configured.map(character => character.assetId).sort()).toEqual([...sidekickAssetIds].sort());
    for (const character of configured) {
      expect(character.displayName).not.toBe("");
      expect(character.description).not.toBe("");
      expect(character.personality).not.toBe("");
      expect(character.dialogueStyle).not.toBe("");
    }
  });

  it.each(themes)("keeps $displayName's players, judge, lawyers and jury as distinct roles", theme => {
    const existing = [theme.judge.assetId, ...Object.values(theme.players.characters).map(character => character.assetId)];
    for (const character of [theme.lawyers.A, theme.lawyers.B, theme.jury]) expect(existing).not.toContain(character.assetId);
    expect(theme.jury.neutralityPolicy).toBe(neutralityPolicy);
    expect(theme.players.characters).toHaveProperty(theme.players.defaults.A);
    expect(theme.players.characters).toHaveProperty(theme.players.defaults.B);
    expect(Object.keys(theme.players.characters)).toHaveLength(2);
  });

  it.each(themes)("renders $displayName's original sidekicks through the shared accessible asset registry", theme => {
    const cast = [theme.lawyers.A, theme.lawyers.B, theme.jury];
    const view = render(<div>{cast.map(character => <CharacterAsset key={character.id} assetId={character.assetId} label={character.description} className="test-role-art"/>)}</div>);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    for (const character of cast) {
      const image = screen.getByRole("img", { name: character.description });
      expect(image).toHaveAttribute("data-character-asset", character.assetId);
      expect(image).toHaveAttribute("shape-rendering", "crispEdges");
      expect(image).toHaveClass("test-role-art");
      expect(image).toHaveAttribute("viewBox", character === theme.jury ? "0 0 192 112" : "0 0 96 112");
      expect(image.querySelectorAll("path").length).toBeGreaterThan(10);
      expect(image.querySelector(".sprite-body > g")).toHaveAttribute("transform", "scale(2)");
      expect(image.querySelector(".sprite-mouth")).toBeInTheDocument();
    }
    const ids = [...view.container.querySelectorAll("title")].map(title => title.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("keeps the noir sidekicks entirely monochrome", () => {
    const theme = themes.find(theme => theme.id === "detective")!;
    const view = render(<>{[theme.lawyers.A, theme.lawyers.B, theme.jury].map(character => <CharacterAsset key={character.id} assetId={character.assetId} label={character.description}/>)}</>);
    for (const element of view.container.querySelectorAll("[fill]")) {
      const fill = element.getAttribute("fill")!;
      if (fill === "none") continue;
      expect(fill).toMatch(/^#[\da-f]{6}$/i);
      expect(fill.slice(1, 3)).toBe(fill.slice(3, 5));
      expect(fill.slice(3, 5)).toBe(fill.slice(5, 7));
    }
  });

  it("has a safe local asset fallback for an invalid internal sidekick identifier", () => {
    render(<SidekickSprite assetId="__proto__" label="Unavailable lawyer art"/>);
    expect(screen.getByRole("img", { name: "Unavailable lawyer art" })).toHaveAttribute("viewBox", "0 0 96 112");
    expect(document.querySelectorAll("svg path").length).toBeGreaterThan(10);
  });
});
