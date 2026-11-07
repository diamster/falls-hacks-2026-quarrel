import { describe, expect, it, vi } from "vitest";
import {
  VOICE_PROFILES,
  handleTtsRequest,
  normalizeSpeaker,
  parseSampleRate,
  pcmToWav,
  synthesizeSpeech,
} from "./index";

describe("Gemini English TTS module (texttospeech)", () => {
  it("maps Lawyer1, Lawyer2, and Judge to distinct English Gemini voices", () => {
    expect(VOICE_PROFILES.Lawyer1).toMatchObject({
      voiceName: "Puck",
      languageCode: "en-US",
    });
    expect(VOICE_PROFILES.Lawyer2).toMatchObject({
      voiceName: "Kore",
      languageCode: "en-US",
    });
    expect(VOICE_PROFILES.Judge).toMatchObject({
      voiceName: "Algenib",
      languageCode: "en-US",
    });
  });

  it("normalizes speaker names case-insensitively", () => {
    expect(normalizeSpeaker("Lawyer1")).toBe("Lawyer1");
    expect(normalizeSpeaker("lawyer 1")).toBe("Lawyer1");
    expect(normalizeSpeaker("Lawyer2")).toBe("Lawyer2");
    expect(normalizeSpeaker("LAWYER_2")).toBe("Lawyer2");
    expect(normalizeSpeaker("Judge")).toBe("Judge");
    expect(normalizeSpeaker("judge")).toBe("Judge");
    expect(() => normalizeSpeaker("Spectator")).toThrow(/Unsupported speaker/);
  });

  it("wraps raw 16-bit PCM bytes with a valid 44-byte RIFF/WAVE header", () => {
    const pcm = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const wav = pcmToWav(pcm, 24000);
    expect(wav.byteLength).toBe(48);
    expect(Buffer.from(wav.slice(0, 4)).toString("ascii")).toBe("RIFF");
    expect(Buffer.from(wav.slice(8, 12)).toString("ascii")).toBe("WAVE");
    expect(Buffer.from(wav.slice(36, 40)).toString("ascii")).toBe("data");
    expect(Array.from(wav.slice(44))).toEqual([0x00, 0x01, 0x02, 0x03]);
  });

  it("parses sample rate from Gemini mimeType", () => {
    expect(parseSampleRate("audio/L16;codec=pcm;rate=24000")).toBe(24000);
    expect(parseSampleRate("audio/pcm;rate=16000")).toBe(16000);
    expect(parseSampleRate(undefined)).toBe(24000);
  });

  it("sends the exact user-entered English text verbatim to Gemini TTS with the selected voice", async () => {
    const fakePcmBase64 = Buffer.from([1, 2, 3, 4]).toString("base64");
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "audio/L16;codec=pcm;rate=24000",
                        data: fakePcmBase64,
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    const cases = [
      {
        speaker: "Lawyer1" as const,
        userEnteredText: "The opposing counsel has no evidence to support that claim.",
        expectedVoice: "Puck",
      },
      {
        speaker: "Lawyer2" as const,
        userEnteredText: "The contract clearly states the deadline was Friday at midnight.",
        expectedVoice: "Kore",
      },
      {
        speaker: "Judge" as const,
        userEnteredText: "Both sides have presented their arguments. Here is my ruling.",
        expectedVoice: "Algenib",
      },
    ];

    for (const testCase of cases) {
      const result = await synthesizeSpeech(
        {
          speaker: testCase.speaker,
          text: testCase.userEnteredText,
        },
        {
          apiKey: "test-key",
          fetchImpl: fetchMock,
        },
      );

      expect(result.speaker).toBe(testCase.speaker);
      expect(result.voiceName).toBe(testCase.expectedVoice);
      expect(result.languageCode).toBe("en-US");
      expect(result.text).toBe(testCase.userEnteredText);
      expect(result.mimeType).toBe("audio/wav");

      const lastCall = fetchMock.mock.calls.at(-1);
      const sentBody = JSON.parse(String(lastCall?.[1]?.body));
      expect(sentBody).toEqual({
        contents: [
          {
            parts: [{ text: testCase.userEnteredText }],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            languageCode: "en-US",
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: testCase.expectedVoice,
              },
            },
          },
        },
      });
    }
  });

  it("handles POST API requests with dynamic user input text and returns audio/wav or JSON", async () => {
    const fakePcmBase64 = Buffer.from([10, 20, 30, 40]).toString("base64");
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: "audio/L16;codec=pcm;rate=24000",
                        data: fakePcmBase64,
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    const dynamicUserText = "A hotdog is structurally a taco, not a sandwich.";

    const wavRequest = new Request("http://127.0.0.1:3000/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speaker: "Lawyer1", text: dynamicUserText }),
    });

    const wavResponse = await handleTtsRequest(wavRequest, {
      apiKey: "test-key",
      fetchImpl: fetchMock,
    });
    expect(wavResponse.status).toBe(200);
    expect(wavResponse.headers.get("Content-Type")).toBe("audio/wav");
    expect(wavResponse.headers.get("X-TTS-Speaker")).toBe("Lawyer1");
    expect(wavResponse.headers.get("X-TTS-Voice")).toBe("Puck");
    expect(wavResponse.headers.get("X-TTS-Language")).toBe("en-US");

    const jsonRequest = new Request("http://127.0.0.1:3000/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        speaker: "Judge",
        text: dynamicUserText,
        format: "json",
      }),
    });

    const jsonResponse = await handleTtsRequest(jsonRequest, {
      apiKey: "test-key",
      fetchImpl: fetchMock,
    });
    expect(jsonResponse.status).toBe(200);
    const body = (await jsonResponse.json()) as {
      speaker: string;
      voiceName: string;
      languageCode: string;
      text: string;
      mimeType: string;
      dataUrl: string;
    };
    expect(body.speaker).toBe("Judge");
    expect(body.voiceName).toBe("Algenib");
    expect(body.languageCode).toBe("en-US");
    expect(body.text).toBe(dynamicUserText);
    expect(body.mimeType).toBe("audio/wav");
    expect(body.dataUrl.startsWith("data:audio/wav;base64,")).toBe(true);
  });

  it("rejects empty user input text", async () => {
    await expect(
      synthesizeSpeech({ speaker: "Judge", text: "   " }, { apiKey: "test-key" }),
    ).rejects.toThrow(/User input text must not be empty/);
  });
});
