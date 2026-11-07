# quarrel.io — Stage 1 boundary

This is a separate Next.js prototype. Do not edit the SFU campus project for work here.

Stage 1 includes the pixel-art courtroom, reusable UI/character components, local character/dialogue previews, and clearly labelled local-only composer interactions. Keep character state types extensible; only idle and speaking are animated initially, with explicit placeholders for the other states.

Do not add multiplayer, Supabase, authentication, LLM/API calls, real judging/debate rules, voice or video, or begin Stage 2 without a new explicit user instruction. No runtime external credentials or services are required. Original artwork stays local. Preserve keyboard accessibility, reduced-motion support and responsive layout.

Before handing off, run `npm run check` (automated component tests with coverage, then the production build) and inspect the desktop/mobile UI and local preview interactions in a browser. Keep the Stage 1 behavior tests passing; fix causes instead of lowering coverage thresholds or weakening assertions. Record actual results and any verification limits in docs/testing.md. jsdom tests do not establish rendered layout, native dialog focus behavior or real animation timing.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
