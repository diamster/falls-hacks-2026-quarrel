# Stage 5 testing — Lawyer Sidekick Debate

**Date:** 2026-11-07 · **Branch:** `quarrel-stage-5` · **Cloud project:** `exjdvtqsalnkghyohyuh`

**Cloud, HTTP, component and browser checks are complete as recorded below. The final coverage/build check and Webpack development-browser recheck passed.** The implementation follows [the approved Stage 5 decisions](stage-5-decisions.md); it does not restore the obsolete objection or direct Ask Judge design.

## Cloud migration and database checks

The user reviewed and approved the proposed Stage 5 migration before it was applied. Repository file [`20261107215110_stage5_lawyer_debate.sql`](../supabase/migrations/20261107215110_stage5_lawyer_debate.sql) matches Cloud's recorded version **`20261107215110`**. It was reviewed as `20261107213415_stage5_lawyer_debate.sql` and renamed before its first commit without changing its contents. Its approved SHA-256 remains **`aae00381631619b74242d4ddeb3aa801854e2cbaebd1ad8278d3553ed3fce4fb`**.

The six earlier migration filenames still differ from their recorded Cloud versions; their verified mappings remain in the earlier testing reports. Aligning this new filename does not make an unrestricted CLI database push safe. Reconcile that existing history before any future push; do not replay migrations or reset Cloud. No Cloud history repair was performed for this rename.

The migration was applied additively to the existing Cloud project. Existing room/debate tables and historical data were retained. No database reset, data drop, service-role application bypass or RLS weakening was performed. New rooms use Courtroom; existing stored themes are retained.

The database agent reported these completed checks against the configured Cloud project:

| Check | Result | Scope |
| --- | --- | --- |
| Stage 5 `tests/db/lawyer.cloud.sql` | **PASS — 121 assertions**, plus malformed-output loops | Independent positions and authorization; plans/revisions; participant-filtered official drafts and private consultations; worker validation/leases; clock transitions and quotas; summaries/jury; legacy isolation. |
| Preserved Stage 3 SQL regression | **PASS — 52 assertions** | Earlier debate data and rules remain compatible. |
| Preserved Stage 4 SQL regression | **PASS — 114 assertions** | Earlier judged debate data, authorization and hidden-state behavior remain compatible. |
| Leave-room SQL regression | **PASS — 63 assertions** | Caller-only detachment, historical records and stale-room protections. |
| Private-table audit | **PASS** | All seven private tables, including the three added for Stage 5, have RLS enabled and no direct client read/write grants. |
| Realtime publication audit | **PASS** | Only public room/player signals are published, with inserts/updates and no DELETE/TRUNCATE publication. Private lawyer text is not a published table payload. |
| New-room default | **PASS** | Courtroom default present; existing rows were not overwritten. |
| Advisor review | **Reviewed** | Performance advisor clear. Existing/expected security notices reviewed: 27 security-definer RPCs, seven private tables with default-deny policies, two anonymous policies and the existing password-protection notice. No authorization was relaxed to suppress notices. |

SQL fixtures ran in rollback transactions and did not reset or delete real debate records. The deadline tests can move deadlines on their own synthetic rows; these checks establish transition invariants, **not a real two-browser wall-clock test**. Genuine elapsed-time HTTP/browser verification is recorded separately below.

## Completed local automated checks

