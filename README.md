# quarrel.io — Stage 6B: Speaking sidekicks and results

A private two-player debate game built with Next.js App Router, TypeScript, Tailwind, Supabase Cloud and Gemini. Players independently choose their positions and present arguments through personal AI lawyers. A neutral judge summarizes each subtopic; the jury evaluates the saved public record.

Stage 6B is developed on **`quarrel-stage-6b`**, based on completed Stage 6A (`fb09640`). It adds optional lawyer/judge speech, local audio preferences, richer saved results, independent acknowledgement, mutual rematches and earlier-results navigation. It preserves the existing courtroom design, debate clocks and evaluation rules. No Stage 6C or Stage 7 is included.

See [Stage 6B architecture and verification](docs/stage-6b.md) and the preserved [Stage 6A backend API contract](docs/stage-6a-api.md). Stage 6A's approved Cloud migration is already applied; Stage 6B requires no schema changes. This development branch does not replace `main` or production.

## Run locally

Requirements: Node.js 22.12+, npm, internet access, and the existing Cloud configuration. In an existing checkout:

```sh
git fetch origin
git switch quarrel-stage-6b
npm ci
```

For a fresh checkout:

```sh
git clone --branch quarrel-stage-6b https://github.com/diamster/falls-hacks-2026-quarrel.git
cd falls-hacks-2026-quarrel
npm ci
```

**Keep an existing `.env.local`. Do not overwrite it with `.env.example`.** Only for a new checkout without that file, copy `.env.example` to `.env.local` beside `package.json`, then configure:

```ini
SUPABASE_URL=https://exjdvtqsalnkghyohyuh.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-project-publishable-key
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_TTS_API_KEY=
GEMINI_TTS_MODEL=gemini-3.8-flash-tts
JUDGE_AI_MODE=auto
JUDGE_AI_TIMEOUT_MS=8000
JUDGE_SERVER_SECRET=your-existing-project-server-capability
```

Use only the Supabase **publishable** key, never a secret/service-role key. `GEMINI_API_KEY`, `GEMINI_TTS_API_KEY` and `JUDGE_SERVER_SECRET` are server-only credentials: keep them in ignored environment configuration, never commit them, and never use a `NEXT_PUBLIC_` prefix. All instances connected to this project must reuse its registered judge capability. Do not replace it or register a new hash merely to start another checkout. `JUDGE_MAX_MESSAGES_PER_TURN` in the example config is retained for legacy Stage 4; Stage 5 uses the approved per-subtopic quotas described below.

The existing Cloud project has anonymous sign-ins enabled. Its Stage 5 migration was reviewed, approved and applied without resetting historical data; see the [migration record and actual test results](docs/stage-5-testing.md). Repository migration filenames do not always match Cloud management timestamps. **Do not run an unreconciled database push, replay initial migrations, reset Cloud, or use `supabase:env` for Cloud configuration.** Inspect schema/history and show any new proposed migration to the user before applying it.

A genuinely new, unregistered project can use `npm run judge:setup` to generate a capability and hash-only registration SQL after the migrations are reviewed. That helper does not apply SQL. The existing project already has a registered capability; obtain and reuse its existing setting instead. Both live and demo AI processing require that capability as well as a verified room-member session.

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Keep one hostname consistently: `localhost` and `127.0.0.1` have separate cookies. To test both players locally, use two separate browsers or a normal and private window. Ordinary tabs share one player session.

For production mode locally, stop the development server, run `npm run build`, then `npm run start`. Stop/restart the production server around rebuilds to avoid mismatched assets. `npm run typecheck` checks TypeScript independently. Development and production builds use Webpack. A repeated Turbopack development refresh issue prompted this change; the final development recheck is recorded in the testing report. Docker remains optional for isolated CI/local database checks; it is not the app's selected backend.

## Play a debate

