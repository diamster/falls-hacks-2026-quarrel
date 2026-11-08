import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CharacterSpeechPlayer, publicSpeechItem, type PlaybackSnapshot, type PublicSpeechItem } from "@/lib/character-speech";
import { defaultSpeechPreferences, parseSpeechPreferences, speechPreferencesKey } from "@/lib/speech-preferences";
import { chooseBrowserVoice, getSpeechVoice } from "@/themes/speech";
import { CharacterSpeechProvider, SpeechMessageControls, SpeechToolbar, useCharacterSpeech } from "@/components/character-speech";
import { AudioPreferences } from "@/components/audio-preferences";
import type { LawyerPublicMessage } from "@/lib/lawyer-types";

class Utterance {
  text: string; lang = ""; rate = 1; pitch = 1; volume = 1; voice?: SpeechSynthesisVoice;
  onstart: (() => void) | null = null; onend: (() => void) | null = null; onerror: (() => void) | null = null; onpause: (() => void) | null = null; onresume: (() => void) | null = null;
  constructor(text: string) { this.text = text; }
}
class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string; volume = 1; playbackRate = 1;
  onplaying: (() => void) | null = null; onpause: (() => void) | null = null; onended: (() => void) | null = null; onerror: (() => void) | null = null;
  play = vi.fn(async () => { this.onplaying?.(); });
  pause = vi.fn(() => this.onpause?.());
  constructor(src: string) { this.src = src; FakeAudio.instances.push(this); }
}
const synth = { speak: vi.fn<(utterance: Utterance) => void>(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), getVoices: vi.fn(() => [] as SpeechSynthesisVoice[]) };
const prefs = { ...defaultSpeechPreferences, enabled: true };
const item: PublicSpeechItem = { messageId: "message-1", role: "lawyerA", text: "A saved public presentation.", roomId: "room-1", debateId: "debate-1", themeId: "courtroom", speechToken: "signed-receipt" };
const message = (patch: Partial<LawyerPublicMessage> = {}): LawyerPublicMessage => ({ id: "message-1", label: "S1-A1", kind: "argument", subtopic: 1, slot: "A", text: "A saved public presentation.", rawText: "PRIVATE ORIGINAL DRAFT", source: "ai", status: "complete", createdAt: new Date().toISOString(), completedAt: new Date().toISOString(), speechToken: "signed-receipt", ...patch });
let states: PlaybackSnapshot[];
let finish: ReturnType<typeof vi.fn<() => void>>;
let player: CharacterSpeechPlayer;
beforeEach(() => {
  localStorage.clear(); states = []; finish = vi.fn(); FakeAudio.instances = [];
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance); vi.stubGlobal("speechSynthesis", synth); vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("WAVE", { headers: { "Content-Type": "audio/wav" } })));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:audio"), revokeObjectURL: vi.fn() }));
  synth.speak.mockReset(); synth.getVoices.mockReturnValue([]);
  player = new CharacterSpeechPlayer(state => states.push(state), finish);
});
afterEach(() => { vi.useRealTimers(); player.dispose(); cleanup(); vi.unstubAllGlobals(); });

