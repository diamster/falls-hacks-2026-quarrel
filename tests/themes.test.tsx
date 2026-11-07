import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getTheme, isThemeId, neutralityPolicy, resolvePlayerCharacter, themes } from "@/themes";
import { DebateArena } from "@/components/debate-arena";
import { JudgeCharacter, PixelCharacter } from "@/components/pixel-character";
import { getGameMode, playableModes } from "@/lib/game-modes";

describe("Stage 2.5 theme registry", () => {
  it("provides exactly the four supported settings with unique stable IDs", () => {
    expect(themes.map(theme => theme.id)).toEqual(["jungle", "superhero", "detective", "courtroom"]);
    for (const theme of themes) {
      expect(isThemeId(theme.id)).toBe(true);
      expect(getTheme(theme.id)).toBe(theme);
      expect(theme.displayName).not.toBe("");
    }
    expect(getTheme()).toBe(getTheme("courtroom"));
  });

  it.each([undefined, null, "", "future-theme", "JUNGLE", "__proto__", "constructor", "toString", 4, {}, []])(
    "falls back safely for unrecognized theme value %j",
    value => {
      expect(isThemeId(value)).toBe(false);
      expect(getTheme(value)).toBe(getTheme("courtroom"));
    },
  );

  it("keeps personality wording separate from one immutable fairness policy", () => {
    expect(Object.isFrozen(neutralityPolicy)).toBe(true);
    expect(Object.isFrozen(neutralityPolicy.requirements)).toBe(true);
    for (const theme of themes) {
      expect(theme.judge.neutralityPolicy).toBe(neutralityPolicy);
      expect(theme.judge.personality).not.toBe("");
      expect(theme.judge.dialogueStyle).not.toBe("");
      expect(theme.animations.objection.implemented).toBe(false);
      expect(theme.animations.verdict.implemented).toBe(false);
    }
    expect(neutralityPolicy.requirements.join(" ")).toMatch(/cannot override evaluation rules or determine a winner/);
    expect(new Set(themes.map(theme => theme.judge.personality)).size).toBe(4);
    expect(new Set(themes.map(theme => theme.judge.dialogueStyle)).size).toBe(4);
  });

  it.each(themes)("keeps $displayName player assets distinct from its judge and resolves future selections safely", theme => {
    const a = resolvePlayerCharacter(theme, "A");
    const b = resolvePlayerCharacter(theme, "B");
    expect(a.id).toBe(theme.players.defaults.A);
    expect(b.id).toBe(theme.players.defaults.B);
    expect(a.id).not.toBe(b.id);
    expect(Object.keys(theme.players.characters)).toHaveLength(2);
    expect(Object.values(theme.players.characters).some(player => player.assetId === theme.judge.assetId)).toBe(false);
    // The renderer already accepts a stable asset choice; no selection UI or
    // multiplayer customization mutation is introduced by this foundation.
    expect(resolvePlayerCharacter(theme, "A", b.id)).toBe(b);
    for (const invalid of [null, "", "missing", "__proto__", "constructor", theme.judge.id]) {
      expect(resolvePlayerCharacter(theme, "A", invalid)).toBe(a);
      expect(resolvePlayerCharacter(theme, "B", invalid)).toBe(b);
    }
    const otherTheme = themes.find(other => other.id !== theme.id)!;
    expect(resolvePlayerCharacter(theme, "A", otherTheme.players.defaults.A)).toBe(a);
  });

  it("defines distinct environments, palettes, speech treatments and local judge samples", () => {
    expect(new Set(themes.map(theme => theme.assets.background)).size).toBe(4);
    expect(new Set(themes.map(theme => theme.palette.canvas)).size).toBe(4);
    expect(new Set(themes.map(theme => theme.ui.speechBubble)).size).toBe(4);
    for (const theme of themes) {
      expect(theme.judge.samples.length).toBeGreaterThan(0);
      expect(new Set(theme.judge.samples.map(sample => sample.id)).size).toBe(theme.judge.samples.length);
      expect(theme.judge.samples.every(sample => sample.label && sample.text)).toBe(true);
    }
    const sampleLines = themes.flatMap(theme => theme.judge.samples.map(sample => sample.text));
    expect(new Set(sampleLines).size).toBe(sampleLines.length);
  });

  it.each(themes)("keeps $displayName primary text readable on each configured UI surface", theme => {
    function luminance(hex: string) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
      const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }
    const text = luminance(theme.palette.ink);
    for (const surface of ["canvas", "paper", "panel", "header"] as const) {
      const background = luminance(theme.palette[surface]);
      const ratio = (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
      expect(ratio, `${theme.displayName} ink against ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("Stage 2.5 character and arena rendering", () => {
  it.each(themes)("renders $displayName with its own environment, judge and two default players", theme => {
    render(<DebateArena theme={theme} players={{ A: { name: "Player One" }, B: { name: "Player Two" } }} dialogue={theme.judge.dialogue.lobby} dialogueKey="lobby" paused={false} roomCode="ABC234"/>);
    const arena = screen.getByRole("region", { name: theme.environmentLabel });
    expect(arena).toHaveAttribute("data-theme", theme.id);
    expect(within(arena).getAllByRole("img")).toHaveLength(3);
    expect(within(arena).getByRole("img", { name: theme.judge.description })).toBeInTheDocument();
    expect(within(arena).getByText("Player One")).toBeInTheDocument();
    expect(within(arena).getByText("Player Two")).toBeInTheDocument();
    const bubble = within(arena).getByRole("status");
    expect(bubble).toHaveTextContent(theme.judge.dialogue.lobby);
    expect(bubble).toHaveAttribute("data-bubble", theme.ui.speechBubble);
    expect(bubble).toHaveAttribute("aria-live", "polite");
    expect(within(arena).getByLabelText("Waiting room: debate not started")).toHaveTextContent("LOBBY");
    expect(arena.querySelector('[data-character-id]')).toHaveAttribute("data-character-id", theme.players.defaults.A);
    expect(arena.querySelector('[data-judge-id]')).toHaveAttribute("data-judge-id", theme.judge.id);
    expect(arena.querySelectorAll("svg title").length).toBe(3);
    const ids = [...arena.querySelectorAll("[id]")].map(element => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses a stable selected character ID independently of the player's display name or seat", () => {
    const theme = getTheme("superhero");
    const selected = theme.players.characters[theme.players.defaults.B];
    const view = render(<PixelCharacter theme={theme} slot="A" characterId={selected.id} displayName="Guest" state="speaking"/>);
    expect(screen.getByRole("img", { name: selected.description })).toBeInTheDocument();
    expect(view.container.firstChild).toHaveAttribute("data-character-id", selected.id);
    expect(view.container.firstChild).toHaveAttribute("data-motion", "speaking");
    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(screen.getByText("Player A")).toBeInTheDocument();
    view.rerender(<PixelCharacter theme={theme} slot="A" characterId="nonexistent" state="thinking" paused/>);
    expect(view.container.firstChild).toHaveAttribute("data-character-id", theme.players.defaults.A);
    expect(view.container.firstChild).toHaveAttribute("data-state", "thinking");
    expect(view.container.firstChild).toHaveAttribute("data-motion", "idle");
    expect(view.container.firstChild).toHaveAttribute("data-paused", "true");
    expect(screen.getByText(/placeholder using idle pose/)).toBeInTheDocument();
  });

  it("keeps judge assets separate and renders placeholder states without evaluation behavior", () => {
    const theme = getTheme("courtroom");
    const view = render(<JudgeCharacter theme={theme}/>);
    expect(screen.getByRole("img", { name: theme.judge.description })).toBeInTheDocument();
    expect(view.container.firstChild).toHaveAttribute("data-judge-id", theme.judge.id);
    expect(view.container.querySelector("[data-character-id]")).toBeNull();
    expect(view.container.firstChild).toHaveAttribute("data-motion", "idle");
    view.rerender(<JudgeCharacter theme={theme} state="questioning" paused/>);
    expect(view.container.firstChild).toHaveAttribute("data-state", "questioning");
    expect(view.container.firstChild).toHaveAttribute("data-motion", "idle");
    expect(view.container.firstChild).toHaveAttribute("data-paused", "true");
    expect(screen.getByText(/placeholder using idle pose/)).toBeInTheDocument();
  });

  it("retains two seats as the only playable mode even for future or invalid mode inputs", () => {
    expect(Object.keys(playableModes)).toEqual(["solo"]);
    for (const value of [undefined, "solo", "teams", "invalid", null, "__proto__"]) {
      expect(getGameMode(value)).toEqual({ id: "solo", maxPlayers: 2, slots: ["A", "B"] });
    }
  });
});
