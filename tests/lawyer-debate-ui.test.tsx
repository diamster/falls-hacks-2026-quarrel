import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LawyerDebateView, LawyerSetup } from "@/components/lawyer-debate";
import type { LawyerDebateSnapshot, LawyerPublicMessage } from "@/lib/lawyer-types";
import type { RoomSnapshot } from "@/lib/room-types";
import { getTheme, themes } from "@/themes";

function debate(overrides: Partial<LawyerDebateSnapshot> = {}): LawyerDebateSnapshot {
  return { format: "lawyer", phase: "setup", topic: "Should lectures be mandatory?", totalSeconds: 120, revision: 3, positionA: "Attendance should be mandatory.", positionB: "Attendance should be optional.", confirmedA: true, confirmedB: true, planReady: false, planGeneration: 0, regenerationUsed: false, subtopics: [{ ordinal: 1, question: "How does attendance affect participation?", secondsPerPlayer: 60, openerSlot: "A", source: "ai", status: "pending", remainingMsA: 60000, remainingMsB: 60000 }, { ordinal: 2, question: "What flexibility do students need?", secondsPerPlayer: 60, openerSlot: "B", source: "ai", status: "pending", remainingMsA: 60000, remainingMsB: 60000 }], currentSubtopic: null, state: null, activeSlot: null, turnDeadline: null, remainingMsA: 60000, remainingMsB: 60000, serverNow: "2030-01-01T00:00:00Z", startedAt: null, history: [], consultations: [], verdict: null, ownMessageCount: 0, ownConsultationCount: 0, needsWork: false, ...overrides };
}
function room(state = debate(), overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return { id: "lawyer-room", code: "ABC234", you: "A", expiresAt: "2030-01-02T00:00:00Z", players: [{ slot: "A", name: "Avery", ready: true, connected: true }, { slot: "B", name: "Blair", ready: true, connected: true }], bothReady: true, themeId: "courtroom", themeLocked: false, lawyer: state, ...overrides };
}
function actions() { return { onPropose: vi.fn().mockResolvedValue(true), onPosition: vi.fn().mockResolvedValue(true), onPlan: vi.fn().mockResolvedValue(true), onStart: vi.fn().mockResolvedValue(true) }; }
function active(overrides: Partial<LawyerDebateSnapshot> = {}) { return debate({ phase: "subtopic", currentSubtopic: 1, state: "composing", activeSlot: "A", planReady: true, startedAt: "2030-01-01T00:00:00Z", turnDeadline: "2030-01-01T00:01:00Z", ...overrides }); }
function props(current = room(active())) { return { room: current, theme: getTheme(current.themeId), clocks: { A: 60, B: 60 }, pending: false, offline: false, onSend: vi.fn().mockResolvedValue(true), onConsult: vi.fn().mockResolvedValue(true) }; }
function message(overrides: Partial<LawyerPublicMessage> = {}): LawyerPublicMessage { return { id: "a-1", label: "S1-P1L1M1", kind: "argument", subtopic: 1, slot: "A", rawText: "My private original wording", text: "A public lawyer presentation", source: "ai", status: "complete", createdAt: "2030-01-01T00:00:05Z", completedAt: "2030-01-01T00:00:06Z", ...overrides }; }

