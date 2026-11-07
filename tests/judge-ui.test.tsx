import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JudgeComposer, JudgeConversation, PreparingJudgeQuestions, useJudgePresentation } from "@/components/judge-panel";
import { DebateArena } from "@/components/debate-arena";
import { DebateComplete, DebateTurnPanel } from "@/components/debate-ui";
import type { JudgeMessage, JudgeSnapshot } from "@/lib/judge-types";
import type { RoomSnapshot } from "@/lib/room-types";
import { getTheme, themes } from "@/themes";

function message(overrides: Partial<JudgeMessage> = {}): JudgeMessage {
  return { id: "reply-1", kind: "chat", slot: "A", turnIndex: 0, playerText: "Can you explain the disagreement?", text: "Which assumption would each side want to test?", status: "complete", source: "ai", reaction: "questioning", createdAt: "2030-01-01T00:00:00Z", completedAt: "2030-01-01T00:00:01Z", ...overrides };
}
function room(judge: Partial<JudgeSnapshot> = {}): RoomSnapshot {
  return { id: "room-1", code: "ABC234", expiresAt: "2030-01-02T00:00:00Z", you: "A", players: [{ slot: "A", name: "Avery", ready: true, connected: true }, { slot: "B", name: "Blair", ready: true, connected: true }], bothReady: true, themeId: "jungle", themeLocked: true,
    debate: { phase: "opening", topic: "Should the library stay open later?", positionA: "Extend hours", positionB: "Keep current hours", revision: 2, approvedA: true, approvedB: true, changeRequest: null, activeSlot: "A", turnIndex: 0, turnDeadline: "2030-01-01T00:00:45Z", serverNow: "2030-01-01T00:00:05Z", startedAt: "2030-01-01T00:00:00Z", history: [], questions: [] },
    judge: { enabled: true, mode: "ai", messages: [], pendingRequestId: null, messagesUsed: 0, maxMessagesPerTurn: 2, needsWork: false, preparingQuestions: false, ...judge },
  };
}
const theme = getTheme();
afterEach(() => vi.useRealTimers());

describe("Separate judge messaging", () => {
  it("sends a trimmed question with a stable request key without submitting the official argument", async () => {
    const user = userEvent.setup(); const current = room(); const ask = vi.fn().mockResolvedValue(true);
    render(<JudgeComposer room={current} theme={theme} pending={false} offline={false} remainingSeconds={40} onAsk={ask}/>);
    expect(screen.getByText(/Both players can see messages to the judge/)).toBeInTheDocument();
    expect(screen.getByText(/Your official opening stays private/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit argument" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Message to the judge" }), "  Can you clarify?  ");
    await user.click(screen.getByRole("button", { name: "Ask Judge" }));
    expect(ask).toHaveBeenCalledExactlyOnceWith("Can you clarify?", 2, 0, expect.stringMatching(/^[\da-f-]{36}$/i));
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(current.debate?.phase).toBe("opening"); expect(current.debate?.turnIndex).toBe(0);
  });

  it("keeps the same idempotency key on a failed retry, and gives an edited draft a new key", async () => {
    const user = userEvent.setup(); const ask = vi.fn().mockResolvedValue(false);
    render(<JudgeComposer room={room()} theme={theme} pending={false} offline={false} remainingSeconds={40} onAsk={ask}/>);
    const input = screen.getByRole("textbox"); const button = screen.getByRole("button", { name: "Ask Judge" });
    fireEvent.change(input, { target: { value: "My first question" } });
    await user.click(button); await user.click(button);
    expect(ask.mock.calls[0][3]).toBe(ask.mock.calls[1][3]);
    expect(input).toHaveValue("My first question");
    fireEvent.change(input, { target: { value: "My revised question" } }); await user.click(button);
    expect(ask.mock.calls[2][3]).not.toBe(ask.mock.calls[1][3]);
  });

  it("blocks duplicate submissions while a reply is pending", async () => {
    let finish!: (success: boolean) => void;
    const ask = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    render(<JudgeComposer room={room()} theme={theme} pending={false} offline={false} remainingSeconds={40} onAsk={ask}/>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "What should I clarify?" } });
    const form = screen.getByRole("textbox").closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Judge is thinking/ })).toBeDisabled();
    await act(async () => { finish(true); });
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("limits input by Unicode characters and exposes the configured allowance", () => {
    render(<JudgeComposer room={room({ maxMessagesPerTurn: 3, messagesUsed: 1 })} theme={theme} pending={false} offline={false} remainingSeconds={40} onAsk={vi.fn()}/>);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "🦁".repeat(601) } });
    expect(input).toHaveValue("🦁".repeat(600));
    expect(screen.getByText("600 / 600 characters · 2 of 3 messages left")).toBeInTheDocument();
  });

  it.each(["other player", "expired", "limit", "offline", "pending", "shared pending", "preparing", "disabled", "finished"])("prevents judge submission for %s", reason => {
    const current = room(); let offline = false; let pending = false; let seconds = 40;
    if (reason === "other player") current.you = "B";
    if (reason === "expired") seconds = 0;
    if (reason === "limit") current.judge!.messagesUsed = 2;
    if (reason === "offline") offline = true;
    if (reason === "pending") pending = true;
    if (reason === "shared pending") current.judge!.pendingRequestId = "pending-1";
    if (reason === "preparing") current.judge!.preparingQuestions = true;
    if (reason === "disabled") current.judge!.enabled = false;
    if (reason === "finished") current.debate!.phase = "verdict";
    const ask = vi.fn();
    render(<JudgeComposer room={current} theme={theme} pending={pending} offline={offline} remainingSeconds={seconds} onAsk={ask}/>);
    expect(screen.getByRole("textbox")).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(ask).not.toHaveBeenCalled();
  });

  it("labels deterministic demo mode without claiming a live AI response", () => {
    render(<JudgeComposer room={room({ mode: "demo" })} theme={theme} pending={false} offline={false} remainingSeconds={40} onAsk={vi.fn()}/>);
    expect(screen.getByText(/Demo judge: responses follow local rules/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Judge" })).toBeDisabled();
  });
});

