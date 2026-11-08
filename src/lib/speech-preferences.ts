"use client";

import { useCallback, useEffect, useRef, useState } from "react";
export interface SpeechPreferences { enabled: boolean; muted: boolean; volume: number; autoplay: boolean; rate: number; browserFallback: boolean; provider: "gemini" | "browser" }
export const speechPreferencesKey = "quarrel-speech-preferences-v1";
const syncEvent = "quarrel-speech-preferences-changed";
export const defaultSpeechPreferences: SpeechPreferences = { enabled: false, muted: false, volume: 0.8, autoplay: true, rate: 1, browserFallback: true, provider: "gemini" };
function numberWithin(value: unknown, fallback: number, min: number, max: number) { return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; }
export function parseSpeechPreferences(value: string | null): SpeechPreferences {
  try {
    const raw = value ? JSON.parse(value) : {};
    const saved = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return { enabled: saved.enabled === true, muted: saved.muted === true, volume: numberWithin(saved.volume, 0.8, 0, 1), autoplay: saved.autoplay !== false, rate: numberWithin(saved.rate, 1, 0.7, 1.4), browserFallback: saved.browserFallback !== false, provider: saved.provider === "browser" ? "browser" : "gemini" };
  } catch { return { ...defaultSpeechPreferences }; }
}
/** Personal browser state only. Never sent to room mutation endpoints. */
export function useSpeechPreferences() {
  const [preferences, setPreferences] = useState<SpeechPreferences>({ ...defaultSpeechPreferences });
  const [storageAvailable, setStorageAvailable] = useState(true);
  const current = useRef(preferences); current.current = preferences;
  useEffect(() => {
    const read = () => { try { const next = parseSpeechPreferences(localStorage.getItem(speechPreferencesKey)); current.current = next; setPreferences(next); } catch { setStorageAvailable(false); } };
    read();
    const storage = (event: StorageEvent) => { if (event.key === speechPreferencesKey || event.key === null) read(); };
    window.addEventListener("storage", storage); window.addEventListener(syncEvent, read);
    return () => { window.removeEventListener("storage", storage); window.removeEventListener(syncEvent, read); };
  }, []);
  const updatePreferences = useCallback((patch: Partial<SpeechPreferences>) => {
    const next = parseSpeechPreferences(JSON.stringify({ ...current.current, ...patch }));
    current.current = next; setPreferences(next);
    try { localStorage.setItem(speechPreferencesKey, JSON.stringify(next)); setStorageAvailable(true); } catch { setStorageAvailable(false); }
    window.dispatchEvent(new Event(syncEvent));
  }, []);
  return { preferences, updatePreferences, storageAvailable };
}
