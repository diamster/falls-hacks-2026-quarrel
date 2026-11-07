# Stage 5 handoff — Lawyer Sidekick Debate

**Written:** 2026-11-07 · **Branch:** `quarrel-stage-5`, created from `quarrel-stage-4` at `59439f2` · **Repository:** `diamster/falls-hacks-2026-quarrel`

This document is the complete, current instruction for Stage 5. It was agreed by the team in a live discussion and supersedes the earlier written brief titled **"Stage 5 — Interactive Objection System"**. **Do not implement that brief**: objections, objection reasons, clarification steps and timer pauses for objections are all out of scope.

> **Do not start from `main`.** `main` still holds Stage 2 only. Stages 2.5 → 3 → 4 are chained on their branches; `quarrel-stage-5` contains all of them.

## 0. Context

quarrel.io is a Fall Hacks 2026 project for the **"Digital Sidekick"** theme: a pixel-art debate game for two players. In Stage 5 each player gets an **AI lawyer**, their personal sidekick, who presents their points. A neutral AI **judge** summarizes each part of the debate and an AI **jury** decides the outcome.

Existing app (Stages 1–4, keep working): Next.js App Router + TypeScript + Tailwind, Supabase Cloud project `exjdvtqsalnkghyohyuh` (PostgreSQL, RLS, Realtime, anonymous Auth), Gemini via a server-only judge engine, four themes (Jungle, Superhero, Detective, Courtroom), private two-seat rooms, lobby with readiness, topic/position proposal and approval, host start, leave room, the `/preview` Stage 1 page.

Read before coding: `AGENTS.md` (rules, including the Stage 5 section), `README.md`, `docs/stage-4-testing.md`, `docs/stage-3-testing.md`, `docs/stage-2-5-cloud.md`, and the relevant guide in `node_modules/next/dist/docs/` (this Next.js version has breaking changes).

## 1. The game flow

1. **Create.** Player 1 (host, slot A) creates a room and proposes the **topic** (e.g. *"Should we watch One Piece or Naruto?"*), the two positions, and a **total time**. Player 2 (slot B) joins with the room code. The existing propose/approve and readiness lobby stays.
2. **Plan.** The topic goes to the AI **planner**, which creates **subtopic questions** and divides the time between them. Example for a 4-minute total:

   | # | Subtopic | Time per player |
   |---|---|---|
   | 1 | Why do you want to watch One Piece? | 1 min |
   | 2 | Why do you want to watch Naruto? | 1 min |
   | 3 | What do you want to achieve by watching? | 2 min |

   Subtopics should let **both sides** make their case. Both players see the plan in the lobby before the host starts.
3. **Debate each subtopic in order, chess.com style.** On each subtopic **each player has their own clock** set to that subtopic's time.
   - The active player's clock runs **only while they are writing**.
   - When they send their prompt to their **lawyer**, their clock **stops**. No clock runs while the lawyer (AI) works.
   - The lawyer rewrites the prompt in its personality and the result is **sent directly to the opponent** (no approval step).
   - Then the opponent's clock starts and they reply through **their** lawyer, and so on.
   - The subtopic ends when **both** clocks have run out. A player with no time left cannot send; the other player keeps going until their clock also runs out.
4. **Judge summary.** After each subtopic the **judge** summarizes what both sides said on it. The summary is **shown to both players** between subtopics, then the next subtopic starts.
5. **Jury verdict.** After the last subtopic the **jury** reads every message (raw and lawyer versions) and every judge summary and **decides the final outcome** of the original topic.

The judge looks at one subtopic at a time; the jury looks at everything.

## 2. Remove / keep

**Remove from the playable flow** (keep old tables and data in the database; do not drop or reset anything in Cloud):
- Ask Judge / direct judge chat (`begin_quarrel_judge_message`, the chat UI in `judge-panel.tsx`).
- AI clarification questions and the `questions` phase.
- Opening/rebuttal phases and the **hidden simultaneous opening reveal** (Stage 3 rule where both openings stayed secret until both were submitted; it no longer applies because there are no openings).
- The placeholder verdict (replaced by the jury verdict).
- Objections of any kind (dropped "for now"; may return later).