describe("Stage 5 independent positions and plan", () => {
  it("lets the host propose only the topic/time and independently submit their own position", async () => {
    const user = userEvent.setup(); const handlers = actions(); render(<LawyerSetup room={room()} pending={false} offline={false} {...handlers}/>);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.queryByRole("textbox", { name: /Player B/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /Debate topic/ }), { target: { value: "  Should lectures be recorded?  " } });
    await user.selectOptions(screen.getByRole("combobox", { name: /Writing time per player/ }), "240");
    await user.click(screen.getByRole("button", { name: "Update topic and time" }));
    expect(handlers.onPropose).toHaveBeenCalledExactlyOnceWith("Should lectures be recorded?", 240, 3);
    fireEvent.change(screen.getByRole("textbox", { name: /Your position/ }), { target: { value: "  I support optional attendance.  " } });
    await user.click(screen.getByRole("button", { name: "Update my position" }));
    expect(handlers.onPosition).toHaveBeenCalledExactlyOnceWith("I support optional attendance.", 3);
    expect(handlers.onStart).not.toHaveBeenCalled();
  });

  it("lets the guest write their own position without host topic, duration, regeneration or start controls", async () => {
    const user = userEvent.setup(); const handlers = actions(); render(<LawyerSetup room={room(debate({ positionB: null, confirmedB: false }), { you: "B" })} pending={false} offline={false} {...handlers}/>);
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /Your position/ }), { target: { value: "Students need flexibility." } });
    await user.click(screen.getByRole("button", { name: "Confirm my position" }));
    expect(handlers.onPosition).toHaveBeenCalledExactlyOnceWith("Students need flexibility.", 3);
    expect(screen.queryByRole("button", { name: "Start debate" })).not.toBeInTheDocument();
    expect(handlers.onPropose).not.toHaveBeenCalled();
    expect(screen.getByText("Attendance should be mandatory.")).toBeInTheDocument();
  });

  it("keeps an unsent position while the peer position updates", () => {
    const handlers = actions(); const view = render(<LawyerSetup room={room()} pending={false} offline={false} {...handlers}/>);
    fireEvent.change(screen.getByRole("textbox", { name: /Your position/ }), { target: { value: "My unfinished rewrite" } });
    view.rerender(<LawyerSetup room={room(debate({ positionB: "A newly confirmed guest position", revision: 4 }))} pending={false} offline={false} {...handlers}/>);
    expect(screen.getByRole("textbox", { name: /Your position/ })).toHaveValue("My unfinished rewrite");
    expect(screen.getByText("A newly confirmed guest position")).toBeInTheDocument();
  });

  it("requires both ready confirmations, a saved plan and both connections before host start", async () => {
    const user = userEvent.setup(); const handlers = actions(); const state = debate({ planReady: true, phase: "planning" });
    const view = render(<LawyerSetup room={room(state, { bothReady: false })} pending={false} offline={false} {...handlers}/>);
    expect(screen.getByRole("button", { name: "Start debate" })).toBeDisabled();
    view.rerender(<LawyerSetup room={room(state)} pending={false} offline={false} {...handlers}/>);
    expect(screen.getByRole("button", { name: "Start debate" })).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Debate topic/ }), { target: { value: "An unsaved change" } });
    expect(screen.getByRole("button", { name: "Start debate" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Debate topic/ }), { target: { value: state.topic } });
    await user.click(screen.getByRole("button", { name: "Start debate" }));
    expect(handlers.onStart).toHaveBeenCalledExactlyOnceWith(3, 0);
    const disconnected = room(state); disconnected.players[1].connected = false;
    view.rerender(<LawyerSetup room={disconnected} pending={false} offline={false} {...handlers}/>);
    expect(screen.getByRole("button", { name: "Start debate" })).toBeDisabled();
    expect(screen.getByText(/Both players must be connected before starting/)).toBeInTheDocument();
  });

  it("shows allocated subtopics and allows exactly the server-provided regeneration opportunity", async () => {
    const user = userEvent.setup(); const handlers = actions(); const view = render(<LawyerSetup room={room(debate({ planReady: true }))} pending={false} offline={false} {...handlers}/>);
    expect(screen.getByText("How does attendance affect participation?")).toBeInTheDocument();
    expect(screen.getByText("01:00 per player · B opens")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Regenerate plan once" })); expect(handlers.onPlan).toHaveBeenCalledExactlyOnceWith(true);
    view.rerender(<LawyerSetup room={room(debate({ planReady: true, regenerationUsed: true }))} pending={false} offline={false} {...handlers}/>);
    expect(screen.getByRole("button", { name: "Plan regeneration used" })).toBeDisabled();
  });

  it("blocks editing while a plan is generating and avoids showing setup after start", () => {
    const handlers = actions(); const view = render(<LawyerSetup room={room(debate({ phase: "planning" }))} pending={false} offline={false} {...handlers}/>);
    expect(screen.getByText(/The planner is dividing your topic/)).toBeInTheDocument();
    for (const input of screen.getAllByRole("textbox")) expect(input).toBeDisabled();
    view.rerender(<LawyerSetup room={room(active())} pending={false} offline={false} {...handlers}/>);
    expect(screen.queryByRole("heading", { name: "Prepare your debate" })).not.toBeInTheDocument();
  });
});

