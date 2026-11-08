# Team workflow: three agents in parallel (Stage 6)

**Written:** 2026-11-07 · **Base for Stage 6:** `main`, once the pull request from `team-workflow` (one-screen lobby, Settings popup and this document) is merged

Three coding agents work on quarrel.io at the same time: **GPT Astra** (strongest; backend + AI) and two **Claude Code** sessions (frontend lanes). Each lane **owns** a set of files. Only the owner edits them; anyone else who needs a change asks the owner (through the user) or leaves a note in the PR. This keeps merge conflicts small and prevents silent database overwrites.

**Who is where:** the project owner runs **Lane B** on their own laptop and **Lane C** from a teammate's computer. Astra runs **Lane A**.

## Branches

| Branch | Purpose |
|---|---|
| `main` | Stage 5. Changes arrive only through reviewed pull requests. |
| `team-workflow` | `main` + one-screen lobby + Settings popup (`stage5-ui`) + this document. **Open as a pull request into `main` for Lane A to review and merge.** |
| `quarrel-stage-6` | Stage 6 integration branch. Lane A creates it from `main` **after** that pull request is merged; every lane merges into it. |
| `stage6-backend` / `stage6-ui` / `stage6-art` | One working branch per lane, created from `quarrel-stage-6`. |

## Golden rules

1. **One folder per agent.** Never run two agents in the same checkout: they overwrite each other's unsaved edits before Git can help. Each agent uses its own clone or `git worktree` (see Setup).
2. **One branch per lane**, merged back into `quarrel-stage-6` by pull request **at least daily**. Before starting work each session: `git fetch && git rebase origin/quarrel-stage-6`.
3. **Contract first.** The shared data shapes (`src/lib/*-types.ts`) and API routes are owned by Lane A. If a frontend lane needs a new field or action, Lane A adds it to the types and the snapshot **first**, merges, then the frontend builds on it. Frontend lanes can prototype against sample data meanwhile (the fixtures in `tests/stage-five-app.test.tsx` are a good start).
4. **Only Lane A writes migrations.** Database snapshot functions such as `get_quarrel_room` are redefined in full by migrations; two people changing them produces **no Git conflict but silently erases one person's change** when applied. Every new Cloud migration is still shown to the user before it is applied.
5. **CSS:** new styles go in **CSS modules or component CSS files** next to the component (as `lawyer-debate.module.css` and `stage-five-app.css` do). `src/app/globals.css` is owned by Lane C; others avoid editing it.
6. **Line endings:** commit with LF. Windows editors may convert whole files to CRLF, which shows every line as changed and causes huge conflicts. Run `git diff --ignore-cr-at-eol --stat` if a diff looks suspiciously large, and set `git config core.autocrlf input` in Windows/WSL checkouts.
7. **`node_modules` is per platform.** A checkout installed from Windows cannot run tools from WSL (and the reverse). Install and run from the same side.
8. Everyone keeps the rules in `AGENTS.md` and `docs/stage-5-decisions.md` (server-authoritative state, `auth.uid()`, RLS, no service role, server-only keys, approved D1–D12). Run `npm run check` before every merge; the owner of a lane updates its tests.

## Stage 6 scope

**Not defined in the repository yet.** The original roadmap named Stage 6 "final verdict generation", but Stage 5 already ships a jury verdict, so the user decides what Stage 6 is. Lane A: ask the user for the Stage 6 brief, record it as `docs/stage-6-decisions.md` and add a Stage 6 section to `AGENTS.md` before any lane builds features. Until then, Stage 5 rules apply.

## Lanes and file ownership

### Lane A: GPT Astra (backend, database, AI, integration, deployment)

| Owns | Files |
|---|---|
| Database | `supabase/**` (migrations, `config.toml`, database tests) |
| Server and API | `src/server/**` (`room-api.ts`, `judge-engine.ts`, `judge-worker.ts`, `lawyer-policy.ts`), `src/app/api/**` |
| Shared contract | `src/lib/*-types.ts`, `src/lib/room-client.ts`, `src/lib/game-modes.ts` |
| AI | Planner, lawyer, consultation, judge-summary and jury prompts, validation and fallbacks |
| Integration and ops | `tests/db/**`, `tests/room-api.test.ts`, `tests/judge-*.test.ts`, `tests/lawyer-engine.test.ts`, `tests/lawyer-live.test.ts`, `scripts/**`, `.github/**`, `package.json`, `vercel.json`, `.env.example`, `.gitattributes` |
| Docs and rules | `AGENTS.md`, `docs/stage-*-decisions.md`, `docs/stage-*-testing.md`, `README.md` (other lanes may append their own section) |

### Lane B: Claude Code #1 (game screens and player flow)

| Owns | Files |
|---|---|
| App shell and flow | `src/components/stage-five-app.tsx` + `.css`, `src/components/multiplayer-app.tsx` (legacy), `src/app/page.tsx`, `src/app/layout.tsx` |
| Debate screens | `src/components/lawyer-debate.tsx` + `.module.css`, `debate-history-panel.tsx` + `.module.css`, `room-controls.tsx`, `debate-ui.tsx`, `debate-history.tsx`, `argument-composer.tsx`, `judge-panel.tsx` (legacy archive view) |
| Settings popup | `src/components/settings-page.tsx` + `.css` (`SettingsPanel`, `SettingsDialog`, `/settings` page), `src/app/settings/**` |
| Tests | `tests/stage-five-app.test.tsx`, `tests/lawyer-debate-ui.test.tsx`, `tests/history-panel.test.tsx`, `tests/settings.test.tsx`, `tests/multiplayer.test.tsx`, `tests/debate-*.test.tsx`, `tests/composer-reset.test.tsx` |