**Keep:** room create/join/leave, anonymous sessions, readiness, connection status, refresh recovery, the two-seat constraint, the theme picker and all four themes, the topic/position propose-approve flow, host start, Supabase Cloud + the Realtime invalidation signal, the Gemini server engine with demo/fallback modes, the judge-server capability (`JUDGE_SERVER_SECRET`), the `/preview` page and original Jungle artwork, keyboard accessibility, reduced motion, responsive layout.

## 3. Provisional decisions — confirm with the user if you need to deviate

The team has not yet confirmed these defaults. Build them as written; if one turns out to be unworkable, ask the user rather than guessing.

| # | Decision | Default | Notes |
|---|---|---|---|
| D1 | Lawyer and jury artwork | Add **new original pixel-art sprites per theme**: a lawyer for A, a lawyer for B, and a jury (a few seated jurors) | Today each theme has only two players and a judge. Store the lawyers' personalities in the theme config like the judge's. No copyrighted characters. Cheaper fallback if time runs short: reuse existing characters with "Lawyer" labels. |
| D2 | Lawyer AI fails or is slow | After ~8 s (`JUDGE_AI_TIMEOUT_MS`), post the player's **raw text, labelled "unedited"** (`source: "fallback"`) | No clock runs while waiting. A lawyer job must never leave the debate stuck: a job past its lease is resolved with the fallback on the next read/heartbeat. |
| D3 | Player disconnects mid-subtopic | Their **clock keeps running** (chess.com behaviour) | Prevents stalling. Reconcile by deadline when anyone reads. |
| D4 | What each side sees | The **opponent sees only the lawyer's version**. The sender sees their own raw text and their lawyer's version. **Judge and jury see both** | Lets the judge/jury notice if a lawyer added something. The member snapshot RPC must filter the opponent's raw text. |
| D5 | Jury result format | Outcome is **side A, side B, or split decision**, with short overall reasoning and one line per subtopic | Evaluates the arguments as presented; does not declare who is factually or morally right. No numeric scores. |
| D6 | Who opens each subtopic | **A opens odd subtopics, B opens even ones** | |
| D7 | Meaning of "total time" | Each player's own speaking time across all subtopics (example above: 1 + 1 + 2 = 4 min each) | Host picks a preset: 2, 4, 6 or 10 minutes. |
| D8 | Planner limits | **2–5 subtopics**, each at least **30 s** per player, totals summing exactly to the chosen time | Server normalizes/validates. Subtopic question ≤ 200 chars. |
| D9 | When the plan is made | Generated after the topic/positions are approved, **shown in the lobby**; host may **regenerate once**; host start locks it | Start still requires approvals, readiness and both players connected. |
| D10 | Lawyer rules | Lawyers may restyle, organize and tighten the player's point in their personality, **but must not add facts, evidence or new arguments** | Lawyer output ≤ ~1.5× the input length, max 900 chars. Player prompt max **600 chars**. |
| D11 | Message cap | Safety cap of **12 messages per player per subtopic** | Prevents spam with tiny messages. |
| D12 | No Gemini key (demo mode) | Fixed fallback subtopics from a template, a light deterministic "lawyer" style wrapper, labelled demo/fallback judge summaries and jury verdict | Same structure as AI output, so the game is fully playable without a key. |

## 4. Records and labels

Every message is a database row with a human-readable **label** (unique per debate):

| Label | Meaning |
|---|---|
| `S1-P1L1M1` | Subtopic 1, player 1 (slot A), lawyer 1, player 1's message 1 in that subtopic |
| `S1-P2L2M1` | Subtopic 1, player 2 (slot B), lawyer 2, message 1 |
| `S1-J` | Judge summary of subtopic 1 |
| `JURY` | Final jury verdict |

