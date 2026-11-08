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