| Command or suite | Observed result | Limits |
| --- | --- | --- |
| `npm test -- tests/stage-five-app.test.tsx tests/lawyer-debate-ui.test.tsx tests/settings.test.tsx` | **49 passed** across 3 files | jsdom with mocked room transport; no live Cloud or model requests. |
| Stage 5 server/API/engine focused suites | **277 passed**, reported by the integration owner | Policy, route/worker validation and mocked provider behavior; not proof of live Gemini fidelity. |
| Sidekick art/configuration and history panel focused suites | **46 passed**, reported by the art/history owner | SVG/component contracts and scrolling/collapse behavior; not native-browser visual acceptance. |
| `npm run typecheck` after the UI integration | **PASS** | Confirmed again by the final build/check. |
| `git diff --check` after the UI integration | **PASS** | Confirmed again by the final build/check. |
| Existing `.next/static` credential-content check | **PASS** | The configured Gemini key and judge-server capability were both absent from the current client bundle. Only configuration/presence booleans were printed; secret values were not printed. Repeated successfully against the final production build; staged files also contained neither configured private value, and `.env.local` was not staged. |
| Earlier targeted new-UI coverage run | **PASS — 36 tests** at that checkpoint; selected coverage reported 97.66% statements, 90.43% branches, 98.36% functions, 100% lines | Targeted subset only, before additional cases. Does not establish full-repository gates. |
| Full coverage suite | **PASS — 539 passed, 5 opt-in skipped; 544 total across 20 files** | 96.46% statements, 93.40% branches, 95.21% functions, 98.15% lines. This final run includes the shared-control extraction and Unicode request-size correction. |
| API tests after Unicode-length correction | **PASS — 176 API tests**, including 4 added cases | Also included in the final full coverage run; do not add overlapping suite totals together. |
| Final `npm run check` | **PASS** | 539 tests passed, 5 live-provider opt-in tests skipped; unchanged coverage gates passed, then the final Webpack production build and TypeScript compilation passed. |

A shared-control extraction removed the `StageFiveApp → multiplayer-app → StageFiveApp` runtime import cycle. Shared controls now live in `room-controls.tsx`, legacy named exports remain compatible, and the public page imports StageFiveApp directly. The earlier isolated run's 100/101 result was superseded by the passing full suite. A legacy fixture now explicitly requests Jungle where its assertions require that artwork, and the asynchronous UI-query wait allows five seconds for complete pixel-art rendering under shared-machine load. No assertion, game deadline or coverage gate was weakened.

The Turbopack development refresh loop **persisted after removing the cycle**. `npm run dev` was changed to Webpack, matching the existing production build. The Webpack development-browser recheck passed: the start screen hydrated, the create/join controls became usable, typed input remained stable, and no critical browser errors were recorded. The circular import fix alone is not claimed as the solution.

The existing gates remain 90% statements, functions and lines, and 85% branches; all passed. The final build and development recheck both passed.

The 49 focused UI cases include:

- Own-position editing, host topic/duration editing, no ability to select another player's slot, readiness/connection start conditions, one plan regeneration and starting the exact saved plan generation.
- Separate public presentation and private consultation callbacks, active-turn restrictions, input/quotas, correct paused-clock state, stable request keys, and preservation of an unsent official draft across `composing → consulting → composing` snapshots.
- Public transcript rendering, author-only original-draft details, completed judge summary speech, private history remaining accessible after completion, and labelled demo/fallback jury results.
- Actual public app entry: Courtroom default, Settings navigation, no inline theme picker, create/join setup, active debate, completed-room start/resume behavior, explicit room-link recovery and confirmed leave/create-another behavior.
- Historical Stage 3/4 archive view with no active Ask Judge/objection controls.
- Settings host/guest authorization and locks, saved local display preferences, invalid/blocked storage recovery and cross-tab preference updates.

## Cloud HTTP and Realtime results

All runs used the authorized Cloud development project, with no resets or weaker Auth settings. Synthetic users/rooms remain subject to normal expiry; they are not real user records.

| Suite | Result |
| --- | --- |
| `test:supabase` | **PASS — 15 checks** |
| Legacy `test:debate` | **PASS — 8 checks**, including a genuine 45-second deadline expiry |
| `test:api` | **PASS** |
| `test:leave` | **PASS — 7 checks** |
| Legacy `test:judge` | **PASS — 7 checks** |
| Stage 5 `test:lawyer` against production-mode app on port 3001 | **PASS — 10 checks**, including a real approximately four-minute debate and 8 completed fallback jobs |

The Stage 5 suite exercised independent setup, planner/start conditions, participant authorization and privacy, idempotency, public/private clock behavior, real expiry, synchronized snapshots/history, summaries and the final saved jury result. It completed using labelled fallback output; it does **not** establish a live Gemini jury evaluation. The exact suite is [`tests/db/lawyer.integration.mjs`](../tests/db/lawyer.integration.mjs). SQL checks above separately cover malformed worker output, quota boundaries and lease recovery.