`P1`/`L1` = slot A and `P2`/`L2` = slot B. Message numbers count per player per subtopic. Store the label as a column, but query by the structured fields.

**Suggested shape** (adjust after reading the migrations; all in `quarrel_private`, no client grants, member-filtered RPC reads only):

- `debates` gains a format marker (e.g. `format = 'lawyer'`), `total_seconds`, and the new phases. Existing Stage 3/4 rows stay valid; do not break the existing `debate_turn_state` data — replace that constraint with one that accepts both old rows and the new phases.
- `debate_subtopics`: `room_id`, `revision`, `ordinal`, `question`, `seconds_per_player`, `opener_slot`, `source` (ai/demo/fallback), `status` (pending/active/summarizing/done), clock state per slot (`remaining_ms_a`, `remaining_ms_b`), `active_slot`, `turn_started_at`, `turn_deadline`.
- `debate_messages`: `id`, `room_id`, `revision`, `subtopic_ordinal`, `slot`, `message_no`, `label`, `kind` (`player` | `judge_summary` | `jury_verdict`), `raw_text`, `lawyer_text`, `source`, `status` (pending/complete), `created_at`, `completed_at`, `claimed_at`, `deadline_at`. Unique on `(room_id, revision, label)` and on a request idempotency key per player.
- The jury verdict stores structured fields (`outcome` A/B/split, `reasoning`, per-subtopic lines) plus its text.

## 5. Server-authoritative clock state machine

Phases: `setup` → `planning` (lobby, plan visible) → `subtopic` → `summary` → … → `jury` → `complete`.

