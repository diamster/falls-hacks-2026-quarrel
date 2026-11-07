import type { SpeakerRole } from "./tts";

export interface ClientTtsOptions {
  /**
   * API endpoint URL where the TTS route handler is mounted.
   * Defaults to "/api/tts".
   */
  endpoint?: string;
  signal?: AbortSignal;
}

/**
 * Requests synthesized WAV audio as a Blob from the TTS API endpoint.
 */
export async function fetchTtsAudioBlob(
  speaker: SpeakerRole,
  text: string,
  options: ClientTtsOptions = {},
): Promise<Blob> {
  const endpoint = options.endpoint ?? "/api/tts";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      speaker,
      text,
      format: "wav",
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    let message = `TTS request failed (${response.status})`;
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson?.error) message = errJson.error;
    } catch {
      // Ignore JSON parse error on non-JSON error responses
    }
    throw new Error(message);
  }

  return response.blob();
}

/**
 * Fetches and immediately plays TTS audio in the browser for Lawyer1, Lawyer2, or Judge.
 * Resolves when playback finishes, and cleans up the object URL automatically.
 */
export async function playTtsAudio(
  speaker: SpeakerRole,
  text: string,
  options: ClientTtsOptions = {},
): Promise<HTMLAudioElement> {
  const blob = await fetchTtsAudioBlob(speaker, text, options);
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);

  const cleanup = () => {
    URL.revokeObjectURL(objectUrl);
  };
  audio.addEventListener("ended", cleanup, { once: true });
  audio.addEventListener("error", cleanup, { once: true });

  await audio.play();
  return audio;
}

