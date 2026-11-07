export type SpeakerRole = "Lawyer1" | "Lawyer2" | "Judge";

export type GeminiVoiceName =
  | "Puck"
  | "Kore"
  | "Algenib"
  | "Charon"
  | "Fenrir"
  | "Orus"
  | "Aoede"
  | "Zephyr"
  | "Leda";

export interface VoiceProfile {
  speaker: SpeakerRole;
  voiceName: GeminiVoiceName;
  languageCode: "en-US";
  label: string;
}

export const VOICE_PROFILES: Record<SpeakerRole, VoiceProfile> = {
  Lawyer1: {
    speaker: "Lawyer1",
    voiceName: "Puck",
    languageCode: "en-US",
    label: "Lawyer 1",
  },
  Lawyer2: {
    speaker: "Lawyer2",
    voiceName: "Kore",
    languageCode: "en-US",
    label: "Lawyer 2",
  },
  Judge: {
    speaker: "Judge",
    voiceName: "Algenib",
    languageCode: "en-US",
    label: "Judge",
  },
};

export const SUPPORTED_SPEAKERS: readonly SpeakerRole[] = ["Lawyer1", "Lawyer2", "Judge"] as const;

export const DEFAULT_GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
export const DEFAULT_LANGUAGE_CODE = "en-US";
export const MAX_TTS_TEXT_LENGTH = 4000;
export const DEFAULT_SAMPLE_RATE = 24000;

export interface TtsRequest {
  /**
   * The exact user-entered text to be spoken in English.
   */
  text: string;
  /**
   * Which voice should speak the user-entered text: "Lawyer1", "Lawyer2", or "Judge".
   */
  speaker: SpeakerRole | string;
  /**
   * Optional override for the Gemini TTS model.
   * Defaults to process.env.GEMINI_TTS_MODEL or "gemini-2.5-flash-preview-tts".
   */
  model?: string;
}

export interface TtsServiceOptions {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export interface TtsResult {
  speaker: SpeakerRole;
  voiceName: GeminiVoiceName;
  languageCode: "en-US";
  text: string;
  mimeType: "audio/wav";
  sampleRate: number;
  wavBytes: Uint8Array;
  base64Audio: string;
  dataUrl: string;
}

export class TtsError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "TtsError";
    this.status = status;
    this.code = code;
  }
}

const SPEAKER_LOOKUP: Record<string, SpeakerRole> = {
  lawyer1: "Lawyer1",
  lawyer_1: "Lawyer1",
  "lawyer 1": "Lawyer1",
  "lawyer-1": "Lawyer1",
  lawyer2: "Lawyer2",
  lawyer_2: "Lawyer2",
  "lawyer 2": "Lawyer2",
  "lawyer-2": "Lawyer2",
  judge: "Judge",
};

/**
 * Normalizes a speaker identifier into one of the three canonical roles:
 * "Lawyer1", "Lawyer2", or "Judge".
 */
export function normalizeSpeaker(input: unknown): SpeakerRole {
  if (typeof input !== "string") {
    throw new TtsError(
      400,
      "INVALID_SPEAKER",
      `Speaker is required and must be one of: ${SUPPORTED_SPEAKERS.join(", ")}.`,
    );
  }
  const normalized = SPEAKER_LOOKUP[input.trim().toLowerCase()];
  if (!normalized) {
    throw new TtsError(
      400,
      "INVALID_SPEAKER",
      `Unsupported speaker "${input}". Allowed speakers: ${SUPPORTED_SPEAKERS.join(", ")}.`,
    );
  }
  return normalized;
}

/**
 * Validates and trims the user-entered text to be spoken.
 */
export function validateTtsText(input: unknown): string {
  if (typeof input !== "string") {
    throw new TtsError(400, "INVALID_TEXT", "User input text is required and must be a string.");
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new TtsError(400, "EMPTY_TEXT", "User input text must not be empty.");
  }
  if (trimmed.length > MAX_TTS_TEXT_LENGTH) {
    throw new TtsError(
      400,
      "TEXT_TOO_LONG",
      `User input text must be ${MAX_TTS_TEXT_LENGTH} characters or fewer.`,
    );
  }
  return trimmed;
}

/**
 * Extracts sample rate from a Gemini audio MIME type such as
 * "audio/L16;codec=pcm;rate=24000" or defaults to 24000 Hz.
 */
export function parseSampleRate(mimeType?: string): number {
  if (!mimeType) return DEFAULT_SAMPLE_RATE;
  const match = /rate=(\d+)/i.exec(mimeType);
  if (!match) return DEFAULT_SAMPLE_RATE;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SAMPLE_RATE;
}

function isWavBuffer(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 && // 'R'
    bytes[1] === 0x49 && // 'I'
    bytes[2] === 0x46 && // 'F'
    bytes[3] === 0x46 && // 'F'
    bytes[8] === 0x57 && // 'W'
    bytes[9] === 0x41 && // 'A'
    bytes[10] === 0x56 && // 'V'
    bytes[11] === 0x45 // 'E'
  );
}

