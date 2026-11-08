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
    askJudge: vi.fn().mockResolvedValue(true), proposeTopic: vi.fn().mockResolvedValue(true), approveTopic: vi.fn().mockResolvedValue(true), requestChanges: vi.fn().mockResolvedValue(true), startDebate: vi.fn().mockResolvedValue(true), submitArgument: vi.fn().mockResolvedValue(true), ...overrides,
  };
}
const tree = () => <DisplayPreferencesProvider><Page/></DisplayPreferencesProvider>;
beforeEach(() => { window.history.replaceState({}, "", "/"); window.localStorage.clear(); });

describe("Public Stage 5 application", () => {
  it("opens the Courtroom welcome view with Settings navigation and no inline theme picker or old debate controls", () => {
    mockedClient.mockReturnValue(client(null)); const view = render(tree());
    expect(view.container.querySelector(".theme-shell")).toHaveAttribute("data-theme", "courtroom");
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getByRole("button", { name: /Preview themes in Settings/ })).toHaveAttribute("aria-haspopup", "dialog");
    expect(view.container.querySelector(".theme-shell")).toHaveClass("theme-shell--fit");
    expect(screen.queryByRole("radiogroup", { name: "Room theme" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create private room" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Ask Judge|Objection|Submit argument/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Art preview/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quarrel home" })).toHaveTextContent("Quarrel");
    for (const region of [document.querySelector("header.site-header"), document.querySelector(".lobby-title")]) expect(region).not.toHaveTextContent(/quarrel\.io|STAGE 05|Digital Sidekick|A fair hearing|Your voice\.|Equal consideration/i);
    expect(document.querySelector(".site-footer")).toBeNull();
    expect(screen.queryByRole("button", { name: /Pause animation/ })).not.toBeInTheDocument();
  });

  it("opens Settings as a popup over the lobby with the shared theme picker, and closes it again", async () => {
    const user = userEvent.setup(); const session = client(room()); mockedClient.mockReturnValue(session);
    window.history.replaceState({}, "", "/?room=ABC234"); render(tree());
    const dialog = document.querySelector("dialog.settings-dialog")!;
    expect(dialog).not.toHaveAttribute("open");
    expect(screen.queryByRole("radiogroup", { name: "Room theme" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(dialog).toHaveAttribute("open");
    const panel = within(dialog as HTMLElement);
    expect(panel.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await user.click(panel.getByRole("radio", { name: "Detective theme" }));
    expect(session.setTheme).toHaveBeenCalledExactlyOnceWith("detective");
    expect(panel.getByRole("checkbox", { name: /Pause artwork animations/ })).not.toBeChecked();
    await user.click(panel.getByRole("button", { name: "Done" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Prepare your debate" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Preview themes in Settings/ }));
    expect(dialog).toHaveAttribute("open");
    await user.click(within(dialog as HTMLElement).getByRole("button", { name: "Close settings" }));
    expect(dialog).not.toHaveAttribute("open");
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

  it("shows the game without a header: logo plus a menu holding room controls, closed by Escape", async () => {
    const user = userEvent.setup(); mockedClient.mockReturnValue(client(room(active()))); const view = render(tree());
    expect(view.container.querySelector(".game-shell")).not.toHaveClass("game-shell--entering");
    expect(screen.getByRole("link", { name: "Quarrel home" })).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Menu/ });
    expect(toggle).toHaveTextContent("ABC234"); expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Copy invite link" })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Copy invite link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave this room" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false"); expect(toggle).toHaveFocus();
    await user.click(toggle); await user.click(document.body);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("plays the entrance only when this tab moves from the lobby into the game", () => {
    let session = client(room()); mockedClient.mockReturnValue(session); window.history.replaceState({}, "", "/?room=ABC234"); const view = render(tree());
    expect(view.container.querySelector(".theme-shell--fit")).not.toBeNull();
    session = client(room(active())); mockedClient.mockReturnValue(session); view.rerender(tree());
    expect(view.container.querySelector(".game-shell")).toHaveClass("game-shell--entering");
  });

  it("opens the Settings popup from a running debate without leaving the courtroom", async () => {
    const user = userEvent.setup(); mockedClient.mockReturnValue(client(room(active(), { themeLocked: true }))); render(tree());
    const dialog = document.querySelector("dialog.settings-dialog")!;
    expect(screen.queryByRole("button", { name: /Settings · Courtroom|Display settings/ })).not.toBeInTheDocument();
    expect(document.querySelector("header.site-header")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Menu/ }));
    expect(screen.getAllByRole("button", { name: /Settings/ })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(dialog).toHaveAttribute("open");
    for (const card of within(dialog as HTMLElement).getAllByRole("radio")) expect(card).toBeDisabled();
    expect(within(dialog as HTMLElement).getByText(/The debate has started, so its theme is locked/)).toBeInTheDocument();
    await user.click(within(dialog as HTMLElement).getByRole("button", { name: "Close settings" }));
    expect(dialog).not.toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: /Menu/ }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByRole("timer", { name: "Player A: 47 seconds remaining" })).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /Menu/ })); await user.click(screen.getByRole("button", { name: "Back to start" })); expect(screen.getByRole("button", { name: "Resume room" })).toBeInTheDocument(); expect(window.location.search).toBe("?start=1");
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
