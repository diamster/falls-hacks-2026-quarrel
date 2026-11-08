import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CourtroomDialogue } from "@/components/courtroom-dialogue";
import { currentCourtroomDialogue } from "@/lib/courtroom-dialogue";
import { getTheme } from "@/themes";
import type { LawyerPublicMessage } from "@/lib/lawyer-types";
import type { PlaybackSnapshot } from "@/lib/character-speech";
const context = { roomId: "room", debateId: "debate", themeId: "courtroom" };
const a: LawyerPublicMessage = { id: "a", label: "S1-A", kind: "argument", slot: "A", subtopic: 1, text: "The saved public presentation.", rawText: "PRIVATE ORIGINAL DRAFT", status: "complete", source: "ai", createdAt: "2030-01-01T00:00:00Z", completedAt: "2030-01-01T00:00:01Z" };
const b: LawyerPublicMessage = { ...a, id: "b", label: "S1-B", slot: "B", text: "The other public presentation.", completedAt: "2030-01-01T00:00:02Z" };
const idle: PlaybackSnapshot = { active: null, status: "idle", error: null, source: null };
describe("current public courtroom dialogue", () => {
  it("updates to new completed public messages while muted, retaining exact saved text and speaker", () => {
    const view = render(<CourtroomDialogue theme={getTheme("courtroom")} {...currentCourtroomDialogue([a], idle, context)}/>);
    expect(screen.getByText("Emery (Lawyer A)")).toBeInTheDocument();
    expect(screen.getByText(a.text!)).toBeInTheDocument();
    view.rerender(<CourtroomDialogue theme={getTheme("courtroom")} {...currentCourtroomDialogue([b,a], idle, context)}/>);
    expect(screen.getByText("Sage (Lawyer B)")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Current public message" })).toHaveTextContent(b.text!);
    expect(screen.queryByText(a.rawText!)).not.toBeInTheDocument();
  });
  it("keeps replayed or paused saved text until playback ends, without using another room's playback", () => {
    const active = { ...context, messageId: a.id, text: a.text!, role: "lawyerA" as const };
    for (const status of ["loading", "speaking", "paused"] as const) expect(currentCourtroomDialogue([a,b], { ...idle, active, status }, context).message?.id).toBe("a");
    expect(currentCourtroomDialogue([a,b], { ...idle, active, status:"idle" }, context).message?.id).toBe("b");
    expect(currentCourtroomDialogue([a,b], { ...idle, active:{ ...active, debateId:"old" }, status:"speaking" }, context).message?.id).toBe("b");
    expect(currentCourtroomDialogue([a,b], { ...idle, active:{ ...active, text:"NOT THE SAVED TEXT" }, status:"speaking" }, context).message?.id).toBe("b");
  });
  it("excludes pending text and consultations defensively, with a neutral empty placeholder", () => {
    const privateMessage = { ...b, kind:"consultation", text:"PRIVATE CONSULTATION" } as unknown as LawyerPublicMessage;
    const selected = currentCourtroomDialogue([{ ...a, status:"pending" },privateMessage],idle,context);
    expect(selected.message).toBeNull();
    render(<CourtroomDialogue theme={getTheme("courtroom")} {...selected}/>);
    expect(screen.queryByText("PRIVATE CONSULTATION")).not.toBeInTheDocument();
    expect(screen.getByText(/Public lawyer presentations and judge announcements will appear here/)).toBeInTheDocument();
  });
  it.each(["courtroom","jungle","superhero","detective"])("uses %s names for judge summaries and the saved jury announcement", themeId => {
    const theme=getTheme(themeId);
    const view=render(<CourtroomDialogue theme={theme} message={{ ...a, kind:"judge_summary", slot:null }}/>);
    expect(within(screen.getByRole("region",{name:"Current courtroom dialogue"})).getByText(theme.judge.displayName)).toBeInTheDocument();
    view.rerender(<CourtroomDialogue theme={theme} message={{ ...a, kind:"jury_verdict", slot:null }}/>);
    expect(screen.getByText(theme.jury.displayName)).toBeInTheDocument();
    view.rerender(<CourtroomDialogue theme={theme} message={{ ...a, kind:"jury_verdict", slot:null }} playbackRole="judge"/>);
    expect(screen.getByText(`${theme.judge.displayName} · Jury announcement`)).toBeInTheDocument();
  });
});