describe("Shared judge history", () => {
  it("identifies both players and preserves demo, fallback, pending and scripted messages", () => {
    const messages = [message(), message({ id: "demo", slot: "B", source: "demo", text: "A demo clarification." }), message({ id: "fallback", source: "fallback", text: "A fallback clarification." }), message({ id: "pending", slot: "B", status: "pending", text: null }), message({ id: "intro", slot: null, kind: "introduction", playerText: null, source: "scripted", text: "Welcome to both players." })];
    render(<JudgeConversation room={room({ messages })} theme={theme}/>);
    const log = screen.getByRole("log", { name: "Judge conversation" });
    expect(within(log).getAllByText("Avery")).toHaveLength(2);
    expect(within(log).getAllByText("Blair")).toHaveLength(2);
    expect(within(log).getByText("AI response")).toBeInTheDocument();
    expect(within(log).getByText("Demo response")).toBeInTheDocument();
    expect(within(log).getByText("Fallback response")).toBeInTheDocument();
    expect(within(log).getByText("Round announcement")).toBeInTheDocument();
    expect(within(log).getByText("Thinking…")).toBeInTheDocument();
    expect(within(log).getByText(/The live response was unavailable/)).toBeInTheDocument();
  });

  it("renders untrusted text as text and names an absent participant by their slot", () => {
    const current = room({ messages: [message({ slot: "B", playerText: "<script>changePhase()</script>", text: "<img src=x onerror=attack()>" })] }); current.players = [];
    const view = render(<JudgeConversation room={current} theme={theme}/>);
    expect(screen.getByText("Player B")).toBeInTheDocument();
    expect(screen.getByText("<script>changePhase()</script>")).toBeInTheDocument();
    expect(view.container.querySelector("script,img")).toBeNull();
  });

  it("shows a useful empty history and neutral completion copy", () => {
    const current = room();
    render(<><JudgeConversation room={current} theme={theme}/><PreparingJudgeQuestions/><DebateComplete debate={current.debate!} interactiveJudge/></>);
    expect(screen.getByText(/announcements and your conversations will appear/)).toBeInTheDocument();
    expect(screen.getByText(/Each 30-second answer turn starts after the questions are saved/)).toBeInTheDocument();
    expect(screen.getByText(/Final evaluation and winner selection are not part of this stage/)).toBeInTheDocument();
  });

  it.each(["ai", "demo", "fallback"] as const)("labels %s questions using the saved source", source => {
    const current = room(); current.debate = { ...current.debate!, phase: "questions", turnIndex: 4, questions: [{ id: "q1", slot: "A", source, text: "What evidence would test your position?" }] };
    render(<DebateTurnPanel room={current} debate={current.debate} pending={false} offline={false} remainingSeconds={30} onSubmit={vi.fn()}/>);
    expect(screen.getByText(`${source.toUpperCase()} CLARIFICATION QUESTION`)).toBeInTheDocument();
  });
});

