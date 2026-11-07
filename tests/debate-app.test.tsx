import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MultiplayerApp } from "@/components/multiplayer-app";
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
  return { room: current, loading: false, pending: false, offline: false, live: true, error: "", remainingSeconds: 45,
    refresh: vi.fn().mockResolvedValue(true), create: vi.fn().mockResolvedValue(true), join: vi.fn().mockResolvedValue(true), setTheme: vi.fn().mockResolvedValue(true), setReady: vi.fn().mockResolvedValue(true), proposeTopic: vi.fn().mockResolvedValue(true), approveTopic: vi.fn().mockResolvedValue(true), requestChanges: vi.fn().mockResolvedValue(true), startDebate: vi.fn().mockResolvedValue(true), submitArgument: vi.fn().mockResolvedValue(true),
  };
}
beforeEach(() => { window.history.replaceState({}, "", "/"); });

describe("Stage 3 app composition", () => {
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
});
