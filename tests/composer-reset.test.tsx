import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Page from "@/app/page";

function setup() {
  const user = userEvent.setup();
  const view = render(<Page />);
  const input = screen.getByRole("textbox", { name: "Your practice argument" });
  const submit = screen.getByRole("button", { name: "Submit" });
  const history = screen.getByRole("list", { name: "Local debate history" });
  return { user, input, submit, history, ...view };
}

describe("Stage 1 page and practice arguments", () => {
  it("renders the real page with three named characters and labelled demo controls", () => {
    setup();
    const court = within(screen.getByRole("region", { name: "Tropical pixel-art courtroom" }));
    expect(court.getAllByRole("img")).toHaveLength(3);
    expect(court.getByRole("img", { name: /Leo, a confident golden lion/ })).toBeInTheDocument();
    expect(court.getByRole("img", { name: /Zuri, an energetic zebra/ })).toBeInTheDocument();
    expect(court.getByRole("img", { name: /Judge Moki, a ring-tailed lemur/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Does pineapple belong on pizza?");
    expect(screen.getByLabelText("Turn timer placeholder: one minute")).toHaveTextContent("01:00");
    expect(screen.getByRole("combobox", { name: /Character state/ })).toHaveValue("speaking");
    expect(screen.getByRole("link", { name: "Skip to courtroom" })).toHaveAttribute("href", "#courtroom-content");
    // Each repeated sprite has its own SVG title; labels must never collide.
    const ids = [...document.querySelectorAll("[id]")].map(element => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects empty and whitespace-only input, including a direct form submission", async () => {
    const { user, input, submit, history } = setup();
    expect(submit).toBeDisabled();
    await user.type(input, "   {Enter}  ");
    expect(submit).toBeDisabled();
    fireEvent.submit(input.closest("form")!);
    expect(within(history).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Opening arguments", { exact: false })).toHaveTextContent("demo");
  });

  it("adds a trimmed local argument, preserves the samples, and clears the draft", async () => {
    const { user, input, submit, history } = setup();
    await user.type(input, "  A contrasting flavour can improve a slice.  ");
    expect(submit).toBeEnabled();
    await user.click(submit);
    const entries = within(history).getAllByRole("listitem");
    expect(entries).toHaveLength(3);
    expect(entries[0]).toHaveTextContent("Sweet and salty is a winning team.");
    expect(entries[1]).toHaveTextContent("Fruit has its place.");
    expect(within(entries[2]).getByText("A contrasting flavour can improve a slice.")).toBeInTheDocument();
    expect(entries[2]).toHaveTextContent("Leo");
    expect(entries[2]).toHaveTextContent("Local preview");
    expect(input).toHaveValue("");
    expect(submit).toBeDisabled();
    expect(screen.getByText("0/500")).toBeInTheDocument();
    expect(screen.getByText(/No AI response or score is generated/)).toBeInTheDocument();
    expect(screen.getByLabelText("Turn timer placeholder: one minute")).toHaveTextContent("01:00");
  });

  it("keeps repeated submissions as distinct ordered transcript entries", async () => {
    const { user, input, submit, history } = setup();
    for (const text of ["First point.", "Second point.", "First point."]) {
      await user.type(input, text);
      await user.click(submit);
    }
    const entries = within(history).getAllByRole("listitem");
    expect(entries).toHaveLength(5);
    expect(entries.slice(2).map(entry => entry.querySelector("p")?.textContent)).toEqual([
      "First point.", "Second point.", "First point.",
    ]);
  });

  it("limits pasted and programmatically changed input to 500 characters", async () => {
    const { user, input, submit, history } = setup();
    await user.click(input);
    await user.paste("p".repeat(540));
    expect(input).toHaveValue("p".repeat(500));
    // Native maxlength alone does not protect every input-event source.
    fireEvent.change(input, { target: { value: "q".repeat(540) } });
    expect(input).toHaveValue("q".repeat(500));
    expect(screen.getByText("500/500")).toBeInTheDocument();
    await user.click(submit);
    expect(within(history).getAllByRole("listitem")[2].querySelector("p")?.textContent).toBe("q".repeat(500));
  });

  it("renders user markup as plain transcript text", async () => {
    const { user, input, submit, history } = setup();
    const text = '<img src="x" onerror="alert(1)"><script>alert(2)</script>';
    await user.click(input);
    await user.paste(text);
    await user.click(submit);
    const entry = within(history).getAllByRole("listitem")[2];
    expect(entry.querySelector("p")?.textContent).toBe(text);
    expect(entry.querySelector("img, script, iframe")).toBeNull();
  });

  it("shows only a sample objection without adding a ruling, score or turn", async () => {
    const { user, input, history } = setup();
    await user.type(input, "Unsubmitted draft");
    await user.click(screen.getByRole("button", { name: /Objection!/ }));
    expect(screen.getByText(/Objection heard! Take a breath/)).toBeInTheDocument();
    expect(screen.getByText(/Leo: objection, placeholder using idle pose/)).toBeInTheDocument();
    expect(screen.getByText(/no debate decision was made/)).toBeInTheDocument();
    expect(input).toHaveValue("Unsubmitted draft");
    expect(within(history).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByLabelText("Demo debate topic")).toHaveTextContent("01 / 03");
    expect(screen.getByLabelText("Turn timer placeholder: one minute")).toHaveTextContent("01:00");
  });
});

describe("Stage 1 reset and local-only boundaries", () => {
  it("resets transcript, draft, every character, selected character, dialogue and pause", async () => {
    const { user, input, submit, history, container } = setup();
    await user.click(screen.getByRole("button", { name: /Zebra$/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: /Character state/ }), "thinking");
    await user.selectOptions(screen.getByRole("combobox", { name: /Give Moki a line/ }), "2");
    await user.click(screen.getByRole("button", { name: "Pause motion" }));
    await user.type(input, "An entry to clear.");
    await user.click(submit);
    await user.click(screen.getByRole("button", { name: /Objection!/ }));
    await user.type(input, "A draft to clear.");
    await user.click(screen.getByRole("button", { name: "Reset preview" }));
    expect(within(history).getAllByRole("listitem")).toHaveLength(2);
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: /Lemur$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox", { name: /Character state/ })).toHaveValue("speaking");
    expect(screen.getByRole("combobox", { name: /Give Moki a line/ })).toHaveValue("0");
    expect(screen.getByText(/Order in the jungle! Big opinions welcome/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause motion" })).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector(".character--lion")).toHaveAttribute("data-state", "idle");
    expect(container.querySelector(".character--zebra")).toHaveAttribute("data-state", "idle");
    expect(container.querySelector(".character--lemur")).toHaveAttribute("data-state", "speaking");
  });

  it("starts fresh on a new mount without mutating the shared sample data", async () => {
    const { user, input, submit, unmount } = setup();
    await user.type(input, "A temporary argument.");
    await user.click(submit);
    await user.click(screen.getByRole("button", { name: "Next judge dialogue" }));
    unmount();
    const fresh = setup();
    expect(within(fresh.history).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("A temporary argument.")).not.toBeInTheDocument();
    expect(fresh.input).toHaveValue("");
    expect(screen.getByRole("combobox", { name: /Give Moki a line/ })).toHaveValue("0");
  });

  it("does not send fetch/XHR or write Web Storage during the preview flow", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Stage 1 must stay local"));
    const xhr = vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(() => {});
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const { user, input, submit } = setup();
    await user.type(input, "Local only.");
    await user.click(submit);
    await user.click(screen.getByRole("button", { name: /Objection!/ }));
    await user.click(screen.getByRole("button", { name: "Next judge dialogue" }));
    await user.click(screen.getByRole("button", { name: "Reset preview" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });
});

describe("guide dialog React integration", () => {
  it.each(["Close guide", "Back to the jungle"])("opens, dismisses with %s, and reopens", async closeLabel => {
    const { user } = setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /How to play/ }));
    const dialog = screen.getByRole("dialog", { name: /A little wild/ });
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByText(/There is no live opponent or AI here yet/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: closeLabel }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /How to play/ }));
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("synchronizes state after a native close event so the guide can reopen", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /How to play/ }));
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    act(() => dialog.close());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /How to play/ }));
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });
});
