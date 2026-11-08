import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LegacyMultiplayerApp as MultiplayerApp } from "@/components/multiplayer-app";
import { useRoomClient } from "@/lib/room-client";
import type { DebateSnapshot } from "@/lib/debate-types";
import type { RoomSnapshot } from "@/lib/room-types";
import { themes } from "@/themes";

// Exercise app composition with authoritative snapshots. HTTP, authorization,
// clock recovery and Realtime have separate client/API/database tests.
vi.mock("@/lib/room-client", () => ({ useRoomClient: vi.fn() }));
const mockedClient = vi.mocked(useRoomClient);
const state = (overrides: Partial<DebateSnapshot> = {}): DebateSnapshot => ({ phase: "setup", topic: "Should lectures be recorded?", positionA: "Record all lectures", positionB: "Recording should be optional", revision: 3, approvedA: true, approvedB: false, changeRequest: null, activeSlot: null, turnIndex: null, turnDeadline: null, serverNow: "2030-01-01T00:00:00Z", startedAt: null, history: [], questions: [], ...overrides });
const room = (debate: DebateSnapshot, overrides: Partial<RoomSnapshot> = {}): RoomSnapshot => ({ id: "room-id", code: "ABC234", expiresAt: "2030-01-02T00:00:00Z", you: "A", players: [{ slot: "A", name: "Avery", ready: true, connected: true }, { slot: "B", name: "Blair", ready: true, connected: true }], bothReady: true, themeId: "jungle", themeLocked: debate.phase !== "setup", debate, ...overrides });
function client(current: RoomSnapshot) {
  return { room: current, loading: false, pending: false, judgePending: false, offline: false, live: true, error: "", remainingSeconds: 45,
    lawyerClocks: { A: 60, B: 60 }, proposeLawyerTopic: vi.fn().mockResolvedValue(true), setOwnPosition: vi.fn().mockResolvedValue(true), planDebate: vi.fn().mockResolvedValue(true), startLawyerDebate: vi.fn().mockResolvedValue(true), sendToLawyer: vi.fn().mockResolvedValue(true), consultLawyer: vi.fn().mockResolvedValue(true),
    listResults: vi.fn().mockResolvedValue([]), getResult: vi.fn().mockResolvedValue(null), acknowledgeResults: vi.fn().mockResolvedValue(null), requestRematch: vi.fn().mockResolvedValue(true), retryJury: vi.fn().mockResolvedValue(true),
    askJudge: vi.fn().mockResolvedValue(true),
    leaveRoom: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(true), create: vi.fn().mockResolvedValue(true), join: vi.fn().mockResolvedValue(true), setTheme: vi.fn().mockResolvedValue(true), setReady: vi.fn().mockResolvedValue(true), proposeTopic: vi.fn().mockResolvedValue(true), approveTopic: vi.fn().mockResolvedValue(true), requestChanges: vi.fn().mockResolvedValue(true), startDebate: vi.fn().mockResolvedValue(true), submitArgument: vi.fn().mockResolvedValue(true),
  };
}
beforeEach(() => { window.history.replaceState({}, "", "/"); });

