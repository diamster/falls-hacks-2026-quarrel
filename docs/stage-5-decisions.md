# Stage 5 — approved decisions and current flow

**Recorded:** 2026-11-07 · **Branch:** `quarrel-stage-5` · **Repository:** `diamster/falls-hacks-2026-quarrel`

The user approved D1–D12 during the Stage 5 implementation discussion, as recorded in the D1–D12 table below. These are approved product decisions, not open questions. Do not ask for the same approval again; request approval before changing a decision. The requirement to show a proposed Cloud migration before applying it remains separate and still applies.

Read [the original handoff](stage-5-handoff.md) first for context, then this document. The user's updated Stage 5 brief and this record take precedence over conflicting historical handoff text or Stage 1–4 behavior. In particular, the host no longer writes both positions, direct Ask Judge and clarification rounds are removed from the playable flow, Courtroom is the new-room default, and theme selection lives in Settings.

## Approved D1–D12

| Decision | Approved behavior |
| --- | --- |
| **D1 — artwork** | Add new original pixel-art Lawyer A, Lawyer B and a seated jury for **each of the four themes**. Preserve the existing players, judge, environments and original Jungle assets. Put lawyer/jury identities, assets and personalities in the shared theme configuration. Do not copy protected character designs. |
| **D2 — slow or failed lawyer** | Use an approximately **8-second AI timeout**, controlled by `JUDGE_AI_TIMEOUT_MS`. If the public presentation cannot be produced, publish the player's **unchanged submitted argument** as a clearly labelled **unedited fallback**. Both clocks remain paused during AI processing. A lost/expired work lease is reconciled by an authorized read or heartbeat; late results cannot replace the saved fallback. |
| **D3 — disconnects** | A disconnected player's active writing clock **continues running**. Reconnection reconciles the original server deadline; it does not restore or extend time. |
| **D4 — visibility and evidence** | The opponent receives only the lawyer's public presentation. The author can also inspect their own original official draft. The judge and jury can review **both official drafts and presentations** to notice additions. **Private lawyer consultations are excluded** from opponent snapshots, the public transcript, judge summaries and jury evidence. “Hidden from opponent” does not mean an official draft is hidden from the judge or jury. |
| **D5 — jury** | Return **A, B or split/inconclusive**, short overall reasoning and a short explanation for every subtopic. No numeric scores. Assess the reasoning presented, not who is factually or morally right. A split/inconclusive result is valid. |
| **D6 — first turn** | A opens odd-numbered subtopics; B opens even-numbered subtopics. Subsequent official presentations alternate while the opponent has time. If only one side has time left, that side can continue. |
| **D7 — duration** | Host presets are **2, 4, 6 or 10 minutes per player**, divided across all subtopics. This is each player's total writing time, not total wall-clock duration. AI processing and summary display time are additional. |
| **D8 — plan bounds** | Generate **2–5 distinct subtopics**, each with at least **30 seconds per player**. Per-player allocations must sum exactly to the selected total. Each question is at most **200 characters**. Validate the complete plan before saving/displaying it. |
| **D9 — planning and start** | Planning begins only after **both independently written positions and both Ready confirmations** are submitted. Both players see the saved plan in the lobby. The host may **regenerate once**, then must press **Start debate** explicitly. Start requires both players connected, confirmed positions and readiness, and the current saved plan. Lock topic, positions, plan and theme atomically. Readiness alone never starts the clocks. |
| **D10 — lawyer fidelity and size** | A lawyer may organize, tighten and restyle the submitting player's point, but must preserve meaning and qualifications and must not invent facts, evidence or additional arguments. Official input is at most **600 characters**; a presentation is at most **1.5× the input length**, capped at **900 characters**. Server/database validation, restricted context and unchanged fallback reduce risk; they do not prove perfect semantic preservation for every model output. |
| **D11 — quotas** | Each player has at most **12 official presentations per subtopic**. The count resets for the next subtopic. Reaching the cap neither extends nor ends their remaining writing clock; the subtopic still ends only when both clocks reach zero. |
| **D12 — development and failures** | Preserve a clearly labelled deterministic **demo/fallback** path for plans, presentations, summaries and verdicts when Gemini is absent or unavailable. The same structured contracts and authorization apply. A fallback verdict does not claim a live AI evaluation; the implementation preserves the record and returns split/inconclusive. |

## Updated flow and implementation details

1. The host creates a private room and enters the main topic and per-player total duration. Each player writes and confirms **only their own position**, at most 600 characters. Both positions are visible before starting. A player cannot supply another identity/slot to edit the other position.
2. Both players choose Ready. The planner creates a shared, timed plan. The host can regenerate once and explicitly start the displayed plan. A stale revision or plan generation cannot start a replaced plan.
3. **Present my argument** is public: the active player submits to their own lawyer, both clocks pause, the presentation is saved, and the opponent's clock starts if the opponent has time left. There is no extra approval step after the lawyer responds. The lawyer cannot submit another point without a player action.
4. **Ask my lawyer privately** is separate: only the active player can consult their own lawyer, at most **two consultations per player per subtopic**, with a **600-character input**. Processing pauses both clocks and resumes the **same player's** remaining time afterward. It does not publish an argument or hand the turn to the opponent. Consultation quotas reset by subtopic and do not add writing time.
5. A subtopic finishes only when both writing clocks reach zero. The neutral judge summarizes that subtopic for both players. The current implementation saves and displays the summary for a short server-controlled interval before proceeding.
6. After the final summary, the jury reviews the complete official record and all summaries. Private consultations never enter that evidence. Only the jury may return an outcome; the planner, lawyers and judge may not announce a winner.

The two-private-consultation cap and short summary display interval are implementation safeguards, not additional D1–D12 approvals. They are documented separately from the user-approved official-message quota. No Settings control changes these limits.

## Presentation and Settings

- **Courtroom** is the default for new rooms and safe rendering fallback. Existing room theme IDs are preserved. Jungle, Superhero and Detective remain selectable with their existing art.
- The dedicated **Settings** page previews all four themes. Only the host can change a room theme before Start; the guest sees read-only previews. A started room remains locked.
- Personal pause-animation, reduced-motion and text-size preferences are stored in that browser only. They do not change room settings, clocks, quotas, AI rules or either player's time. No sound or gameplay preferences were added.
- The public transcript sits beside the courtroom on wide screens and uses a collapsible panel on narrow screens. It follows new messages unless the reader is reviewing older entries. Official drafts are visible only to their author in the client; private consultation history is a separate owner-only panel.
- Preserve `/preview`, room membership, names, readiness, connection status, refresh recovery and leave/create-another behavior. Older Stage 3/4 records remain available as read-only archives rather than exposing obsolete Ask Judge or objection controls in the current experience.

## Boundaries and delivery

Use the existing Next.js, TypeScript, Tailwind, Supabase Cloud and server-only Gemini engine. Do not reset Cloud, drop historical data, weaken RLS, expand room capacity, add authentication screens, implement character customization or Team Mode, or add voice/video. New migration application requires the user's review first. Work and push exclusively on `quarrel-stage-5`; do not merge into `main` or older stage branches. Deployment is not included in this Stage 5 change.

The verification record is [stage-5-testing.md](stage-5-testing.md). Passing schema, policy or mocked tests is not proof of unrestricted model fidelity, live Cloud behavior or rendered browser quality; record each separately.
