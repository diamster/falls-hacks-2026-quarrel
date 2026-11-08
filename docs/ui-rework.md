# UI rework (`quarrel-ui-rework`)

Frontend-only changes to the started debate screen, made in parallel with Stage 6A backend work. Branched from `main` at `01ec1c7` with `stage5-ui` (one-screen lobby, Settings popup) merged in at `b6a5a94`. No database, API, server, AI prompt, state-transition or data-field changes.

## Fixes

1. **Everything you need is on one screen (desktop).** Heading, clocks, scene and the argument input fit in a 1440×900 window; the scene height adapts to the window (`clamp(320px, 100dvh − 510px, 460px)`). The debate history stays beside the courtroom.
2. **Lawyers and the jury are in the courtroom.** Each lawyer stands beside their player; the jury sits raised on the side. A working lawyer shows "Preparing the presentation…" or "Private consultation…" and bobs; the jury shows "Deliberating…" during review. The cast is laid out once at full size and the stage scales to the scene's height and width, so nothing overlaps from desktop to phone.
3. **No duplicates.**
   - One set of clocks: the chess-style clocks above the scene (A left, B right, the running one lit). The scene's own timer is hidden on this screen.
   - One Settings entry: the header (opens the popup). The "Display settings" strip and the "Settings · theme" box are gone.
   - The subtopic question appears once, in the heading, with numbered progress squares. The judge's bubble says whose turn it is ("Avery, the floor is yours.", "Sage is presenting Blair's point. Both clocks are paused.") instead of repeating the question; summaries still appear there between subtopics. The history panel no longer repeats the current subtopic.
4. **Phones show the courtroom near the top.** Order: topic and subtopic, clocks, scene, input, then the collapsible history.

