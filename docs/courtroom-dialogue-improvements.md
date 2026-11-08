# Courtroom dialogue improvements

Branch: `quarrel-courtroom-dialogue`, based on Stage 6B commit `6635386`.

- Subtopic summaries now request 2–3 short sentences, target 40–70 words, and are validated at 70 words / 700 characters maximum. Summary generation uses a 512-token ceiling. Overlong output follows the existing labelled fallback path with balanced, concise text; it is never clipped to remove one side. Final jury prompts, limits and evaluation remain unchanged. Existing saved summaries are preserved.
- A shared role layout puts the two existing lawyer sprites in the former player positions and the existing player sprites on labelled side stands. Judge remains centered. All four themes reuse their original assets and identities. Below-scene duplicate lawyer cards were removed; the jury and private consultation controls remain.
- On desktops at least 1600px wide, spare outer margins add 128px to the arena/history layout, increasing the arena from roughly 972px to 1100px (13%). Its original 972:510 ratio is retained. Navigation, clocks and argument-input sizing remain unchanged. Narrower layouts keep their existing responsive breakpoints.
- A scrollable pixel-art dialogue panel directly below the arena displays the latest completed public lawyer/judge/jury message. Active or paused playback selects that exact saved message instead. It returns to the latest public message after Stop, works with audio disabled, and never reads draft or consultation text. The chronological history side panel is retained.

## Quick checks only

No full suite, coverage suite, screenshots, screenshot/visual-regression tests, long multiplayer test, Cloud migration or database integration was run.

- TypeScript check passed.
- Production build passed.
- 43 targeted dialogue/active-debate/TTS presentation checks passed, including one corrected assertion rerun after moving the lawyer cards. Dialogue checks cover updates, muted/paused playback, canonical text, private-text exclusion and theme speaker names.
- 6 role-layout checks passed across all four themes, including legacy compatibility and reduced-motion flags.
- 10 summary-specific checks and 9 selected existing summary/personality regressions passed. These verify prompt/schema/length/token limits and jury isolation; no new live AI call was made.
- Browser DOM/layout inspection in the in-app browser verified the actual 390px and 1600px viewports, both named players/stands, both lawyers, centered judge and below-scene dialogue. The page had no horizontal overflow or critical console errors. No screenshots were taken or saved. A small desktop nameplate overlap detected by bounds was corrected and rechecked.

TTS transport/provider code, server clocks, room APIs, schema, authorization and rematch/results logic were unchanged. Audio matching was checked through targeted playback-state tests; no new live audio generation or cross-browser listening test was performed. Full art/visual regression and a long multiplayer run were intentionally omitted.
