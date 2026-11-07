# Vercel deployment

Vercel serves the Next.js website and its authenticated server routes. Supabase Cloud remains the shared database, anonymous-session provider and Realtime service. The browser connects directly to Supabase for room notifications, so this app does not need a custom WebSocket server on Vercel. Gemini calls stay inside the server routes.

## Project settings

- Import `diamster/falls-hacks-2026-quarrel`.
- Deploy the `quarrel-stage-4` branch. Do not accidentally publish an earlier stage from `main`.
- Root directory: repository root (`./`). Framework: Next.js.
- Node.js: `22.x`, matching the tested GitHub runner.
- Install: `npm ci`. Build: `npm run build`. Output directory: framework default.
- Keep a stable production URL for invitations and session recovery. Each hostname has its own browser cookies.

`vercel.json` supplies the framework/install/build settings. Each room route declares a 30-second `maxDuration`, including routes that may process pending judge work with Next.js `after()`. This is a server invocation limit, not a change to the debate's 45/30-second turn timers. The model's own timeout remains separately bounded.

## Server environment

Add these to the Vercel project's Production environment before deploying. Use the values from the existing ignored `.env.local`; do not upload that file, paste secrets into chat, put credentials in source, or use `NEXT_PUBLIC_` prefixes.

| Variable | Setting |
| --- | --- |
| `SUPABASE_URL` | Current Cloud project URL from `.env.local` |
| `SUPABASE_PUBLISHABLE_KEY` | Current publishable key; never the secret/service-role key |
| `JUDGE_SERVER_SECRET` | The **same existing capability** registered in the current Cloud database |
| `GEMINI_API_KEY` | Existing server-only Gemini credential |
| `GEMINI_MODEL` | Existing configured model |
| `JUDGE_AI_MODE` | `auto` for Gemini when configured; `demo` only for an intentional demo deployment |
| `JUDGE_AI_TIMEOUT_MS` | `8000` (current default) |
| `JUDGE_MAX_MESSAGES_PER_TURN` | `2` (current default) |

Do not run `judge:setup` to generate a different capability for Vercel. All instances on this Cloud project must share the registered capability. No database reset, migration replay, anonymous-auth change or new service-role credential is needed for hosting. The existing anonymous sign-in flow has no OAuth callback to add.

Environment changes require a new deployment. Local environment files and Vercel link metadata are excluded from Git and CLI source uploads. Preview deployments should receive credentials only if they intentionally use this same Cloud backend; they otherwise fall back to the project's unconfigured-room screen.

## Invite flow

1. Open the stable public URL in Browser A and create a **new** room.
2. Copy the invitation generated there; it must start with the public HTTPS hostname.
3. Open that exact link in Browser B (or on another device), enter a name and join.
4. Verify both names, readiness and theme changes synchronize, then refresh both browsers.

`localhost` means each person's own computer. Merely replacing the hostname on an old local room link does not move its owner's browser session to the public site. Create a new room on the deployed site for the first public test. Both players should stay on one hostname rather than mixing production and preview URLs.

## Hosted verification before sharing

- Public page loads without requiring the invited player to have a Vercel account.
- Anonymous create/join succeed over HTTPS; session cookies are HttpOnly, SameSite=Strict and Secure.
- Share URL uses the deployed origin. Refresh restores each player's own seat.
- Realtime synchronizes names, readiness, themes and judge messages for two isolated browser sessions.
- Third-player, wrong-origin and wrong-turn requests are rejected.
- Ask Judge completes after the response on Vercel; both players receive the same saved answer.
- A complete debate reaches the existing placeholder verdict; no real verdict or Stage 5 feature is added.
- Leave/create-another-room works on the public hostname.

Keep Supabase's Auth protections enabled. Anonymous creation is server-side, so hosting egress may share an Auth IP rate limit across visitors. If that limit is actually reached, inspect the Auth logs and configure an appropriate protected signup strategy; do not disable safeguards to make a test pass.

## Status

The Vercel project `falls-hacks-2026-quarrel` is created in team `diamsterac-7087`, with Next.js, Node 22.x and Standard Deployment Protection (the production domain is public; preview/generated deployment URLs remain protected). Production credentials and deployment are still pending.

Vercel's GitHub login connection is not configured, so the initial deployment will use a source snapshot of the committed Stage 4 branch. Automatic deployments on push are not enabled. Connect GitHub in Vercel later and select `quarrel-stage-4` as the production branch before enabling them.

Local verification: production build and TypeScript passed with the route-duration settings. The full local suite passed 376 tests but hit one existing initial-recovery timeout on the busy machine; 3 live-provider tests were intentionally skipped. The previous exact application implementation passed all 377 tests and 255 database assertions on GitHub. The deployment configuration commit also runs the clean CI suite. Hosted behavior is not yet claimed as tested.

References: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [function duration](https://vercel.com/docs/functions/configuring-functions/duration), [environment variables](https://vercel.com/docs/environment-variables).
