import type { LawyerPublicMessage } from "./lawyer-types";
import { chooseBrowserVoice, getSpeechVoice, type SpeechRole } from "@/themes/speech";
import type { SpeechPreferences } from "./speech-preferences";

export type SpeechStatus = "idle" | "loading" | "speaking" | "paused";
export interface PublicSpeechItem { messageId: string; text: string; role: SpeechRole; roomId: string; debateId: string; themeId: string; speechToken?: string }
export interface PlaybackSnapshot { status: SpeechStatus; active: PublicSpeechItem | null; error: string | null; source: "gemini" | "browser" | null }
export function publicSpeechItem(message: LawyerPublicMessage, context: { roomId: string; debateId: string; themeId: string }): PublicSpeechItem | null {
  if (message.speechBlocked || message.status !== "complete" || !message.text?.trim()) return null;
  const role = message.kind === "argument" ? (message.slot === "A" ? "lawyerA" : message.slot === "B" ? "lawyerB" : null)
    : message.kind === "judge_summary" || message.kind === "announcement" || message.kind === "jury_verdict" ? "judge" : null;
  return role ? { ...context, messageId: message.id, text: message.text, role, speechToken: message.speechToken } : null;
}

/** Sole browser playback owner. It has no debate-mutation or timer API. */
export class CharacterSpeechPlayer {
  private generation = 0;
  private request: AbortController | null = null;
  private audio: HTMLAudioElement | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private objectUrl: string | null = null;
  private cache = new Map<string, Blob>();
  private snapshot: PlaybackSnapshot = { status: "idle", active: null, error: null, source: null };
  private voices: SpeechSynthesisVoice[] = [];
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private requestTimer: ReturnType<typeof setTimeout> | null = null;
  private updateVoices = () => { this.voices = window.speechSynthesis?.getVoices() ?? []; };
  constructor(private changed: (state: PlaybackSnapshot) => void, private finished: () => void) {
    this.updateVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", this.updateVoices);
  }
  private clearStartup() { if (this.startupTimer) clearTimeout(this.startupTimer); this.startupTimer = null; }
  private emit(patch: Partial<PlaybackSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.changed(this.snapshot); }
  private release() {
    this.clearStartup();
    if (this.requestTimer) clearTimeout(this.requestTimer); this.requestTimer = null;
    this.request?.abort(); this.request = null;
    if (this.audio) { this.audio.onended = this.audio.onerror = this.audio.onplaying = this.audio.onpause = null; this.audio.pause(); this.audio.src = ""; this.audio = null; }
    if (this.utterance) { this.utterance.onstart = this.utterance.onend = this.utterance.onerror = this.utterance.onpause = this.utterance.onresume = null; window.speechSynthesis?.cancel(); this.utterance = null; }
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
  }
  stop() { this.generation++; this.release(); this.emit({ status: "idle", active: null, source: null, error: null }); }
  dispose() { this.generation++; this.release(); this.cache.clear(); window.speechSynthesis?.removeEventListener?.("voiceschanged", this.updateVoices); }
  setVolume(volume: number) { if (this.audio) this.audio.volume = volume; }
  pause() { if (this.snapshot.status !== "speaking") return; if (this.audio) this.audio.pause(); else window.speechSynthesis?.pause(); this.emit({ status: "paused" }); }
  resume() {
    if (this.snapshot.status !== "paused") return;
    if (this.audio) { const generation = this.generation; void this.audio.play().catch(() => { if (generation === this.generation) this.fail("Playback was blocked. Press Replay to try again."); }); }
    else { window.speechSynthesis?.resume(); this.emit({ status: "speaking" }); }
  }
  private finish() { this.release(); this.emit({ status: "idle", active: null, source: null }); this.finished(); }
  private fail(message: string) { this.release(); this.emit({ status: "idle", active: null, source: null, error: message }); this.finished(); }
  private browser(item: PublicSpeechItem, preferences: SpeechPreferences, generation: number) {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      this.fail("Speech is unavailable in this browser. The complete conversation remains readable."); return;
    }
    const config = getSpeechVoice(item.themeId, item.role);
    const utterance = new SpeechSynthesisUtterance(item.text);
    this.utterance = utterance;
    utterance.lang = config.lang; utterance.rate = config.rate * preferences.rate; utterance.pitch = config.pitch; utterance.volume = preferences.volume;
    const voice = chooseBrowserVoice(window.speechSynthesis.getVoices().length ? window.speechSynthesis.getVoices() : this.voices, config);
    if (voice) utterance.voice = voice;
    utterance.onstart = () => { if (generation === this.generation) { this.clearStartup(); this.emit({ status: "speaking", source: "browser" }); } };
    utterance.onend = () => { if (generation === this.generation) this.finish(); };
    utterance.onerror = () => { if (generation === this.generation) this.fail("Browser speech could not play. You can replay the message or continue reading."); };
    utterance.onpause = () => { if (generation === this.generation) this.emit({ status: "paused" }); };
    utterance.onresume = () => { if (generation === this.generation) this.emit({ status: "speaking" }); };
    this.emit({ source: "browser" });
    this.startupTimer = setTimeout(() => { if (generation === this.generation) this.fail("Browser speech did not start. Press Replay or continue reading."); }, 15_000);
    try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); }
    catch { this.fail("Browser speech could not start. The debate can continue normally."); }
  }
  async play(item: PublicSpeechItem, preferences: SpeechPreferences) {
    this.stop();
    if (!preferences.enabled || preferences.muted || preferences.volume === 0) return;
    const generation = this.generation;
    this.emit({ status: "loading", active: item, error: null });
    if (preferences.provider === "browser") { this.browser(item, preferences, generation); return; }
    const key = `${item.roomId}:${item.debateId}:${item.messageId}:${item.themeId}`;
    let fallbackAllowed = true;
    try {
      let blob = this.cache.get(key);
      if (!blob) {
        if (!item.speechToken) throw new Error("Speech receipt unavailable. Refresh the room to enable Gemini playback.");
        this.request = new AbortController();
        this.requestTimer = setTimeout(() => this.request?.abort(), 25_000);
        const response = await fetch("/api/rooms/lawyer/speech", {
          method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "x-quarrel-room-id": item.roomId },
          body: JSON.stringify({ debateId: item.debateId, messageId: item.messageId, speechToken: item.speechToken }), signal: this.request.signal,
        });
        if (this.requestTimer) clearTimeout(this.requestTimer); this.requestTimer = null;
        if (!response.ok) {
          fallbackAllowed = false;
          const failure = await response.json().catch(() => ({}));
          fallbackAllowed = failure.fallbackAllowed === true;
          throw new Error(typeof failure.error === "string" ? failure.error : "Character speech is temporarily unavailable.");
        }
        if (!response.headers.get("content-type")?.startsWith("audio/")) throw new Error("The speech service returned an invalid audio response.");
        blob = await response.blob();
        if (generation !== this.generation) return;
        this.cache.set(key, blob);
        if (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value!);
      }
      if (generation !== this.generation) return;
      this.objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(this.objectUrl); this.audio = audio;
      audio.volume = preferences.volume; audio.playbackRate = preferences.rate;
      audio.onplaying = () => { if (generation === this.generation) { this.clearStartup(); this.emit({ status: "speaking", source: "gemini" }); } };
      audio.onpause = () => { if (generation === this.generation) this.emit({ status: "paused" }); };
      audio.onended = () => { if (generation === this.generation) this.finish(); };
      audio.onerror = () => { if (generation === this.generation) this.fail("Audio could not play. Press Replay or use browser speech in Settings."); };
      this.emit({ source: "gemini" });
      this.startupTimer = setTimeout(() => { if (generation === this.generation) this.fail("Audio did not start. Press Replay or continue reading."); }, 15_000);
      await audio.play();
    } catch (error) {
      if (generation !== this.generation) return;
      this.release();
      if (preferences.browserFallback && fallbackAllowed) this.browser(item, preferences, generation);
      else this.fail(error instanceof Error ? error.message : "Speech could not play. The debate can continue normally.");
    }
  }
}
