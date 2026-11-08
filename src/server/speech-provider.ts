import "server-only";
import { createHash } from "node:crypto";
import { getSpeechVoice, type SpeechRole } from "@/themes/speech";

export const MAX_SPEECH_CHARACTERS = 4000;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
const CACHE_BYTES = 16 * 1024 * 1024;
const CACHE_TTL = 15 * 60_000;
const cache = new Map<string, { wav: Uint8Array; expires: number }>();
const inFlight = new Map<string, Promise<Uint8Array>>();
const limits = new Map<string, { count: number; until: number }>();
let cachedBytes = 0;

export class SpeechError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fallbackAllowed = true) { super(message); }
}

/** Adapted from the reviewed texttospeech branch's PCM/RIFF implementation. */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24_000): Uint8Array {
  if (!pcm.length || pcm.length % 2 || pcm.length > MAX_AUDIO_BYTES || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48_000) {
    throw new SpeechError(502, "TTS_INVALID_AUDIO", "Speech returned invalid audio. The saved text is still available.");
  }
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  wav.set(new TextEncoder().encode("RIFF"), 0); view.setUint32(4, 36 + pcm.length, true);
  wav.set(new TextEncoder().encode("WAVEfmt "), 8); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  wav.set(new TextEncoder().encode("data"), 36); view.setUint32(40, pcm.length, true); wav.set(pcm, 44);
  return wav;
}

function validWav(bytes: Uint8Array): boolean {
  if (bytes.length < 44 || bytes.length > MAX_AUDIO_BYTES) return false;
  const text = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (text.decode(bytes.subarray(0, 4)) !== "RIFF" || text.decode(bytes.subarray(8, 12)) !== "WAVE" || view.getUint32(4, true) + 8 !== bytes.length) return false;
  let format = false, data = false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = text.decode(bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (offset + 8 + size > bytes.length) return false;
    if (name === "fmt ") {
      if (size < 16) return false;
      const rate = view.getUint32(offset + 12, true);
      format = view.getUint16(offset + 8, true) === 1 && view.getUint16(offset + 10, true) === 1 && view.getUint16(offset + 22, true) === 16 && rate >= 8000 && rate <= 48000;
    }
    if (name === "data") data = size > 0 && size % 2 === 0;
    offset += 8 + size + size % 2;
  }
  return format && data;
}

async function boundedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) throw new Error("size");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.length;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("size"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

interface SpeechInput { text: string; themeId: string; role: SpeechRole }

/** Only the TTS credential is accepted. No text-key or alternate-provider fallback. */
export async function generateSpeech(input: SpeechInput): Promise<Uint8Array> {
  const key = process.env.GEMINI_TTS_API_KEY?.trim();
  if (!key) throw new SpeechError(503, "TTS_NOT_CONFIGURED", "Gemini speech is unavailable. You can use browser speech or read the text.");
  if (!input.text.trim() || Array.from(input.text).length > MAX_SPEECH_CHARACTERS) throw new SpeechError(400, "TTS_INVALID_TEXT", "This message is not available for speech.", false);
  const model = process.env.GEMINI_TTS_MODEL?.trim() || "gemini-3.8-flash-tts";
  if (!/^gemini-[a-z0-9.-]+tts[a-z0-9.-]*$/.test(model)) throw new SpeechError(503, "TTS_CONFIGURATION", "The speech model needs configuration.");
  const voice = getSpeechVoice(input.themeId, input.role);
  const parts = [{ text: input.text, speech_metadata: { style: voice.delivery } }];
  const timeout = Math.min(30_000, Math.max(1000, Number(process.env.GEMINI_TTS_TIMEOUT_MS) || 20_000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: controller.signal,
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: {
        voiceConfig: { voice: voice.geminiVoice },
      } } }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new SpeechError(response.status === 429 ? 429 : 503, response.status === 429 ? "TTS_QUOTA" : "TTS_PROVIDER_UNAVAILABLE", "Gemini speech is temporarily unavailable. Your debate continues with text.");
    }
    const payload = await boundedJson(response) as { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
    if (payload.promptFeedback?.blockReason || payload.candidates?.some(item => ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST"].includes(item.finishReason ?? ""))) {
      throw new SpeechError(422, "TTS_CONTENT_BLOCKED", "Speech is unavailable for this message.", false);
    }
    const audioParts = payload.candidates?.[0]?.content?.parts?.filter(part => part.inlineData?.data) ?? [];
    if (audioParts.length !== 1) throw new Error("audio");
    const audio = audioParts[0].inlineData!;
    if (typeof audio.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio.data) || audio.data.length % 4 !== 0) throw new Error("base64");
    const bytes = new Uint8Array(Buffer.from(audio.data, "base64"));
    if (audio.mimeType === "audio/wav" || audio.mimeType === "audio/x-wav") {
      if (!validWav(bytes)) throw new Error("wav");
      return bytes;
    }
    if (!/^audio\/l16;(?:codec=pcm;)?rate=(\d+)$/i.test(audio.mimeType ?? "")) throw new Error("mime");
    return pcmToWav(bytes, Number(/rate=(\d+)/i.exec(audio.mimeType!)![1]));
  } catch (error) {
    if (error instanceof SpeechError) throw error;
    throw new SpeechError(502, controller.signal.aborted ? "TTS_TIMEOUT" : "TTS_INVALID_RESPONSE", "Speech could not play. Your saved text and debate are unchanged.");
  } finally { clearTimeout(timer); }
}

/** Process-local, bounded replay cache. Authorization is verified before calling. */
export async function cachedSpeech(input: SpeechInput & { userId: string; roomId: string; debateId: string; messageId: string }): Promise<Uint8Array> {
  const now = Date.now();
  for (const [id, item] of cache) if (item.expires <= now) { cachedBytes -= item.wav.length; cache.delete(id); }
  for (const [id, item] of limits) if (item.until <= now) limits.delete(id);
  const id = createHash("sha256").update(JSON.stringify([input.roomId, input.debateId, input.messageId, input.text, input.themeId, input.role, process.env.GEMINI_TTS_MODEL, getSpeechVoice(input.themeId, input.role)])).digest("hex");
  const hit = cache.get(id); if (hit) return hit.wav;
  const pending = inFlight.get(id); if (pending) return pending;
  const limit = limits.get(input.userId);
  if ((limit?.count ?? 0) >= 8 || inFlight.size >= 4 || limits.size >= 1000 && !limit) throw new SpeechError(429, "TTS_RATE_LIMITED", "Speech is busy. Please wait briefly or use browser speech.");
  limits.set(input.userId, { count: (limit?.count ?? 0) + 1, until: limit?.until ?? now + 60_000 });
  const promise = generateSpeech(input).then(wav => {
    while (cache.size && (cachedBytes + wav.length > CACHE_BYTES || cache.size >= 32)) {
      const oldest = cache.keys().next().value!; cachedBytes -= cache.get(oldest)!.wav.length; cache.delete(oldest);
    }
    cache.set(id, { wav, expires: Date.now() + CACHE_TTL }); cachedBytes += wav.length;
    return wav;
  }).finally(() => { inFlight.delete(id); });
  inFlight.set(id, promise); return promise;
}
