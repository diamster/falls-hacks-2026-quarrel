# Stage 6A backend verification

Branch: `quarrel-stage-6a`, based on completed Stage 5 and the invite flow at `01ec1c7`.

## Rewrite incident

The original Gemini configuration returned HTTP 429 `RESOURCE_EXHAUSTED` for its daily per-project, per-model free-tier quota. Requests failed before any rewrite was generated; the existing unchanged-text fallback was therefore expected recovery behavior, not an artwork or layout bug.

The user supplied a replacement key. It was installed in ignored local configuration and as the existing Vercel Production secret, without committing or displaying it. Initial two-role tests returned AI results, but an isolated follow-up showed the primary `gemini-3.6-flash` model still returned daily-quota errors; the initial success used the configured alternate model. A new key alone did not restore that model's quota.

Direct tests of `gemini-3.1-flash-lite`, with alternate-model fallback disabled, then verified the exact short argument from the screenshot was rewritten within the 1.5× size limit. The rich jury test initially rejected missing required citations; the prompt/schema descriptions were improved without weakening validation, and a corrective live jury test passed. Production now selects the verified available Gemini model with the replacement key. Deployment `dpl_BnZaus3kioRwCkNdvNyRSYrdb6jo` reached READY at the same existing production commit (`01ec1c7`), not Stage 6A code. A production HTTP test created two synthetic players, submitted the screenshot argument and verified an AI rewrite, the peer’s identical public presentation, hidden original draft and handoff to B’s clock. Its plan used a labelled fallback. Both synthetic seats were explicitly left, retaining records.

The backend emits only fixed failure codes, never prompts, credentials or provider error bodies. Optional `GEMINI_FALLBACK_MODEL` can try one alternate model on quota/provider failure within the same timeout; it is now unset locally and in production. Future quota exhaustion still requires quota/billing management; application code cannot increase provider limits.

## Implemented scope

- Strict structured jury decisions distinguish A, B, tie and inconclusive; include strongest arguments, weaknesses, optional compromise and authoritative topic/positions. The database attaches actual saved subtopic summaries.
- Judge/jury evidence excludes original private drafts and consultations, including defensive filtering in the engine. Context preserves the complete bounded public transcript. Referenced argument labels are validated; this does not prove semantic fairness or factual truth.
- Fenced attempt tokens, bounded automatic jury retries and rate-limited explicit retries preserve one canonical result. A provider failure, missing key or demo mode never creates a Stage 6 verdict.
- Existing server clocks and summary completion transactions remain authoritative. Both clocks stay paused during processing.
- New session IDs and archives preserve previous results across mutually approved rematches. Acknowledgement is independent per player and does not mean agreement.
- Participant-only history endpoints expose public records only. Stage 5 compatibility is maintained through versioned APIs; no UI, CSS or artwork changes were made.

See [API usage](stage-6a-api.md) for request shapes and authorization.

## Checks completed so far

- API unit suites: 205 passed (29 new Stage 6 cases plus existing route tests).
- Engine and legacy judge unit suites: 117 passed.
- Worker tests: 20 passed, including fenced completion and sanitized jury failures.
- Live Gemini rewrite/consultation: 2 AI responses through configured failover; not proof the primary quota was restored. Direct `gemini-3.1-flash-lite` short-rewrite and corrected rich-jury checks subsequently passed individually without failover.
- TypeScript and whitespace checks passed during focused development. Final production rebuild after the jury prompt correction passed. No UI files, CSS, animation or artwork changed.
- Full `npm run check`: 613 tests passed, 5 opt-in skipped; coverage gates and production build passed. Coverage: 96.61% statements, 93.62% branches, 95.49% functions, 98.20% lines. Later jury prompt/600-character compromise alignment passed the focused 117-test engine suite and TypeScript.
- Isolated PostgreSQL/WASM: all migrations and Stage 5/6A transactional assertions passed. This was only a schema-test environment; the app stayed on Supabase Cloud, with no Docker backend substitution.
- Supabase Cloud: existing Stage 5 transactional suite passed 122 assertion statements; Stage 6A passed 58 statements, with loops exercising all four verdict outcomes and retry attempts. Fixtures and temporary test capability changes were rolled back.
- Real Stage 6A HTTP smoke: 5 grouped checks passed against localhost:3003 and Cloud, including create/join, positions, API authorization, incomplete-results guards, stale IDs and token renewal. No AI calls were needed; synthetic seats were explicitly left.
- Cloud security checks: archive RLS enabled; direct authenticated table access denied; private helpers inaccessible; anonymous rematch denied; private tables absent from Realtime; insert/update-only privacy guard preserved.

## Migration and rollout

`supabase/migrations/20261107235910_stage6a_reliability.sql` is additive: it preserves existing data, RLS and Realtime privacy. It adds private session archives and versioned worker/results APIs. Existing Stage 5 rooms retain their semantics unless explicitly upgraded by a Stage 6 worker; new Stage 6 rooms use the reliable lifecycle. The old worker cannot claim Stage 6 work.

The user explicitly approved the proposed migration. A syntax-only CASE-parentheses correction was disclosed before application; behavior did not change. Cloud applied it as `20261108000849_stage6a_reliability`, SHA-256 `40ad97935571765522ec2f266bb24fec2a1695773241905ee0bd988f642222f7`. Future migrations still require explicit review/approval. Do not replay historical migrations; Cloud and repository timestamps may differ. Do not reset data. Never deploy this branch against an unmigrated database.

Pre-migration departed players whose identities were already detached cannot be retrospectively restored to result access. New session archives retain original participant IDs. History is tied to the existing anonymous identity: clearing its credentials loses that access. The history list returns up to the latest 100 results; an authorized known debate ID remains individually retrievable.

Rematch, acknowledgement and explicit retry controls have backend endpoints only in this stage. Wiring new controls and richer result presentation belongs to Stage 6B/6C. Without connected clients there is no always-running worker; reconciliation resumes on authorized activity. Jury failures remain visibly incomplete in backend state until retry succeeds, rather than being passed off as a verdict.

## Test limits

The long Stage 5 HTTP clock/Realtime suite was updated to distinguish legacy demo completion from Stage 6 demo jury retry state, preserving its existing clock/privacy assertions. It was not rerun locally after that test-only adjustment to respect the requested time limit; CI runs it on push. Database tests covered its core clock/transition invariants, and focused real HTTP tests exercised the new routes. No new browser layout inspection was needed because this stage changes no UI. Live tests establish the observed synthetic responses, not a guarantee that every future AI response passes validation or has quota available.
