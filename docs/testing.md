# Stage 1 testing checklist

Test from `prototypes/quarrel-io` using Node.js 22.12 or newer. No environment secrets are needed.

## Build and startup

1. Run `npm ci`, then `npm run build`. Confirm compilation and TypeScript checks succeed.
2. Run `npm run dev` and open `http://127.0.0.1:3000`. Confirm the page loads and has no critical browser console errors.
3. Stop development, run `npm run start` after the build, and confirm the production page loads.

## Courtroom and local interactions

1. Confirm Leo is on the left, Zuri on the right and Judge Moki in the middle behind the wooden bench. Names, room code, topic, round, timer, speech bubble and debate history should be readable.
2. In Director’s booth, choose each character and try **idle** and **speaking**. Only that character’s selected state should change. Switching characters should retain their respective selections.
3. Select each of **listening, thinking, questioning, surprised, objection and verdict**. Confirm the control explicitly calls it a placeholder; it must not generate a decision or advance a round.
4. Choose each judge dialogue sample and use both arrow buttons, including wrapping from the last to the first. Confirm the bubble displays the chosen sample.
5. Pause motion, then change the judge dialogue: the new text must remain visible while motion stays paused. Resume motion. With the operating system’s reduced-motion preference enabled, verify animations are suppressed without hiding content or preventing dialogue changes.
6. Leave the argument empty, then enter only spaces: Submit should be disabled. Enter a normal argument and submit: a **Local preview** entry should appear as Leo, the draft should clear, and no generated reply, score or turn progression should appear.
7. Paste a long argument: the input should stop at 500 characters and the counter should match. A long unbroken word must not stretch the page horizontally.
8. Press **Objection!**: confirm the predefined judge sample and the lion’s objection placeholder appear, with a notice explaining that no decision was made.
9. Press **Reset preview**: confirm the two initial sample entries, welcome dialogue, default character states, empty draft and resumed motion return. Reload the page and confirm that local edits are not retained.

## Layout and accessibility

1. Inspect a desktop viewport and a narrow phone viewport. Check all three characters, speech text and nameplates remain visible; controls and text must not overlap or cause horizontal page scrolling.
2. Scroll through the mobile page and use the character/state/dialogue controls and composer. Confirm buttons are reachable and legible.
3. Navigate with Tab/Shift+Tab. Confirm visible focus, working native selects, the skip link and accessible Submit/Objection controls.
4. Open **How to play** with the keyboard. Confirm focus stays in the guide, Escape and its close buttons dismiss it, and focus returns to the opener.
5. Inspect the browser console after interactions. Confirm no critical runtime/hydration or missing asset errors. No credentials should be requested.

## Recorded results — November 7, 2026

Browser verification used the local development app at `http://127.0.0.1:3000` and a fresh production server at `http://127.0.0.1:3001` (a port override kept it separate from development).

| Check | Result |
| --- | --- |
| Production compilation | Final `npm run build` passed with the default Webpack builder: compilation, TypeScript and static route generation all succeeded |
| Production startup | `next start` on port 3001 started successfully; fresh production page loaded without credentials |
| Desktop layout | Inspected at 1440 × 1000; all three characters, names, bench and dialogue visible; no horizontal overflow |
| Mobile layout | Development inspected at 390 × 844 and 320 × 740; all three characters, names, dialogue and controls visible; no horizontal overflow |
| Production layout | Fresh production page inspected at 1280 × 720 and 390 × 844 without horizontal overflow |
| Character previews | All 24 character/state combinations checked, including independent state retention when switching selected characters |
| Judge dialogue | All four samples, previous/next navigation and wraparound checked |
| Animations | Separate unpaused screenshots showed changed pixels in all three sprite crops: idle lion/zebra and speaking judge |
| Motion controls | Pause/resume and changing dialogue while paused checked; new text stays visible. Two paused screenshots were pixel-identical across the full page |
| Submit | Empty/whitespace disabled; a valid local entry appears as the third transcript entry and clears the draft; no generated response or round progression |
| Objection | Predefined line and the lion’s objection placeholder shown, with local-only feedback and no round progression |
| Input length/overflow | 540 characters clamp to the 500-character limit; long unbroken text does not cause horizontal overflow |
| Reset | Restores two sample entries, initial states, welcome dialogue and empty draft |
| Guide keyboard behavior | Tab remains in the modal; Escape closes it and returns focus to the opener |
| Production interaction smoke test | Judge dialogue, zebra speaking and local argument submission worked; reload restored two sample entries and default states |
| Browser console | No production console errors before or after the mobile checks |
| Reduced motion | CSS rule reviewed; operating-system reduced-motion emulation was not performed |

Saved presentation evidence: [desktop](screenshots/desktop-final.png) and [mobile](screenshots/mobile-final.png). These show the final local-only Stage 1 interface.

The initial Turbopack production build encountered a local worker permission error (`EPERM`), including a retry with broader execution permission. The supported Webpack build passed and is the project’s default build path. No application feature depends on that worker behavior.

Source review confirmed that the implementation stays within Stage 1: local React state, bundled art/fonts, static demo topic/room/round/timer, and no multiplayer, Supabase, authentication, LLM, voice/video or judging services.
