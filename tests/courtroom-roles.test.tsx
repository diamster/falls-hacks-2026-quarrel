import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DebateArena } from "@/components/debate-arena";
import { getTheme } from "@/themes";

const props = { players: { A: { name: "Avery" }, B: { name: "Blair" } }, dialogue: "Both sides are welcome.", dialogueKey: "intro", paused: false };

describe("Shared courtroom role positions", () => {
  it.each(["courtroom", "jungle", "superhero", "detective"])("keeps %s identities with players on stands and lawyers in the arena", id => {
    const theme = getTheme(id);
    const { container } = render(<DebateArena {...props} theme={theme} counsel={{ A: "speaking", B: "listening" }} judgeState="listening"/>);
    expect(container.querySelector('[data-role-layout="lawyer-led"]')).toBeInTheDocument();
    expect(within(screen.getByLabelText("Player A witness stand")).getByText("Avery")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Player B witness stand")).getByText("Blair")).toBeInTheDocument();
    for (const slot of ["A", "B"] as const) {
      const lawyer = screen.getByLabelText(`${theme.lawyers[slot].displayName}, Player ${slot}’s lawyer`);
      expect(lawyer).toHaveAttribute("data-role", "lawyer");
      expect(lawyer).toHaveAttribute("data-slot", slot);
      expect(within(lawyer).getByText(theme.lawyers[slot].displayName)).toBeInTheDocument();
    }
    expect(container.querySelectorAll('[data-speaking="true"]')).toHaveLength(1);
    expect(container.querySelector('[data-judge-id]')).toHaveAttribute("data-judge-id", theme.judge.id);
    expect(container.querySelectorAll('[data-character-id]')).toHaveLength(2);
  });
  it("returns lawyers to listening and respects the existing pause state", () => {
    const theme = getTheme("courtroom");
    const view = render(<DebateArena {...props} theme={theme} counsel={{ A: "speaking", B: "thinking" }}/>);
    view.rerender(<DebateArena {...props} theme={theme} counsel={{ A: "listening", B: "idle" }} paused/>);
    expect(view.container.querySelectorAll('[data-speaking="true"]')).toHaveLength(0);
    expect(view.container.querySelector('[data-role="lawyer"][data-slot="A"]')).toHaveAttribute("data-state", "listening");
    expect(view.container.querySelector('[data-role="lawyer"][data-slot="B"]')).toHaveAttribute("data-paused", "true");
  });
  it("leaves legacy callers without counsel unchanged", () => {
    const { container } = render(<DebateArena {...props} theme={getTheme("jungle")}/>);
    expect(container.querySelector('[data-role-layout]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-role="lawyer"]')).not.toBeInTheDocument();
    expect(screen.getByText("Avery")).toBeInTheDocument();
    expect(screen.getByText("Blair")).toBeInTheDocument();
  });
});
