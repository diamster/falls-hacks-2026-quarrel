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

## Session 1 (shell): home page, header, branding, transitions

Branch `quarrel-ui-shell`, from `quarrel-ui-rework` at `774bdc5`. Frontend only.

**Changes**
- **Name:** "Quarrel" in the logo, lobby wordmark, browser title, Settings page and invite page. The URL is unchanged. The legacy Stage 4 screen and the Stage 1 `/preview` page keep their original text (preserved as-is per `AGENTS.md`).
- **Filler removed:** "Your voice. A fair hearing." and the divider beside the logo; the "STAGE 05 / YOUR LAWYER SIDEKICK" badge; the "Art preview" link; the lobby footer (theme tagline such as "Different views. Equal consideration.", "Digital Sidekick · Stage 5 …"); "A fair hearing. A shared starting line."; "Every great debate starts with hello." (replaced by the Quarrel wordmark, or the topic once set); "Two players. One invitation."; "FOUR WORLDS. ONE FAIR HEARING." in the theme picker; "Two voices. A fair hearing." on the invite page; the scene's "LOBBY / TAKE YOUR SEAT" pill in the lobby; the duplicate room-code pill in the scene (the code is in the room panel and on the game Menu).
- **Home header:** logo, Start/Back to start and Settings only; no background bar.
- **Game:** no header. The logo sits top-left and a **Menu** button (showing the room code) top-right; its popover holds Settings, Back to start and the room panel (invite link, players, connection, Leave). Escape or clicking outside closes it. The game fills the viewport (`.game-shell`, `100dvh`); `LawyerDebateView` renders in `.game-stage`, which scrolls internally until Session 2 makes the game fit its height.
- **Transition:** moving from the lobby into a started game in the same tab plays a 0.55 s zoom/fade into the courtroom (decided during render, so there is no flash). Reloading straight into a game doesn't animate. Lobby panels ease in when they change.
- **Pause animation** button removed from the home page (Settings has "Pause artwork animations").
- **Why there seemed to be no animation:** this laptop's Windows setting asks for reduced motion, and the app honoured it by stopping all animation. Settings now has **"Play animations even if my device asks for less motion"** (browser-only preference `ignoreDeviceMotion`, default off; disabled while the in-app "Reduce motion" is on). With it ticked, idle animations and the game entrance run. The device setting is still respected by default.

**Files:** `stage-five-app.tsx`/`.css`, new `game-menu.tsx`, `settings-page.tsx`, `display-preferences.tsx`, `room-controls.tsx`, `share-invite.tsx`/`.module.css`, `theme-selector.tsx`, `src/app/layout.tsx`, `src/app/globals.css` (the reduced-motion rule only), tests `stage-five-app.test.tsx`, `settings.test.tsx`.

**Verification**

| Check | Result | Limits |
| --- | --- | --- |
| `tsc --noEmit`, `npm run build` | PASS | Windows Node. |
| Coverage suite excl. `judge-config.test.ts` | **562 passed, 5 skipped**; 96.02 / 93.31 / 94.89 / 98.03 % | `judge-config` fails only on Windows. |
| Updated tests | Intended changes only | Art preview link now asserted absent; in-game Settings/Back to start are reached through Menu; stored preferences include `ignoreDeviceMotion`. |
| New tests | PASS | No header/footer/filler on the start screen; game menu (contents, Escape returns focus, outside click); entrance only after lobby to game; the motion option and its storage. |
| Browser | All four themes; 1440×900, 1024×768, 390×844; game menu open; Settings motion option; invite page | Headless Chrome with stubbed room fixtures. A lobby-to-game switch confirmed the `game-enter` animation and idle `theme-idle` animation run with the option on (the machine reports reduced motion). Screenshots: `docs/screenshots/ui-shell-*.png`. |

**For Session 2 / later (not changed here, outside this session's files)**
- The "Debate scene with counsel" block in `globals.css` has its own `prefers-reduced-motion` rule; scope it like the global one (`.display-preferences:not([data-device-motion="ignore"]) …`) so the motion option also covers lawyer/jury animation.
- Filler candidates in game files: the history panel's "Shared with both players. Private consultations stay separate." and the composer fine print; the courtroom bench plaque reads "A FAIR HEARING" (`theme.ui.benchCaption`). Theme configs still contain `ui.tagline`, now unused by these screens.
- No backend changes needed.

**Game screen (rebuilt after merging `main`, Stage 6A/6B):** the courtroom fills the game view. At the top are the question card (topic, subtopic squares, question) and a versus pair of clocks; the running clock is lit. At the bottom is one input bar with your clock built in: a draining time bar, your time, the text box (Enter presents, Shift+Enter adds a line) and "Present my argument". "Ask my lawyer privately" sits beside it and opens upward. The history is a drawer on the right, toggled by **History** next to Menu, and holds the speech controls, the 6A message filter and the transcript. Results (6A acknowledge/rematch) appear centred over the courtroom. During 6B playback the speaking lawyer shows their words in a bubble in the scene. Implemented in `lawyer-debate.tsx`/`.module.css` (the earlier shell-only CSS overlay was removed). Phones stack the question and clocks, the courtroom, then the input bar. Screenshots: `ui-shell-game*.png`.