describe("public speech boundaries and voices", () => {
  it("uses the exact final public text and excludes drafts, pending and unsafe speech", () => {
    expect(publicSpeechItem(message(), item)).toMatchObject({ text: item.text, role: "lawyerA" });
    expect(publicSpeechItem(message({ slot: "B" }), item)?.role).toBe("lawyerB");
    for (const kind of ["judge_summary", "announcement", "jury_verdict"] as const) expect(publicSpeechItem(message({ kind, slot: null }), item)?.role).toBe("judge");
    for (const patch of [{ status: "pending" }, { text: null }, { text: "  " }, { kind: "jury_verdict", status: "pending" }, { slot: null }, { speechBlocked: true }] as Partial<LawyerPublicMessage>[]) expect(publicSpeechItem(message(patch), item)).toBeNull();
  });
  it("uses coherent distinct roles across all themes and safe missing-voice fallbacks", () => {
    const voices = [{ name: "Fallback A", lang: "en-CA" }, { name: "Fallback B", lang: "en-GB" }, { name: "Samantha", lang: "en-US" }] as SpeechSynthesisVoice[];
    for (const theme of ["courtroom", "jungle", "superhero", "detective"]) {
      const configs = ["judge", "lawyerA", "lawyerB"].map(role => getSpeechVoice(theme, role as PublicSpeechItem["role"]));
      expect(new Set(configs.map(config => config.geminiVoice)).size).toBe(3);
      configs.forEach(config => expect(config.delivery.length).toBeGreaterThan(10));
    }
    expect(getSpeechVoice("invalid", "judge")).toEqual(getSpeechVoice("courtroom", "judge"));
    expect(chooseBrowserVoice(voices, getSpeechVoice("courtroom", "judge"))?.name).toBe("Samantha");
    expect(chooseBrowserVoice(voices, getSpeechVoice("courtroom", "lawyerA"))?.name).toBe("Fallback B");
    expect(chooseBrowserVoice([], getSpeechVoice("courtroom", "judge"))).toBeUndefined();
    expect(chooseBrowserVoice([{ name: "Local", lang: "fr-FR" }] as SpeechSynthesisVoice[], getSpeechVoice("detective", "lawyerB"))?.name).toBe("Local");
  });
  it("bounds persisted preferences and handles malformed storage", () => {
    expect(parseSpeechPreferences(null)).toEqual(defaultSpeechPreferences);
    expect(parseSpeechPreferences("broken")).toEqual(defaultSpeechPreferences);
    expect(parseSpeechPreferences("[]")).toEqual(defaultSpeechPreferences);
    expect(parseSpeechPreferences("null")).toEqual(defaultSpeechPreferences);
    expect(parseSpeechPreferences(JSON.stringify({ volume: 22, rate: 0, enabled: true, muted: true, provider: "browser", autoplay: false, browserFallback: false }))).toEqual({ volume: 1, rate: 0.7, enabled: true, muted: true, provider: "browser", autoplay: false, browserFallback: false });
  });
});

