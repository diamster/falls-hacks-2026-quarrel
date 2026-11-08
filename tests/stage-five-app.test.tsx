import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "@/app/page";
import { DisplayPreferencesProvider, displayPreferencesKey } from "@/components/display-preferences";
import { useRoomClient } from "@/lib/room-client";
import type { LawyerDebateSnapshot } from "@/lib/lawyer-types";
import type { RoomSnapshot } from "@/lib/room-types";

vi.mock("@/lib/room-client", () => ({ useRoomClient: vi.fn() }));
const mockedClient = vi.mocked(useRoomClient);

function debate(overrides: Partial<LawyerDebateSnapshot> = {}): LawyerDebateSnapshot {
  return { format: "lawyer", phase: "setup", topic: "Should lectures be mandatory?", totalSeconds: 120, revision: 2, positionA: "Attendance should be mandatory.", positionB: "Attendance should be optional.", confirmedA: true, confirmedB: true, planReady: false, planGeneration: 0, regenerationUsed: false, subtopics: [{ ordinal: 1, question: "How does attendance affect participation?", secondsPerPlayer: 60, openerSlot: "A", source: "ai", status: "pending", remainingMsA: 60000, remainingMsB: 60000 }, { ordinal: 2, question: "What flexibility do students need?", secondsPerPlayer: 60, openerSlot: "B", source: "ai", status: "pending", remainingMsA: 60000, remainingMsB: 60000 }], currentSubtopic: null, state: null, activeSlot: null, turnDeadline: null, remainingMsA: 60000, remainingMsB: 60000, serverNow: "2030-01-01T00:00:00Z", startedAt: null, history: [], consultations: [], verdict: null, ownMessageCount: 0, ownConsultationCount: 0, needsWork: false, ...overrides };
}
function room(lawyer = debate(), overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return { id: "stage5-room", code: "ABC234", expiresAt: "2030-01-02T00:00:00Z", you: "A", players: [{ name: "Avery", slot: "A", connected: true, ready: false }, { name: "Blair", slot: "B", connected: true, ready: false }], bothReady: false, themeId: "courtroom", themeLocked: false, lawyer, ...overrides };
}
function active(overrides: Partial<LawyerDebateSnapshot> = {}) { return debate({ phase: "subtopic", currentSubtopic: 1, activeSlot: "A", state: "composing", startedAt: "2030-01-01T00:00:00Z", planReady: true, turnDeadline: "2030-01-01T00:01:00Z", ...overrides }); }
function client(current: RoomSnapshot | null, overrides = {}) {
  return { room: current, loading: false, pending: false, offline: false, live: true, error: "", remainingSeconds: 0, lawyerClocks: { A: 47, B: 60 }, judgePending: false,
    refresh: vi.fn().mockResolvedValue(true), create: vi.fn().mockResolvedValue(true), join: vi.fn().mockResolvedValue(true), leaveRoom: vi.fn().mockResolvedValue(true), setTheme: vi.fn().mockResolvedValue(true), setReady: vi.fn().mockResolvedValue(true),
    proposeLawyerTopic: vi.fn().mockResolvedValue(true), setOwnPosition: vi.fn().mockResolvedValue(true), planDebate: vi.fn().mockResolvedValue(true), startLawyerDebate: vi.fn().mockResolvedValue(true), sendToLawyer: vi.fn().mockResolvedValue(true), consultLawyer: vi.fn().mockResolvedValue(true),
    listResults: vi.fn().mockResolvedValue([]), getResult: vi.fn().mockResolvedValue(null), acknowledgeResults: vi.fn().mockResolvedValue(null), requestRematch: vi.fn().mockResolvedValue(true), retryJury: vi.fn().mockResolvedValue(true),
    askJudge: vi.fn().mockResolvedValue(true), proposeTopic: vi.fn().mockResolvedValue(true), approveTopic: vi.fn().mockResolvedValue(true), requestChanges: vi.fn().mockResolvedValue(true), startDebate: vi.fn().mockResolvedValue(true), submitArgument: vi.fn().mockResolvedValue(true), ...overrides,
  };
}
const tree = () => <DisplayPreferencesProvider><Page/></DisplayPreferencesProvider>;
beforeEach(() => { window.history.replaceState({}, "", "/"); window.localStorage.clear(); });