Also: a compact argument input (title says when it's your turn, status on the same line, counter beside the button, Ctrl/Cmd+Enter presents), and a global `.sr-only` utility that was used but never defined.

## Files

`src/components/lawyer-debate.tsx` + `.module.css`, `debate-arena.tsx`, `stage-five-app.tsx` + `.css`, `src/app/globals.css`, `tests/lawyer-debate-ui.test.tsx`, `tests/stage-five-app.test.tsx`.

## Verification

| Check | Result | Limits |
| --- | --- | --- |
| `tsc --noEmit` | PASS | Windows Node (this checkout's `node_modules` is Windows). |
| Coverage suite excl. `tests/judge-config.test.ts` | **559 passed, 5 skipped**; 96.36 / 93.55 / 95.18 / 98.32 % | `judge-config` fails only on Windows (Unix file mode); unchanged. |
| New tests | PASS | Lawyers/jury in scene, one timer pair, subtopic once, `h1` topic, progress, working lawyer/jury states. Existing assertion kept: "Private consultation…" is now the lawyer's in-scene badge. |
| `npm run build` | PASS | |
| Browser | All four themes at 1440×900; Detective at 1024×768; Courtroom and Jungle at 390×844; lawyer-working state | Headless Chrome with a stubbed `/api/rooms` fixture. Screenshots: `docs/screenshots/ui-rework-*.png`. The demo loop was separately exercised against Supabase Cloud before these changes. |

## Backend notes (not changed here)

None required for these fixes.

## Session 2 (game)

Branch `quarrel-ui-game`, from `quarrel-ui-rework` at `774bdc5`. UI only: no database, API, server, AI prompt, state-transition, type or data-field changes. Uses only data the snapshot already provides.

### Changes

1. **No scrolling during a game.** `LawyerDebateView` now fills its container's height (the 100dvh box from Session 1) as one grid. On desktop:
   - the left column holds the heading and subtopic, the centre clocks, the scene (it takes the remaining height), and the argument input
   - the shared record fills the right column, and only its log scrolls
   - "Ask my lawyer privately" sits under the record and opens upward over it, so it never pushes the scene

   On phones (≤ 900px), the heading, clocks and a compact scene stay on top. Below them, one panel shows at a time (Your point, Shared record, My lawyer), with the tab bar pinned to the bottom and the input just above it. A fallback `min-height` keeps the screen usable inside the old page layout too.
2. **Centre clocks.** The two clocks meet in the middle (A's time and B's time side by side), with a pivot between them. It shows an arrow toward the side with the floor and says Writing, Lawyer or Paused.
   - The side with the floor is lit (accent colour). The other clock is muted, and an expired clock's time is struck through.
   - In the scene, that side gets a stepped spotlight and a "WRITING"/"PRESENTING" marker over the player. The other player and their lawyer are dimmed.
   - Private consultations light nothing.
   - The `role="timer"` labels ("Player A: N seconds remaining") and the "Writing clock running" status are unchanged.
3. **The cast in the room.**
   - Everyone shares one ground line and one sprite scale (`--unit: 1.4px` per sprite unit). Lawyers are now the same size as their players and stand beside them.
   - Name plates hang just below the feet, all the same height.
   - The jury sits on a raised pixel-art jury stand at the back right, with its name plate on the stand.
   - The stage scales as one unit by container height and width, and keeps at least 900 layout units of width, so the cast never overlaps.
4. **Pixel backgrounds.** New `src/themes/art/pixel-scene.tsx` paints all four backdrops on a 240 × 110 cell grid. It uses the `pixelart` branch technique: integer cells emitted as runs, no curves, no opacity, and dithering instead of gradients. The art is original:
   - **Courtroom:** wood-panelled room, curtained windows, scales emblem, the bar and a carpet runner
   - **Jungle:** dithered sky, sun, stepped canopy, palms, vines and a wooden deck
   - **Superhero:** night skyline, moon, a dithered searchlight and rooftop tiles
   - **Detective:** strictly greyscale office with blinds, rain, an evidence board and lamplight

   The jury stand comes from the same file. The arena uses these backdrops, which includes the lobby scene. The original backgrounds (`backgrounds.tsx`) and the original Jungle art (`pixel-art.tsx`, `/preview`) are unchanged and still used by the theme previews.
5. **Jury decision popup.** New `jury-results.tsx` and `.module.css` show the decision in a native modal `<dialog>`:
   - the reveal runs in order: the jury's intro, each subtopic's line one by one, the outcome banner (A, B or split, with a personal line for each player), then the reasoning
   - Skip and Close are real buttons; Esc closes; focus moves to Close when Skip disappears
   - with reduced motion (system setting or the display preference), everything shows at once
   - it opens once per room and verdict (remembered in `sessionStorage`)
   - after closing, the full record stays on the page, with a "Replay the jury's decision" button

Also: `DebateHistoryPanel` has a `fill` mode (fills its cell and scrolls inside; the default behaviour is unchanged), and "New messages · jump to latest" now reads "New messages: jump to latest".

### Files

`src/components/lawyer-debate.tsx` + `.module.css`, `debate-arena.tsx`, `debate-history-panel.tsx` + `.module.css`, the "Debate scene with counsel" block at the end of `src/app/globals.css`. New: `src/components/jury-results.tsx` + `.module.css`, `src/themes/art/pixel-scene.tsx`.

### Verification

| Check | Result | Limits |
| --- | --- | --- |
| `tsc --noEmit` | PASS | WSL Node. |
| Vitest coverage suite | **Not run** | Skipped at the user's request. Existing assertions were kept where the behaviour is unchanged (timer labels, "Writing clock running", "Private consultation…", "Ask my lawyer privately" summary, verdict headings), but they haven't been rerun. |
| `npm run build` | **Not run** | The dev server compiled all changed files. |
| Browser | All four themes at 1440×900, 1024×768 and 390×844, in the composing, waiting, lawyering, consulting, summary, jury, complete and split states. No page or container overflow in any of them. | Headless Chromium against a temporary, uncommitted sample-snapshot page in a 100dvh wrapper. **A live two-window room in demo mode was not played.** |

Screenshots: `docs/screenshots/ui-game-*.png`.

### Needs backend (not implemented)

- `JuryVerdict.perSubtopic` has no per-subtopic winner, so the reveal can't show a running score (e.g. "A takes subtopic 2"). A `winner: "A" | "B" | "split"` per line would allow that.
