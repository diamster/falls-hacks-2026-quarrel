"use client";

import { useSpeechPreferences } from "@/lib/speech-preferences";
import { SectionHeading } from "./ui";
import "./character-speech.css";

export function AudioPreferences() {
  const { preferences, updatePreferences, storageAvailable } = useSpeechPreferences();
  return <section className="pixel-panel settings-personal settings-audio" aria-labelledby="audio-settings-title">
    <SectionHeading eyebrow="ONLY ON THIS BROWSER"><span id="audio-settings-title">Character speech</span></SectionHeading>
    <div className="settings-body">
      <p>Listen to saved public lawyer presentations and judge announcements. Audio never changes the text or pauses a debate clock. Enable playback in the room after returning here.</p>
      <label className="settings-checkbox"><input type="checkbox" checked={preferences.enabled} onChange={event => updatePreferences({ enabled: event.target.checked })}/><span><strong>Enable character speech</strong><small>Your browser may require a click in the room before playback starts.</small></span></label>
      <label className="settings-checkbox"><input type="checkbox" checked={preferences.muted} onChange={event => updatePreferences({ muted: event.target.checked })}/><span><strong>Mute speech</strong><small>Only your device is muted.</small></span></label>
      <label className="settings-checkbox"><input type="checkbox" checked={preferences.autoplay} onChange={event => updatePreferences({ autoplay: event.target.checked })}/><span><strong>Automatically play new public messages</strong><small>Earlier messages stay silent after refresh. Use Replay speech to hear them.</small></span></label>
      <label className="settings-range"><strong>Speech volume · {Math.round(preferences.volume * 100)}%</strong><input aria-label="Speech volume" type="range" min="0" max="1" step="0.1" value={preferences.volume} onChange={event => updatePreferences({ volume: Number(event.target.value) })}/><small>Browser voices use the new volume on the next message. Mute always stops playback immediately.</small></label>
      <label className="settings-range"><strong>Speech speed · {preferences.rate.toFixed(1)}×</strong><input aria-label="Speech speed" type="range" min="0.7" max="1.4" step="0.1" value={preferences.rate} onChange={event => updatePreferences({ rate: Number(event.target.value) })}/><small>Applies to the next message. Browser voices also use the theme’s delivery pace.</small></label>
      <label className="settings-select"><span><strong>Speech source</strong><small>Character voices use Gemini when available. Browser speech uses the voices installed on your device.</small></span><select aria-label="Speech source" value={preferences.provider} onChange={event => updatePreferences({ provider: event.target.value === "browser" ? "browser" : "gemini" })}><option value="gemini">Gemini character voices</option><option value="browser">Browser voices</option></select></label>
      <label className="settings-checkbox"><input type="checkbox" checked={preferences.browserFallback} onChange={event => updatePreferences({ browserFallback: event.target.checked })}/><span><strong>Use browser voices if Gemini speech is unavailable</strong><small>Voice availability and pronunciation vary by browser. Unsupported devices keep the complete written conversation.</small></span></label>
      <p className="settings-save-note" role="status">{storageAvailable ? "Audio preferences are saved only in this browser. No microphone is used." : "Browser storage is unavailable. Audio preferences apply in this tab only."}</p>
    </div>
  </section>;
}