Within a subtopic the state is `composing(slot)` (that slot's clock is running) or `lawyering(slot)` (no clock running).

- **Send** (RPC, under the existing room lock, identity from `auth.uid()`): compute elapsed time with `clock_timestamp()`, subtract it from the sender's remaining time, reject if the sender is not the active slot, has no time left, or exceeds the message cap. Insert a `pending` message with the raw text and switch to `lawyering`.
- **Lawyer job** is claimed once by the server worker (same pattern as `claim_quarrel_judge_work` / `finish_quarrel_judge_work` with the server capability), validated, saved, and the message becomes `complete`.
- **After a message completes:** if the opponent has time, the opponent is `composing` with `turn_deadline = now + their remaining`. Else if the sender still has time, the sender continues. Else the subtopic ends → `summary`.
- **Deadline passes** while `composing`: that player's remaining time becomes 0 and the same rule decides what happens next. Reconcile on any authorized read/heartbeat using the original deadline chain (Stage 3 approach), so reconnecting never resets or extends a clock.
- **Summary job** → judge summary saved as `S{n}-J`, shown to both, then the next subtopic starts (a short fixed display interval, or an explicit "Continue" from both, your choice; keep it server-driven). After the last subtopic → `jury` job → `JURY` row → `complete`.
- Every AI job has a lease and a deterministic fallback so the room can never stay stuck.
- Bump `debate_version` on every change; Realtime carries only that invalidation signal, never message text.
- Browser clocks use the existing `ServerClock` / monotonic method (`src/lib/debate-types.ts`); the database alone accepts or rejects.

## 6. AI roles (one shared engine, Gemini only)

Extend `src/server/judge-engine.ts` and `judge-worker.ts` with new job kinds instead of building separate engines: `plan`, `lawyer`, `summary`, `jury`. Keep structured JSON responses validated on the server **and** in PostgreSQL, bounded input/output, timeouts, the untrusted-data/prompt-injection rules, and the safety redirection for threats/abuse.

| Role | Input | Output | Personality |
|---|---|---|---|
| Planner | topic, positions, total time | 2–5 subtopics + seconds each | neutral |
| Lawyer A / B | the player's raw prompt, their position, the subtopic, recent visible messages | rewritten message | per theme, per side |
| Judge | one subtopic's messages (raw and lawyer versions) | neutral summary of both sides; may note claims that were unsupported or added by a lawyer | theme judge |
| Jury | all messages, all summaries, topic, positions | outcome A / B / split, reasoning, per-subtopic lines | theme jury |

Important: the current engine policy and the `forbiddenVerdict` check **forbid naming a winner**. That must remain true for the lawyer, judge and planner jobs; allow an outcome **only for the `jury` job**, through its structured `outcome` field. Lawyers argue only for their own player and must not attack or insult the opponent. Personality changes wording only, never standards.

## 7. UI

- **Lobby:** total-time preset, the planned subtopics with times, "Regenerate plan" (host, once), existing start rules.
- **Debate screen:** current subtopic question and number, two chess clocks (active clock visibly running), a composer with **"Send to my lawyer"** (disabled when not your turn or out of time), a "lawyer is writing…" state, a conversation log of lawyer messages labelled by side, with the sender able to expand their own raw text.
- **Between subtopics:** the judge's summary in the themed speech bubble.
- **End:** the jury verdict with the full transcript.
- Lawyer and jury sprites per theme (D1); keep the existing judge characters. Reduced motion, keyboard access and mobile layout must keep working.

## 8. Security and database rules (from `AGENTS.md`)

- Identity always comes from the verified session and `auth.uid()`; never accept a player ID or slot as authority.
- No Supabase service-role key anywhere. Private data stays in `quarrel_private` behind security-definer RPCs and RLS.
- Keep `GEMINI_API_KEY` and `JUDGE_SERVER_SECRET` server-only; never commit or print them.
- **Cloud migrations:** inspect the existing migration history first (Cloud timestamps differ from file names, see `docs/stage-2-5-cloud.md`), write one new reviewed migration, **show it to the user before applying it**, never reset, replay or drop existing data, and keep the insert/update-only Realtime publication guard.

## 9. Test checklist

1. Planner produces 2–5 subtopics whose times sum to the chosen total; demo fallback works without a key.
2. Only the active player can send; the other player's sends are rejected server-side.
3. The sender's clock stops on send; no clock runs while the lawyer works; the opponent's clock starts after the lawyer message is saved.
4. Remaining time is preserved exactly across turns, refreshes and reconnects; a disconnected player's clock keeps running.
5. A player with no time cannot send; the subtopic ends only when both clocks are empty.
6. Lawyer failure/timeout posts the labelled raw text and never stalls the room.
7. The opponent never receives the other side's raw text (snapshot RPC and Realtime checked).
8. Labels are correct and unique (`S1-P1L1M1`, `S1-P2L2M1`, `S1-J`, `JURY`); duplicate submissions/retries do not create extra rows or AI calls.
9. A judge summary appears after every subtopic in both browsers; the jury verdict appears once, identically in both.
10. Only the jury names an outcome; lawyers do not add facts; prompt-injection text in player messages is ignored.
11. All four themes show their lawyers, judge and jury; reduced motion and mobile layout work.
12. Existing room, lobby, theme, leave and `/preview` behaviour still works.

Run `npm run check`, the database tests, and the Cloud integration suites described in `AGENTS.md` (`QUARREL_ALLOW_REMOTE_TESTS=true` for remote runs), update the integration tests for the new flow, and record actual results and limits in `docs/stage-5-testing.md`. Update `README.md` for the new flow.

## 10. Out of scope

Objections, Ask Judge chat, clarification questions, character customization (Stage 8), Team Mode (Stage 9), AI-generated debate *topics* (the planner generates subtopics of the user's topic only), voice/video, account registration, hosting/deployment, and switching AI provider away from Gemini.

## 11. Delivery

Commit to `quarrel-stage-5` and push that branch. Do not push to `main` or the earlier stage branches. Summarize the files changed, tests run (and which were not run) and any remaining issues for the user.