describe("single-owner playback", () => {
  it("fetches by signed message identity only, plays WAV, pauses/resumes, replays cache and releases resources", async () => {
    await player.play(item, { ...prefs, browserFallback: false });
    expect(states.at(-1)?.error).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/rooms/lawyer/speech", expect.objectContaining({ body: JSON.stringify({ debateId: item.debateId, messageId: item.messageId, speechToken: item.speechToken }) }));
    expect(states.at(-1)).toMatchObject({ status: "speaking", active: item, source: "gemini" });
    expect(FakeAudio.instances[0].volume).toBe(0.8);
    player.setVolume(0.4); expect(FakeAudio.instances[0].volume).toBe(0.4);
    player.pause(); expect(states.at(-1)?.status).toBe("paused");
    player.resume(); expect(FakeAudio.instances[0].play).toHaveBeenCalledTimes(2);
    FakeAudio.instances[0].onended?.(); expect(finish).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio");
    await player.play(item, prefs); expect(fetch).toHaveBeenCalledOnce();
    player.stop(); expect(states.at(-1)?.active).toBeNull();
  });
  it("uses exact text with browser fallback, theme pace, available voices, and native state events", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "Quota", fallbackAllowed: true }), { status: 429 }));
    synth.getVoices.mockReturnValue([{ name: "Daniel", lang: "en-GB" }] as SpeechSynthesisVoice[]);
    await player.play({ ...item, themeId: "detective" }, { ...prefs, rate: 1.2 });
    const spoken = synth.speak.mock.calls[0][0];
    expect(spoken.text).toBe(item.text); expect(spoken.voice?.name).toBe("Daniel"); expect(spoken.rate).toBeCloseTo(1.08);
    spoken.onstart?.(); expect(states.at(-1)?.status).toBe("speaking");
    player.pause(); expect(synth.pause).toHaveBeenCalled(); spoken.onpause?.(); expect(states.at(-1)?.status).toBe("paused");
    player.resume(); expect(synth.resume).toHaveBeenCalled(); spoken.onresume?.(); expect(states.at(-1)?.status).toBe("speaking");
    spoken.onend?.(); expect(states.at(-1)?.active).toBeNull();
  });
  it("never falls back after authorization or safety rejection", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "Access denied", fallbackAllowed: false }), { status: 403 }));
    await player.play(item, prefs);
    expect(synth.speak).not.toHaveBeenCalled(); expect(states.at(-1)?.error).toBe("Access denied");
  });
  it("handles absent credentials, unsupported browser, disabled fallback and missing receipt", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Offline"));
    await player.play(item, { ...prefs, browserFallback: false }); expect(states.at(-1)?.error).toBe("Offline");
    vi.stubGlobal("speechSynthesis", undefined);
    await player.play({ ...item, speechToken: undefined }, prefs);
    expect(states.at(-1)?.error).toContain("unavailable in this browser");
  });
  it("stops immediately and ignores late responses after cancellation", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise(res => { resolve = res; }));
    const pending = player.play(item, prefs);
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    player.stop(); expect(signal?.aborted).toBe(true);
    resolve(new Response("WAVE", { headers: { "Content-Type": "audio/wav" } })); await pending;
    expect(FakeAudio.instances).toHaveLength(0); expect(states.at(-1)?.status).toBe("idle");
  });
  it("handles late voice initialization, native start errors and silent-browser timeouts", async () => {
    const events = new EventTarget();
    Object.assign(synth, { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) });
    const latePlayer = new CharacterSpeechPlayer(state => states.push(state), finish);
    synth.getVoices.mockReturnValue([{ name: "Late voice", lang: "en-US" }] as SpeechSynthesisVoice[]);
    events.dispatchEvent(new Event("voiceschanged"));
    await latePlayer.play(item, { ...prefs, provider: "browser" });
    expect(synth.speak.mock.calls[0][0].voice?.name).toBe("Late voice");
    latePlayer.stop();
    synth.speak.mockImplementationOnce(() => { throw new Error("native unavailable"); });
    await latePlayer.play(item, { ...prefs, provider: "browser" });
    expect(states.at(-1)?.error).toContain("could not start");
    vi.useFakeTimers();
    await latePlayer.play(item, { ...prefs, provider: "browser" });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(states.at(-1)?.error).toContain("did not start");
    latePlayer.dispose();
  });
  it("bounds a hung speech request and falls back without any room mutation", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("Timed out")))));
    const pending = player.play(item, prefs);
    await vi.advanceTimersByTimeAsync(25_000); await pending;
    expect(synth.speak).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch).mock.calls.every(call => call[0] === "/api/rooms/lawyer/speech")).toBe(true);
  });
  it("handles blocked media playback and cache eviction", async () => {
    for (let index = 0; index < 13; index++) await player.play({ ...item, messageId: `cache-${index}` }, prefs);
    await player.play({ ...item, messageId: "cache-0" }, prefs);
    expect(fetch).toHaveBeenCalledTimes(14);
    const audio = FakeAudio.instances.at(-1)!;
    player.pause(); audio.play.mockRejectedValueOnce(new Error("gesture")); player.resume();
    await Promise.resolve(); expect(states.at(-1)?.error).toContain("Playback was blocked");
  });
  it("does not fetch or speak while disabled, muted, or zero volume", async () => {
    for (const patch of [{ enabled: false }, { muted: true }, { volume: 0 }]) await player.play(item, { ...prefs, ...patch });
    player.pause(); player.resume(); expect(fetch).not.toHaveBeenCalled(); expect(synth.speak).not.toHaveBeenCalled();
  });
  it("reports browser speech errors and invalid service responses without affecting any debate state", async () => {
    await player.play(item, { ...prefs, provider: "browser" });
    synth.speak.mock.calls[0][0].onerror?.(); expect(states.at(-1)?.error).toContain("Browser speech could not play");
    vi.mocked(fetch).mockResolvedValue(new Response("bad data"));
    await player.play(item, { ...prefs, browserFallback: false }); expect(states.at(-1)?.error).toContain("invalid audio");
  });
  it("cleans up failed audio and handles non-json endpoint failures", async () => {
    await player.play(item, prefs); FakeAudio.instances[0].onerror?.(); expect(states.at(-1)?.error).toContain("Audio could not play");
    vi.mocked(fetch).mockResolvedValue(new Response("bad gateway", { status: 502 }));
    await player.play({ ...item, messageId: "m2" }, prefs); expect(states.at(-1)?.error).toContain("temporarily unavailable"); expect(synth.speak).not.toHaveBeenCalled();
  });
});

