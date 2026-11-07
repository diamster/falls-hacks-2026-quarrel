# quarrel.io — Stage 2 boundary

This is a separate Next.js prototype. Do not edit the SFU campus project for work here.

Stage 2 is authorized: private two-player Supabase rooms, anonymous per-player sessions, server create/join routes, membership-only database access, Realtime readiness and connection status, refresh recovery, and a both-ready confirmation. Keep the original Stage 1 local-only preview at `/preview` and its art unchanged. No debate turns, real objections/verdicts, AI, account registration, voice/video, or Stage 3 without a new explicit user instruction.

All room mutations derive identity from the verified session and PostgreSQL `auth.uid()`. Never accept a player ID/slot as mutation authority. No browser or server service-role bypass. Keep private room data behind RLS and state-changing RPCs; preserve the race-safe two-slot constraint. Use local Supabase for tests and never commit runtime credentials. Preserve keyboard accessibility, reduced-motion support and responsive layout.

Before handing off, run `npm run check` (automated component tests with coverage, then the production build) and inspect the desktop/mobile UI and local preview interactions in a browser. Keep the Stage 1 behavior tests passing; fix causes instead of lowering coverage thresholds or weakening assertions. Also run `npm run test:db`, `npm run test:supabase` and `npm run test:api` against local Supabase and the running app. Record actual results and any verification limits in docs/testing.md. jsdom tests do not establish rendered layout, native dialog focus behavior or real animation timing.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
