import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DebateComplete, DebateHistory, DebateProgress, DebateSetup, DebateTurnPanel, debateAnnouncement, formatTurnTime } from "@/components/debate-ui";
import { DebateArena } from "@/components/debate-arena";
import { RoomLobby } from "@/components/multiplayer-app";
import { getTheme, themes } from "@/themes";
import type { DebateSnapshot } from "@/lib/debate-types";
import type { RoomSnapshot } from "@/lib/room-types";

function debate(overrides: Partial<DebateSnapshot> = {}): DebateSnapshot {
  return { phase: "setup", topic: null, positionA: null, positionB: null, revision: 0, approvedA: false, approvedB: false, changeRequest: null, activeSlot: null, turnIndex: null, turnDeadline: null, serverNow: "2030-01-01T00:00:00Z", startedAt: null, history: [], questions: [], ...overrides };
}
function room(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return { id: "room-id", code: "ABC234", expiresAt: "2030-01-02T00:00:00Z", you: "A", players: [{ slot: "A", name: "Avery", ready: false, connected: true }, { slot: "B", name: "Blair", ready: false, connected: true }], bothReady: false, ...overrides };
}
function actions() { return { onPropose: vi.fn().mockResolvedValue(true), onApprove: vi.fn().mockResolvedValue(true), onRequestChanges: vi.fn().mockResolvedValue(true), onStart: vi.fn().mockResolvedValue(true) }; }
const proposed = { topic: "Should lectures be recorded?", positionA: "Record all lectures", positionB: "Keep recording optional", revision: 4, approvedA: true };
const started = { ...proposed, phase: "opening" as const, approvedB: true, activeSlot: "A" as const, turnIndex: 0, turnDeadline: "2030-01-01T00:00:45Z" };

