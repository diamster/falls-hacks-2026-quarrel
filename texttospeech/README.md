# Gemini Text-to-Speech (`texttospeech`)

Synthesizes dynamic user-entered English text (`text`) into playable WAV audio (`audio/wav`) using Gemini TTS (`gemini-2.5-flash-preview-tts`) with three courtroom voices: `Lawyer1`, `Lawyer2`, and `Judge`.

## 1. Environment Variables

Configure your Gemini API key in `.env.local`:

```env
GEMINI_API_KEY=your-gemini-api-key
# Optional override (defaults to gemini-2.5-flash-preview-tts)
# GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
```

## 2. Supported Voices (`en-US`)

| Speaker (`speaker`) | Gemini Voice (`voiceName`) | Language (`languageCode`) |
| :--- | :--- | :--- |
| `Lawyer1` | `Puck` | `en-US` |
| `Lawyer2` | `Kore` | `en-US` |
| `Judge` | `Algenib` | `en-US` |

## 3. Usage

### A. Sending User-Entered Text to the API (`POST`)

Pass the user's input text (`userInputText`) and the target voice (`speaker`) in the request body:

```ts
await fetch("/api/tts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    speaker: selectedSpeaker, // "Lawyer1" | "Lawyer2" | "Judge"
    text: userInputText,      // Dynamic English text entered by the user
  }),
});
```

- **Default response**: Binary `audio/wav` stream (playable directly in `<audio>` and `new Audio()`).
- **JSON response** (when passing `"format": "json"` or `?format=json`):
  ```json
  {
    "speaker": "Lawyer1",
    "voiceName": "Puck",
    "languageCode": "en-US",
    "text": "<user-entered English text>",
    "mimeType": "audio/wav",
    "sampleRate": 24000,
    "audioBase64": "UklGR...",
    "dataUrl": "data:audio/wav;base64,UklGR..."
  }
  ```

### B. Playing User-Entered Text in the Browser

```ts
import { playTtsAudio } from "@/../texttospeech/client";

await playTtsAudio("Lawyer1", userInputText);
```

### C. Calling Directly on the Server

```ts
import { synthesizeSpeech } from "@/../texttospeech";

const result = await synthesizeSpeech({
  speaker: "Lawyer2",
  text: userInputText,
});
```

### D. Mounting as a Next.js App Router Route

```ts
export { GET, POST, dynamic, runtime } from "../../../../texttospeech/route";
```

## 4. Quick Local Test (`demo.mjs`)

You can test the Gemini TTS voices immediately with `.env.local` using Node.js (no extra packages needed):

### Interactive Browser Test Page

```bash
node --env-file=.env.local texttospeech/demo.mjs
```

Then open `http://127.0.0.1:4000` in your browser, select `Lawyer1`, `Lawyer2`, or `Judge`, type any English sentence, and click **Speak**.

### Command-Line WAV File Generation

```bash
node --env-file=.env.local texttospeech/demo.mjs Lawyer1 "Your Honor, I object to this line of questioning."
node --env-file=.env.local texttospeech/demo.mjs Lawyer2 "The witness already answered that question."
node --env-file=.env.local texttospeech/demo.mjs Judge "Objection sustained. Proceed with your next argument."
```