describe("Stage 3 app composition", () => {
  it("does not label a pending judge request as an official argument submission", async () => {
    const user = userEvent.setup();
    const snapshot = room(state({ phase: "opening", approvedB: true, activeSlot: "A", turnIndex: 0, turnDeadline: "2030-01-01T00:00:45Z" }));
    snapshot.judge = { enabled: true, mode: "demo", messages: [], pendingRequestId: null, messagesUsed: 0, maxMessagesPerTurn: 2, needsWork: false, preparingQuestions: false };
    let current = client(snapshot); mockedClient.mockReturnValue(current);
    const view = render(<MultiplayerApp/>);
    const input = screen.getByRole("textbox", { name: "Your opening statement" });
    fireEvent.change(input, { target: { value: "My unfinished official argument." } });
    current = { ...current, pending: true, judgePending: true }; mockedClient.mockReturnValue(current); view.rerender(<MultiplayerApp/>);
    expect(screen.queryByRole("button", { name: "Submitting…" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit argument" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Judge is thinking/ })).toBeDisabled();
    expect(input).toBeEnabled(); expect(input).toHaveValue("My unfinished official argument.");
    expect(current.submitArgument).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "My completed official argument." } });
    current = { ...current, pending: false }; mockedClient.mockReturnValue(current); view.rerender(<MultiplayerApp/>);
    expect(screen.getByRole("button", { name: "Submit argument" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Submit argument" }));
    expect(current.submitArgument).toHaveBeenCalledExactlyOnceWith("My completed official argument.", 3, 0);
    current = { ...current, pending: true, judgePending: false }; mockedClient.mockReturnValue(current); view.rerender(<MultiplayerApp/>);
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ask Judge" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Judge is thinking/ })).not.toBeInTheDocument();
  });

  it("keeps judge messages separate from arguments and waits for saved clarification questions", async () => {
    const user = userEvent.setup();
    const snapshot = room(state({ phase: "opening", approvedB: true, activeSlot: "A", turnIndex: 0, turnDeadline: "2030-01-01T00:00:45Z" }));
    snapshot.judge = { enabled: true, mode: "demo", messages: [], pendingRequestId: null, messagesUsed: 0, maxMessagesPerTurn: 2, needsWork: false, preparingQuestions: false };
    let current = client(snapshot); mockedClient.mockReturnValue(current);
    const view = render(<MultiplayerApp/>);
    expect(screen.getByRole("button", { name: "Submit argument" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Message to the judge" }), "Help me clarify my position.");
    await user.click(screen.getByRole("button", { name: "Ask Judge" }));
    expect(current.askJudge).toHaveBeenCalledWith("Help me clarify my position.", 3, 0, expect.any(String));
    expect(current.submitArgument).not.toHaveBeenCalled();
    const asking = { ...snapshot, judge: { ...snapshot.judge, pendingRequestId: "request-1" } };
    current = client(asking); mockedClient.mockReturnValue(current); view.rerender(<MultiplayerApp/>);
    expect(view.container.querySelector("[data-judge-id]")).toHaveAttribute("data-motion", "thinking");
    expect(screen.getByRole("button", { name: /Judge is thinking/ })).toBeDisabled();
    const preparing = { ...snapshot, judge: { ...snapshot.judge, preparingQuestions: true }, debate: { ...snapshot.debate!, phase: "questions" as const, turnIndex: 4, activeSlot: null, turnDeadline: null } };
    current = client(preparing); mockedClient.mockReturnValue(current); view.rerender(<MultiplayerApp/>);
    expect(screen.getByRole("heading", { name: "The judge is preparing your questions" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Your answer" })).not.toBeInTheDocument();
    expect(view.container.querySelector(".turn-timer strong")).toHaveTextContent("…");
    const ready = { ...preparing, judge: { ...snapshot.judge, preparingQuestions: false }, debate: { ...preparing.debate, activeSlot: "A" as const, turnDeadline: "2030-01-01T00:01:30Z", questions: [{ id: "saved-q-a", slot: "A" as const, source: "ai" as const, text: "How would recordings affect participation?" }] } };
    current = { ...client(ready), remainingSeconds: 30 }; mockedClient.mockReturnValue(current); view.rerender(<MultiplayerApp/>);
    expect(screen.getByRole("textbox", { name: "Your answer" })).toBeInTheDocument();
    expect(screen.getByText("AI CLARIFICATION QUESTION")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("00:30");
    expect(screen.getByRole("log", { name: "Judge conversation" })).toBeInTheDocument();
  });

  it("connects host setup, proposal, readiness and start to the shared client callbacks", async () => {
    const user = userEvent.setup();
    let current = client(room(state())); mockedClient.mockReturnValue(current);
    const view = render(<MultiplayerApp/>);
    expect(screen.getByRole("radiogroup", { name: "Room theme" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Judge dialogue preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start debate" })).toBeDisabled();
    const topic = screen.getByRole("textbox", { name: /Debate topic/ });
    fireEvent.change(topic, { target: { value: "A revised topic" } });
    await user.click(screen.getByRole("button", { name: "Update proposal" }));
    expect(current.proposeTopic).toHaveBeenCalledWith("A revised topic", "Record all lectures", "Recording should be optional", 3);
    current = client(room(state({ approvedB: true, topic: "A revised topic", revision: 4 }))); mockedClient.mockReturnValue(current); view.rerender(<MultiplayerApp/>);
    await user.click(screen.getByRole("button", { name: "Start debate" })); expect(current.startDebate).toHaveBeenCalledWith(4);
    expect(screen.queryByRole("textbox", { name: "Your opening statement" })).not.toBeInTheDocument();
  });

  it("connects guest approval and change requests without exposing host controls", async () => {
    const user = userEvent.setup(); const current = client(room(state(), { you: "B" })); mockedClient.mockReturnValue(current);
    render(<MultiplayerApp/>);
    expect(screen.queryByRole("button", { name: "Start debate" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve topic and positions" })); expect(current.approveTopic).toHaveBeenCalledWith(3);
    await user.click(screen.getByRole("button", { name: "Request changes" }));
    fireEvent.change(screen.getByRole("textbox", { name: /What should change/ }), { target: { value: "Narrow the scope." } });
    await user.click(screen.getByRole("button", { name: "Send change request" })); expect(current.requestChanges).toHaveBeenCalledWith("Narrow the scope.", 3);
  });

  it.each(themes)("renders $displayName in an active round with locked theme and authoritative judge wording", async theme => {
    const user = userEvent.setup(); const current = client(room(state({ phase: "opening", approvedB: true, activeSlot: "A", turnIndex: 0 }), { themeId: theme.id })); mockedClient.mockReturnValue(current);
    const view = render(<MultiplayerApp/>);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByText("Theme locked for this debate")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Judge dialogue preview" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: theme.judge.description })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: theme.environmentLabel })).toHaveAttribute("data-theme", theme.id);
    const bubble = view.container.querySelector(".judge-speech")!;
    expect(bubble).toHaveTextContent("Should lectures be recorded?"); expect(bubble).toHaveTextContent("Avery");
    expect(screen.queryByRole("button", { name: /I’m ready|I’m not ready/ })).not.toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Your opening statement" });
    await user.type(input, "An opening argument."); await user.click(screen.getByRole("button", { name: "Submit argument" }));
    expect(current.submitArgument).toHaveBeenCalledWith("An opening argument.", 3, 0);
    await user.click(screen.getByRole("button", { name: "Pause animation" }));
    expect(screen.getByText("Pausing the artwork does not pause the shared turn clock.")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("00:45");
  });

  it("replaces drafts between server turns, reveals completed openings, and ends in a neutral record", () => {
    const openingA = { id: "a", slot: "A" as const, phase: "opening" as const, turnIndex: 0, text: "A recorded opening.", submittedAt: "2030-01-01T00:00:10Z", status: "submitted" as const };
    const openingB = { ...openingA, id: "b", slot: "B" as const, turnIndex: 1, text: "B recorded opening." };
    mockedClient.mockReturnValue(client(room(state({ phase: "opening", activeSlot: "A", turnIndex: 0 }))));
    const view = render(<MultiplayerApp/>);
    fireEvent.change(screen.getByRole("textbox", { name: "Your opening statement" }), { target: { value: "An unsent draft" } });
    mockedClient.mockReturnValue(client(room(state({ phase: "opening", activeSlot: "B", turnIndex: 1, history: [openingA] })))); view.rerender(<MultiplayerApp/>);
    expect(screen.queryByRole("textbox", { name: "Your opening statement" })).not.toBeInTheDocument();
    expect(screen.getByText("Private receipt")).toBeInTheDocument();
    mockedClient.mockReturnValue(client(room(state({ phase: "rebuttal", activeSlot: "A", turnIndex: 2, history: [openingA, openingB] })))); view.rerender(<MultiplayerApp/>);
    expect(screen.getByRole("textbox", { name: "Your rebuttal" })).toHaveValue("");
    expect(screen.getByText("B recorded opening.")).toBeInTheDocument();
    mockedClient.mockReturnValue(client(room(state({ phase: "questions", activeSlot: "A", turnIndex: 4, questions: [{ slot: "A", id: "q-a", text: "What would change your view?", source: "placeholder" }], history: [openingA, openingB] })))); view.rerender(<MultiplayerApp/>);
    expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue("");
    expect(screen.getByText("What would change your view?")).toBeInTheDocument();
    mockedClient.mockReturnValue(client(room(state({ phase: "verdict", history: [openingA, openingB] })))); view.rerender(<MultiplayerApp/>);
    expect(screen.getByRole("heading", { name: "The debate record is complete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit argument" })).not.toBeInTheDocument();
    expect(screen.getByText("Verdict placeholder — no winner has been selected.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Debate history" })).getByText("B recorded opening.")).toBeInTheDocument();
  });

  it("opens the start screen for a completed saved room instead of replaying its result", async () => {
    const saved = client(room(state({ phase: "verdict" })));
    mockedClient.mockReturnValue(saved);
    render(<MultiplayerApp/>);

    expect(await screen.findByRole("heading", { name: "Every great debate starts with hello." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume room" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "The debate record is complete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Your display name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create private room" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join private room" })).not.toBeInTheDocument();
    expect(saved.create).not.toHaveBeenCalled();
    expect(saved.join).not.toHaveBeenCalled();
    expect(saved.startDebate).not.toHaveBeenCalled();
  });

  it("returns to start and resumes the same saved history without a refresh bouncing it back", async () => {
    const user = userEvent.setup();
    const history = [{ id: "saved-opening", slot: "A" as const, phase: "opening" as const, turnIndex: 0, text: "Preserve this completed argument.", submittedAt: "2030-01-01T00:00:10Z", status: "submitted" as const }];
    mockedClient.mockReturnValue(client(room(state({ phase: "verdict", history }))));
    const view = render(<MultiplayerApp/>);

    await user.click(await screen.findByRole("button", { name: "Resume room" }));
    expect(await screen.findByRole("heading", { name: "The debate record is complete" })).toBeInTheDocument();
    expect(window.location.search).toBe("?room=ABC234");
    expect(screen.getByText("Preserve this completed argument.")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Back to start" }));
    expect(await screen.findByRole("heading", { name: "Every great debate starts with hello." })).toBeInTheDocument();
    expect(window.location.search).toBe("?start=1");
    expect(screen.queryByRole("region", { name: "Debate history" })).not.toBeInTheDocument();

    // A heartbeat or Realtime resync supplies a fresh object with the same room.
    // Navigation intent must survive it without changing stored debate history.
    mockedClient.mockReturnValue(client(room(state({ phase: "verdict", history, serverNow: "2030-01-01T00:01:00Z" }))));
    view.rerender(<MultiplayerApp/>);
    expect(screen.getByRole("button", { name: "Resume room" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "The debate record is complete" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resume room" }));
    expect(await screen.findByRole("heading", { name: "The debate record is complete" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Debate history" })).getByText("Preserve this completed argument.")).toBeInTheDocument();
    expect(window.location.search).toBe("?room=ABC234");
  });

  it("restores a completed debate directly when refreshing its explicit room URL", async () => {
    window.history.replaceState({}, "", "/?room=ABC234");
    mockedClient.mockReturnValue(client(room(state({ phase: "verdict" }))));
    const view = render(<MultiplayerApp/>);
    expect(await screen.findByRole("heading", { name: "The debate record is complete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume room" })).not.toBeInTheDocument();
    view.unmount();

    render(<MultiplayerApp/>);
    expect(await screen.findByRole("heading", { name: "The debate record is complete" })).toBeInTheDocument();
    expect(window.location.search).toBe("?room=ABC234");
    expect(screen.getByText("Verdict placeholder — no winner has been selected.")).toBeInTheDocument();
  });

  it("honors an explicit start view during an active debate and resumes its current turn", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/?start=1");
    const saved = client(room(state({ phase: "rebuttal", activeSlot: "A", turnIndex: 2, turnDeadline: "2030-01-01T00:00:45Z" })));
    mockedClient.mockReturnValue(saved);
    render(<MultiplayerApp/>);

    expect(await screen.findByRole("heading", { name: "Every great debate starts with hello." })).toBeInTheDocument();
    expect(screen.getByText("Returning to start does not pause a live debate.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Your rebuttal" })).not.toBeInTheDocument();
    expect(saved.startDebate).not.toHaveBeenCalled();
    expect(saved.submitArgument).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Resume room" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Your rebuttal" })).toBeEnabled());
    expect(screen.getByRole("timer")).toHaveTextContent("00:45");
    expect(window.location.search).toBe("?room=ABC234");
  });
});