describe("Stage 3 topic agreement", () => {
  it("sends a trimmed proposal with its revision and requires every field", async () => {
    const user = userEvent.setup(); const calls = actions();
    render(<DebateSetup room={room()} debate={debate()} pending={false} offline={false} {...calls}/>);
    expect(screen.getByRole("button", { name: "Propose topic and positions" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /Debate topic/ }), "  Public transport?  ");
    await user.type(screen.getByRole("textbox", { name: /Player A’s position/ }), "  Free fares  ");
    await user.type(screen.getByRole("textbox", { name: /Player B’s position/ }), "  Subsidized fares  ");
    await user.click(screen.getByRole("button", { name: "Propose topic and positions" }));
    expect(calls.onPropose).toHaveBeenCalledWith("Public transport?", "Free fares", "Subsidized fares", 0);
    expect(screen.getByRole("button", { name: "Start debate" })).toBeDisabled();
  });

  it("caps topic and positions by Unicode codepoints, without splitting emoji", () => {
    render(<DebateSetup room={room()} debate={debate()} pending={false} offline={false} {...actions()}/>);
    const topic = screen.getByRole("textbox", { name: /Debate topic/ });
    const a = screen.getByRole("textbox", { name: /Player A’s position/ });
    const b = screen.getByRole("textbox", { name: /Player B’s position/ });
    fireEvent.change(topic, { target: { value: "🌴".repeat(250) } });
    fireEvent.change(a, { target: { value: "🌴".repeat(170) } });
    fireEvent.change(b, { target: { value: "b".repeat(170) } });
    expect(topic).toHaveValue("🌴".repeat(240)); expect(a).toHaveValue("🌴".repeat(160)); expect(b).toHaveValue("b".repeat(160));
  });

  it("only enables host start after both approvals and readiness, and prevents starting an unsaved edit", async () => {
    const user = userEvent.setup(); const calls = actions();
    const agreed = debate({ ...proposed, approvedB: true });
    const view = render(<DebateSetup room={room()} debate={agreed} pending={false} offline={false} {...calls}/>);
    expect(screen.getByText(/Both players must choose ready/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start debate" })).toBeDisabled();
    view.rerender(<DebateSetup room={room({ bothReady: true })} debate={agreed} pending={false} offline={false} {...calls}/>);
    await user.click(screen.getByRole("button", { name: "Start debate" }));
    expect(calls.onStart).toHaveBeenCalledWith(4);
    expect(screen.getByRole("button", { name: "Update proposal" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /Debate topic/ }), " Revised");
    expect(screen.getByRole("button", { name: "Start debate" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Update proposal" }));
    expect(calls.onPropose).toHaveBeenCalledWith(`${proposed.topic} Revised`, proposed.positionA, proposed.positionB, 4);
    view.rerender(<DebateSetup room={room({ bothReady: true })} debate={debate({ ...proposed, topic: "An updated proposal", revision: 5 })} pending={false} offline={false} {...calls}/>);
    expect(screen.getByRole("textbox", { name: /Debate topic/ })).toHaveValue("An updated proposal");
    expect(screen.getByRole("button", { name: "Start debate" })).toBeDisabled();
  });

  it("keeps setup mutations disabled while offline or pending", () => {
    const calls = actions();
    const view = render(<DebateSetup room={room({ bothReady: true })} debate={debate({ ...proposed, approvedB: true })} pending offline={false} {...calls}/>);
    expect(screen.getByRole("textbox", { name: /Debate topic/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start debate" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox", { name: /Debate topic/ }).closest("form")!);
    expect(calls.onPropose).not.toHaveBeenCalled();
    view.rerender(<DebateSetup room={room({ bothReady: true })} debate={debate({ ...proposed, approvedB: true })} pending={false} offline {...calls}/>);
    expect(screen.getByRole("button", { name: "Start debate" })).toBeDisabled();
  });

  it("gives the guest review controls without host editing or starting controls", async () => {
    const user = userEvent.setup(); const calls = actions(); const guest = room({ you: "B" });
    const view = render(<DebateSetup room={guest} debate={debate()} pending={false} offline={false} {...calls}/>);
    expect(screen.getByText(/Player A is preparing/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Debate topic/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start debate" })).not.toBeInTheDocument();
    view.rerender(<DebateSetup room={guest} debate={debate(proposed)} pending={false} offline={false} {...calls}/>);
    expect(screen.getByRole("heading", { name: proposed.topic })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve topic and positions" }));
    expect(calls.onApprove).toHaveBeenCalledWith(4);
    view.rerender(<DebateSetup room={guest} debate={debate({ ...proposed, approvedB: true })} pending={false} offline={false} {...calls}/>);
    expect(screen.getByRole("button", { name: "Proposal approved" })).toBeDisabled();
  });

  it("retains a failed change request, then closes it only after success", async () => {
    const user = userEvent.setup(); const calls = actions();
    calls.onRequestChanges.mockResolvedValueOnce(false);
    render(<DebateSetup room={room({ you: "B" })} debate={debate(proposed)} pending={false} offline={false} {...calls}/>);
    await user.click(screen.getByRole("button", { name: "Request changes" }));
    expect(screen.getByRole("button", { name: "Send change request" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox", { name: /What should change/ }).closest("form")!);
    expect(calls.onRequestChanges).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: /What should change/ }), "  Please narrow the topic.  ");
    await user.click(screen.getByRole("button", { name: "Send change request" }));
    expect(calls.onRequestChanges).toHaveBeenCalledWith("Please narrow the topic.", 4);
    expect(screen.getByRole("textbox", { name: /What should change/ })).toHaveValue("  Please narrow the topic.  ");
    await user.click(screen.getByRole("button", { name: "Send change request" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: /What should change/ })).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Request changes" }));
    await user.click(screen.getByRole("button", { name: "Cancel request" }));
    expect(screen.queryByRole("textbox", { name: /What should change/ })).not.toBeInTheDocument();
  });

  it("shows the guest’s requested amendment and blocks stale approval", () => {
    render(<DebateSetup room={room({ you: "B" })} debate={debate({ ...proposed, changeRequest: "Please specify undergraduate lectures." })} pending={false} offline={false} {...actions()}/>);
    expect(screen.getByText("Player B requested changes")).toBeInTheDocument();
    expect(screen.getByText("Please specify undergraduate lectures.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve topic and positions" })).toBeDisabled();
  });
});

describe("Stage 3 active turn", () => {
  it("submits once with revision and turn identity, clearing only a successful submission", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    render(<DebateTurnPanel room={room()} debate={debate(started)} remainingSeconds={44} pending={false} offline={false} onSubmit={onSubmit}/>);
    expect(screen.getByRole("timer")).toHaveTextContent("00:44");
    expect(screen.getByRole("button", { name: "Submit argument" })).toBeDisabled();
    const input = screen.getByRole("textbox", { name: "Your opening statement" });
    fireEvent.submit(input.closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
    await user.type(input, "  Accessible recordings help everyone.  ");
    await user.click(screen.getByRole("button", { name: "Submit argument" }));
    expect(onSubmit).toHaveBeenCalledWith("Accessible recordings help everyone.", 4, 0);
    expect(input).toHaveValue("  Accessible recordings help everyone.  ");
    await user.click(screen.getByRole("button", { name: "Submit argument" }));
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("keeps a local draft while disconnected but cannot send it, and never submits automatically at expiry", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn(); const state = debate(started);
    const view = render(<DebateTurnPanel room={room()} debate={state} remainingSeconds={10} pending={false} offline onSubmit={onSubmit}/>);
    const input = screen.getByRole("textbox", { name: "Your opening statement" });
    await user.type(input, "A local draft");
    expect(screen.getByRole("button", { name: "Submit argument" })).toBeDisabled();
    expect(screen.getByText(/Connection lost. Your draft stays/)).toBeInTheDocument();
    view.rerender(<DebateTurnPanel room={room()} debate={state} remainingSeconds={0} pending={false} offline={false} onSubmit={onSubmit}/>);
    expect(input).toHaveValue("A local draft"); expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Turn ended" })).toBeDisabled();
    expect(screen.getByText(/Unsent text is not submitted automatically/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not let the waiting player write and explains either side of the turn order", () => {
    const view = render(<DebateTurnPanel room={room({ you: "B" })} debate={debate(started)} remainingSeconds={30} pending={false} offline={false} onSubmit={vi.fn()}/>);
    expect(screen.getByRole("heading", { name: "Avery has the floor" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText(/You’ll write after Player A/)).toBeInTheDocument();
    view.rerender(<DebateTurnPanel room={room()} debate={debate({ ...started, activeSlot: "B", turnIndex: 1 })} remainingSeconds={30} pending={false} offline={false} onSubmit={vi.fn()}/>);
    expect(screen.getByRole("heading", { name: "Blair has the floor" })).toBeInTheDocument();
    expect(screen.getByText(/You’ve had your turn in this round/)).toBeInTheDocument();
  });

  it("uses the server-provided practice question and adapts the input for later rounds", () => {
    const onSubmit = vi.fn();
    const view = render(<DebateTurnPanel room={room()} debate={debate({ ...started, phase: "rebuttal", turnIndex: 2 })} remainingSeconds={45} pending={false} offline={false} onSubmit={onSubmit}/>);
    expect(screen.getByRole("textbox", { name: "Your rebuttal" })).toBeInTheDocument();
    expect(screen.getByText(/Respond to the other player’s opening/)).toBeInTheDocument();
    view.rerender(<DebateTurnPanel room={room()} debate={debate({ ...started, phase: "questions", turnIndex: 4, questions: [{ slot: "A", id: "q-a", source: "placeholder", text: "What evidence would change your mind?" }] })} remainingSeconds={30} pending={false} offline={false} onSubmit={onSubmit}/>);
    expect(screen.getByText("What evidence would change your mind?")).toBeInTheDocument();
    expect(screen.getByText("SCRIPTED PRACTICE QUESTION · NO AI")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your answer" })).toBeInTheDocument();
    view.rerender(<DebateTurnPanel room={room()} debate={debate({ ...started, phase: "questions", turnIndex: 4 })} remainingSeconds={30} pending={false} offline={false} onSubmit={onSubmit}/>);
    expect(screen.getByText("The question is loading from the room.")).toBeInTheDocument();
  });

  it("caps argument length at 2,000 codepoints and prevents a pending duplicate", async () => {
    const onSubmit = vi.fn();
    const view = render(<DebateTurnPanel room={room()} debate={debate(started)} remainingSeconds={40} pending={false} offline={false} onSubmit={onSubmit}/>);
    const input = screen.getByRole("textbox", { name: "Your opening statement" });
    fireEvent.change(input, { target: { value: "🌴".repeat(2001) } });
    expect(input).toHaveValue("🌴".repeat(2000));
    expect(screen.getByText("2000 / 2,000 characters")).toBeInTheDocument();
    view.rerender(<DebateTurnPanel room={room()} debate={debate(started)} remainingSeconds={40} pending offline={false} onSubmit={onSubmit}/>);
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled();
    fireEvent.submit(input.closest("form")!); expect(onSubmit).not.toHaveBeenCalled();
  });

  it("cannot send without a server turn identity", () => {
    const onSubmit = vi.fn();
    render(<DebateTurnPanel room={room()} debate={debate({ ...started, turnIndex: null })} remainingSeconds={40} pending={false} offline={false} onSubmit={onSubmit}/>);
    const input = screen.getByRole("textbox", { name: "Your opening statement" });
    fireEvent.change(input, { target: { value: "A test argument" } }); fireEvent.submit(input.closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("Stage 3 record and presentation", () => {
  const history = [
    { id: "a", slot: "A" as const, phase: "opening" as const, turnIndex: 0, text: "A’s opening", submittedAt: "2030-01-01T00:00:10Z", status: "submitted" as const },
    { id: "b", slot: "B" as const, phase: "opening" as const, turnIndex: 1, text: "B’s opening", submittedAt: "2030-01-01T00:00:20Z", status: "submitted" as const },
    { id: "c", slot: "A" as const, phase: "rebuttal" as const, turnIndex: 2, text: null, submittedAt: null, status: "expired" as const },
  ];
  it("shows only the viewer’s private opening receipt until both opening turns finish", () => {
    const view = render(<DebateHistory debate={debate({ ...started, history: history.slice(0, 2) })} players={room().players} you="A"/>);
    expect(screen.getByText("A’s opening")).toBeInTheDocument(); expect(screen.queryByText("B’s opening")).not.toBeInTheDocument();
    expect(screen.getByText("Private receipt")).toBeInTheDocument();
    view.rerender(<DebateHistory debate={debate({ ...started, phase: "rebuttal", history })} players={room().players} you="A"/>);
    expect(screen.getByText("A’s opening")).toBeInTheDocument(); expect(screen.getByText("B’s opening")).toBeInTheDocument();
    expect(screen.getByText("No argument was submitted before the deadline.")).toBeInTheDocument();
    expect(screen.getByText("Time expired")).toBeInTheDocument();
  });

  it("handles an empty history and unavailable receipt text without fabricating an argument", () => {
    const view = render(<DebateHistory debate={debate({ ...started })} players={[]} you="B"/>);
    expect(screen.getByText(/No visible submissions yet/)).toBeInTheDocument();
    view.rerender(<DebateHistory debate={debate({ ...started, phase: "questions", history: [{ ...history[0], phase: "questions", text: null }] })} players={[]} you="B"/>);
    expect(screen.getByText("Submission recorded.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Judge questions" })).toBeInTheDocument();
  });

  it("marks round progression and clearly presents completion without choosing a winner", () => {
    const view = render(<><DebateProgress phase="rebuttal"/><DebateComplete debate={debate({ phase: "verdict", history })}/></>);
    const rounds = within(screen.getByRole("list", { name: "Debate rounds" })).getAllByRole("listitem");
    expect(rounds[0]).toHaveAttribute("data-complete", "true"); expect(rounds[1]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Verdict placeholder — no winner has been selected.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "The debate record is complete" })).getByText("2")).toBeInTheDocument();
    view.rerender(<DebateProgress phase="verdict"/>);
    expect(screen.getAllByRole("listitem").every(item => item.dataset.complete === "true")).toBe(true);
    view.rerender(<DebateProgress phase="setup"/>);
    expect(screen.getAllByRole("listitem").some(item => item.hasAttribute("aria-current"))).toBe(false);
  });

  it.each(themes)("uses $displayName configured announcements, including the agreed topic, without AI", theme => {
    expect(debateAnnouncement(theme, debate(), "Avery")).toBe(theme.judge.debateDialogue.setup);
    expect(debateAnnouncement(theme, debate(proposed), "Avery")).toBe(theme.judge.debateDialogue.awaitingApproval);
    expect(debateAnnouncement(theme, debate({ ...proposed, approvedB: true }), "Avery")).toBe(theme.judge.debateDialogue.setup);
    const intro = debateAnnouncement(theme, debate(started), "Avery"); expect(intro).toContain(proposed.topic); expect(intro).toContain("Avery");
    expect(debateAnnouncement(theme, debate({ ...started, topic: null }), "Avery")).toContain("the agreed topic");
    for (const phase of ["opening", "rebuttal", "questions"] as const) expect(debateAnnouncement(theme, debate({ ...started, phase, turnIndex: 1 }), "Blair")).toBe(theme.judge.debateDialogue[phase].replaceAll("{speaker}", "Blair"));
    expect(debateAnnouncement(theme, debate({ phase: "verdict" }), "Avery")).toBe(theme.judge.debateDialogue.complete);
  });

  it("formats countdowns without negative displayed time", () => { expect(formatTurnTime(45)).toBe("00:45"); expect(formatTurnTime(61)).toBe("01:01"); expect(formatTurnTime(-1)).toBe("00:00"); expect(formatTurnTime(.2)).toBe("00:01"); });

  it("keeps original art while indicating speaker and final neutral judge state", () => {
    const theme = getTheme("jungle"); const players = { A: { name: "Avery" }, B: { name: "Blair" } };
    const view = render(<DebateArena theme={theme} players={players} dialogue="Avery has the floor." dialogueKey="opening-0" paused={false} turn={{ label: "ROUND 1 · PLAYER A", time: "00:45", activeSlot: "A", complete: false }}/>);
    expect(screen.getByLabelText("ROUND 1 · PLAYER A: 00:45")).toBeInTheDocument();
    expect(view.container.querySelector(".character--lion")).toHaveAttribute("data-state", "speaking");
    expect(view.container.querySelector(".character--zebra")).toHaveAttribute("data-state", "listening");
    view.rerender(<DebateArena theme={theme} players={players} dialogue="Blair has the floor." dialogueKey="opening-1" paused={false} turn={{ label: "ROUND 1 · PLAYER B", time: "00:40", activeSlot: "B", complete: false }}/>);
    expect(view.container.querySelector(".character--zebra")).toHaveAttribute("data-state", "speaking");
    view.rerender(<DebateArena theme={theme} players={players} dialogue="All rounds complete." dialogueKey="complete" paused={false} turn={{ label: "ALL ROUNDS COMPLETE", time: "DONE", activeSlot: null, complete: true }}/>);
    expect(view.container.querySelector("[data-judge-id]")).toHaveAttribute("data-state", "thinking");
    expect(screen.getAllByRole("img")).toHaveLength(3);
  });

  it("preserves connections but removes readiness mutations after start and completion", () => {
    const onReady = vi.fn();
    const view = render(<RoomLobby room={room({ debate: debate(started) })} pending={false} offline={false} live onReady={onReady}/>);
    expect(screen.queryByRole("button", { name: /I’m ready|I’m not ready/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Connected")).toHaveLength(2);
    expect(screen.getByText(/agreed positions are locked/)).toBeInTheDocument();
    view.rerender(<RoomLobby room={room({ debate: debate({ phase: "verdict" }) })} pending={false} offline={false} live onReady={onReady}/>);
    expect(screen.getByText(/All rounds are complete/)).toBeInTheDocument();
  });
});