For a rerun, use `QUARREL_ALLOW_REMOTE_TESTS=true QUARREL_TEST_URL=http://127.0.0.1:3001 npm run test:lawyer` while that server is running. Confirm the configured Cloud target first. Local Docker/CI results, if run, must be recorded separately.

## Browser acceptance

The production-mode app was inspected in **two isolated origins/sessions in the same Chromium browser**, not two different browser engines. Desktop viewport: **1440 × 1000**. Mobile viewport: **390 × 844**.

| Area | Observed result |
| --- | --- |
| Setup and plan | A created and B joined; each entered their own position, chose Ready, saw the plan and started the debate. |
| Debate interaction | Four public arguments and one owner-only private consultation were submitted. Public and private actions remained separate. |
| Themes | All four themes were selected through Settings and synchronized. Theme controls were disabled after Start. |
| Personal settings | Display preferences persisted after refresh. They remained separate from shared room settings. |
| Refresh and completion | Both sessions refreshed and recovered the same completed debate and verdict. |
| Mobile history and controls | History expanded/collapsed, text submission remained usable, and no horizontal overflow was observed. |
| Browser console | No console errors were observed through the inspected flow. |

The browser room was synthetic. Two of its public lawyer presentations were saved with `source: ai`; other observed jobs used labelled fallback. Native Safari/Firefox behavior was not tested. jsdom coverage of keyboard/focus contracts is not a claim of a full assistive-technology audit.

## Live Gemini evidence and limitation

- An earlier interrupted development HTTP run saved **two live AI plans and one live AI judge summary**. The interrupted run itself is not counted as a completed integration pass.
- The browser flow saved **two live AI lawyer presentations**. This confirms those calls reached Gemini and produced accepted structured output.
- A bounded diagnostic made **two requests**, both returning **HTTP 429**, indicating provider quota/rate limitations. No credentials or full provider payloads were printed.
- **No live AI jury result was confirmed.** The complete HTTP/browser flow reached a clearly labelled fallback split/inconclusive verdict. Successful live plans, presentations and a summary do not prove live jury behavior or perfect semantic fidelity.

## Visual evidence

- [Desktop courtroom and history, 1440 × 1000](screenshots/stage5-desktop.jpg).
- [Mobile courtroom/history, 390 × 844](screenshots/stage5-mobile.jpg).
- [All four themes' new lawyer and jury assets](screenshots/stage5-sidekick-art.png).

The application screenshots were saved during the production-mode browser inspection. The asset sheet is additional artwork evidence, not a substitute for the assembled-layout checks.

## Known limits and remaining work

- Full coverage/build, Webpack development startup, Cloud, HTTP and browser checks passed. GitHub CI is recorded separately after the branch push. Live jury generation remains unverified because the observed provider calls encountered quota/rate limits.
- Model instructions, output bounds and validation do not mathematically prove that every lawyer rewrite preserves meaning. Original official drafts are available to the author and judge/jury for comparison; unchanged fallback is labelled. Private consultations never become evidence.
- Demo/fallback verdicts return split/inconclusive and explicitly identify that no live AI evaluation occurred. They are not evidence of neutral live jury quality.
- The database authorizes deadlines; client countdowns estimate server time. Sleeping tabs and temporary network loss can delay their displayed refresh. Authorized reads reconcile elapsed deadlines; they do not restore writing time.
- No permanent background worker runs when every participant is offline. Saved work/lease expiry is reconciled when an authorized participant reads or reconnects.
- No Stage 5 deployment was performed. The existing public Vercel site continues to serve Stage 4 until a separately authorized deployment. This branch's localhost invitation works only where that localhost server is reachable.

Previous verification remains in [Stage 4](stage-4-testing.md), [Stage 3](stage-3-testing.md), and [Cloud setup history](stage-2-5-cloud.md). The Stage 5 changes do not reinterpret those old reports as tests of the new flow.