Uses Lane A's types and `useRoomClient` actions read-only.

### Lane C: Claude Code #2 (themes, art, scene visuals, global styling)

| Owns | Files |
|---|---|
| Themes and art | `src/themes/**` (theme configs, `art/sidekicks.tsx`, characters, backgrounds, benches, assets, styles) |
| Scene and characters | `src/components/debate-arena.tsx`, `pixel-character.tsx`, `character.tsx`, `courtroom.tsx`, `pixel-art.tsx` (keep original Jungle art unchanged) |
| Pickers and preferences | `theme-selector.tsx`, `theme-preview.tsx`, `display-preferences.tsx` + `.css`, `ui.tsx` |
| Global styling | `src/app/globals.css` (includes the one-screen lobby layout) |
| Stage 1 preview | `src/app/preview/**`, `quarrel-app.tsx`, `preview-controls.tsx`, `about-dialog.tsx`, `src/lib/preview.ts`, `public/art/**` |
| Tests | `tests/themes.test.tsx`, `tests/sidekick-art.test.tsx`, `tests/character-dialogue.test.tsx` |

Theme personality **text used in AI prompts** (lawyer, judge and jury personality strings) lives in theme configs owned by Lane C, but changing what the AI is allowed to do is Lane A's decision.

### Shared touch points (coordinate before editing)

| File | Why it is shared | Rule |
|---|---|---|
| `src/themes/types.ts` | Lane C defines theme fields; Lane A reads personalities for prompts | Lane C edits; tell Lane A when a field the AI uses changes |
| `src/components/debate-arena.tsx` | Lane B places it on screen; Lane C draws it | Lane C owns; Lane B passes props only |
| `README.md` | Everyone documents features | Append to your own section; Lane A resolves conflicts |
| `tests/setup.ts`, `vitest.config.mts` | Global test setup | Lane A only |

## Notes for GPT Astra (Lane A)

Things that changed or were found since your Stage 5 push:

1. **Review and merge the pull request `team-workflow` → `main`.** It has no conflicts (`main` has not moved since `345af08`). It contains `stage5-ui` plus this document. Please run `npm run check` on Linux, look at the lobby and Settings popup in a browser, then merge, and create `quarrel-stage-6` from the merged `main`. What changed in the frontend: Settings is now a popup: `settings-page.tsx` exports `SettingsPanel` (shared body), `SettingsDialog` (native `<dialog>`) and `SettingsPage` (`/settings` still works). `LawyerDebateView` has a new optional `onOpenSettings` prop. The pre-start lobby is the full-screen `theme-shell--fit` layout from Claude Cowork. No server, API, type or database changes. Results are in `docs/stage-5-testing.md` (last section).
2. **`tests/judge-config.test.ts` fails on Windows** (2 tests): it asserts file mode `0600`, but NTFS reports `0666`. Linux CI passes. Since two lanes work from Windows machines, consider skipping only the mode assertion when `process.platform === "win32"` so `npm run check` passes there, without weakening the Linux check.
3. **The Vercel deployment commits are only on `quarrel-stage-4`** (`391c510`, `1fe14b1`: `vercel.json`, `.vercelignore`, `docs/vercel-deployment.md`, route config). They are not in `main`, `quarrel-stage-5` or `stage5-ui`. Bring them into `quarrel-stage-6` before any Stage 5/6 deployment (deploy only when the user authorizes it).
4. **Line endings:** a Windows checkout converted files to CRLF and produced whole-file diffs. Please add a `.gitattributes` with `* text=auto eol=lf` (plus `*.png binary`) to stop this for everyone.
5. **Live Gemini is still unverified** for the jury and private consultations (HTTP 429 during your run). Worth resolving before features that depend on them.
6. **There is an unmerged branch `texttospeech`** (2 commits: `texttospeech/tts.ts`, `tts.test.ts`, outside `src/`). Voice was out of scope through Stage 5; check with the user whether it belongs in Stage 6 before merging it.
7. **Stage 6 has no brief in the repo yet** (see "Stage 6 scope" above). Please get it from the user and record it before lanes start.

## Setup for each agent

```sh
git clone https://github.com/diamster/falls-hacks-2026-quarrel.git quarrel-<lane>
cd quarrel-<lane>
git switch quarrel-stage-6          # once Lane A has created it from main
git switch -c stage6-<lane>         # stage6-backend / stage6-ui / stage6-art
git config core.autocrlf input
npm ci
cp .env.example .env.local          # then fill in keys shared privately; never commit
npm run dev                         # each machine uses its own localhost:3000
```

On one machine with several agents, use worktrees instead of clones: `git worktree add ../quarrel-ui -b stage6-ui origin/quarrel-stage-6`, and run each dev server on a different port (`npx next dev --webpack --hostname 127.0.0.1 --port 3001`).

All lanes share the **same Supabase Cloud project**. That is fine for rooms and data, but only Lane A changes the database schema.

## Merging

1. `npm run check` passes on your branch.
2. `git fetch && git rebase origin/quarrel-stage-6`, fix conflicts in your own files, rerun the check.
3. Open a pull request into `quarrel-stage-6`. Do not push to `main` or older stage branches; `main` changes only through pull requests reviewed by Lane A.
4. Merge small and often; a lane branch older than a day is a conflict risk.
