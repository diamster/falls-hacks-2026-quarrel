# Stage 6B — speaking sidekicks and end-to-end integration

Branch: `quarrel-stage-6b`, from completed Stage 6A at `fb09640`. Stage 6C and Stage 7 remain out of scope. No Cloud schema changes or migrations were needed.

## Experience

The existing debate workflow, clocks, themes and artwork are preserved. Enable character speech with a click in the courtroom. Completed public lawyer presentations and judge summaries/announcements can play once as they arrive. Replay reads the selected saved message; it does not invoke the lawyer, judge or jury again. Pause, resume, stop and mute are local. Text remains available and the next player can write while speech plays.

Settings now contains enabled/muted state, volume, autoplay, speed, Gemini/browser source and optional browser fallback. Preferences are saved only in that browser. Returning to a newly loaded page requires a playback gesture; old history is baselined rather than automatically spoken. The queue excludes private consultations, original drafts and pending messages. At completion, the judge can read the existing saved public jury announcement (`jury_verdict.text`), labelled “Judge reads final announcement”; structured verdict fields are not concatenated or generated again. Current-room actors animate only for matching room/debate/theme playback. Archived replay never impersonates an actor in a different current debate.

Stage 6A UI integration shows the saved rich verdict, including tie/inconclusive outcomes, both positions, strongest reasoning, weaknesses, per-subtopic reasoning, saved summaries and optional compromise. Acknowledgement explicitly means review, not agreement or resolution. Both players must approve a rematch; the existing server creates the new debate and retains results. Previous debates are available from the start/lobby/debate; archive reads never replace the live room state or clocks. The side panel filters public history by subtopic, summaries or verdict. Jury failures show the existing recoverable retry state instead of a fabricated result.

## Canonical text and credentials

`GEMINI_API_KEY` remains unchanged and is used exclusively by the existing text engine. `GEMINI_TTS_API_KEY` is used exclusively by the server speech provider. The latter is installed only in the ignored local Stage 6B environment; no key is committed or included in browser code, and this branch does not update Production environment settings.

The default speech model is `gemini-3.8-flash-tts`, configurable through `GEMINI_TTS_MODEL`. Its generateContent request contains the exact saved text in `parts[].text`, separate delivery metadata in `speech_metadata`, and the configured voice. There is no text-key fallback. Missing credentials, quota exhaustion, timeout or invalid audio preserve text-based debate and optionally use browser speech. Provider safety refusals do not fall back to browser speech. A narrow existing unsuitable-dispute tripwire also marks speech unavailable; it is not a comprehensive classifier.