/**
 * Wraps raw 16-bit signed little-endian mono PCM bytes (returned by Gemini TTS)
 * with a standard 44-byte RIFF/WAVE header so browsers and audio players can play it directly.
 */
export function pcmToWav(
  pcmBytes: Uint8Array,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
  numChannels = 1,
  bitsPerSample = 16,
): Uint8Array {
  if (isWavBuffer(pcmBytes)) {
    return pcmBytes;
  }

  const headerLength = 44;
  const dataLength = pcmBytes.byteLength;
  const totalLength = headerLength + dataLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);

  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  // "RIFF" chunk descriptor
  view.setUint8(0, 0x52); // 'R'
  view.setUint8(1, 0x49); // 'I'
  view.setUint8(2, 0x46); // 'F'
  view.setUint8(3, 0x46); // 'F'
  view.setUint32(4, 36 + dataLength, true);
  view.setUint8(8, 0x57); // 'W'
  view.setUint8(9, 0x41); // 'A'
  view.setUint8(10, 0x56); // 'V'
  view.setUint8(11, 0x45); // 'E'

  // "fmt " sub-chunk
  view.setUint8(12, 0x66); // 'f'
  view.setUint8(13, 0x6d); // 'm'
  view.setUint8(14, 0x74); // 't'
  view.setUint8(15, 0x20); // ' '
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // "data" sub-chunk
  view.setUint8(36, 0x64); // 'd'
  view.setUint8(37, 0x61); // 'a'
  view.setUint8(38, 0x74); // 't'
  view.setUint8(39, 0x61); // 'a'
  view.setUint32(40, dataLength, true);

  const wavBytes = new Uint8Array(buffer);
  wavBytes.set(pcmBytes, headerLength);
  return wavBytes;
}

interface GeminiInlineDataPart {
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiInlineDataPart[];
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

/**
 * Synthesizes the dynamic user-provided English text into WAV audio
 * using the selected speaker's Gemini voice (Lawyer1, Lawyer2, or Judge).
 */
export async function synthesizeSpeech(
  request: TtsRequest,
  options: TtsServiceOptions = {},
): Promise<TtsResult> {
  const speaker = normalizeSpeaker(request.speaker);
  const text = validateTtsText(request.text);
  const profile = VOICE_PROFILES[speaker];

  const apiKey =
    options.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new TtsError(
      503,
      "MISSING_API_KEY",
      "GEMINI_API_KEY is not configured on the server.",
    );
  }

  const model =
    request.model ??
    options.model ??
    process.env.GEMINI_TTS_MODEL ??
    DEFAULT_GEMINI_TTS_MODEL;

  const fetchFn = options.fetchImpl ?? fetch;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let response: Response;
  try {
    response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text }],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            languageCode: profile.languageCode,
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: profile.voiceName,
              },
            },
          },
        },
      }),
    });
  } catch (error) {
    throw new TtsError(
      502,
      "GEMINI_NETWORK_ERROR",
      error instanceof Error
        ? `Failed to reach Gemini TTS API: ${error.message}`
        : "Failed to reach Gemini TTS API.",
    );
  }

  let payload: GeminiGenerateContentResponse | null = null;
  try {
    payload = (await response.json()) as GeminiGenerateContentResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const upstreamMessage =
      payload?.error?.message ?? `Gemini TTS request failed with status ${response.status}.`;
    throw new TtsError(502, "GEMINI_API_ERROR", upstreamMessage);
  }

  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const audioPart = parts.find((part) => Boolean(part.inlineData?.data));
  const base64Pcm = audioPart?.inlineData?.data;

  if (!base64Pcm) {
    throw new TtsError(
      502,
      "EMPTY_AUDIO_RESPONSE",
      "Gemini TTS response did not contain audio data.",
    );
  }

  const rawBytes = new Uint8Array(Buffer.from(base64Pcm, "base64"));
  const sampleRate = parseSampleRate(audioPart?.inlineData?.mimeType);
  const wavBytes = pcmToWav(rawBytes, sampleRate);
  const base64Audio = Buffer.from(wavBytes).toString("base64");

  return {
    speaker,
    voiceName: profile.voiceName,
    languageCode: profile.languageCode,
    text,
    mimeType: "audio/wav",
    sampleRate,
    wavBytes,
    base64Audio,
    dataUrl: `data:audio/wav;base64,${base64Audio}`,
  };
}

/**
 * Speaks whatever dynamic English text the user passes in using Lawyer1's voice.
 */
export function speakLawyer1(userInputText: string, options?: TtsServiceOptions): Promise<TtsResult> {
  return synthesizeSpeech({ speaker: "Lawyer1", text: userInputText }, options);
}

/**
 * Speaks whatever dynamic English text the user passes in using Lawyer2's voice.
 */
export function speakLawyer2(userInputText: string, options?: TtsServiceOptions): Promise<TtsResult> {
  return synthesizeSpeech({ speaker: "Lawyer2", text: userInputText }, options);
}

/**
 * Speaks whatever dynamic English text the user passes in using the Judge's voice.
 */
export function speakJudge(userInputText: string, options?: TtsServiceOptions): Promise<TtsResult> {
  return synthesizeSpeech({ speaker: "Judge", text: userInputText }, options);
}
