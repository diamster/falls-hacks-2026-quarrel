import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SUPPORTED_SPEAKERS, VOICE_PROFILES, synthesizeSpeech } from "./tts.ts";

const args = process.argv.slice(2);

const HTML_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gemini TTS Tester (Lawyer1 / Lawyer2 / Judge)</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 20px; background: #141218; color: #f5f2eb; }
    h1 { font-size: 1.4rem; margin-bottom: 0.5rem; }
    label { display: block; margin-top: 1rem; font-weight: 600; }
    select, textarea, button { width: 100%; margin-top: 0.4rem; padding: 0.7rem; border-radius: 8px; border: 1px solid #3c3647; background: #1f1c26; color: #f5f2eb; font-size: 1rem; box-sizing: border-box; }
    textarea { min-height: 110px; resize: vertical; }
    button { margin-top: 1rem; background: #d97706; border: none; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    #status { margin-top: 1rem; font-size: 0.95rem; color: #cbd5e1; }
    audio { width: 100%; margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>Gemini TTS Live Test</h1>
  <p>Select a courtroom role, enter any English text, and click <strong>Speak</strong>.</p>
  <label for="speaker">Speaker Voice</label>
  <select id="speaker">
    <option value="Lawyer1">Lawyer1 (Puck)</option>
    <option value="Lawyer2">Lawyer2 (Kore)</option>
    <option value="Judge">Judge (Algenib)</option>
  </select>
  <label for="text">English Text</label>
  <textarea id="text" placeholder="Type any English sentence to synthesize...">Your Honor, the evidence clearly proves my client is innocent.</textarea>
  <button id="speakBtn">Speak</button>
  <div id="status"></div>
  <audio id="player" controls hidden></audio>
  <script>
    const btn = document.getElementById("speakBtn");
    const status = document.getElementById("status");
    const player = document.getElementById("player");
    btn.addEventListener("click", async () => {
      const speaker = document.getElementById("speaker").value;
      const text = document.getElementById("text").value;
      btn.disabled = true;
      status.textContent = "Generating audio with Gemini TTS...";
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ speaker, text }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || ("HTTP " + res.status));
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        player.src = url;
        player.hidden = false;
        status.textContent = "Playing " + speaker + " (" + res.headers.get("X-TTS-Voice") + ")...";
        await player.play();
      } catch (e) {
        status.textContent = "Error: " + e.message;
      } finally {
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>`;

async function startTestServer(port = 4000) {
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML_PAGE);
      return;
    }

    if (req.method === "POST" && req.url === "/api/tts") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const result = await synthesizeSpeech({
          speaker: body.speaker,
          text: body.text,
        });
        res.writeHead(200, {
          "Content-Type": "audio/wav",
          "Content-Length": String(result.wavBytes.byteLength),
          "X-TTS-Speaker": result.speaker,
          "X-TTS-Voice": result.voiceName,
          "X-TTS-Language": result.languageCode,
        });
        res.end(Buffer.from(result.wavBytes));
      } catch (err) {
        const status = err?.status || 500;
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: err?.message || "TTS Error" }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Gemini TTS test page running at http://127.0.0.1:${port}`);
    console.log(`Available speakers: ${SUPPORTED_SPEAKERS.map((s) => `${s} (${VOICE_PROFILES[s].voiceName})`).join(", ")}`);
    console.log("Press Ctrl+C to stop.");
  });
}

async function runCli() {
  if (args.includes("--serve") || args.length === 0) {
    const portArg = args.find((a) => a.startsWith("--port="));
    const port = portArg ? Number(portArg.split("=")[1]) : 4000;
    await startTestServer(port);
    return;
  }

  const speaker = args[0];
  const text = args.slice(1).join(" ");
  if (!speaker || !text) {
    console.error('Usage: node --env-file=.env.local texttospeech/demo.mjs <Lawyer1|Lawyer2|Judge> "<English text>"');
    console.error("   or: node --env-file=.env.local texttospeech/demo.mjs --serve");
    process.exit(1);
  }

  console.log(`Synthesizing [${speaker}]: "${text}" ...`);
  const result = await synthesizeSpeech({ speaker, text });
  const outputPath = resolve(process.cwd(), "texttospeech", `output-${result.speaker.toLowerCase()}.wav`);
  await writeFile(outputPath, result.wavBytes);
  console.log(`Saved WAV audio (${result.wavBytes.byteLength} bytes, voice: ${result.voiceName}) to:`);
  console.log(outputPath);
}

runCli().catch((err) => {
  console.error("TTS failed:", err?.message || err);
  process.exit(1);
});

