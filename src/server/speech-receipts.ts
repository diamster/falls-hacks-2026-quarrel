import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { LawyerPublicMessage } from "@/lib/lawyer-types";
import { isThemeId } from "@/themes";
import type { SpeechRole } from "@/themes/speech";
import { MAX_SPEECH_CHARACTERS, SpeechError } from "./speech-provider";

interface Receipt {
  v: 1; userId: string; roomId: string; debateId: string; messageId: string;
  themeId: string; role: SpeechRole; text: string; expires: number;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeText = (text: unknown): text is string => typeof text === "string" && Boolean(text.trim()) && Array.from(text).length <= MAX_SPEECH_CHARACTERS && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text);
// Same narrow unsuitable-dispute tripwire as the existing lawyer policy. This
// avoids voicing unchanged unsafe fallbacks; it is not a comprehensive classifier.
const unsuitable = /\b(?:kill|hurt|hit|beat|threaten|coerce|blackmail)\s+(?:me|you|him|her|them|my\s+(?:partner|wife|husband|friend))\b|\b(?:domestic abuse|sexual assault|coercive control)\b/i;

function signingKey(): Buffer | null {
  const secret = process.env.JUDGE_SERVER_SECRET;
  return secret && secret.length >= 16 ? createHmac("sha256", secret).update("quarrel.io/stage6b/public-speech/v1").digest() : null;
}

/** Called only on an already authorized database snapshot, never browser text. */
export function attachSpeechReceipts(history: LawyerPublicMessage[], scope: { userId: string; roomId: string; debateId: string; themeId: string }): LawyerPublicMessage[] {
  const key = signingKey();
  const canSign = key && scope.userId && uuid.test(scope.roomId) && uuid.test(scope.debateId) && isThemeId(scope.themeId);
  return history.map(message => {
    const { speechToken: _oldToken, ...clean } = message;
    if (message.status !== "complete" || !safeText(message.text)) return clean;
    const role: SpeechRole | null = message.kind === "argument" ? message.slot === "A" ? "lawyerA" : message.slot === "B" ? "lawyerB" : null
      : message.kind === "judge_summary" || message.kind === "announcement" || message.kind === "jury_verdict" ? "judge" : null;
    if (!role) return clean;
    // Browser speech needs the same exclusion even when Gemini signing is
    // unavailable. Personal fallback settings must not bypass this flag.
    if (unsuitable.test(message.text)) return { ...clean, speechBlocked: true };
    if (!canSign || !uuid.test(message.id)) return clean;
    const payload: Receipt = { v: 1, ...scope, messageId: message.id, role, text: message.text, expires: Date.now() + 60 * 60_000 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return { ...clean, speechToken: `${encoded}.${createHmac("sha256", key!).update(encoded).digest("base64url")}` };
  });
}

/** Auth-bound signed canonical text prevents a speech request reading/mutating a room. */
export function verifySpeechReceipt(token: string, expected: { userId: string; roomId: string; debateId: string; messageId: string }): Receipt {
  const invalid = () => new SpeechError(403, "TTS_INVALID_RECEIPT", "Refresh the saved message before playing speech.", false);
  const key = signingKey();
  if (!key) throw new SpeechError(503, "TTS_NOT_CONFIGURED", "Character speech needs server configuration.");
  if (typeof token !== "string" || token.length > 32_000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
  const [encoded, signature] = token.split(".");
  const actual = Buffer.from(signature, "base64url");
  const wanted = createHmac("sha256", key).update(encoded).digest();
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) throw invalid();
  let value: Receipt;
  try { value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw invalid(); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "debateId,expires,messageId,role,roomId,text,themeId,userId,v"
    || value.v !== 1 || value.userId !== expected.userId || value.roomId !== expected.roomId || value.debateId !== expected.debateId || value.messageId !== expected.messageId
    || !isThemeId(value.themeId) || !["lawyerA", "lawyerB", "judge"].includes(value.role) || !safeText(value.text)
    || !Number.isSafeInteger(value.expires) || value.expires <= Date.now() || value.expires > Date.now() + 60 * 60_000) throw invalid();
  if (unsuitable.test(value.text)) throw new SpeechError(422, "TTS_CONTENT_BLOCKED", "Speech is unavailable for this message.", false);
  return value;
}
