# quarrel.io — Stage 4

Four original pixel-art settings for private two-player rooms, built with Next.js App Router, TypeScript, Tailwind, Supabase PostgreSQL and Realtime. Stage 4 adds a **shared interactive Gemini judge**: ask questions during your turn, receive contextual replies, and answer saved clarification questions based on both sides’ arguments. Topic agreement, six timed turns, all four themes and the multiplayer lobby remain intact. The debate ends with a **placeholder verdict**, without a winner or score. No objections, character customization, Team Mode, account registration, voice or video are implemented.

The original Stage 1 artwork and local interaction preview are preserved at `/preview`. This standalone repository, [diamster/falls-hacks-2026-quarrel](https://github.com/diamster/falls-hacks-2026-quarrel), is the home for all quarrel.io work. Stage 4 extends the existing application on `quarrel-stage-4`; earlier stage branches retain their history.

## Run locally with Supabase Cloud

The app now targets the quarrel Cloud project `exjdvtqsalnkghyohyuh`. The Next.js website still runs on your computer; this does not publish the website. Requirements: Node.js 22.12+, npm, internet access, and this project's **publishable** API key. Docker is only needed for the optional local database/CI workflow below.

```sh
git clone --branch quarrel-stage-4 https://github.com/diamster/falls-hacks-2026-quarrel.git
cd falls-hacks-2026-quarrel
npm ci
```

For a fresh checkout, copy `.env.example` to `.env.local` next to `package.json`. Keep an existing configured file. Supply the publishable key and optionally a Gemini API key:

```ini
SUPABASE_URL=https://exjdvtqsalnkghyohyuh.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-project-publishable-key
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
JUDGE_AI_MODE=auto
JUDGE_AI_TIMEOUT_MS=8000
JUDGE_MAX_MESSAGES_PER_TURN=2
```

Copy only the Supabase publishable key from [the project's API Keys page](https://supabase.com/dashboard/project/exjdvtqsalnkghyohyuh/settings/api-keys). Never configure a Supabase secret/service-role key. The optional `GEMINI_API_KEY` and the separate generated `JUDGE_SERVER_SECRET` are server credentials: keep them in ignored `.env.local`, never commit them, and never prefix them with `NEXT_PUBLIC_`. Restart the app after changing its environment. Do not run `supabase:env` to configure Cloud; that helper generates local settings.

The Cloud project needs anonymous sign-ins enabled in [Authentication Providers](https://supabase.com/dashboard/project/exjdvtqsalnkghyohyuh/auth/providers), the existing schema plus both Stage 4 migrations, and the member-protected Realtime publication. The current project is already configured. Before setting up another instance or changing its database, review [Stage 4 verification](docs/stage-4-testing.md), [Stage 3 verification](docs/stage-3-testing.md), and [Cloud setup history](docs/stage-2-5-cloud.md). Management-tool timestamps differ from repository migration filenames; do not replay the initial schema, reset the database, or run an unreconciled database push.

For a new server instance that does not yet have a registered capability:

```sh
npm run judge:setup
```

This creates a cryptographically random `JUDGE_SERVER_SECRET` if absent, preserves the other environment settings, restricts `.env.local` to mode `0600`, and prints **hash-only registration SQL**. It does not connect to or change any database. After reviewing both Stage 4 migrations, run the generated SQL in the intended project’s [SQL Editor](https://supabase.com/dashboard/project/exjdvtqsalnkghyohyuh/sql). Only a SHA-256 hash is stored in private `judge_settings`; the raw secret stays on the application server. Re-running setup reuses an existing valid secret. Registration accepts an unset hash or the same existing hash and **refuses to replace a different registered capability**. All instances using this project must reuse its existing server capability; changing it requires a separate, explicit rotation coordinated across those instances. An already configured checkout needs only `npm run dev`.

For automation, `npm run judge:setup -- --sql-out /tmp/quarrel-judge-registration.sql` creates a new file containing only that SQL, refusing to overwrite an existing file. Registration is required in **both live and demo mode**. It authorizes trusted job handling while every room action still requires the verified player session; it grants no Supabase service-role access.

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) or [http://127.0.0.1:3000](http://127.0.0.1:3000). Use one hostname consistently in each browser: they have separate cookies. Local-only room codes and sessions do not migrate to Cloud; refresh and create a new room if an old local session is rejected.

Create a room with a display name, then open its invitation in a **different browser or private browser window**. Ordinary tabs share a player session. The creator is Player A and chooses the setting from the lobby’s four preview cards. The joiner is Player B and sees the host’s current setting. Jungle starts with the lion and zebra; the other themes supply their own default characters. Each player can toggle only their own readiness. Both-ready confirms the lobby is ready. Player A starts explicitly after the topic and positions are approved; that action locks the theme and topic.

For production mode locally:

```sh
npm run build
npm run start
```

Stop any server using the same port first. Stop/restart a production server around a rebuild to avoid serving mismatched assets. `npm run typecheck` checks TypeScript independently. The supported Webpack build remains the default from Stage 1.

## Start screen and saved rooms

Use **Back to start** (or the quarrel.io logo) to return to the welcome screen. A saved seat appears behind **Resume room**; its topic, theme and history are preserved. A completed room no longer opens automatically when visiting `/` without a room link. Explicit `/?room=CODE` URLs still restore the saved room after refresh; `/?start=1` keeps the welcome screen open. Returning to start does not pause a live debate.

The existing one-room-per-session restriction remains. Creating or joining a fresh room while keeping the saved seat requires another browser or private window. New visitors without a saved session still see the Create/Join form.

## Play a debate

1. Player A chooses a theme and proposes a topic plus two distinct opposing positions. Submitting the proposal confirms A’s position.
2. Player B approves the topic and their position, or sends a change request. A revised proposal requires B’s approval again and clears both Ready flags.
3. Both players choose Ready. Player A presses **Start debate**; both players must be connected. Topic, positions and theme are then locked.
4. Opening statements: A has 45 seconds, then B has 45 seconds. Each can see only their own submitted opening until both turns finish. Both results then reveal together.
5. Rebuttals: A, then B, each with 45 seconds and the opening statements visible.
6. After both rebuttals, the judge prepares one clarification question per side. Both questions are saved together and shared identically before A’s full 30-second answer turn begins, followed by B’s 30 seconds. A labelled deterministic fallback is used if generation is unavailable.
7. The selected judge appears with a placeholder verdict message and the full debate history. No winner or score is generated.

Submitting early starts the next player’s full turn immediately. An expired turn is recorded as missed; unsent text is never submitted automatically. Arguments accept up to 2,000 Unicode characters. Submitted work survives refresh; unsent drafts exist only in that tab and are cleared when its turn changes. Artwork pause/reduced motion never pauses the debate clock.

## Debate state and timing

The database serializes each transition using the room row lock and `clock_timestamp()`. Requests carry the expected proposal revision and turn index, but never an authoritative player ID, phase or deadline. Unique entries prevent duplicate submissions, and stale, late or out-of-turn arguments are rejected even if browser controls are bypassed.

`quarrel_private.debates` and `quarrel_private.debate_entries` store the topic, deadlines and history without client table grants. Members receive filtered snapshots through authenticated RPCs. The existing member-protected room Realtime stream carries only a `debate_version` invalidation signal; concealed opening text is never placed on public room/player rows or in Realtime payloads.

The countdown uses a database time sample and monotonic elapsed time, with approximate network transit compensation. The displayed second may differ slightly across devices; PostgreSQL alone accepts or rejects a submission. Either connected client asks the server to reconcile at a deadline, and the existing heartbeat is a fallback. If everyone is offline, no background worker runs: the next authorized read/heartbeat reconciles all elapsed turns against the original deadline chain, so reconnecting never resets or extends the clock. Authenticated reconnects can submit only in their own still-open turn.

Theme-specific introductions and round announcements live in `theme.judge.debateDialogue`, separate from the mechanics. They are scripted, personalized with the agreed topic, names and current speaker, and saved in shared history. Clarification questions have stable IDs and `source: "ai" | "demo" | "fallback"`; historical Stage 3 rooms can retain placeholder questions. The `verdict` phase remains only a completion boundary for a future Stage 6 evaluator.

## Talk to the judge

During your active turn, **Ask Judge** sends a separate message; **Submit Argument** submits your official statement. Asking does not submit an argument, end a turn, extend the timer or change the phase. Both participants see every judge conversation, including the sender, pending state and reply, and it survives refresh. Judge messages are public **within that private room**, not private coaching. The interface shows thinking, speaking and questioning states using the existing themed characters.

Each player can ask two messages per turn by default, up to 600 characters each. The server enforces a three-second interval and one pending job per room. Duplicate retries reuse the saved request instead of creating another reply or API call. The limit is configured with `JUDGE_MAX_MESSAGES_PER_TURN` (1–5) and captured when a debate starts. The question-generation pause has no active player or running answer timer; both answers always retain the existing 30-second allowance.

Hidden official openings are excluded from the shared judge’s context, even from their author, until both opening turns finish. Text you deliberately send through **Ask Judge** is immediately shared with your opponent. After reveal, the engine receives up to six official entries, the saved questions, and the last eight completed chat exchanges. Context is bounded to this room; no cross-room or long-term personal memory is used.

The shared engine uses Gemini’s server-side `generateContent` API with structured JSON and validation. Its default model is `gemini-3.6-flash`; the configured timeout defaults to 8 seconds and is bounded to 1–12 seconds. Output is capped at 1,600 tokens, and failed calls are not automatically retried. Missing keys or `JUDGE_AI_MODE=demo` provide deterministic contextual demo replies without network calls. A debate started in demo mode stays in demo mode; add a key and start a new room to try live AI. Provider errors, refusals, timeouts and invalid output produce labelled fallback replies/questions, without discarding the player’s message.

Personality changes wording only. All four judges share the same neutrality rules: treat claims as unverified, request evidence or clarification, consider both positions, avoid invented evidence, and never declare a winner. Player text is serialized as untrusted data separately from system instructions. The model receives no tools or database authority. Output validation rejects unsupported structures and common winner/score/phase instructions; these safeguards do not guarantee perfect model wording. Serious threats, abuse or coercion are redirected toward safer discussion instead of competitive judging.

The server reserves each request in PostgreSQL, then claims and finishes it using both the verified participant session and the server capability. Clients cannot supply that capability, forge judge replies or claim work using their publishable key/player token. Private tables hold conversation text; Realtime publishes only a room-version signal so members fetch their authorized snapshot. A stalled claimed job receives a deterministic recovery result on a later authorized read after its 20-second deadline, without another model call. There is no always-running background worker; keep the app connected to process pending work.

Existing Stage 3 rooms and its legacy authenticated start RPC remain compatible without judge chat. The application’s Start button always uses the new judged-start RPC. No AI-generated topics, objections or actual verdicts are included.

## Optional local database and CI

For an isolated local stack, run Docker Desktop and use:

```sh
npm run supabase:start
npm run supabase:env
npx supabase migration up
npm run judge:setup -- --sql-out /tmp/quarrel-judge-registration.sql
npx supabase db query --file /tmp/quarrel-judge-registration.sql
rm /tmp/quarrel-judge-registration.sql
npm run dev
```

Use a separate checkout or keep your Cloud `.env.local` safely outside the working copy before generating local settings. The environment helper refuses to overwrite an existing file and writes only the local API URL/publishable key. With the installed CLI v3, `migration up` and `db query` target the local stack by default; the commands above contain no remote target. First startup downloads the local containers. `npm run supabase:stop` retains local data; `npm run supabase:start` restores it. Local migrations update the existing stack without a reset. CI sets `JUDGE_AI_MODE=demo`, generates an isolated capability and runs the Stage 4 HTTP/Realtime checks without a Gemini key.

GitHub Actions continues to use isolated local Supabase. Neither its settings nor `supabase/config.toml` configures the Cloud project. Local website URLs are only usable on this computer; a shareable public website needs its own deployment. No hosted website deployment was performed.

## Four shared settings

| Theme ID | Setting and default players | Judge and presentation personality |
| --- | --- | --- |
| `jungle` | Preserved tropical court; Leo the lion and Zuri the zebra | Judge Moki, the lemur: playful, energetic and dramatic |
| `superhero` | Gothic rooftop, searchlight and skyline; Nova the scout and Kit the inventor | Rook, an original superhero sidekick: heroic, witty and analytical |
| `detective` | Monochrome office, rainy windows and blinds; Quinn the reporter and Ellis the witness | Detective Vale: observant, skeptical and dryly humorous |
| `courtroom` | Traditional wood courtroom and balanced scales; Morgan and Casey, advocates | Judge Rowan: formal, composed and professional |

Player A can switch settings while the room is in the lobby, including after both players choose ready. The selected ID is saved in PostgreSQL and sent through the existing Supabase Realtime connection. Player B has a read-only selector; joining or refreshing either player restores the selected theme. Theme changes preserve names, seats, connection tracking and readiness.

Before starting, the **Judge dialogue preview** uses predefined samples in the current tab. During a debate the bubble displays shared announcements, judge replies and clarification questions. Each theme’s personality, dialogue style, speech treatment, animation settings and sample text live in configuration. The same shared AI engine loads this configuration. Idle, listening, thinking, speaking, questioning and surprised reactions reuse simple CSS; objection/verdict styles remain unimplemented metadata.

Unknown theme or player-character IDs fall back safely when rendering. The API and database reject invalid theme writes, leaving the saved setting unchanged. A database `theme_locked` flag is checked by the host-only mutation RPC; the Stage 3 start transaction sets it together with the first deadline. There is no unlock or rematch API.

## Theme architecture and later stages

`src/themes/types.ts` defines the serializable theme contract. The four theme files declare palettes, environment/bench assets, separate player and judge assets, judge identity/personality/style, sample dialogue, animation configuration and UI settings. `src/themes/index.ts` is the registry and safe resolver; `assets.tsx` maps asset IDs to local SVG components; `styles.ts` supplies CSS variables. The lobby and `DebateArena` consume the same resolved configuration. Multiplayer transport and authorization are shared across all themes.

`neutralityPolicy` is the single shared policy used by the Stage 4 judge engine. Personality changes wording only and may not change the standards, favor a player or determine a winner. There are no scoring or outcome rules in this stage.

For future Stage 8 customization, each theme has a stable-ID player registry and exactly two default player designs. `PixelCharacter` accepts a character ID independently of display name/seat, and falls back to that theme’s default if no valid player selection exists. Judge assets are outside that player registry. `RoomPlayer.selectedCharacterId` is an optional type field only; there are no character-selection controls, database writes or extra selectable character designs.

For future Stage 9 team mode, types distinguish player identity, optional team membership and a `RoundRepresentativeAssignment` containing a round, team and representative player ID. `playableModes` currently contains **only solo**, with capacity two. Unsupported modes resolve to solo; metadata cannot add seats. Existing database capacity constraints and authorization remain unchanged. No teams, private team chat, representative selection/rotation, team UI or team debate logic are implemented. These type boundaries prepare for a later optional 4v4 mode without enabling it now.

To add another theme later, extend the configuration/asset registry, add its original default art, extend the database theme allowlist in a new migration, and cover its rendering, fallback and synchronized host selection. Keep evaluation rules and multiplayer code independent of presentation.

## Session and room behavior

- Room codes contain six cryptographically random, unambiguous uppercase letters/digits, with a unique database constraint. Treat the invitation as a private invite: anyone possessing it can claim the unfilled second seat.
- Display names are 1–32 characters. Names, readiness and selected room theme synchronize through Supabase Realtime; a ten-second heartbeat also refreshes the room as a fallback.
- Each browser gets a Supabase anonymous Auth session through the server. There is no registration form. Access and refresh credentials use HttpOnly, SameSite=Strict cookies, with Secure on HTTPS. The short-lived access token is supplied in memory to the member's Realtime client; no refresh token or service key reaches browser JavaScript.
- The server validates the session with Supabase Auth. PostgreSQL RPCs derive the player from `auth.uid()`, never a submitted player ID or slot. Request fields are allowlisted, cross-origin writes are rejected, and JSON bodies are bounded while streaming: 1 KB for simple actions, 2 KB for change requests, 4 KB for proposals, 8 KB for judge requests and 16 KB for arguments, with tighter field-length checks.
- RLS allows authenticated members to read only their room and its players. Direct table mutations are denied, including changing your own row. Narrow RPCs enforce the allowed operations. A row lock and database constraints serialize competing joins; exactly two seats exist.
- Connection status reflects an authenticated heartbeat within 35 seconds. A stopped/closed client normally appears disconnected within about 45 seconds after the last heartbeat. Sleeping devices/background timer throttling can also appear disconnected. Realtime transport failure falls back to heartbeat refreshes, with an explicit status message.
- Readiness is retained across refreshes/disconnections, but both-ready confirmation requires both players to be currently connected. A disconnected player's seat stays reserved; a third player cannot take it.
- Rooms expire after 24 hours. Sessions survive ordinary refreshes and server restarts. Clearing browser cookies or an invalid/revoked session loses that seat; a name/code is not enough to impersonate its owner. Temporary Auth outages preserve recovery cookies.
- One active room per anonymous session. No leave/kick/spectator/rematch controls are implemented. Expired room rows and anonymous test users remain in the selected database; expiry is an access rule, not automatic deletion. A future retention policy must distinguish test fixtures from real rooms.

This migration assumes a **dedicated quarrel Supabase project**. It restricts the `supabase_realtime` publication to inserts/updates for the entire project, because Supabase Postgres Changes does not apply RLS to DELETE events. This prevents deleted room metadata from leaking. Review that publication-wide setting before applying the migration to a shared project.

Cloud uses `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` with verified anonymous player sessions and the same database authorization rules. A future public website deployment needs HTTPS and appropriate anonymous-sign-in abuse protection. Existing rate limits or CAPTCHA protections must not be disabled merely to make tests pass. Cloud connection results are recorded separately from [the earlier local-only verification](docs/stage-2-5-testing.md).

## Tests

```sh
npm run check           # Stage 1–4 tests, coverage gate, build; no live AI by default
QUARREL_ALLOW_REMOTE_TESTS=true npm run test:supabase
# Preserved Cloud room/theme/Auth/Realtime regression checks
QUARREL_ALLOW_REMOTE_TESTS=true npm run test:debate
# Stage 3 approval/turn/privacy/race/Realtime checks and a real 45-second expiry
QUARREL_ALLOW_REMOTE_TESTS=true npm run test:judge
# Running app on port 3000: shared judge, authorization, quotas, hidden openings,
# saved questions/full answer timer, refresh, Realtime and placeholder completion
RUN_LIVE_JUDGE_TESTS=true npm run test:judge:live
# Optional: three synthetic Gemini calls; requires a key and may incur API charges
```

The remote opt-in is required when `.env.local` points at the authorized Cloud development project. For local Supabase, use `npm run test:supabase` without that flag. Do not use remote integration tests against an unrelated or production project.

For actual application route tests, first run the built app on port 3001 in another terminal:

```sh
npx next start --hostname 127.0.0.1 --port 3001
QUARREL_ALLOW_REMOTE_TESTS=true npm run test:api
QUARREL_ALLOW_REMOTE_TESTS=true QUARREL_TEST_URL=http://127.0.0.1:3001 npm run test:judge
```

`test:api` defaults to port 3001; `test:judge` defaults to port 3000. Set `QUARREL_TEST_URL` explicitly when needed. API tests exercise whichever Supabase backend the running app uses, even though the website URL is local. Each integration suite creates three anonymous users and one test room in that backend; users/room rows remain afterward. They never print session tokens or reset existing rooms. The judge HTTP suite creates at most four generation jobs and accepts live or labelled fallback output; the separate opt-in live tests require real AI output. The room Realtime suite deliberately waits 36 seconds to verify disconnection; the debate suite waits for a real 45-second opening expiry. Optional `npm run test:db` still targets a local stack for CI; it is not a Cloud test. Hosted sign-in limits can affect repeated runs; wait for the applicable limit instead of weakening it.

`npm test` runs once; `npm run test:watch` watches changes. `npm run test:coverage` generates `coverage/index.html` and enforces the existing 90% statement/function/line and 85% branch gates. These tests do not replace browser inspection. See [the Stage 4 testing report](docs/stage-4-testing.md), [the Stage 3 report](docs/stage-3-testing.md), [the Cloud follow-up](docs/stage-2-5-cloud.md), [the earlier Stage 2.5 local report](docs/stage-2-5-testing.md), [the Stage 2 record](docs/testing-stage-2.md), and [the preserved Stage 1 record](docs/testing.md).

GitHub Actions runs the build, regression suite and local Supabase integration tests using Docker. No production credentials or deployment are involved. The existing workflow filename remains `.github/workflows/quarrel-stage-1-checks.yml` for continuity.

## Files

| Location | Responsibility |
| --- | --- |
| `src/components/multiplayer-app.tsx` | Shared lobby and debate composition, invitations, readiness and themes |
| `src/components/debate-ui.tsx` | Proposal approval, round status, argument input, history and completion placeholder |
| `src/components/judge-panel.tsx` | Separate Ask Judge composer, shared conversation, pending and error states |
| `src/server/judge-engine.ts`, `judge-worker.ts` | Shared Gemini/demo engine, bounded context, validation and trusted single-claim work |
| `src/lib/judge-types.ts` | Shared conversation, job and response contracts |
| `scripts/judge-config.mjs` | Local capability setup and hash-only registration SQL; no network access |
| `src/lib/debate-types.ts` | Snapshot/question/history contracts and monotonic countdown calculation |
| `src/themes/` | Four theme definitions, safe resolvers, palettes, original SVG assets and shared neutrality policy |
| `src/components/theme-selector.tsx`, `theme-preview.tsx` | Host-only theme cards and selection status |
| `src/components/debate-arena.tsx`, `pixel-character.tsx` | Theme-aware scene, character-ID rendering and separate judge rendering |
| `src/lib/game-modes.ts` | Solo-only capacity configuration and future team/round-representative types |
| `src/lib/room-client.ts`, `room-types.ts` | Typed room transport, serialized requests, Realtime and recovery |
| `src/app/api/rooms/`, `src/server/room-api.ts` | Session-authorized Next.js routes, validation and cookies |
| `supabase/migrations/` | Tables, constraints, RLS, membership RPCs and publication |
| `supabase/tests/database/`, `tests/db/` | Real database, Supabase and HTTP integration tests |
| `src/app/preview/`, `src/components/quarrel-app.tsx` | Original local-only Stage 1 preview |
| `src/components/pixel-art.tsx` | Unchanged original lion, zebra, lemur, jungle and bench artwork |
| `src/components/courtroom.tsx`, `character.tsx` | Reused scene with optional real names/code; Stage 1 defaults retained |
| `tests/` | Component, transport and server validation/security tests |

Original pixel-art notes: [ART.md](public/art/ART.md). Fonts and artwork remain bundled locally. Keyboard controls, live feedback, responsive layout, pause and reduced-motion styles are preserved.

Implementation references: [Gemini generateContent](https://ai.google.dev/api/generate-content), [Gemini 3.6 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash), [Supabase anonymous sessions](https://supabase.com/docs/guides/auth/auth-anonymous), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), and [Postgres Changes / DELETE behavior](https://supabase.com/docs/guides/realtime/postgres-changes#receiving-old-records).