describe("Public Stage 5 application", () => {
  it("opens the Courtroom welcome view with Settings navigation and no inline theme picker or old debate controls", () => {
    mockedClient.mockReturnValue(client(null)); const view = render(tree());
    expect(view.container.querySelector(".theme-shell")).toHaveAttribute("data-theme", "courtroom");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: /Preview themes in Settings/ })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("radiogroup", { name: "Room theme" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create private room" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Ask Judge|Objection|Submit argument/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Art preview/ })).toHaveAttribute("href", "/preview");
  });

  it("creates a room and exposes independently owned setup and readiness", async () => {
    const user = userEvent.setup(); let session = client(null); mockedClient.mockReturnValue(session); const view = render(tree());
    fireEvent.change(screen.getByRole("textbox", { name: "Your display name" }), { target: { value: "  Avery  " } });
    await user.click(screen.getByRole("button", { name: "Create private room" })); expect(session.create).toHaveBeenCalledExactlyOnceWith("Avery");
    session = client(room(debate({ topic: null, positionA: null, positionB: null, confirmedA: false, confirmedB: false, revision: 0 }))); mockedClient.mockReturnValue(session); view.rerender(tree());
    expect(screen.getByRole("heading", { name: "Prepare your debate" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Debate topic/ })).toBeInTheDocument(); expect(screen.queryByRole("textbox", { name: /Your position/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I’m ready" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /Debate topic/ }), { target: { value: "Should lectures be recorded?" } });
    await user.selectOptions(screen.getByRole("combobox", { name: /Writing time per player/ }), "240");
    await user.click(screen.getByRole("button", { name: "Save topic and time" })); expect(session.proposeLawyerTopic).toHaveBeenCalledWith("Should lectures be recorded?", 240, 0);
    session = client(room()); mockedClient.mockReturnValue(session); view.rerender(tree());
    expect(screen.getByRole("textbox", { name: /Your position/ })).toHaveValue("Attendance should be mandatory.");
    await user.click(screen.getByRole("button", { name: "I’m ready" })); expect(session.setReady).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.getByRole("textbox", { name: "Shareable invitation" })).toHaveValue(`${window.location.origin}/share/?room=ABC234`);
    expect(window.location.search).toBe("?room=ABC234");
  });

  it("joins an invitation as B without host editing controls and retains the selected room theme", async () => {
    window.history.replaceState({}, "", "/?room=ABC234"); const user = userEvent.setup(); let session = client(null); mockedClient.mockReturnValue(session); const view = render(tree());
    expect(screen.getByRole("textbox", { name: "Six-character room code" })).toHaveValue("ABC234");
    fireEvent.change(screen.getByRole("textbox", { name: "Your display name" }), { target: { value: "Blair" } }); await user.click(screen.getByRole("button", { name: "Join private room" }));
    expect(session.join).toHaveBeenCalledExactlyOnceWith("ABC234", "Blair");
    session = client(room(debate(), { you: "B", themeId: "detective" })); mockedClient.mockReturnValue(session); view.rerender(tree());
    expect(view.container.querySelector(".theme-shell")).toHaveAttribute("data-theme", "detective");
    expect(screen.getByRole("textbox", { name: /Your position/ })).toHaveValue("Attendance should be optional.");
    expect(screen.queryByRole("textbox", { name: /Debate topic/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start debate" })).not.toBeInTheDocument();
  });

  it("keeps planning in the lobby and starts only the shown generation of the shared plan", async () => {
    const user = userEvent.setup(); const session = client(room(debate({ phase: "planning", planReady: true, planGeneration: 1 }), { bothReady: true })); mockedClient.mockReturnValue(session); render(tree());
    expect(screen.getByRole("button", { name: "I’m ready" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Argument for my lawyer/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Regenerate plan once" })); expect(session.planDebate).toHaveBeenCalledExactlyOnceWith(2, true);
    await user.click(screen.getByRole("button", { name: "Start debate" })); expect(session.startLawyerDebate).toHaveBeenCalledExactlyOnceWith(2, 1);
    expect(session.startDebate).not.toHaveBeenCalled();
  });

  it("uses Stage 5 clocks, public presentations and a separate private consultation action", async () => {
    const user = userEvent.setup(); const session = client(room(active(), { themeLocked: true })); mockedClient.mockReturnValue(session); render(tree());
    expect(screen.getByRole("timer", { name: "Player A: 47 seconds remaining" })).toHaveTextContent("00:47");
    expect(screen.getByRole("log", { name: "Public debate messages" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /Argument for my lawyer/ }), { target: { value: "My attendance argument" } });
    await user.click(screen.getByRole("button", { name: "Present my argument" })); expect(session.sendToLawyer).toHaveBeenCalledWith("My attendance argument", 2, 1, expect.any(String));
    await user.click(screen.getByText("Ask my lawyer privately", { selector: "summary span" })); fireEvent.change(screen.getByRole("textbox", { name: /Private message to my lawyer/ }), { target: { value: "Help organize this" } });
    await user.click(screen.getByRole("button", { name: "Ask my lawyer privately" })); expect(session.consultLawyer).toHaveBeenCalledWith("Help organize this", 2, 1, expect.any(String));
    expect(session.askJudge).not.toHaveBeenCalled(); expect(session.submitArgument).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Ask Judge|Objection/ })).not.toBeInTheDocument();
  });

  it("opens completed saved rooms on the start view, supports resume, and respects explicit completed-room refresh", async () => {
    const user = userEvent.setup(); const completed = room(active({ phase: "complete", state: null, activeSlot: null, verdict: { outcome: "split", reasoning: "Two reasonable positions remain.", perSubtopic: [] } }), { themeId: "superhero" });
    mockedClient.mockReturnValue(client(completed)); const view = render(tree());
    expect(screen.getByRole("heading", { name: "Your room is saved" })).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "Split decision / inconclusive" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume room" })); expect(screen.getByRole("heading", { name: "Split decision / inconclusive" })).toBeInTheDocument();
    expect(view.container.querySelector(".theme-shell")).toHaveAttribute("data-theme", "superhero"); expect(window.location.search).toBe("?room=ABC234");
    view.unmount(); render(tree()); expect(screen.getByRole("heading", { name: "Split decision / inconclusive" })).toBeInTheDocument();
  });

  it("keeps the explicit start view through snapshot updates and lets the user resume the live room", async () => {
    window.history.replaceState({}, "", "/?start=1"); const user = userEvent.setup(); let session = client(room(active())); mockedClient.mockReturnValue(session); const view = render(tree());
    expect(screen.queryByRole("textbox", { name: /Argument for my lawyer/ })).not.toBeInTheDocument();
    session = client(room(active({ activeSlot: "B" }))); mockedClient.mockReturnValue(session); view.rerender(tree());
    expect(screen.getByRole("button", { name: "Resume room" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume room" })); expect(screen.getByRole("textbox", { name: /Argument for my lawyer/ })).toBeDisabled();
    await user.click(screen.getByRole("link", { name: "Back to start" })); expect(screen.getByRole("button", { name: "Resume room" })).toBeInTheDocument(); expect(window.location.search).toBe("?start=1");
  });

  it("requires leave confirmation before creating another room and keeps a failed leave recoverable", async () => {
    window.history.replaceState({}, "", "/?start=1"); const user = userEvent.setup(); let session = client(room()); session.leaveRoom.mockResolvedValueOnce(false).mockResolvedValueOnce(true); mockedClient.mockReturnValue(session); const view = render(tree());
    await user.click(screen.getByRole("button", { name: "Create or join another room" })); expect(session.leaveRoom).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" })); expect(screen.getByRole("button", { name: "Resume room" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create or join another room" })); await user.click(screen.getByRole("button", { name: "Leave room" }));
    expect(screen.getByRole("button", { name: "Resume room" })).toBeInTheDocument(); expect(session.leaveRoom).toHaveBeenCalledWith("stage5-room");
    await user.click(screen.getByRole("button", { name: "Leave room" })); session = client(null); mockedClient.mockReturnValue(session); view.rerender(tree());
    expect(screen.getByRole("button", { name: "Create private room" })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Resume room" })).not.toBeInTheDocument();
  });

  it("preserves legacy records as read-only and does not restore obsolete judge or turn controls", () => {
    const legacy = room(); delete legacy.lawyer; legacy.themeId = "jungle";
    legacy.debate = { phase: "opening", topic: "An older topic", positionA: "Old A", positionB: "Old B", revision: 1, approvedA: true, approvedB: true, changeRequest: null, activeSlot: "A", turnIndex: 0, turnDeadline: "2030-01-01T00:00:45Z", serverNow: "2030-01-01T00:00:00Z", startedAt: "2030-01-01T00:00:00Z", history: [{ id: "old-entry", slot: "A", phase: "opening", turnIndex: 0, text: "An older saved argument", submittedAt: "2030-01-01T00:00:01Z", status: "submitted" }], questions: [] };
    const session = client(legacy); mockedClient.mockReturnValue(session); const view = render(tree());
    expect(screen.getByRole("heading", { name: "Earlier debate record" })).toBeInTheDocument(); expect(screen.getByText("An older saved argument")).toBeInTheDocument();
    expect(view.container.querySelector(".theme-shell")).toHaveAttribute("data-theme", "jungle");
    expect(screen.queryByRole("textbox", { name: /Your opening statement|Message to the judge|Argument for my lawyer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ask Judge|Objection|I’m ready|Start debate/ })).not.toBeInTheDocument();
    expect(session.askJudge).not.toHaveBeenCalled();
  });

  it("applies the persisted personal animation preference without changing room state", () => {
    window.localStorage.setItem(displayPreferencesKey, JSON.stringify({ pauseAnimations: true, reducedMotion: false, textSize: "large" })); const session = client(room(active())); mockedClient.mockReturnValue(session); const view = render(tree());
    expect(view.container.querySelector(".display-preferences")).toHaveAttribute("data-text-size", "large");
    const arena = screen.getByRole("region", { name: getThemeName() }); expect(arena).toHaveAttribute("data-paused", "true");
    expect(session.setTheme).not.toHaveBeenCalled(); expect(session.setReady).not.toHaveBeenCalled();
    expect(within(arena).getByRole("status")).toBeInTheDocument();
  });
});

function getThemeName() { return "Traditional pixel-art courtroom"; }

describe("Stage 6B room lifecycle integration", () => {
  it.each(["A", "B"] as const)("restores %s to new setup after the authoritative mutual rematch snapshot", async you => {
    window.history.replaceState({}, "", "/?room=ABC234");
    const user = userEvent.setup();
    const finished = active({ debateId: "finished-debate", phase: "complete", state: null, activeSlot: null, verdict: { outcome: "split", decision: "inconclusive", reasoning: "Both sides need evidence.", perSubtopic: [] }, acknowledgements: { A: null, B: null }, rematch: { A: you === "B" ? "2030-01-01" : null, B: you === "A" ? "2030-01-01" : null, nextDebateId: null } });
    let session = client(room(finished, { you, themeId: "detective" })); mockedClient.mockReturnValue(session); const view = render(tree());
    await user.click(screen.getByRole("button", { name: "Acknowledge results" })); expect(session.acknowledgeResults).toHaveBeenCalledWith("finished-debate");
    await user.click(screen.getByRole("button", { name: "Approve rematch" })); expect(session.requestRematch).toHaveBeenCalledWith("finished-debate");
    expect(screen.getByRole("heading", { name: "The evidence is inconclusive" })).toBeInTheDocument();
    session = client(room(debate({ debateId: "new-debate", topic: null, positionA: null, positionB: null, confirmedA: false, confirmedB: false, history: [], consultations: [] }), { you, themeId: "detective" })); mockedClient.mockReturnValue(session); view.rerender(tree());
    expect(screen.getByRole("heading", { name: "Prepare your debate" })).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "The evidence is inconclusive" })).not.toBeInTheDocument();
    expect(view.container.querySelector(".theme-shell")).toHaveAttribute("data-theme", "detective"); expect(screen.getByRole("button", { name: "Previous debates" })).toBeInTheDocument();
    if (you === "A") expect(screen.getByRole("textbox", { name: /Debate topic/ })).toHaveValue("");
    else expect(screen.getByText("Waiting for the host to propose a topic")).toBeInTheDocument();
  });
});
