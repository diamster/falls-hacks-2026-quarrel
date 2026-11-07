export {
  DEFAULT_GEMINI_TTS_MODEL,
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_SAMPLE_RATE,
  MAX_TTS_TEXT_LENGTH,
  SUPPORTED_SPEAKERS,
  TtsError,
  VOICE_PROFILES,
  normalizeSpeaker,
  parseSampleRate,
  pcmToWav,
  speakJudge,
  speakLawyer1,
  speakLawyer2,
  synthesizeSpeech,
  validateTtsText,
  type GeminiVoiceName,
  type SpeakerRole,
  type TtsRequest,
  type TtsResult,
  type TtsServiceOptions,
  type VoiceProfile,
} from "./tts";

export {
  GET,
  POST,
  handleTtsRequest,
  type TtsResponseFormat,
} from "./route";

export {
  fetchTtsAudioBlob,
  playTtsAudio,
  type ClientTtsOptions,
} from "./client";
