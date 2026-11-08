import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LawyerDebateView } from "@/components/lawyer-debate";
import { getTheme } from "@/themes";
import type { LawyerDebateSnapshot } from "@/lib/lawyer-types";
import type { RoomSnapshot } from "@/lib/room-types";
import type { PublicSpeechItem } from "@/lib/character-speech";

const playback = vi.hoisted(() => ({ status: "idle", active: null as PublicSpeechItem | null }));
vi.mock("@/components/character-speech", async importOriginal => ({
  ...await importOriginal<typeof import("@/components/character-speech")>(),
  useCharacterSpeech: () => playback,
}));
const debate: LawyerDebateSnapshot = { format: "lawyer", debateId: "current-debate", reliabilityVersion: 2, phase: "subtopic", topic: "Lecture recordings", totalSeconds: 120, revision: 1, positionA: "Record lectures", positionB: "Keep lectures private", confirmedA: true, confirmedB: true, planReady: true, regenerationUsed: false, planGeneration: 1, subtopics: [], currentSubtopic: 1, state: "composing", activeSlot: "A", turnDeadline: "2030-01-01T00:01:00Z", remainingMsA: 45000, remainingMsB: 60000, serverNow: "2030-01-01T00:00:15Z", startedAt: "2030-01-01T00:00:00Z", history: [], consultations: [], verdict: null, ownMessageCount: 0, ownConsultationCount: 0, needsWork: false };
const room: RoomSnapshot = { id: "current-room", code: "ABC234", you: "A", themeId: "courtroom", themeLocked: true, expiresAt: "2030-01-02T00:00:00Z", bothReady: true, players: [{ slot: "A", name: "Avery", ready: true, connected: true }, { slot: "B", name: "Blair", ready: true, connected: true }], lawyer: debate };
const props = () => ({ room, theme: getTheme("courtroom"), clocks: { A: 45, B: 60 }, pending: false, offline: false, onSend: vi.fn().mockResolvedValue(true), onConsult: vi.fn().mockResolvedValue(true) });
beforeEach(() => { playback.status = "idle"; playback.active = null; });

describe("Stage 6B canonical speech presentation", () => {
  it.each(["lawyerA", "lawyerB"] as const)("animates %s only during actual playback without changing composing controls", role => {
    playback.status = "speaking"; playback.active = { roomId: room.id, debateId: debate.debateId!, themeId: "courtroom", messageId: "saved-message", role, text: "These exact words were saved publicly." };
    const handlers = props(); handlers.room = { ...room, lawyer: { ...debate, history: [{ id: "saved-message", label: "S1-PUBLIC", kind: "argument", slot: role === "lawyerA" ? "A" : "B", subtopic: 1, text: playback.active.text, status: "complete", source: "ai", createdAt: debate.serverNow, completedAt: debate.serverNow }] } }; const view = render(<LawyerDebateView {...handlers}/>);
    expect(view.container.querySelectorAll('[data-speaking="true"]')).toHaveLength(1); expect(screen.getByRole("region", { name: "Current public message" })).toHaveTextContent("These exact words were saved publicly.");
    expect(screen.getByRole("textbox", { name: /Argument for my lawyer/ })).toBeEnabled(); expect(screen.getByRole("timer", { name: "Player A: 45 seconds remaining" })).toHaveTextContent("00:45");
    expect(handlers.onSend).not.toHaveBeenCalled(); expect(handlers.onConsult).not.toHaveBeenCalled();
    playback.status = "paused"; view.rerender(<LawyerDebateView {...handlers}/>); expect(view.container.querySelectorAll('[data-speaking="true"]')).toHaveLength(0); expect(screen.getByRole("region", { name: "Current public message" })).toHaveTextContent("These exact words were saved publicly.");
  });
  it("uses the saved judge message in the bubble and returns to listening on stop", () => {
    playback.status = "speaking"; playback.active = { roomId: room.id, debateId: debate.debateId!, themeId: "courtroom", messageId: "saved-summary", role: "judge", text: "Both participants discussed attendance fairly." };
    const handlers = props(); const view = render(<LawyerDebateView {...handlers}/>);
    expect(view.container.querySelector('.character--lemur')).toHaveAttribute("data-state", "speaking"); expect(view.container.querySelector('.speech-text')).toHaveTextContent(playback.active.text);
    playback.status = "idle"; playback.active = null; view.rerender(<LawyerDebateView {...handlers}/>); expect(view.container.querySelector('.character--lemur')).toHaveAttribute("data-state", "listening");
  });
  it("does not animate current characters with an archived message from a different debate", () => {
    playback.status = "speaking"; playback.active = { roomId: room.id, debateId: "previous-debate", themeId: "courtroom", messageId: "old-summary", role: "judge", text: "Older saved speech" };
    const view = render(<LawyerDebateView {...props()}/>); expect(view.container.querySelector('.character--lemur')).toHaveAttribute("data-state", "listening"); expect(screen.queryByText("Older saved speech")).not.toBeInTheDocument();
  });
});
