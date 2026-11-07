import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DebateHistoryPanel } from "@/components/debate-history-panel";

function transcript(ids: string[]) {
  return <ol>{ids.map(id => <li key={id}>{id}</li>)}</ol>;
}

function dimensions(element: HTMLElement, height: number, viewport = 300) {
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: height });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: viewport });
}

describe("Public debate history panel", () => {
  it("renders a labelled public record in supplied chronological order with the current subtopic", () => {
    render(<DebateHistoryPanel latestMessageId="summary" currentSubtopic="What does flexibility change?">{transcript(["Player A argument", "Player B presentation", "Judge summary"])}</DebateHistoryPanel>);
    expect(screen.getByRole("complementary", { name: "Debate history" })).toBeInTheDocument();
    const log = screen.getByRole("log", { name: "Public debate messages" });
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log).toHaveAttribute("tabindex", "0");
    expect(within(log).getAllByRole("listitem").map(item => item.textContent)).toEqual(["Player A argument", "Player B presentation", "Judge summary"]);
    expect(screen.getByText("What does flexibility change?")).toBeInTheDocument();
    expect(screen.getByText("Shared with both players. Private consultations stay separate.")).toBeInTheDocument();
  });

  it("follows new messages while the reader is already near the bottom", () => {
    const view = render(<DebateHistoryPanel latestMessageId="first">{transcript(["first"])}</DebateHistoryPanel>);
    const log = screen.getByRole("log");
    dimensions(log, 900);
    log.scrollTop = 570;
    fireEvent.scroll(log);
    dimensions(log, 1100);
    view.rerender(<DebateHistoryPanel latestMessageId="second">{transcript(["first", "second"])}</DebateHistoryPanel>);
    expect(log.scrollTop).toBe(1100);
    expect(screen.queryByRole("button", { name: /New messages/ })).not.toBeInTheDocument();
  });

  it("keeps an older reading position and offers an explicit jump without remounting history", async () => {
    const user = userEvent.setup();
    const view = render(<DebateHistoryPanel latestMessageId="first">{transcript(["first"])}</DebateHistoryPanel>);
    const log = screen.getByRole("log");
    dimensions(log, 1200);
    log.scrollTop = 200;
    fireEvent.scroll(log);
    expect(log).toHaveAttribute("aria-live", "off");
    view.rerender(<DebateHistoryPanel latestMessageId="second">{transcript(["first", "second"])}</DebateHistoryPanel>);
    expect(screen.getByRole("log")).toBe(log);
    expect(log.scrollTop).toBe(200);
    expect(screen.getByRole("button", { name: /New messages/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /New messages/ }));
    expect(log.scrollTop).toBe(1200);
    expect(log).toHaveFocus();
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("button", { name: /New messages/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide history" })).toHaveAttribute("aria-expanded", "true");
    log.scrollTop = 100;
    fireEvent.scroll(log);
    view.rerender(<DebateHistoryPanel latestMessageId="third">{transcript(["first", "second", "third"])}</DebateHistoryPanel>);
    await user.click(screen.getByRole("button", { name: /New messages/ }));
    expect(log).toHaveFocus();
    expect(log.scrollTop).toBe(1200);
  });

  it("clears the new-message notice when the reader scrolls back to the bottom", () => {
    const view = render(<DebateHistoryPanel latestMessageId="first">{transcript(["first"])}</DebateHistoryPanel>);
    const log = screen.getByRole("log");
    dimensions(log, 1000);
    log.scrollTop = 0;
    fireEvent.scroll(log);
    view.rerender(<DebateHistoryPanel latestMessageId="second">{transcript(["first", "second"])}</DebateHistoryPanel>);
    expect(screen.getByRole("button", { name: /New messages/ })).toBeInTheDocument();
    log.scrollTop = 700;
    fireEvent.scroll(log);
    expect(screen.queryByRole("button", { name: /New messages/ })).not.toBeInTheDocument();
    expect(log).toHaveAttribute("aria-live", "polite");
  });

  it("toggles the mobile disclosure with the keyboard and preserves its mounted contents and reading position", async () => {
    const user = userEvent.setup();
    render(<DebateHistoryPanel latestMessageId="first" title="Live record">{transcript(["first"])}</DebateHistoryPanel>);
    const button = screen.getByRole("button", { name: "Show history" });
    const body = document.getElementById(button.getAttribute("aria-controls")!)!;
    const log = screen.getByRole("log");
    dimensions(log, 1000);
    button.focus();
    await user.keyboard("{Enter}");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(body).toHaveAttribute("data-expanded", "true");
    log.scrollTop = 150;
    fireEvent.scroll(log);
    button.focus();
    await user.keyboard(" ");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(body).toHaveAttribute("data-expanded", "false");
    expect(screen.getByRole("log")).toBe(log);
    await user.keyboard("{Enter}");
    expect(log.scrollTop).toBe(150);
    expect(screen.getByRole("complementary", { name: "Live record" })).toBeInTheDocument();
  });

  it("does not announce a duplicate snapshot or reset manual review", () => {
    const view = render(<DebateHistoryPanel latestMessageId="same">{transcript(["same"])}</DebateHistoryPanel>);
    const log = screen.getByRole("log");
    dimensions(log, 900);
    log.scrollTop = 100;
    fireEvent.scroll(log);
    view.rerender(<DebateHistoryPanel latestMessageId="same">{transcript(["same"])}</DebateHistoryPanel>);
    expect(log.scrollTop).toBe(100);
    expect(screen.queryByRole("button", { name: /New messages/ })).not.toBeInTheDocument();
  });
});
