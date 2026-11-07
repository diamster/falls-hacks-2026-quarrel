# quarrel.io — Stage 2.5 boundary

This is the standalone quarrel.io repository: `diamster/falls-hacks-2026-quarrel`. All future quarrel.io changes and pushes belong here. The Next.js app lives at the repository root. Do not use `falls-hacks-2026-ideas` or the SFU campus checkout for this app.

Stage 2.5 is authorized: preserve the Stage 1/2 application and add four original themes (Jungle, Superhero, Detective and Courtroom), a centralized theme/asset configuration, host-only persisted lobby selection, Realtime synchronization and local judge-dialogue previews. Keep room creation/joining, verified anonymous sessions, readiness, connection status, refresh recovery and the two-seat limit working. Preserve the original Jungle SVG artwork and the Stage 1 local-only preview at `/preview`.

No debate turns, actual start transition, AI/LLM integration, real objections/verdicts, account registration, voice/video or Stage 3 without a new explicit user instruction. Judge personality is presentation metadata only; every theme must reuse the shared neutrality policy, and personality must never override evaluation rules or determine a winner. Objection/verdict animation styles remain unimplemented configuration.

Use stable theme/character IDs and the central resolvers; do not scatter theme-specific multiplayer branches through the app. Invalid rendered IDs fall back safely; invalid theme writes are rejected by the server and database. Only verified Player A may change a room theme. Preserve the database theme-lock guard for a future start stage; both-ready is not a start and does not lock themes now.

Stage 8/9 preparation is types/configuration only: keep player identity, optional character choice/team membership and round-specific representative assignment separate. No character-selection UI or writes, extra selectable characters, teams, team chat, representative selection/rotation or team rules. Solo is the only playable mode, with capacity two; future mode metadata cannot expand the current database constraint or bypass authorization.

All room mutations derive identity from the verified session and PostgreSQL `auth.uid()`. Never accept a player ID/slot as mutation authority. No browser or server service-role bypass. Keep private room data behind RLS and state-changing RPCs; preserve the race-safe two-slot constraint. Use local Supabase for tests and never commit runtime credentials. Preserve keyboard accessibility, reduced-motion support and responsive layout.

Before handing off, run `npm run check` (automated component tests with coverage, then the production build) and inspect the desktop/mobile UI and local preview interactions in a browser. Keep the Stage 1 and Stage 2 behavior tests passing; fix causes instead of lowering coverage thresholds or weakening assertions. Also run `npm run test:db`, `npm run test:supabase` and `npm run test:api` against local Supabase and the running app. Record actual results and any verification limits in `docs/stage-2-5-testing.md`, retaining the earlier stage records. Verify all four themes, host/guest authorization, invalid-ID fallback, theme persistence, and desktop/mobile rendering; save comparison screenshots when visual changes occur. jsdom tests do not establish rendered layout, native dialog focus behavior or real animation timing.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