References: [Google speech-generation documentation](https://ai.google.dev/gemini-api/docs/speech-generation), [Supabase verified user retrieval](https://supabase.com/docs/reference/javascript/auth-getuser). Provider model listing and one direct short generation verified availability before selecting the default. No new SDK, paid TTS service, microphone access, voice input or audio streaming through Supabase was added.

## Speech API and authorization

`POST /api/rooms/lawyer/speech` accepts `{debateId, messageId, speechToken}` and requires `x-quarrel-room-id`, same-origin JSON and the existing verified HttpOnly player session. It returns `audio/wav`, or a sanitized JSON `{error, code, fallbackAllowed}`. Responses are private and no-store.

Already authorized room/archive snapshots attach a one-hour HMAC speech receipt only to completed eligible public messages. The receipt binds the verified participant, room, debate, message, role, theme and exact saved text. A domain-derived signing key uses the existing server capability; the capability itself never leaves the server. The speech endpoint verifies the signature, expiry and caller binding. It neither reads/reconciles room state nor schedules a worker. Therefore replay cannot advance a clock or generate another official argument. New receipts are issued on normal snapshot/archive refreshes. They are per-player authorization metadata, not part of the shared canonical transcript.

Why receipts: the current room-read RPC also reconciles expired clocks. Reusing it inside speech would give playback a state side effect. Receipts preserve the existing schema and avoid a new Cloud migration. A receipt grants its original authorized participant short-lived playback of text they already received, including an old result; leaving a room does not erase their saved public evidence.

Provider requests are bounded (default 20 seconds, maximum 30), output audio is validated and bounded, and new generation is limited to 8/minute/player and 4 concurrent jobs/process. The server keeps at most 16 MiB / 32 clips for 15 minutes with in-flight deduplication; the browser holds at most 12 clips. **These are process-local protections:** separate serverless instances may synthesize the same authorized text independently. There is no global exactly-once audio generation claim. Official debate jobs retain their database idempotency.

## Playback and voices

One playback owner cancels fetch/audio/browser speech on replacement, room/debate change or cleanup. A stable message ID tracks the active text. Late callbacks cannot revive cancelled playback. Autoplay consumes only new complete public entries and skips an old reconnect backlog; explicit replay remains available. A finite queue prevents overlap. Watchdogs recover missing audio/browser-start events. Browser voice loading uses `voiceschanged`; absent preferred voices use an available language/role fallback or the system default. Unsupported devices retain text-only operation.

Voice configuration lives in `src/themes/speech.ts`: judge Kore, lawyer A Puck, lawyer B Charon for Gemini, plus role-distinct browser voice preferences/pitch. All four themes configure delivery and pace without altering written content or evaluation rules. Native browser volume changes apply to the next utterance; mute/zero volume stops immediately. Gemini audio volume changes affect current playback. Speech speed applies to the next clip.

## Reviewed `texttospeech` branch

Inspected `origin/texttospeech` at `df47aa9`; its eight-file standalone experiment was based on the old Stage 2 code. Reused/adapted the PCM-to-RIFF/WAV encoder and fetch/blob/object-URL lifecycle approach. Did not merge the branch, copy its unauthenticated arbitrary-text endpoint, retain its text-key usage, import its demo page, or overwrite Stage 5/6A functionality. Current Gemini request fields were updated against official documentation.

## Verification record

The final checks and browser observations are appended below. Mocked playback tests do not prove audible device output; provider-generated WAV alone does not prove browser playback or verbatim pronunciation.

### Automated checks

- `npm run check` passed: **702 tests passed, 7 optional tests skipped**, then the Next.js production build succeeded. Coverage was 96.69% statements, 93.53% branches, 95.92% functions and 98.61% lines; the existing gates were unchanged.
- The final check ran from a temporary local snapshot with byte-identical `src/` and `tests/` and the same installed dependencies, after Documents-folder resource contention caused earlier timing failures. An earlier real failure (an ambiguous Settings storage-warning assertion) was fixed by scoping it to the display settings region. No timeouts or coverage thresholds were loosened.
- Tests cover separate credential use, exact saved-text requests, role/theme voices, missing credentials, quota/provider failures, invalid audio, safety refusals, bounded cache, receipt tampering/expiry/caller isolation, local playback lifecycle, autoplay deduplication, private-text exclusion, result acknowledgements, rematches, archived history and existing application regressions.
- Scanned commit candidates and generated browser bundles for all three installed private credentials: **zero matches**. The ignored local environment contains distinct text and TTS keys. No production environment or database schema was changed.

The opted-in Cloud suite also exercises genuine deadlines rather than shortening or forcing clocks. Its next-subtopic timing assertion now compares the persisted start/summary timestamps and full stored clock allocations; elapsed network/polling delay is not treated as lost player time.

### Live Cloud integration

`QUARREL_ALLOW_REMOTE_TESTS=true QUARREL_TEST_URL=http://127.0.0.1:3004 npm run test:stage6b` passed **all 14 grouped HTTP/Realtime checks** against the verified production build and existing Supabase Cloud project. These include room/position authorization, private consultation isolation, duplicate submissions, separate lawyer A/B WAV playback requests, cached replay, recipient-bound speech authorization, unchanged clocks/text during speech, actual disconnected-player deadline expiry, one summary per subtopic, one live saved jury verdict, judge-summary speech, refresh recovery, independent acknowledgement, mutual rematch and preserved earlier public results.

The completed text jobs were **4 AI / 0 demo / 4 labelled fallbacks**. This establishes successful live text and speech requests, not that every planner/summary request succeeded live. The Stage 6A jury assertion requires a real AI verdict and rejects a simulated completed result. All three speech roles returned valid WAV; provider failure recovery is separately covered by deterministic automated tests.

Earlier development-server attempts exposed a network-sensitive timestamp assertion and one initial Cloud creation timeout; the final production-mode run passed without those failures. Synthetic room `ab2426e9-9c37-46fe-991e-a0e729e5659f` and its anonymous test participants remain in the authorized project. No data was reset or deleted.

### Observed browser flow

Manually exercised two independent cookie sessions (`stage6b.localhost` and `stage6b-peer.localhost`) in the **ChatGPT in-app browser**, using the Courtroom theme. This is one browser engine, not evidence of cross-browser compatibility. All four theme voice configurations are exercised by automated tests; real playback was not manually checked in all four themes.

- Created a room and joined through the invitation page; both players entered separate positions and readied; host started the stored plan.
- Both lawyers produced live rewritten public arguments. Gemini media playback reached the real browser's playing state. Browser speech fallback also emitted its speaking state. No microphone request occurred.
- Pause/resume/stop and mute controlled local audio while authoritative clocks continued. A's Stop left B's playback running. New-subtopic speech remained available. Refreshed history did not autoplay again; the clock/phase restored.
- Judge summary replay displayed the exact saved summary and a speaking judge. This run's plan and summaries were labelled fallbacks after existing text-provider validation/timeout failures; the lawyers and final jury returned live AI output. Speech vocalized those saved texts without silently treating fallback summaries as live AI judgments.
- Both sessions rendered identical saved verdict text. A's acknowledgement appeared to B without acknowledging B. A's rematch request waited for B; B's approval returned both to a new setup while preserving players/theme and the previous result.
- Opened that previous result after rematch, inspected its public transcript, and replayed the saved final announcement with the judge role. Archive loading encountered a transient timeout and recovered through the existing retry interaction.
- No critical browser console errors were captured. Development emitted existing Supabase multiple-client/HMR and smooth-scroll warnings; these were not errors.

Desktop courtroom/history and archived-results screenshots were saved. The viewport tool accepted requested desktop/mobile overrides but DOM measurements remained 1280px; **mobile visual verification is incomplete**. Native Chrome control timed out. Safari, Firefox, mobile Safari and Chrome were not playback-tested. Responsive code review checked labelled controls, wrapping toolbar, stacked settings and verdict word wrapping; that is not a substitute for a real device check.

These checks observe actual media/browser-speech playback events and UI states, not a human listening test of every voice or every spoken word. Provider audio is generated from the exact saved transcript; semantic pronunciation/fidelity across all future output is not guaranteed by these tests.
