"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { LawyerPublicMessage } from "@/lib/lawyer-types";
import { CharacterSpeechPlayer, publicSpeechItem, type PlaybackSnapshot, type PublicSpeechItem } from "@/lib/character-speech";
import { defaultSpeechPreferences, useSpeechPreferences, type SpeechPreferences } from "@/lib/speech-preferences";
import "./character-speech.css";

type SpeechContextOptions = { roomId?: string; debateId?: string; themeId?: string };
interface CharacterSpeechContextValue extends PlaybackSnapshot {
  preferences: SpeechPreferences;
  activated: boolean;
  updatePreferences: (patch: Partial<SpeechPreferences>) => void;
  enable: () => void;
  play: (message: LawyerPublicMessage, options?: SpeechContextOptions) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}
const idle: PlaybackSnapshot = { status: "idle", active: null, error: null, source: null };
const noop = () => {};
const Context = createContext<CharacterSpeechContextValue>({ ...idle, preferences: defaultSpeechPreferences, activated: false, updatePreferences: noop, enable: noop, play: noop, stop: noop, pause: noop, resume: noop });
export function useCharacterSpeech() { return useContext(Context); }

/** Only this provider owns speech. No audio callback can change a room or its clocks. */
export function CharacterSpeechProvider({ roomId, debateId, themeId, messages, children }: {
  roomId: string | null; debateId: string | null; themeId: string; messages: readonly LawyerPublicMessage[]; children: ReactNode;
}) {
  const { preferences, updatePreferences } = useSpeechPreferences();
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>(idle);
  const [activated, setActivated] = useState(false);
  const player = useRef<CharacterSpeechPlayer | null>(null);
  const queue = useRef<PublicSpeechItem[]>([]);
  const preferenceRef = useRef(preferences); preferenceRef.current = preferences;
  const activatedRef = useRef(false);
  const busy = useRef(false);
  const advanceQueue = useRef<() => void>(noop);
  advanceQueue.current = () => {
    const settings = preferenceRef.current;
    if (busy.current || !activatedRef.current || !settings.enabled || settings.muted || !settings.autoplay) return;
    const next = queue.current.shift();
    if (next && player.current) { busy.current = true; void player.current.play(next, settings); }
  };
  useEffect(() => {
    player.current = new CharacterSpeechPlayer(state => { busy.current = state.status !== "idle"; setSnapshot(state); }, () => advanceQueue.current());
    return () => { queue.current = []; player.current?.dispose(); player.current = null; };
  }, []);
  const stop = useCallback(() => { queue.current = []; player.current?.stop(); busy.current = false; }, []);
  useEffect(() => { stop(); }, [roomId, debateId, stop]);
  useEffect(() => {
    if (!preferences.enabled || preferences.muted || preferences.volume === 0) stop();
    else player.current?.setVolume(preferences.volume);
  }, [preferences.enabled, preferences.muted, preferences.volume, stop]);
  useEffect(() => { if (!preferences.autoplay) queue.current = []; }, [preferences.autoplay]);

  const seen = useRef<{ context: string; ids: Set<string> }>({ context: "", ids: new Set() });
  useEffect(() => {
    const context = `${roomId ?? ""}:${debateId ?? ""}`;
    const complete = messages.filter(message => message.status === "complete");
    if (seen.current.context !== context) {
      seen.current = { context, ids: new Set(complete.map(message => message.id)) };
      return; // Refresh/re-entry restores text without reading old messages aloud.
    }
    for (const message of complete) {
      if (seen.current.ids.has(message.id)) continue;
      seen.current.ids.add(message.id); // Mark seen even while muted or speech is disabled.
      if (!roomId || !debateId || !activatedRef.current || !preferences.enabled || preferences.muted || !preferences.autoplay) continue;
      const item = publicSpeechItem(message, { roomId, debateId, themeId });
      // Do not unexpectedly read a backlog after a long reconnect. Replay stays available.
      const completed = Date.parse(message.completedAt ?? message.createdAt);
      if (item && Number.isFinite(completed) && Date.now() - completed < 90_000) queue.current.push(item);
    }
    queue.current = queue.current.slice(-8);
    advanceQueue.current();
  }, [messages, roomId, debateId, themeId, preferences.enabled, preferences.muted, preferences.autoplay]);

  const enable = useCallback(() => { activatedRef.current = true; setActivated(true); updatePreferences({ enabled: true, muted: false }); }, [updatePreferences]);
  const play = useCallback((message: LawyerPublicMessage, options: SpeechContextOptions = {}) => {
    const context = { roomId: options.roomId ?? roomId, debateId: options.debateId ?? debateId, themeId: options.themeId ?? themeId };
    if (!context.roomId || !context.debateId) return;
    const item = publicSpeechItem(message, { ...context, roomId: context.roomId, debateId: context.debateId });
    if (!item) return;
    queue.current = [];
    activatedRef.current = true; setActivated(true); updatePreferences({ enabled: true });
    void player.current?.play(item, { ...preferenceRef.current, enabled: true });
  }, [roomId, debateId, themeId, updatePreferences]);
  return <Context.Provider value={{ ...snapshot, preferences, activated, updatePreferences, enable, play, stop, pause: () => player.current?.pause(), resume: () => player.current?.resume() }}>{children}</Context.Provider>;
}

export function SpeechToolbar() {
  const speech = useCharacterSpeech();
  const playing = speech.status !== "idle";
  return <div className="character-speech-toolbar" aria-label="Character speech controls">
    {!speech.activated || !speech.preferences.enabled ? <button type="button" onClick={speech.enable}>Enable character speech</button> : <>
      <button type="button" aria-pressed={speech.preferences.muted} onClick={() => speech.updatePreferences({ muted: !speech.preferences.muted })}>{speech.preferences.muted ? "Unmute speech" : "Mute speech"}</button>
      {playing && <><button type="button" onClick={speech.status === "paused" ? speech.resume : speech.pause} disabled={speech.status === "loading"}>{speech.status === "paused" ? "Resume speech" : "Pause speech"}</button><button type="button" onClick={speech.stop}>Stop speech</button></>}
    </>}
    <a href="/settings">Audio settings</a>
    <span className="speech-status" role="status">{speech.status === "loading" ? "Preparing speech…" : speech.status === "speaking" ? `${speech.source === "browser" ? "Browser" : "Character"} speech playing` : speech.status === "paused" ? "Speech paused" : "Audio is optional. Debate clocks continue normally."}</span>
    {speech.error && <p className="speech-error" role="status">{speech.error}</p>}
  </div>;
}

export function SpeechMessageControls({ message, ...options }: { message: LawyerPublicMessage } & SpeechContextOptions) {
  const speech = useCharacterSpeech();
  if (!publicSpeechItem(message, { roomId: options.roomId ?? "", debateId: options.debateId ?? "", themeId: options.themeId ?? "courtroom" })) return null;
  const current = speech.active?.messageId === message.id && speech.status !== "idle";
  return <div className="speech-message-controls">
    {message.kind === "jury_verdict" && <span>Judge reads final announcement</span>}
    <button type="button" aria-label={`${current ? "Stop" : "Replay"} speech for ${message.label}`} disabled={!current && (speech.preferences.muted || speech.preferences.volume === 0)} onClick={() => current ? speech.stop() : speech.play(message, options)}>{current ? "Stop speech" : "Replay speech"}</button>
    {current && <span role="status">{speech.status === "loading" ? "Preparing…" : speech.status === "paused" ? "Paused" : "Speaking"}</span>}
  </div>;
}