function PlaybackStatus() { const speech = useCharacterSpeech(); return <output data-testid="active">{speech.active?.messageId ?? "none"}:{speech.status}</output>; }
function App({ messages, roomId = "room-1", debateId = "debate-1" }: { messages: LawyerPublicMessage[]; roomId?: string; debateId?: string }) {
  return <CharacterSpeechProvider roomId={roomId} debateId={debateId} themeId="courtroom" messages={messages}><SpeechToolbar/><PlaybackStatus/>{messages.map(m => <SpeechMessageControls key={m.id} message={m}/>)}</CharacterSpeechProvider>;
}
describe("room playback integration", () => {
  it("requires gesture, does not autoplay restored history, queues fresh public text once, and stops on room change", async () => {
    localStorage.setItem(speechPreferencesKey, JSON.stringify({ ...prefs, provider: "browser" }));
    const view = render(<App messages={[message()]}/>);
    expect(synth.speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enable character speech" }));
    expect(synth.speak).not.toHaveBeenCalled();
    const next = message({ id: "message-2", label: "S1-B1", slot: "B", text: "The other saved presentation." });
    view.rerender(<App messages={[message(), next]}/>);
    await waitFor(() => expect(synth.speak).toHaveBeenCalledOnce());
    expect(synth.speak.mock.calls[0][0].text).toBe(next.text);
    act(() => synth.speak.mock.calls[0][0].onstart?.());
    expect(screen.getByTestId("active")).toHaveTextContent("message-2:speaking");
    view.rerender(<App messages={[message(), { ...next }]}/>); expect(synth.speak).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Pause speech" })); expect(screen.getByTestId("active")).toHaveTextContent("paused");
    fireEvent.click(screen.getByRole("button", { name: "Resume speech" }));
    view.rerender(<App roomId="room-2" debateId="debate-2" messages={[message(), next]}/>);
    expect(screen.getByTestId("active")).toHaveTextContent("none:idle"); expect(synth.cancel).toHaveBeenCalled();
  });
  it("replays saved messages explicitly without an AI request and clears a queued announcement on stop", async () => {
    localStorage.setItem(speechPreferencesKey, JSON.stringify({ ...prefs, provider: "browser" }));
    const view = render(<App messages={[message()]}/>);
    fireEvent.click(screen.getByRole("button", { name: "Replay speech for S1-A1" }));
    await waitFor(() => expect(synth.speak).toHaveBeenCalledOnce());
    act(() => synth.speak.mock.calls[0][0].onstart?.());
    view.rerender(<App messages={[message(), message({ id: "judge", label: "Summary", kind: "judge_summary", slot: null })]}/>);
    expect(synth.speak).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Stop speech for S1-A1" }));
    expect(screen.getByTestId("active")).toHaveTextContent("none:idle"); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not queue muted messages, old reconnect backlog, unsafe speech, pending messages or pending verdicts", async () => {
    localStorage.setItem(speechPreferencesKey, JSON.stringify({ ...prefs, provider: "browser" }));
    const view = render(<App messages={[]}/>);
    fireEvent.click(screen.getByRole("button", { name: "Enable character speech" }));
    fireEvent.click(screen.getByRole("button", { name: "Mute speech" }));
    view.rerender(<App messages={[message()]}/>); expect(synth.speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Unmute speech" }));
    view.rerender(<App messages={[message(), message({ id: "old", completedAt: "2020-01-01T00:00:00Z" }), message({ id: "unsafe", speechBlocked: true }), message({ id: "pending", status: "pending" }), message({ id: "jury", kind: "jury_verdict", status: "pending" })]}/>);
    expect(synth.speak).not.toHaveBeenCalled(); expect(screen.getAllByRole("button", { name: /Replay speech/ })).toHaveLength(2);
  });
  it("reads the saved final announcement in the judge voice without generating a new verdict", () => {
    localStorage.setItem(speechPreferencesKey, JSON.stringify({ ...prefs, provider: "browser" }));
    const view = render(<App messages={[]}/>);
    fireEvent.click(screen.getByRole("button", { name: "Enable character speech" }));
    const final = message({ id: "final-message", label: "Final", kind: "jury_verdict", slot: null, text: "The jury has finished its review. Both presented cases remain inconclusive." });
    view.rerender(<App messages={[final]}/>);
    expect(screen.getByText("Judge reads final announcement")).toBeInTheDocument();
    expect(synth.speak).toHaveBeenCalledOnce(); expect(synth.speak.mock.calls[0][0].text).toBe(final.text); expect(fetch).not.toHaveBeenCalled();
    act(() => synth.speak.mock.calls[0][0].onstart?.());
    expect(screen.getByTestId("active")).toHaveTextContent("final-message:speaking");
    view.rerender(<App messages={[{ ...final }]}/>); expect(synth.speak).toHaveBeenCalledOnce();
  });
  it("serializes new messages, advances after completion, and treats explicit Stop as skip", async () => {
    localStorage.setItem(speechPreferencesKey, JSON.stringify({ ...prefs, provider: "browser" }));
    const view = render(<App messages={[]}/>);
    fireEvent.click(screen.getByRole("button", { name: "Enable character speech" }));
    const judge = message({ id: "judge", label: "Summary", kind: "judge_summary", slot: null, text: "Saved summary." });
    view.rerender(<App messages={[message(), judge]}/>);
    expect(synth.speak).toHaveBeenCalledOnce();
    act(() => { synth.speak.mock.calls[0][0].onstart?.(); synth.speak.mock.calls[0][0].onend?.(); });
    expect(synth.speak).toHaveBeenCalledTimes(2); expect(synth.speak.mock.calls[1][0].text).toBe("Saved summary.");
    act(() => synth.speak.mock.calls[1][0].onstart?.());
    fireEvent.click(screen.getByRole("button", { name: /^Stop speech$/ }));
    expect(screen.getByTestId("active")).toHaveTextContent("none:idle");
  });
  it("autoplay off still allows explicit replay and refresh never repeats it", async () => {
    localStorage.setItem(speechPreferencesKey, JSON.stringify({ ...prefs, provider: "browser", autoplay: false }));
    const view = render(<App messages={[]}/>);
    fireEvent.click(screen.getByRole("button", { name: "Enable character speech" }));
    view.rerender(<App messages={[message()]}/>); expect(synth.speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Replay speech for S1-A1" })); expect(synth.speak).toHaveBeenCalledOnce();
    view.unmount(); render(<App messages={[message()]}/>);
    expect(synth.speak).toHaveBeenCalledOnce();
  });
  it("keeps settings local, supports volume/source/rate, and syncs browser preference changes", async () => {
    render(<AudioPreferences/>);
    fireEvent.click(screen.getByRole("checkbox", { name: /Enable character speech/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Mute speech/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Automatically play/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Use browser voices if/ }));
    fireEvent.change(screen.getByLabelText("Speech volume"), { target: { value: "0.4" } });
    fireEvent.change(screen.getByLabelText("Speech speed"), { target: { value: "1.2" } });
    fireEvent.change(screen.getByLabelText("Speech source"), { target: { value: "browser" } });
    expect(JSON.parse(localStorage.getItem(speechPreferencesKey)!)).toMatchObject({ enabled: true, muted: true, autoplay: false, browserFallback: false, volume: 0.4, rate: 1.2, provider: "browser" });
    localStorage.removeItem(speechPreferencesKey);
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: speechPreferencesKey })));
    expect(screen.getByLabelText("Speech volume")).toHaveValue("0.8"); expect(fetch).not.toHaveBeenCalled();
  });
  it("works text-only without a playback provider and handles unavailable preference storage", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<><AudioPreferences/><SpeechToolbar/><SpeechMessageControls message={message({ kind: "jury_verdict" })}/></>);
    expect(screen.getByText(/Browser storage is unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Mute speech/ }));
    expect(screen.getByRole("checkbox", { name: /Mute speech/ })).toBeChecked();
    get.mockRestore(); set.mockRestore();
  });
});
