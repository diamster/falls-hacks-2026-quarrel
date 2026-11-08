import type { LawyerPublicMessage } from "./lawyer-types";
import type { PlaybackSnapshot } from "./character-speech";

/** Only canonical public text is eligible; drafts and consultations are never inputs. */
export function currentCourtroomDialogue(messages: readonly LawyerPublicMessage[], playback: Pick<PlaybackSnapshot, "active" | "status">, context: { roomId: string; debateId?: string; themeId: string }) {
  const publicMessages = messages.filter(message => message.status === "complete" && message.text?.trim()
    && (message.kind === "argument" ? message.slot === "A" || message.slot === "B" : ["judge_summary", "announcement", "jury_verdict"].includes(message.kind)));
  const active = playback.status !== "idle" && playback.active?.roomId === context.roomId
    && playback.active.debateId === context.debateId && playback.active.themeId === context.themeId ? playback.active : null;
  const playingMessage = active && publicMessages.find(message => message.id === active.messageId && message.text === active.text);
  const latest = [...publicMessages].sort((a, b) => Date.parse(a.completedAt ?? a.createdAt) - Date.parse(b.completedAt ?? b.createdAt)
    || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.label.localeCompare(b.label)).at(-1);
  return { message: playingMessage || latest || null, playbackRole: playingMessage ? active!.role : null };
}