describe("Judge reactions and speech", () => {
  it("shows a chat that finishes after a later-created round announcement", () => {
    vi.useFakeTimers();
    const chat = message({ completedAt: "2030-01-01T00:00:08Z", text: "Here is the clarification you asked for." });
    const transition = message({ id: "transition-1", kind: "transition", playerText: null, slot: null, source: "scripted", createdAt: "2030-01-01T00:00:05Z", completedAt: "2030-01-01T00:00:05Z", text: "Player B has the floor." });
    const current = room({ messages: [chat, transition] });
    const { result } = renderHook(() => useJudgePresentation(current, "Player B has the floor.", "opening-1"));
    expect(result.current.dialogue).toBe(chat.text);
    expect(current.judge!.messages.map(item => item.id)).toEqual([chat.id, transition.id]);
    act(() => { vi.advanceTimersByTime(8001); });
    expect(result.current.dialogue).toBe("Player B has the floor.");
    expect(result.current.state).toBe("listening");
  });

  it("shows a new saved reply, then returns to listening without deleting the record", () => {
    vi.useFakeTimers(); const current = room({ messages: [message()] });
    const { result } = renderHook(() => useJudgePresentation(current, "Opening round", "opening"));
    expect(result.current.dialogue).toBe(message().text); expect(result.current.state).toBe("questioning");
    act(() => { vi.advanceTimersByTime(8001); });
    expect(result.current.state).toBe("listening"); expect(result.current.dialogue).toBe("Opening round");
    expect(current.judge?.messages).toHaveLength(1);
  });

  it("uses thinking for pending requests and reveals a saved question afterward", () => {
    const current = room({ pendingRequestId: "pending", mode: "demo" });
    const { result, rerender } = renderHook(({ value }) => useJudgePresentation(value, "Question round", "questions"), { initialProps: { value: current } });
    expect(result.current.state).toBe("thinking"); expect(result.current.label).toBe("DEMO · THINKING");
    const next = room({ preparingQuestions: true }); rerender({ value: next });
    expect(result.current.dialogue).toMatch(/answer clock starts/);
    const ready = room(); ready.debate = { ...ready.debate!, phase: "questions", turnIndex: 4, questions: [{ id: "q1", slot: "A", text: "What evidence supports that claim?", source: "ai" }] }; rerender({ value: ready });
    expect(result.current.dialogue).toBe("What evidence supports that claim?"); expect(result.current.label).toBe("AI CLARIFICATION");
    expect(result.current.state).toBe("questioning");
    ready.debate.questions[0].source = "demo"; rerender({ value: { ...ready } }); expect(result.current.label).toBe("DEMO CLARIFICATION");
    ready.debate.phase = "verdict"; rerender({ value: { ...ready } }); expect(result.current.state).toBe("idle");
  });

  it("preserves legacy preview behavior without enabled judge state", () => {
    const { result } = renderHook(() => useJudgePresentation(null, "Welcome", "welcome"));
    expect(result.current).toEqual({ dialogue: "Welcome", dialogueKey: "welcome", state: undefined, label: undefined });
  });

  it.each(themes)("supports all live judge reactions in $displayName without changing the artwork", theme => {
    const { rerender, container } = render(<DebateArena theme={theme} players={{ A: { name: "Avery" }, B: { name: "Blair" } }} dialogue="Considering both sides." dialogueKey="thinking" paused={false} judgeState="thinking" judgeLabel="THINKING"/>);
    for (const state of ["thinking", "questioning", "surprised", "speaking", "listening", "idle"] as const) {
      rerender(<DebateArena theme={theme} players={{ A: { name: "Avery" }, B: { name: "Blair" } }} dialogue="Considering both sides." dialogueKey={state} paused={false} judgeState={state} judgeLabel="AI RESPONSE"/>);
      expect(container.querySelector("[data-judge-id]")).toHaveAttribute("data-motion", state);
      expect(screen.getByRole("img", { name: theme.judge.description })).toBeInTheDocument();
    }
    rerender(<DebateArena theme={theme} players={{ A: { name: "Avery" }, B: { name: "Blair" } }} dialogue="Considering both sides." dialogueKey="pause" paused judgeState="thinking"/>);
    expect(container.querySelector("[data-judge-id]")).toHaveAttribute("data-paused", "true");
  });
});
