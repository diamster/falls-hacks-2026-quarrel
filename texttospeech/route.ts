import {
  SUPPORTED_SPEAKERS,
  TtsError,
  VOICE_PROFILES,
  synthesizeSpeech,
  type TtsServiceOptions,
} from "./tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type TtsResponseFormat = "wav" | "json";

interface TtsRoutePayload {
  speaker?: unknown;
  voice?: unknown;
  role?: unknown;
  text?: unknown;
  format?: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function resolveResponseFormat(request: Request, bodyFormat?: unknown): TtsResponseFormat {
  if (typeof bodyFormat === "string" && bodyFormat.trim().toLowerCase() === "json") {
    return "json";
  }
  const url = new URL(request.url, "http://127.0.0.1:3000");
  const queryFormat = url.searchParams.get("format");
  if (queryFormat && queryFormat.trim().toLowerCase() === "json") {
    return "json";
  }
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json") && !accept.includes("audio/") && !accept.includes("*/*")) {
    return "json";
  }
  return "wav";
}

function toAudioResponse(
  wavBytes: Uint8Array,
  speaker: string,
  voiceName: string,
): Response {
  const copy = new Uint8Array(wavBytes.byteLength);
  copy.set(wavBytes);
  return new Response(copy.buffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(copy.byteLength),
      "Cache-Control": "no-store",
      "X-TTS-Speaker": speaker,
      "X-TTS-Voice": voiceName,
      "X-TTS-Language": "en-US",
    },
  });
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof TtsError) {
    return jsonResponse(
      {
        error: error.message,
        code: error.code,
        supportedSpeakers: SUPPORTED_SPEAKERS,
      },
      error.status,
    );
  }
  return jsonResponse(
    {
      error: "Unexpected error while generating speech.",
      code: "INTERNAL_TTS_ERROR",
      supportedSpeakers: SUPPORTED_SPEAKERS,
    },
    500,
  );
}

/**
 * HTTP handler that receives dynamic user-entered text and a speaker role
 * ("Lawyer1" | "Lawyer2" | "Judge") and returns the spoken English audio.
 */
export async function handleTtsRequest(
  request: Request,
  options?: TtsServiceOptions,
): Promise<Response> {
  try {
    if (request.method === "GET") {
      const url = new URL(request.url, "http://127.0.0.1:3000");
      const speakerParam =
        url.searchParams.get("speaker") ??
        url.searchParams.get("voice") ??
        url.searchParams.get("role");
      const userTextParam = url.searchParams.get("text");

      if (!speakerParam && !userTextParam) {
        return jsonResponse({
          speakers: SUPPORTED_SPEAKERS,
          voices: VOICE_PROFILES,
        });
      }

      const result = await synthesizeSpeech(
        {
          speaker: String(speakerParam ?? ""),
          text: String(userTextParam ?? ""),
        },
        options,
      );

      if (resolveResponseFormat(request) === "json") {
        return jsonResponse({
          speaker: result.speaker,
          voiceName: result.voiceName,
          languageCode: result.languageCode,
          text: result.text,
          mimeType: result.mimeType,
          sampleRate: result.sampleRate,
          audioBase64: result.base64Audio,
          dataUrl: result.dataUrl,
        });
      }

      return toAudioResponse(result.wavBytes, result.speaker, result.voiceName);
    }

    if (request.method !== "POST") {
      return jsonResponse(
        { error: "Method not allowed. Use POST or GET.", code: "METHOD_NOT_ALLOWED" },
        405,
      );
    }

    let body: TtsRoutePayload;
    try {
      body = (await request.json()) as TtsRoutePayload;
    } catch {
      throw new TtsError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const speakerInput = body.speaker ?? body.voice ?? body.role;

    const result = await synthesizeSpeech(
      {
        speaker: speakerInput as string,
        text: body.text as string,
      },
      options,
    );

    if (resolveResponseFormat(request, body.format) === "json") {
      return jsonResponse({
        speaker: result.speaker,
        voiceName: result.voiceName,
        languageCode: result.languageCode,
        text: result.text,
        mimeType: result.mimeType,
        sampleRate: result.sampleRate,
        audioBase64: result.base64Audio,
        dataUrl: result.dataUrl,
      });
    }

    return toAudioResponse(result.wavBytes, result.speaker, result.voiceName);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleTtsRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleTtsRequest(request);
}
