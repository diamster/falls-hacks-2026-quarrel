# quarrel.io — Stage 2.5

Four original pixel-art settings for private two-player rooms, built with Next.js App Router, TypeScript, Tailwind, Supabase PostgreSQL and Realtime. Stage 2.5 adds synchronized theme selection and local judge-personality previews. Play still stops at a **both-ready confirmation**. No debate turns, AI, account registration, real objections/verdicts, voice or video are implemented.

The original Stage 1 artwork and local interaction preview are preserved at `/preview`. This standalone repository, [diamster/falls-hacks-2026-quarrel](https://github.com/diamster/falls-hacks-2026-quarrel), is the home for all future quarrel.io work. The completed Stage 2 baseline remains on `main`; Stage 2.5 extends the same application on `quarrel-stage-2-5`.

## Run locally with Supabase Cloud

The app now targets the quarrel Cloud project `exjdvtqsalnkghyohyuh`. The Next.js website still runs on your computer; this does not publish the website. Requirements: Node.js 22.12+, npm, internet access, and this project's **publishable** API key. Docker is only needed for the optional local database/CI workflow below.

```sh
git clone --branch quarrel-stage-2-5 https://github.com/diamster/falls-hacks-2026-quarrel.git
cd falls-hacks-2026-quarrel
npm ci
```

Create `.env.local` next to `package.json`:

```ini
SUPABASE_URL=https://exjdvtqsalnkghyohyuh.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-project-publishable-key
```

Copy only the publishable key from [the project's API Keys page](https://supabase.com/dashboard/project/exjdvtqsalnkghyohyuh/settings/api-keys). Never put a secret or service-role key in the app configuration. `.env.local` is ignored by Git and must not be committed. Restart the app after changing it; do not run `supabase:env` to configure Cloud, because that helper generates local settings.

The Cloud project needs anonymous sign-ins enabled in [Authentication Providers](https://supabase.com/dashboard/project/exjdvtqsalnkghyohyuh/auth/providers), both repository migrations applied, and the member-protected Realtime publication. See [Cloud setup and verification](docs/stage-2-5-cloud.md) before making database changes: this project has existing migration history, so do not reapply the initial schema or blindly run a database push.

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) or [http://127.0.0.1:3000](http://127.0.0.1:3000). Use one hostname consistently in each browser: they have separate cookies. Local-only room codes and sessions do not migrate to Cloud; refresh and create a new room if an old local session is rejected.

Create a room with a display name, then open its invitation in a **different browser or private browser window**. Ordinary tabs share a player session. The creator is Player A and chooses the setting from the lobby’s four preview cards. The joiner is Player B and sees the host’s current setting. Jungle starts with the lion and zebra; the other themes supply their own default characters. Each player can toggle only their own readiness. Both-ready confirms the lobby is ready; it does not start a debate or lock the theme.

For production mode locally:

```sh
npm run build
npm run start
```

Stop any server using the same port first. Stop/restart a production server around a rebuild to avoid serving mismatched assets. `npm run typecheck` checks TypeScript independently. The supported Webpack build remains the default from Stage 1.

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

The **Judge dialogue preview** uses predefined samples in the current tab. It changes neither the shared room theme nor any game outcome. No AI is connected. Each theme’s personality, dialogue style, speech treatment, animation settings and sample text live in configuration. Idle/speaking animations are simple CSS; objection/verdict styles are metadata marked unimplemented.

Unknown theme or player-character IDs fall back safely when rendering. The API and database reject invalid theme writes, leaving the saved setting unchanged. A database `theme_locked` flag is checked by the host-only mutation RPC; a future authorized debate-start transition must set it transactionally. Stage 2.5 supplies no start, lock or unlock API.

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
- The server validates the session with Supabase Auth. PostgreSQL RPCs derive the player from `auth.uid()`, never a submitted player ID or slot. Request fields are allowlisted, cross-origin writes are rejected, and JSON bodies are limited to 1 KB while streaming.
- RLS allows authenticated members to read only their room and its players. Direct table mutations are denied, including changing your own row. Narrow RPCs enforce the allowed operations. A row lock and database constraints serialize competing joins; exactly two seats exist.
- Connection status reflects an authenticated heartbeat within 35 seconds. A stopped/closed client normally appears disconnected within about 45 seconds after the last heartbeat. Sleeping devices/background timer throttling can also appear disconnected. Realtime transport failure falls back to heartbeat refreshes, with an explicit status message.
- Readiness is retained across refreshes/disconnections, but both-ready confirmation requires both players to be currently connected. A disconnected player's seat stays reserved; a third player cannot take it.
- Rooms expire after 24 hours. Sessions survive ordinary refreshes and server restarts. Clearing browser cookies or an invalid/revoked session loses that seat; a name/code is not enough to impersonate its owner. Temporary Auth outages preserve recovery cookies.
- One active room per anonymous session. No leave/kick/spectator controls are implemented in Stage 2.5. Expired room rows and anonymous test users remain in the selected database; expiry is an access rule, not automatic deletion. A future retention policy must distinguish test fixtures from real rooms.

This migration assumes a **dedicated quarrel Supabase project**. It restricts the `supabase_realtime` publication to inserts/updates for the entire project, because Supabase Postgres Changes does not apply RLS to DELETE events. This prevents deleted room metadata from leaking. Review that publication-wide setting before applying the migration to a shared project.

Cloud uses `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` with verified anonymous player sessions and the same database authorization rules. A future public website deployment needs HTTPS and appropriate anonymous-sign-in abuse protection. Existing rate limits or CAPTCHA protections must not be disabled merely to make tests pass. Cloud connection results are recorded separately from [the earlier local-only verification](docs/stage-2-5-testing.md).

## Tests

```sh
npm run check           # Stage 1, 2 and 2.5 tests, coverage gate, build
npm run test:db         # PostgreSQL policies/constraints on the local stack
QUARREL_ALLOW_REMOTE_TESTS=true npm run test:supabase
# Real Cloud Auth, joins, themes, RLS, Realtime and disconnect
```

The remote opt-in is required when `.env.local` points at the authorized Cloud development project. For local Supabase, use `npm run test:supabase` without that flag. Do not use remote integration tests against an unrelated or production project.

For actual application route tests, first run the built app on port 3001 in another terminal:

```sh
npx next start --hostname 127.0.0.1 --port 3001
npm run test:api
```

Set `QUARREL_TEST_URL=http://127.0.0.1:3000` to test the development server instead. API tests exercise whichever Supabase backend the running app uses, even though the website URL is local. Each integration suite creates three anonymous users and one test room in that backend; users/room rows remain afterward. They never print session tokens or reset existing rooms. The Realtime suite deliberately waits 36 seconds to verify disconnection. Hosted sign-in limits can affect repeated runs; wait for the applicable limit instead of weakening it.

`npm test` runs once; `npm run test:watch` watches changes. `npm run test:coverage` generates `coverage/index.html` and enforces the existing 90% statement/function/line and 85% branch gates. These tests do not replace browser inspection. See [the Cloud follow-up](docs/stage-2-5-cloud.md), [the earlier Stage 2.5 local report](docs/stage-2-5-testing.md), [the Stage 2 record](docs/testing-stage-2.md), and [the preserved Stage 1 record](docs/testing.md).

GitHub Actions runs the build, regression suite and local Supabase integration tests using Docker. No production credentials or deployment are involved. The existing workflow filename remains `.github/workflows/quarrel-stage-1-checks.yml` for continuity.

## Files

| Location | Responsibility |
| --- | --- |
| `src/components/multiplayer-app.tsx` | Shared lobby, create/join, invitations, readiness and theme composition |
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