1. **Create or join.** The host creates a private room and shares the six-character code or invitation. The room has exactly two seats. New rooms use Courtroom.
2. **Agree on the setup.** The host enters the main topic and **2, 4, 6 or 10 minutes of writing time per player**. Each player independently writes and confirms their own position. Neither can edit the other's position. Both positions are visible before starting.
3. **Ready and plan.** Both players choose Ready. The planner creates 2–5 shared subtopics, each with at least 30 seconds per player, summing exactly to the chosen per-player duration. Both see the saved plan. The host may regenerate once, then presses **Start debate** explicitly while both players are connected. Start locks the topic, positions, plan and theme.
4. **Present through your lawyer.** On your turn, write a point and press **Present my argument**. Your clock stops while your lawyer prepares the presentation. The saved presentation appears for both players, then the opposing clock starts if that player still has time.
5. **Consult privately if useful.** **Ask my lawyer privately** is a separate action. The reply stays private, does not submit an argument, and resumes your own remaining clock after processing.
6. **Review each subtopic.** A opens odd subtopics; B opens even ones. When one player runs out of time, the other can continue. Only when both clocks reach zero does the judge save and display a neutral summary before the next subtopic.
7. **Read the jury decision.** After the final summary, the jury reviews the full official debate and all summaries, explains both sides' reasoning and returns A, B or split/inconclusive. It evaluates the presented case, not who is factually or morally right. Stage 6A distinguishes A, B, tie and inconclusive decisions. A provider failure leaves the jury retryable with no saved verdict; it does not fabricate an inconclusive evaluation.

AI and summary-display time is additional to the chosen writing time. The host's “4 minutes each” setting therefore does not promise a four-minute wall-clock debate. No Ask Judge chat, judge-question rounds or objection controls appear in the current flow. No AI-generated main topics, character customization, Team Mode, microphone input, voice/video calls or account-registration screen were added.

## Public arguments and private consultations

| Action | Who can read it | Clock after processing | Per-player limit, per subtopic |
| --- | --- | --- | --- |
| **Present my argument** | Both players see the lawyer presentation. The author can expand their original official draft, hidden from the opponent. The judge/jury receive only public presentations, not original private drafts. | Opponent starts if they have time; otherwise the same player continues if they have time. | 12 presentations; 600-character input; output at most 1.5× input, capped at 900 characters. |
| **Ask my lawyer privately** | Only the owning player and their lawyer. Never the opposing player, public transcript, judge summary or jury evidence. | The same player's remaining clock resumes. | 2 consultations; 600-character input. |

Only the active verified player can use either action. Both clocks pause during model processing. Quotas reset at the next subtopic; reaching a quota neither adds time nor ends the remaining clock. Submitted history survives refresh; unsent text is local to the current tab. A private consultation does not erase an unsent official draft.

Lawyers are instructed to preserve meaning and qualifications, without adding facts, evidence or new arguments. Bounded context, structured responses, validation and unchanged-text fallbacks reduce errors; they cannot guarantee that every live rewrite is semantically perfect. Original official drafts remain available only to their author in the client; Stage 6A excludes them from judge/jury context. Private consultations are excluded from that evidence.

## Courtroom, history and Settings

The pixel-art arena preserves the four existing environments, players and judges, with new original lawyers and jurors for each theme. Public messages appear chronologically beside the courtroom on desktop. The history follows new messages unless you are reviewing older entries; a jump-to-latest control returns to the end. On narrow screens, use the collapsible history panel. The composer and private consultation record remain separate from that shared transcript.

Open **Settings** from the navigation or room. All four themes have preview cards:

| Theme ID | Environment | Judge |
| --- | --- | --- |
| `courtroom` | Traditional wooden courtroom; default for new rooms | Judge Rowan, formal and composed |
| `jungle` | Preserved tropical court and original lion/zebra cast | Judge Moki, playful and dramatic |
| `superhero` | Gothic rooftop and original superhero characters | Rook, witty and analytical |
| `detective` | Monochrome office, rain and Venetian blinds | Detective Vale, observant and skeptical |

The host can change a room's theme before Start; the guest can preview but cannot change it. Changes synchronize and survive refresh. Started rooms are locked. Existing rooms keep their stored theme. Invalid render IDs fall back to Courtroom; invalid writes are rejected rather than silently changing the room.

Personal animation-pause, reduced-motion and text-size settings are stored only in that browser. They never pause the game clock or alter shared rules. Audio settings are also local: enable speech, mute, volume, automatic playback and speech rate. AI-policy and gameplay settings remain unchanged. Theme configuration controls presentation and personalities; the same neutrality and evaluation rules apply to every theme. The original local-only art/state preview remains at `/preview`.

## Hearing the sidekicks and reviewing results

Enable character speech in the courtroom or Settings. New saved public lawyer presentations and judge summaries/announcements can play automatically, while **Replay** reads an earlier saved message. Pause/resume and Stop control only your playback. Text remains visible; the opponent can write immediately after the server saves a presentation, even while audio plays. Refreshing does not automatically reread the old transcript.

