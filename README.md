# quarrel.io — Stage 2

A tropical pixel-art courtroom with private two-player rooms, built with Next.js App Router, TypeScript, Tailwind, Supabase PostgreSQL and Realtime. Stage 2 stops at a **both-ready confirmation**. No debate turns, AI, account registration, real objections/verdicts, voice or video are implemented.

The original Stage 1 artwork and local interaction preview are preserved at `/preview`. The SFU campus project is unchanged. Work is isolated on `quarrel-stage-2`.

## Run locally

Requirements: Node.js 22.12+, npm, and a running Docker Desktop. No hosted Supabase project or external credentials are needed. First startup downloads the local Supabase containers.

```sh
cd prototypes/quarrel-io
npm ci
npm run supabase:start
npm run supabase:env
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The environment helper writes only the local API URL and publishable key into ignored `.env.local`; it refuses to overwrite existing settings. Never put a service-role/secret key in the application configuration.

Create a room with a display name, then open its invitation in a **different browser or private browser window**. Ordinary tabs share a player session. The creator is the lion (A), the joiner is the zebra (B). Each can toggle only their own readiness. Both-ready confirms the lobby is ready; it does not start a debate.

For production mode locally:

```sh
npm run build
npm run start
```

Stop any server using the same port first. Stop/restart a production server around a rebuild to avoid serving mismatched assets. `npm run typecheck` checks TypeScript independently. The supported Webpack build remains the default from Stage 1.

To stop local Supabase while retaining its local data: `npm run supabase:stop`. Restarting with `npm run supabase:start` restores it. When adding migrations to an existing local stack, run `npx supabase migration up --local`. A destructive database reset is not needed for ordinary restarts.

The current review server uses [http://127.0.0.1:3001](http://127.0.0.1:3001). Local URLs are only usable on this computer; sharing across devices requires hosting the app and a reachable Supabase project. No hosted deployment was performed.

## Session and room behavior

- Room codes contain six cryptographically random, unambiguous uppercase letters/digits, with a unique database constraint. Treat the invitation as a private invite: anyone possessing it can claim the unfilled second seat.
- Display names are 1–32 characters. Names and room readiness synchronize through Supabase Realtime; a ten-second heartbeat also refreshes the room as a fallback.
- Each browser gets a Supabase anonymous Auth session through the server. There is no registration form. Access and refresh credentials use HttpOnly, SameSite=Strict cookies, with Secure on HTTPS. The short-lived access token is supplied in memory to the member's Realtime client; no refresh token or service key reaches browser JavaScript.
- The server validates the session with Supabase Auth. PostgreSQL RPCs derive the player from `auth.uid()`, never a submitted player ID or slot. Request fields are allowlisted, cross-origin writes are rejected, and JSON bodies are limited to 1 KB while streaming.
- RLS allows authenticated members to read only their room and its players. Direct table mutations are denied, including changing your own row. Narrow RPCs enforce the allowed operations. A row lock and database constraints serialize competing joins; exactly two seats exist.
- Connection status reflects an authenticated heartbeat within 35 seconds. A stopped/closed client normally appears disconnected within about 45 seconds after the last heartbeat. Sleeping devices/background timer throttling can also appear disconnected. Realtime transport failure falls back to heartbeat refreshes, with an explicit status message.
- Readiness is retained across refreshes/disconnections, but both-ready confirmation requires both players to be currently connected. A disconnected player's seat stays reserved; a third player cannot take it.
- Rooms expire after 24 hours. Sessions survive ordinary refreshes and server restarts. Clearing browser cookies or an invalid/revoked session loses that seat; a name/code is not enough to impersonate its owner. Temporary Auth outages preserve recovery cookies.
- One active room per anonymous session. No leave/kick/spectator controls are implemented in Stage 2. Expired room data and test anonymous users remain in the local database; future hosted operations need a retention/cleanup policy.

This migration assumes a **dedicated quarrel Supabase project**. It restricts the `supabase_realtime` publication to inserts/updates for the entire project, because Supabase Postgres Changes does not apply RLS to DELETE events. This prevents deleted room metadata from leaking. Review that publication-wide setting before applying the migration to a shared project.

Hosted configuration would use `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in server environment variables, anonymous sign-ins enabled, the migration applied, and HTTPS. Public deployment also needs suitable anonymous-sign-in abuse/rate limits; local configuration is for development. No hosted security, proxy, or cross-device testing is claimed here.

## Tests

```sh
npm run check           # Stage 1 + 2 unit/component/API tests, coverage gate, build
npm run test:db         # real PostgreSQL policies and constraints (pgTAP)
npm run test:supabase   # real Auth, concurrent joins, RLS, Realtime, disconnect
```

For actual application route tests, first run the built app on port 3001 in another terminal:

```sh
npx next start --hostname 127.0.0.1 --port 3001
npm run test:api
```

Set `QUARREL_TEST_URL=http://127.0.0.1:3000` to test another local port. The integration tests create disposable anonymous users/rooms in local Supabase, never print session tokens, and do not reset existing rooms. The Realtime test deliberately waits 36 seconds to verify disconnection. Allow the first container startup to settle before running it.

`npm test` runs once; `npm run test:watch` watches changes. `npm run test:coverage` generates `coverage/index.html` and enforces the existing 90% statement/function/line and 85% branch gates. These tests do not replace browser inspection. See [the Stage 2 results and manual checklist](docs/testing-stage-2.md) and [the preserved Stage 1 record](docs/testing.md).

GitHub Actions runs the build, regression suite and local Supabase integration tests using Docker. No production credentials or deployment are involved. The existing workflow filename remains `.github/workflows/quarrel-stage-1-checks.yml` for continuity.

## Files

| Location | Responsibility |
| --- | --- |
| `src/components/multiplayer-app.tsx` | Create/join, invitations, two seats, readiness and confirmation |
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