describe("Stage 5 lawyer debate interface", () => {
  it("shows both server clock estimates and marks only the composing player's clock running", () => {
    const initial = props(); const view = render(<LawyerDebateView {...initial}/>);
    expect(screen.getByRole("timer", { name: "Player A: 60 seconds remaining" })).toHaveTextContent("01:00");
    expect(screen.getAllByText("Writing clock running")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Present my argument" })).toBeDisabled();
    view.rerender(<LawyerDebateView {...initial} room={room(active({ state: "lawyering" }))} clocks={{ A: 43, B: 60 }}/>);
    expect(screen.queryByText("Writing clock running")).not.toBeInTheDocument();
    expect(screen.getByRole("timer", { name: "Player A: 43 seconds remaining" })).toHaveTextContent("00:43");
    expect(screen.getByRole("textbox", { name: /Argument for my lawyer/ })).toBeDisabled();
    expect(screen.getByText(/Neither player’s clock runs/)).toBeInTheDocument();
  });

  it("sends a public presentation once with stable retry identity, preserving failed drafts", async () => {
    const user = userEvent.setup(); const current = props(); current.onSend.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<LawyerDebateView {...current}/>);
    const input = screen.getByRole("textbox", { name: /Argument for my lawyer/ });
    fireEvent.change(input, { target: { value: "  Attendance encourages discussion.  " } });
    await user.click(screen.getByRole("button", { name: "Present my argument" }));
    expect(current.onSend).toHaveBeenCalledWith("Attendance encourages discussion.", 3, 1, expect.any(String));
    expect(input).toHaveValue("  Attendance encourages discussion.  ");
    const requestKey = current.onSend.mock.calls[0][3];
    await user.click(screen.getByRole("button", { name: "Present my argument" }));
    expect(current.onSend.mock.calls[1][3]).toBe(requestKey);
    expect(input).toHaveValue("");
    expect(current.onConsult).not.toHaveBeenCalled();
  });

  it("gives edited failed drafts a new request ID and blocks pending duplicate submissions", async () => {
    const user = userEvent.setup(); const current = props(); current.onSend.mockResolvedValueOnce(false);
    let complete: (value: boolean) => void = () => {};
    current.onSend.mockImplementationOnce(async () => false).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    render(<LawyerDebateView {...current}/>); const input = screen.getByRole("textbox", { name: /Argument for my lawyer/ });
    fireEvent.change(input, { target: { value: "First point" } }); await user.click(screen.getByRole("button", { name: "Present my argument" }));
    fireEvent.change(input, { target: { value: "Edited point" } }); fireEvent.submit(input.closest("form")!); fireEvent.submit(input.closest("form")!);
    expect(current.onSend).toHaveBeenCalledTimes(2);
    expect(current.onSend.mock.calls[0][3]).not.toBe(current.onSend.mock.calls[1][3]);
    await act(async () => { complete(true); });
  });

  it("keeps private consultation separate from the public argument draft and transcript", async () => {
    const user = userEvent.setup(); const current = props(); render(<LawyerDebateView {...current}/>);
    const argument = screen.getByRole("textbox", { name: /Argument for my lawyer/ }); fireEvent.change(argument, { target: { value: "My unfinished official point" } });
    await user.click(screen.getByText("Ask my lawyer privately", { selector: "summary span" }));
    const question = screen.getByRole("textbox", { name: /Private message to my lawyer/ }); fireEvent.change(question, { target: { value: "Help me organize my reasoning." } });
    await user.click(screen.getByRole("button", { name: "Ask my lawyer privately" }));
    expect(current.onConsult).toHaveBeenCalledExactlyOnceWith("Help me organize my reasoning.", 3, 1, expect.any(String));
    expect(current.onSend).not.toHaveBeenCalled(); expect(argument).toHaveValue("My unfinished official point"); expect(question).toHaveValue("");
    expect(within(screen.getByRole("log", { name: "Public debate messages" })).queryByText("Help me organize my reasoning.")).not.toBeInTheDocument();
  });

  it("preserves the unsent official draft while consulting clears the active slot and later resumes composing", () => {
    const current = props(); const view = render(<LawyerDebateView {...current}/>);
    fireEvent.change(screen.getByRole("textbox", { name: /Argument for my lawyer/ }), { target: { value: "Keep this official argument draft." } });
    const pending = { id: "private-pending", subtopic: 1, playerText: "Help organize this", text: null, source: "ai" as const, status: "pending" as const, createdAt: "2030-01-01T00:00:02Z" };
    view.rerender(<LawyerDebateView {...current} room={room(active({ state: "consulting", activeSlot: null, consultations: [pending] }))}/>);
    expect(screen.getByRole("textbox", { name: /Argument for my lawyer/ })).toHaveValue("Keep this official argument draft.");
    expect(screen.getByRole("textbox", { name: /Argument for my lawyer/ })).toBeDisabled();
    expect(screen.getByText("Private consultation…")).toBeInTheDocument();
    view.rerender(<LawyerDebateView {...current} room={room(active({ consultations: [{ ...pending, status: "complete", text: "A private suggestion" }] }))}/>);
    expect(screen.getByRole("textbox", { name: /Argument for my lawyer/ })).toHaveValue("Keep this official argument draft.");
    expect(screen.getByRole("textbox", { name: /Argument for my lawyer/ })).toBeEnabled();
  });

  it("shows the saved summary in the judge bubble while the server holds the summary display interval", () => {
    const summary = message({ id: "summary-current", label: "S1-J", kind: "judge_summary", slot: null, text: "One side values participation; the other values flexibility." });
    const current = props(room(active({ phase: "summary", state: null, activeSlot: null, history: [summary] })));
    render(<LawyerDebateView {...current}/>);
    const bubble = within(screen.getByRole("region", { name: current.theme.environmentLabel })).getByRole("status");
    expect(bubble).toHaveTextContent(summary.text!);
    expect(screen.queryByText(/I’m summarizing the reasoning/)).not.toBeInTheDocument();
    expect(screen.getByText(/The summary is ready above/)).toBeInTheDocument();
  });

  it("renders member-filtered private history only inside its own panel and hides forged peer raw text", async () => {
    const user = userEvent.setup(); const state = active({ history: [message(), message({ id: "b-1", label: "S1-P2L2M1", slot: "B", text: "The other side’s public presentation", rawText: "SECRET PEER RAW" })], consultations: [{ id: "private-1", subtopic: 1, playerText: "PRIVATE QUESTION", text: "PRIVATE ANSWER", source: "ai", status: "complete", createdAt: "2030-01-01T00:00:03Z" }] });
    render(<LawyerDebateView {...props(room(state))}/>);
    const publicLog = screen.getByRole("log", { name: "Public debate messages" });
    expect(within(publicLog).getByText("The other side’s public presentation")).toBeInTheDocument();
    expect(within(publicLog).queryByText(/PRIVATE QUESTION|PRIVATE ANSWER|SECRET PEER RAW/)).not.toBeInTheDocument();
    expect(screen.queryByText("SECRET PEER RAW")).not.toBeInTheDocument();
    await user.click(screen.getByText("Your original draft · hidden from opponent")); expect(within(publicLog).getByText("My private original wording")).toBeInTheDocument();
    await user.click(screen.getByText("Ask my lawyer privately", { selector: "summary span" }));
    const privateLog = screen.getByRole("log", { name: "Your private lawyer consultations" });
    expect(within(privateLog).getByText("PRIVATE QUESTION")).toBeInTheDocument(); expect(within(privateLog).getByText("PRIVATE ANSWER")).toBeInTheDocument();
  });

  it("keeps chronological public messages and labels argument, judge, system and jury roles", () => {
    const state = active({ history: [message({ id: "jury", label: "JURY", kind: "jury_verdict", slot: null, createdAt: "2030-01-01T00:00:30Z", text: "Jury explanation" }), message({ id: "summary", label: "S1-J", kind: "judge_summary", slot: null, createdAt: "2030-01-01T00:00:20Z", text: "Both positions considered", source: "fallback" }), message(), message({ id: "announcement", label: "INTRO", kind: "announcement", slot: null, createdAt: "2030-01-01T00:00:00Z", text: "Welcome both sides" })] });
    render(<LawyerDebateView {...props(room(state))}/>);
    const entries = within(screen.getByRole("log", { name: "Public debate messages" })).getAllByRole("listitem");
    expect(entries.map(entry => entry.textContent)).toEqual([expect.stringContaining("System announcement"), expect.stringContaining("S1-P1L1M1"), expect.stringContaining("S1-J"), expect.stringContaining("JURY")]);
    expect(screen.getByText("Fallback response")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ask Judge|Objection/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Message to the judge/ })).not.toBeInTheDocument();
  });

  it.each([{ ownMessageCount: 12 }, { activeSlot: "B" as const }, { state: "consulting" as const }])("prevents a public submission outside the allowed state %j", override => {
    const current = props(room(active(override))); render(<LawyerDebateView {...current}/>);
    const input = screen.getByRole("textbox", { name: /Argument for my lawyer/ }); fireEvent.change(input, { target: { value: "A point" } }); fireEvent.submit(input.closest("form")!);
    expect(screen.getByRole("button", { name: "Present my argument" })).toBeDisabled(); expect(current.onSend).not.toHaveBeenCalled();
  });

  it("caps Unicode input and prevents expired, offline and over-limit consultations", async () => {
    const user = userEvent.setup(); const current = props(room(active({ ownConsultationCount: 2 }))); const view = render(<LawyerDebateView {...current}/>);
    const input = screen.getByRole("textbox", { name: /Argument for my lawyer/ }); fireEvent.change(input, { target: { value: "😀".repeat(601) } }); expect(input).toHaveValue("😀".repeat(600));
    await user.click(screen.getByText("Ask my lawyer privately", { selector: "summary span" }));
    const privateInput = screen.getByRole("textbox", { name: /Private message to my lawyer/ }); fireEvent.change(privateInput, { target: { value: "Help" } });
    expect(screen.getByRole("button", { name: "Ask my lawyer privately" })).toBeDisabled(); fireEvent.submit(privateInput.closest("form")!); expect(current.onConsult).not.toHaveBeenCalled();
    view.rerender(<LawyerDebateView {...current} offline/>); expect(screen.getByRole("button", { name: "Present my argument" })).toBeDisabled();
    view.rerender(<LawyerDebateView {...current} clocks={{ A: 0, B: 20 }}/>); expect(screen.getByRole("textbox", { name: /Argument for my lawyer/ })).toBeDisabled();
  });

  it("shows summary/jury processing without composers, then a split verdict and full history", () => {
    const current = props(room(active({ phase: "summary", state: null, activeSlot: null }))); const view = render(<LawyerDebateView {...current}/>);
    expect(screen.getByText(/Both writing clocks are empty/)).toBeInTheDocument(); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    view.rerender(<LawyerDebateView {...current} room={room(active({ phase: "jury", state: null, activeSlot: null }))}/>);
    expect(screen.getByText(/All subtopics are finished/)).toBeInTheDocument();
    view.rerender(<LawyerDebateView {...current} room={room(active({ phase: "complete", state: null, activeSlot: null, history: [message()], verdict: { outcome: "split", reasoning: "Neither argument settles the question.", perSubtopic: [{ ordinal: 1, text: "Both sides identify a tradeoff." }] } }))}/>);
    expect(screen.getByRole("heading", { name: "Split decision / inconclusive" })).toBeInTheDocument(); expect(screen.getByText("Neither argument settles the question.")).toBeInTheDocument();
    expect(screen.getByRole("log", { name: "Public debate messages" })).toHaveTextContent("A public lawyer presentation");
    expect(screen.queryByRole("button", { name: "Present my argument" })).not.toBeInTheDocument();
  });

  it("keeps the owner's private consultation record accessible after completion without a new-message control", async () => {
    const user = userEvent.setup();
    render(<LawyerDebateView {...props(room(active({ phase: "complete", state: null, activeSlot: null, consultations: [{ id: "private-final", subtopic: 1, playerText: "My private preparation", text: "My private response", source: "demo", status: "complete", createdAt: "2030-01-01T00:00:01Z" }], verdict: { outcome: "A", reasoning: "A stronger presented connection.", perSubtopic: [] } })))}/>);
    expect(screen.getByRole("heading", { name: "The stronger presented case: Avery" })).toBeInTheDocument();
    await user.click(screen.getByText("Your private lawyer record", { selector: "summary span" }));
    expect(screen.getByRole("log", { name: "Your private lawyer consultations" })).toHaveTextContent("My private preparation");
    expect(screen.getByRole("log", { name: "Public debate messages" })).not.toHaveTextContent("My private preparation");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it.each(themes)("renders the existing $displayName cast and corresponding new lawyer/jury art", theme => {
    const view = render(<LawyerDebateView {...props(room(active(), { themeId: theme.id }))} theme={theme} paused/>);
    expect(screen.getByRole("img", { name: theme.judge.description })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: theme.lawyers.A.description })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: theme.lawyers.B.description })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: theme.jury.description })).toBeInTheDocument();
    expect(view.container.querySelector("[data-paused=true]")).not.toBeNull();
  });
});
