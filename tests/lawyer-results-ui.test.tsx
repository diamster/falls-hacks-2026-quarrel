import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PreviousDebates, SavedVerdict } from "@/components/lawyer-results";
import type { LawyerResultDetail } from "@/lib/lawyer-types";

const record: LawyerResultDetail = {
  id: "old-debate", roomId: "old-room", topic: "Recorded lectures?", themeId: "courtroom", totalSeconds: 120, startedAt: "2030-01-01T00:00:00Z", completedAt: "2030-01-01T00:04:00Z", positions: { A: "Record them", B: "Do not record" }, players: [{ slot: "A", name: "Avery" }, { slot: "B", name: "Blair" }],
  verdict: { outcome: "split", decision: "inconclusive", reasoning: "More evidence is needed.", perSubtopic: [] }, acknowledgements: { A: "2030-01-01", B: null }, rematch: { A: null, B: null, nextDebateId: "new-debate" }, subtopics: [{ ordinal: 1, question: "How does attendance matter?", secondsPerPlayer: 60, summary: "Both sides discussed participation." }],
  history: [{ id: "argument-1", label: "S1-A", kind: "argument", slot: "A", subtopic: 1, status: "complete", source: "ai", text: "Recordings support review.", createdAt: "2030-01-01T00:00:10Z", completedAt: "2030-01-01T00:00:12Z" }, { id: "summary-1", label: "S1-S", kind: "judge_summary", slot: null, subtopic: 1, status: "complete", source: "ai", text: "Both sides discussed participation.", createdAt: "2030-01-01T00:00:30Z", completedAt: "2030-01-01T00:00:31Z" }],
};

describe("Stage 6B previous results", () => {
  it("loads only on request and keeps archive navigation read-only", async () => {
    const user = userEvent.setup(); const listResults = vi.fn().mockResolvedValue([record]); const getResult = vi.fn().mockResolvedValue(record);
    render(<PreviousDebates listResults={listResults} getResult={getResult}/>); expect(listResults).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Previous debates" })); expect(listResults).toHaveBeenCalledExactlyOnceWith();
    await user.selectOptions(screen.getByRole("combobox", { name: "Saved debate" }), "old-debate"); expect(getResult).toHaveBeenCalledExactlyOnceWith("old-debate");
    const archive = screen.getByRole("article", { name: "Archived verdict" }); expect(archive).toHaveTextContent("The evidence is inconclusive"); expect(archive).toHaveTextContent("Recordings support review.");
    expect(screen.queryByRole("button", { name: "Request rematch" })).not.toBeInTheDocument(); expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Review archived messages" }), "summaries"); expect(archive).toHaveTextContent("Both sides discussed participation."); expect(archive).not.toHaveTextContent("Recordings support review.");
    await user.selectOptions(screen.getByRole("combobox", { name: "Review archived messages" }), "1"); expect(archive).toHaveTextContent("Recordings support review.");
    await user.click(screen.getByRole("button", { name: "Close previous debates" })); expect(screen.queryByRole("article", { name: "Archived verdict" })).not.toBeInTheDocument();
  });

  it("shows empty and recoverable failed archive reads", async () => {
    const user = userEvent.setup(); const listResults = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce([]).mockResolvedValue([record]); const getResult = vi.fn().mockResolvedValue(null);
    render(<PreviousDebates listResults={listResults} getResult={getResult}/>);
    await user.click(screen.getByRole("button", { name: "Previous debates" })); expect(screen.getByRole("alert")).toHaveTextContent("Previous results could not be loaded");
    await user.click(screen.getByRole("button", { name: "Close previous debates" })); await user.click(screen.getByRole("button", { name: "Previous debates" })); expect(screen.getByText("No completed debates yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close previous debates" })); await user.click(screen.getByRole("button", { name: "Previous debates" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Saved debate" }), "old-debate"); expect(screen.getByRole("alert")).toHaveTextContent("saved result is unavailable");
  });

  it("ignores an archive response after the reader closes the panel", async () => {
    let resolve!: (value: LawyerResultDetail[]) => void; const listResults = vi.fn(() => new Promise<LawyerResultDetail[]>(done => { resolve = done; }));
    render(<PreviousDebates listResults={listResults} getResult={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button", { name: "Previous debates" })); expect(screen.getByRole("status")).toHaveTextContent("Loading");
    fireEvent.click(screen.getByRole("button", { name: "Close previous debates" })); resolve([record]);
    expect(screen.queryByRole("combobox", { name: "Saved debate" })).not.toBeInTheDocument();
  });

  it.each(["A", "B"] as const)("renders the named %s verdict without needing optional legacy fields", slot => {
    render(<SavedVerdict verdict={{ outcome: slot, reasoning: "The presented reasoning is stronger.", perSubtopic: [] }} players={record.players}/>);
    expect(screen.getByRole("heading", { name: `The stronger presented case: ${slot === "A" ? "Avery" : "Blair"}` })).toBeInTheDocument();
  });
});
