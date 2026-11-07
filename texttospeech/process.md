# TTS Process Overview

End-to-end flow from user text input to audio playback using Gemini TTS (`gemini-2.5-flash-preview-tts`).

## 1. Flow Summary

```text
User Input (speaker + text)
  → Client: POST /api/tts (texttospeech/client.ts)
  → Server Route: handleTtsRequest (texttospeech/route.ts)
  → Gemini API: synthesizeSpeech (texttospeech/tts.ts)
  → PCM to WAV: pcmToWav (44-byte RIFF/WAVE header added)
  → Browser Playback: new Audio(objectUrl).play()
```

## 2. Voice Mapping (`en-US`)

| Speaker (`speaker`) | Gemini Voice (`voiceName`) |
| :--- | :--- |
| `Lawyer1` | `Puck` |
| `Lawyer2` | `Kore` |
| `Judge` | `Algenib` |

## 3. API Calls & Parameters

### Step 1: Client $\rightarrow$ Local Server (`POST /api/tts`)

Called via `playTtsAudio(speaker, text)` or `fetch("/api/tts", ...)`:

- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "speaker": "Lawyer1 | Lawyer2 | Judge",
    "text": "User-entered English text",
    "format": "wav"
  }
  ```
  *(Optional `format`: `"wav"` by default, or `"json"` for Base64/Data URL.)*

### Step 2: Local Server $\rightarrow$ Gemini TTS API

`synthesizeSpeech()` in `texttospeech/tts.ts` calls Google's REST API:

- **URL**: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent`
- **Headers**:
  - `Content-Type: application/json`
  - `x-goog-api-key: <process.env.GEMINI_API_KEY>`
- **Body**:
  ```json
  {
    "contents": [
      { "parts": [{ "text": "<user-entered English text>" }] }
    ],
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": {
        "languageCode": "en-US",
        "voiceConfig": {
          "prebuiltVoiceConfig": {
            "voiceName": "Puck | Kore | Algenib"
          }
        }
      }
    }
  }
  ```

### Step 3: Gemini Response $\rightarrow$ WAV Conversion $\rightarrow$ Playback

1. **Gemini Response**: Returns Base64 raw 16-bit 24kHz mono PCM in `candidates[0].content.parts[0].inlineData.data`.
2. **WAV Conversion (`pcmToWav`)**: Prepends a 44-byte `RIFF`/`WAVE` header to the raw PCM bytes so browsers can play it directly.
3. **Server Response**: Returns `200 OK` with `Content-Type: audio/wav` binary data.
4. **Browser Playback (`playTtsAudio`)**: Converts the response to a `Blob`, creates an object URL, and plays it via `new Audio(url).play()`.
