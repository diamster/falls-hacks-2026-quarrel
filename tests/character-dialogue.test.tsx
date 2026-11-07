import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QuarrelApp } from "@/components/quarrel-app";

const animals = [
  { species: "Lion", name: "Leo", initialState: "idle" },
  { species: "Zebra", name: "Zuri", initialState: "idle" },
  { species: "Lemur", name: "Judge Moki", initialState: "speaking" },
] as const;

const states = [
  "idle", "speaking", "listening", "thinking", "questioning",
  "surprised", "objection", "verdict",
] as const;

function courtroom() {
  return screen.getByRole("region", { name: "Tropical pixel-art courtroom" });
}

function booth() {
  return screen.getByRole("complementary", { name: "Director’s booth" });
}

function character(name: string) {
  const sprite = within(courtroom()).getByRole("img", {
    name: new RegExp(`^${name},`),
  });
  const wrapper = sprite.closest<HTMLElement>("[data-state]");
  if (!wrapper) throw new Error(`Missing character state wrapper for ${name}`);
  return wrapper;
}

function picker(species: string) {
  return within(booth()).getByRole("button", {
    name: new RegExp(`${species}$`),
  });
}

function stateSelect() {
  return screen.getByRole("combobox", { name: "02 Character state" });
}

function dialogueSelect() {
  return screen.getByRole("combobox", { name: "03 Give Moki a line" });
}

function speech() {
  return within(courtroom()).getByRole("status");
}

describe("Stage 1 character previews", () => {
  it.each(animals)(
    "previews all eight $species states without changing the other characters or the debate",
    async (animal) => {
      const user = userEvent.setup();
      render(<QuarrelApp />);

      expect(within(courtroom()).getAllByRole("img")).toHaveLength(3);
      await user.click(picker(animal.species));
      expect(picker(animal.species)).toHaveAttribute("aria-pressed", "true");

      for (const state of states) {
        await user.selectOptions(stateSelect(), state);
        const animated = state === "idle" || state === "speaking";
        expect(stateSelect()).toHaveValue(state);
        expect(character(animal.name)).toHaveAttribute("data-state", state);
        // This checks the animation-selection contract, not rendered CSS frames.
        expect(character(animal.name)).toHaveAttribute("data-motion", animated ? state : "idle");
        expect(within(booth()).getByRole("status")).toHaveTextContent(
          `${animal.name} · ${state} ${animated ? "animation" : "placeholder · idle pose"}`,
        );

        for (const other of animals.filter((candidate) => candidate !== animal)) {
          expect(character(other.name)).toHaveAttribute("data-state", other.initialState);
        }
      }

      expect(within(screen.getByRole("list", { name: "Local debate history" })).getAllByRole("listitem"))
        .toHaveLength(2);
      expect(screen.getByLabelText("Turn timer placeholder: one minute")).toHaveTextContent("01:00");
      expect(screen.getByRole("region", { name: "Demo debate topic" }))
        .toHaveTextContent(/ROUND\s*01\s*\/\s*03/);
    },
  );

  it("retains each character’s chosen state when moving between preview controls", async () => {
    const user = userEvent.setup();
    render(<QuarrelApp />);

    for (const [species, state] of [
      ["Lion", "thinking"], ["Zebra", "speaking"], ["Lemur", "questioning"],
    ] as const) {
      await user.click(picker(species));
      await user.selectOptions(stateSelect(), state);
    }

    for (const [species, state] of [
      ["Lion", "thinking"], ["Zebra", "speaking"], ["Lemur", "questioning"],
    ] as const) {
      await user.click(picker(species));
      expect(stateSelect()).toHaveValue(state);
      expect(picker(species)).toHaveAttribute("aria-pressed", "true");
      for (const other of animals.filter((animal) => animal.species !== species)) {
        expect(picker(other.species)).toHaveAttribute("aria-pressed", "false");
      }
    }
  });
});

describe("Stage 1 judge dialogue", () => {
  it("shows each named sample in the live speech bubble", async () => {
    const user = userEvent.setup();
    render(<QuarrelApp />);

    const samples = [
      ["Welcome to court", "Order in the jungle! Big opinions welcome."],
      ["A little encouragement", "An interesting point! A strong argument needs more than a very confident roar."],
      ["A question for both sides", "Let’s peel this back. What’s one thing the other side might be right about?"],
      ["Objection preview", "Objection heard! Take a breath, hold the bananas,"],
    ] as const;

    for (const [index, [label, text]] of samples.entries()) {
      await user.selectOptions(dialogueSelect(), within(dialogueSelect()).getByRole("option", { name: label }));
      expect(speech()).toHaveTextContent(text);
      expect(speech()).toHaveAttribute("aria-live", "polite");
      expect(within(booth()).getByText(`SAMPLE ${index + 1} / 4`)).toBeInTheDocument();
    }
  });

  it("wraps backward from the first dialogue and forward from the last", async () => {
    const user = userEvent.setup();
    render(<QuarrelApp />);

    await user.click(screen.getByRole("button", { name: "Previous judge dialogue" }));
    expect(dialogueSelect()).toHaveValue("3");
    expect(speech()).toHaveTextContent("Objection heard!");

    await user.click(screen.getByRole("button", { name: "Next judge dialogue" }));
    expect(dialogueSelect()).toHaveValue("0");
    expect(speech()).toHaveTextContent("Order in the jungle!");

    await user.click(screen.getByRole("button", { name: "Next judge dialogue" }));
    expect(dialogueSelect()).toHaveValue("1");
    expect(speech()).toHaveTextContent("An interesting point!");
  });

  it("makes only the judge speak when a sample is changed", async () => {
    const user = userEvent.setup();
    render(<QuarrelApp />);

    await user.click(picker("Lion"));
    await user.selectOptions(stateSelect(), "thinking");
    await user.click(picker("Zebra"));
    await user.selectOptions(stateSelect(), "speaking");
    await user.click(picker("Lemur"));
    await user.selectOptions(stateSelect(), "verdict");

    await user.selectOptions(dialogueSelect(), "2");

    expect(character("Judge Moki")).toHaveAttribute("data-state", "speaking");
    expect(character("Leo")).toHaveAttribute("data-state", "thinking");
    expect(character("Zuri")).toHaveAttribute("data-state", "speaking");
    expect(stateSelect()).toHaveValue("speaking");
    expect(speech()).toHaveTextContent("What’s one thing the other side might be right about?");
  });

  it("updates dialogue while paused without resuming any character", async () => {
    const user = userEvent.setup();
    render(<QuarrelApp />);

    await user.click(screen.getByRole("button", { name: "Pause motion" }));
    await user.selectOptions(dialogueSelect(), "1");

    expect(screen.getByRole("button", { name: "Resume motion" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(courtroom()).toHaveAttribute("data-paused", "true");
    expect(speech()).toHaveAttribute("data-paused", "true");
    expect(speech()).toHaveTextContent("An interesting point!");
    for (const animal of animals) {
      expect(character(animal.name)).toHaveAttribute("data-paused", "true");
    }

    await user.click(screen.getByRole("button", { name: "Resume motion" }));
    expect(screen.getByRole("button", { name: "Pause motion" }))
      .toHaveAttribute("aria-pressed", "false");
    expect(courtroom()).toHaveAttribute("data-paused", "false");
    expect(speech()).toHaveTextContent("An interesting point!");
    for (const animal of animals) {
      expect(character(animal.name)).toHaveAttribute("data-paused", "false");
    }
  });
});