Gemini TTS uses **only `GEMINI_TTS_API_KEY`**. Leave it blank for text-only operation or choose the optional browser speech fallback. The existing `GEMINI_API_KEY` remains exclusively for planner, lawyer, judge and jury text. Audio failures never pause/reset clocks or trigger another argument rewrite. Browser voices vary by device; enable audio with a user gesture, and use text if playback is unsupported. General audio preferences are under Settings and never change the other player's preferences.

After the saved verdict arrives, each participant can acknowledge reading it without agreeing with it. A rematch starts a new setup only after both players approve; previous results remain available. The public-history panel includes subtopic and summary navigation and replay controls. Private lawyer consultations remain separate and have no speech controls.

## Start screen, recovery and leaving

The quarrel.io logo and **Back to start** return to the welcome screen without losing the saved seat. Completed debates do not automatically replace the start screen on a plain `/` visit: choose **Resume room** to inspect them. Explicit room links restore the saved record; `/?start=1` keeps the welcome screen open. Going to Settings or the start screen does not pause a live clock.

Use **Create or join another room**, then confirm **Leave room**, to start fresh in the same browser. Cancellation or failure retains your seat. Leaving detaches only your membership, preserves the historical record, and prevents another person from inheriting your departed seat. Your anonymous Auth session remains available for creating/joining a new room. Stale-tab requests carry the expected room ID and cannot mutate your newer room.

Historical Stage 3/4 records remain readable as archives; the current app does not expose their obsolete Ask Judge or objection controls. A refresh restores saved Stage 5 positions, plan, clocks, public messages, owner-only consultations and verdict. Unsent drafts do not persist across a page reload.

## Server authority and AI handling

PostgreSQL serializes room transitions under a room lock, derives identity from `auth.uid()`, computes elapsed time from server timestamps and validates revisions, subtopics and the displayed plan generation. Browser clocks estimate server time for display; they cannot authorize a send or advance an unexpired turn. A disconnected active player's clock continues. Reconciliation uses the original deadline chain and never grants fresh time on reconnect.

The server reserves idempotent work before generating, claims each job once and saves validated output before clients display it. Both browsers read the same saved public result. Realtime carries member-protected room invalidation signals, not private message bodies; authenticated snapshots filter the data for each player. Direct private-table access and mutations remain denied. The existing two-seat capacity, HttpOnly session cookies, same-origin action checks and membership protections are preserved.

One Gemini engine handles planning, public lawyer presentations, private consultations, judge summaries and jury evaluation. Keys and the worker capability never reach browser code. Role-specific context excludes private consultations from public roles. Only the jury's structured result can identify an outcome. Submitted text is untrusted data; personalities affect wording, not evidence standards. Threats, abuse and coercion receive safer redirection rather than competitive judgment.

`JUDGE_AI_MODE=auto` uses Gemini when configured; `demo` produces deterministic labelled responses. Failed, malformed or timed-out public lawyer output becomes the **unchanged submitted text**, labelled unedited fallback. AI timeout defaults to approximately eight seconds. Pending work also has a lease; an authorized read/heartbeat recovers expired work without another model call, and a late response cannot replace a completed result. There is no permanent background worker: progress after all clients disconnect is reconciled when a participant returns. Fallback summaries remain factual, labelled descriptions of the public transcript. Stage 6A never saves a fallback verdict: failed jury attempts use fenced, bounded retries followed by an explicit participant retry. Optional `GEMINI_FALLBACK_MODEL` permits one alternate Gemini model on rate limits/provider outages within the same timeout; it is unset by default.

Rooms expire after 24 hours; expiry is an access rule, not automatic deletion. Connection indicators use authenticated heartbeats and may show sleeping/background devices as disconnected. Realtime outages fall back to periodic refresh. The Cloud project is dedicated to quarrel: its insert/update-only publication guard also affects other tables added to that project. Do not remove the guard or weaken Auth protections to make tests pass.

## Tests and verification

```sh
npm run typecheck
npm run check
# Unit/component/policy/security tests, unchanged coverage gates, then production build
```

For authorized Cloud integration checks after the reviewed migration is applied, start the app on the port expected by the suite, then use the explicit remote opt-in:

```sh
QUARREL_ALLOW_REMOTE_TESTS=true npm run test:supabase
QUARREL_ALLOW_REMOTE_TESTS=true npm run test:api
QUARREL_ALLOW_REMOTE_TESTS=true npm run test:leave
QUARREL_ALLOW_REMOTE_TESTS=true npm run test:lawyer
```

