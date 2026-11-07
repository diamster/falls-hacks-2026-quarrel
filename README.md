# quarrel.io — Stage 3

Four original pixel-art settings for private two-player rooms, built with Next.js App Router, TypeScript, Tailwind, Supabase PostgreSQL and Realtime. Stage 3 adds topic agreement, opposing positions and six server-timed turns ending in a **placeholder verdict**. All four themes and the existing multiplayer rooms are preserved. No AI, account registration, real objections/verdicts, voice or video are implemented.

The original Stage 1 artwork and local interaction preview are preserved at `/preview`. This standalone repository, [diamster/falls-hacks-2026-quarrel](https://github.com/diamster/falls-hacks-2026-quarrel), is the home for all future quarrel.io work. The completed Stage 2 baseline remains on `main`; the completed Stage 2.5 remains on `quarrel-stage-2-5`; this stage extends it on `quarrel-stage-3`.

## Run locally with Supabase Cloud

The app now targets the quarrel Cloud project `exjdvtqsalnkghyohyuh`. The Next.js website still runs on your computer; this does not publish the website. Requirements: Node.js 22.12+, npm, internet access, and this project's **publishable** API key. Docker is only needed for the optional local database/CI workflow below.

```sh
git clone --branch quarrel-stage-3 https://github.com/diamster/falls-hacks-2026-quarrel.git
cd falls-hacks-2026-quarrel
npm ci
```

Create `.env.local` next to `package.json`:

```ini
SUPABASE_URL=https://exjdvtqsalnkghyohyuh.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-project-publishable-key
```

Copy only the publishable key from [the project's API Keys page](https://supabase.com/dashboard/project/exjdvtqsalnkghyohyuh/settings/api-keys). Never put a secret or service-role key in the app configuration. `.env.local` is ignored by Git and must not be committed. Restart the app after changing it; do not run `supabase:env` to configure Cloud, because that helper generates local settings.

The Cloud project needs anonymous sign-ins enabled in [Authentication Providers](https://supabase.com/dashboard/project/exjdvtqsalnkghyohyuh/auth/providers), the three repository migrations applied, and the member-protected Realtime publication. See [Stage 3 verification](docs/stage-3-testing.md) and [Cloud setup history](docs/stage-2-5-cloud.md) before making database changes: this project has existing migration history, so do not reapply the initial schema or blindly run a database push.

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
6. Questions: each receives a predefined clarification question and 30 seconds, A then B. Questions are explicitly marked as placeholders.
7. The selected judge appears with a placeholder verdict message and the full debate history. No winner or score is generated.

Submitting early starts the next player’s full turn immediately. An expired turn is recorded as missed; unsent text is never submitted automatically. Arguments accept up to 2,000 Unicode characters. Submitted work survives refresh; unsent drafts exist only in that tab and are cleared when its turn changes. Artwork pause/reduced motion never pauses the debate clock.

## Debate state and timing

The database serializes each transition using the room row lock and `clock_timestamp()`. Requests carry the expected proposal revision and turn index, but never an authoritative player ID, phase or deadline. Unique entries prevent duplicate submissions, and stale, late or out-of-turn arguments are rejected even if browser controls are bypassed.

`quarrel_private.debates` and `quarrel_private.debate_entries` store the topic, deadlines and history without client table grants. Members receive filtered snapshots through authenticated RPCs. The existing member-protected room Realtime stream carries only a `debate_version` invalidation signal; concealed opening text is never placed on public room/player rows or in Realtime payloads.

The countdown uses a database time sample and monotonic elapsed time, with approximate network transit compensation. The displayed second may differ slightly across devices; PostgreSQL alone accepts or rejects a submission. Either connected client asks the server to reconcile at a deadline, and the existing heartbeat is a fallback. If everyone is offline, no background worker runs: the next authorized read/heartbeat reconciles all elapsed turns against the original deadline chain, so reconnecting never resets or extends the clock. Authenticated reconnects can submit only in their own still-open turn.

Theme-specific announcements live in `theme.judge.debateDialogue`, separate from the mechanics. The stored `DebateQuestion` records include stable IDs and `source: "placeholder"`; a future Stage 4 question provider can replace their source. The `verdict` phase is only a completion boundary for a future Stage 6 evaluator. Neither integration exists now.

## Optional local database and CI

For an isolated local stack, run Docker Desktop and use:

```sh
npm run supabase:start
npm run supabase:env
npx supabase migration up --local
npm run dev
```

Use a separate checkout or keep your Cloud `.env.local` safely outside the working copy before generating local settings. The helper refuses to overwrite an existing file and writes only the local API URL/publishable key. First startup downloads the local containers. `npm run supabase:stop` retains local data; `npm run supabase:start` restores it. Local migrations update the existing stack without a reset.

GitHub Actions continues to use isolated local Supabase. Neither its settings nor `supabase/config.toml` configures the Cloud project. Local website URLs are only usable on this computer; a shareable public website needs its own deployment. No hosted website deployment was performed.

## Four shared settings

| Theme ID | Setting and default players | Judge and presentation personality |
| --- | --- | --- |
| `jungle` | Preserved tropical court; Leo the lion and Zuri the zebra | Judge Moki, the lemur: playful, energetic and dramatic |
| `superhero` | Gothic rooftop, searchlight and skyline; Nova the scout and Kit the inventor | Rook, an original superhero sidekick: heroic, witty and analytical |
| `detective` | Monochrome office, rainy windows and blinds; Quinn the reporter and Ellis the witness | Detective Vale: observant, skeptical and dryly humorous |
| `courtroom` | Traditional wood courtroom and balanced scales; Morgan and Casey, advocates | Judge Rowan: formal, composed and professional |

Player A can switch settings while the room is in the lobby, including after both players choose ready. The selected ID is saved in PostgreSQL and sent through the existing Supabase Realtime connection. Player B has a read-only selector; joining or refreshing either player restores the selected theme. Theme changes preserve names, seats, connection tracking and readiness.

Before starting, the **Judge dialogue preview** uses predefined samples in the current tab. During a debate the judge bubble follows the shared round announcements. It changes neither the shared room theme nor any game outcome. No AI is connected. Each theme’s personality, dialogue style, speech treatment, animation settings and sample text live in configuration. Idle/speaking animations are simple CSS; objection/verdict styles are metadata marked unimplemented.

Unknown theme or player-character IDs fall back safely when rendering. The API and database reject invalid theme writes, leaving the saved setting unchanged. A database `theme_locked` flag is checked by the host-only mutation RPC; the Stage 3 start transaction sets it together with the first deadline. There is no unlock or rematch API.

## Theme architecture and later stages

`src/themes/types.ts` defines the serializable theme contract. The four theme files declare palettes, environment/bench assets, separate player and judge assets, judge identity/personality/style, sample dialogue, animation configuration and UI settings. `src/themes/index.ts` is the registry and safe resolver; `assets.tsx` maps asset IDs to local SVG components; `styles.ts` supplies CSS variables. The lobby and `DebateArena` consume the same resolved configuration. Multiplayer transport and authorization are shared across all themes.

`neutralityPolicy` is a single reusable boundary for future Stage 4 integration: personality changes wording only and may not change evaluation criteria, favor a player or determine a winner. It is configuration, not implemented judging logic. All judges reference the same policy.

For future Stage 8 customization, each theme has a stable-ID player registry and exactly two default player designs. `PixelCharacter` accepts a character ID independently of display name/seat, and falls back to that theme’s default if no valid player selection exists. Judge assets are outside that player registry. `RoomPlayer.selectedCharacterId` is an optional type field only; there are no character-selection controls, database writes or extra selectable character designs.

For future Stage 9 team mode, types distinguish player identity, optional team membership and a `RoundRepresentativeAssignment` containing a round, team and representative player ID. `playableModes` currently contains **only solo**, with capacity two. Unsupported modes resolve to solo; metadata cannot add seats. Existing database capacity constraints and authorization remain unchanged. No teams, private team chat, representative selection/rotation, team UI or team debate logic are implemented. These type boundaries prepare for a later optional 4v4 mode without enabling it now.

To add another theme later, extend the configuration/asset registry, add its original default art, extend the database theme allowlist in a new migration, and cover its rendering, fallback and synchronized host selection. Keep evaluation rules and multiplayer code independent of presentation.

## Session and room behavior

- Room codes contain six cryptographically random, unambiguous uppercase letters/digits, with a unique database constraint. Treat the invitation as a private invite: anyone possessing it can claim the unfilled second seat.
- Display names are 1–32 characters. Names, readiness and selected room theme synchronize through Supabase Realtime; a ten-second heartbeat also refreshes the room as a fallback.
- Each browser gets a Supabase anonymous Auth session through the server. There is no registration form. Access and refresh credentials use HttpOnly, SameSite=Strict cookies, with Secure on HTTPS. The short-lived access token is supplied in memory to the member's Realtime client; no refresh token or service key reaches browser JavaScript.
- The server validates the session with Supabase Auth. PostgreSQL RPCs derive the player from `auth.uid()`, never a submitted player ID or slot. Request fields are allowlisted, cross-origin writes are rejected, and JSON bodies are bounded while streaming: 1 KB for simple actions, 2 KB for change requests, 4 KB for proposals and 16 KB for arguments, with tighter field-length checks.
- RLS allows authenticated members to read only their room and its players. Direct table mutations are denied, including changing your own row. Narrow RPCs enforce the allowed operations. A row lock and database constraints serialize competing joins; exactly two seats exist.
- Connection status reflects an authenticated heartbeat within 35 seconds. A stopped/closed client normally appears disconnected within about 45 seconds after the last heartbeat. Sleeping devices/background timer throttling can also appear disconnected. Realtime transport failure falls back to heartbeat refreshes, with an explicit status message.
- Readiness is retained across refreshes/disconnections, but both-ready confirmation requires both players to be currently connected. A disconnected player's seat stays reserved; a third player cannot take it.
- Rooms expire after 24 hours. Sessions survive ordinary refreshes and server restarts. Clearing browser cookies or an invalid/revoked session loses that seat; a name/code is not enough to impersonate its owner. Temporary Auth outages preserve recovery cookies.
- One active room per anonymous session. No leave/kick/spectator/rematch controls are implemented in Stage 3. Expired room rows and anonymous test users remain in the selected database; expiry is an access rule, not automatic deletion. A future retention policy must distinguish test fixtures from real rooms.

This migration assumes a **dedicated quarrel Supabase project**. It restricts the `supabase_realtime` publication to inserts/updates for the entire project, because Supabase Postgres Changes does not apply RLS to DELETE events. This prevents deleted room metadata from leaking. Review that publication-wide setting before applying the migration to a shared project.

Cloud uses `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` with verified anonymous player sessions and the same database authorization rules. A future public website deployment needs HTTPS and appropriate anonymous-sign-in abuse protection. Existing rate limits or CAPTCHA protections must not be disabled merely to make tests pass. Cloud connection results are recorded separately from [the earlier local-only verification](docs/stage-2-5-testing.md).

## Tests

```sh
npm run check           # Stage 1–3 tests, coverage gate, build
QUARREL_ALLOW_REMOTE_TESTS=true npm run test:supabase
# Preserved Cloud room/theme/Auth/Realtime regression checks
QUARREL_ALLOW_REMOTE_TESTS=true npm run test:debate
# Stage 3 approval/turn/privacy/race/Realtime checks and a real 45-second expiry
```

The remote opt-in is required when `.env.local` points at the authorized Cloud development project. For local Supabase, use `npm run test:supabase` without that flag. Do not use remote integration tests against an unrelated or production project.

For actual application route tests, first run the built app on port 3001 in another terminal:

```sh
npx next start --hostname 127.0.0.1 --port 3001
npm run test:api
```

Set `QUARREL_TEST_URL=http://127.0.0.1:3000` to test the development server instead. API tests exercise whichever Supabase backend the running app uses, even though the website URL is local. Each integration suite creates three anonymous users and one test room in that backend; users/room rows remain afterward. They never print session tokens or reset existing rooms. The room Realtime suite deliberately waits 36 seconds to verify disconnection; the debate suite waits for a real 45-second opening expiry. Optional `npm run test:db` still targets a local stack for CI; it is not a Cloud test. Hosted sign-in limits can affect repeated runs; wait for the applicable limit instead of weakening it.

`npm test` runs once; `npm run test:watch` watches changes. `npm run test:coverage` generates `coverage/index.html` and enforces the existing 90% statement/function/line and 85% branch gates. These tests do not replace browser inspection. See [the Stage 3 testing report](docs/stage-3-testing.md), [the Cloud follow-up](docs/stage-2-5-cloud.md), [the earlier Stage 2.5 local report](docs/stage-2-5-testing.md), [the Stage 2 record](docs/testing-stage-2.md), and [the preserved Stage 1 record](docs/testing.md).

GitHub Actions runs the build, regression suite and local Supabase integration tests using Docker. No production credentials or deployment are involved. The existing workflow filename remains `.github/workflows/quarrel-stage-1-checks.yml` for continuity.

## Files

| Location | Responsibility |
| --- | --- |
| `src/components/multiplayer-app.tsx` | Shared lobby and debate composition, invitations, readiness and themes |
| `src/components/debate-ui.tsx` | Proposal approval, round status, argument input, history and completion placeholder |
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

Implementation references: [Supabase anonymous sessions](https://supabase.com/docs/guides/auth/auth-anonymous), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), and [Postgres Changes / DELETE behavior](https://supabase.com/docs/guides/realtime/postgres-changes#receiving-old-records).
