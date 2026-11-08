/** Explicit live speech extension of the existing real-clock multiplayer suite.
 * Uses the configured local app + authorized Supabase Cloud project.
 * Up to three new TTS generations (A, B, judge); replays use the server cache.
 * No forced deadlines, privileged DB writes, migrations or deletion.
 */
process.env.QUARREL_TEST_SPEECH = "true";
await import("./lawyer.integration.mjs");