Check each suite's `QUARREL_TEST_URL` default before running. These tests target the backend configured in `.env.local`, even when the website is localhost. They create synthetic anonymous users/rooms in the authorized development project; do not point them at an unrelated database or reset existing data. Legacy `test:debate` and `test:judge` check earlier-stage compatibility, not the new Stage 5 flow. `test:judge:live` is a separately opted-in earlier-stage live Gemini check; passing it alone does not verify the new roles. `test:db` and the GitHub Actions database job use isolated local Supabase, not the selected Cloud backend.

Stage 6B verification is recorded in [the Stage 6B report](docs/stage-6b.md). It separates unit/component checks, real Cloud and Gemini requests, and browser playback observations. The existing coverage gates remain 90% statements/functions/lines and 85% branches.

For the explicitly opted-in real speech/clock suite, start the app locally and run:

```sh
QUARREL_ALLOW_REMOTE_TESTS=true QUARREL_TEST_URL=http://127.0.0.1:3004 npm run test:stage6b
```

This takes several minutes because it preserves the full minimum writing time. It creates synthetic Cloud participants and checks up to three new speech generations plus cached replays; it does not force deadlines or reset data. Existing reports remain available: [Stage 6A](docs/stage-6a-testing.md), [Stage 5](docs/stage-5-testing.md), [Stage 4](docs/stage-4-testing.md), [Stage 3](docs/stage-3-testing.md), [Cloud setup](docs/stage-2-5-cloud.md), and [Stage 1](docs/testing.md).

## Files

| Location | Responsibility |
| --- | --- |
| `src/components/stage-five-app.tsx` | Current start screen, lobby, speech-provider composition and results access |
| `src/components/lawyer-results.tsx` | Rich saved verdicts and participant-only previous-result navigation |
| `src/components/character-speech.tsx`, `audio-preferences.tsx` | Playback queue, controls, and personal Settings |
| `src/lib/character-speech.ts`, `speech-preferences.ts` | Cancellable Gemini/browser playback and local preferences |
| `src/themes/speech.ts` | Central delivery and voice configuration for judge and both lawyers |
| `src/server/speech-provider.ts`, `speech-receipts.ts` | TTS-only credential, canonical-text authorization, validated audio, bounded cache/rate limits |
| `src/components/room-controls.tsx` | Shared room creation/joining, readiness, invitation and leave controls without a circular app import |
| `src/components/lawyer-debate.tsx` | Independent positions, timed plan preview, dual clocks, public/private inputs and jury result |
| `src/components/debate-history-panel.tsx` | Sticky desktop transcript, mobile collapse and manual-reading-aware scrolling |
| `src/app/settings/`, `src/components/settings-page.tsx` | Dedicated theme previews and host-only pre-start selection |
| `src/components/display-preferences.tsx` | Browser-local animation/motion/text settings |
| `src/lib/lawyer-types.ts` | Stage 5 snapshot, jobs, messages, plan, verdict and clock contracts |
| `src/server/lawyer-policy.ts` | Shared role instructions, structured contracts, bounded context and deterministic results |
| `src/server/judge-engine.ts`, `judge-worker.ts` | Existing Gemini engine extended with Stage 5 roles and single-claim work |
| `src/app/api/rooms/lawyer/`, `src/server/room-api.ts` | Verified-member Stage 5 routes and input validation |
| `src/lib/room-client.ts`, `room-types.ts` | Shared request transport, Realtime, heartbeat and recovery |
| `src/themes/` | All four original theme definitions and new lawyer/jury art/personality configuration |
| `supabase/migrations/20261107215110_stage5_lawyer_debate.sql` | Additive Stage 5 private state, authorized RPCs and safe new-room default |
| `supabase/tests/database/lawyer.test.sql`, `tests/db/lawyer.cloud.sql` | Stage 5 database authorization, privacy, clocks and transition checks |
| `tests/` | Current and preserved component, server, policy, transport and integration checks |
| `src/app/preview/`, `src/components/pixel-art.tsx` | Original local preview and preserved Jungle artwork |

Stable player IDs and solo-only mode metadata remain preparation for later stages; no customization or teams are enabled. Fonts and original SVG artwork are bundled locally; see [art notes](public/art/ART.md). New theme-specific sidekick art is in `src/themes/art/sidekicks.tsx`.
