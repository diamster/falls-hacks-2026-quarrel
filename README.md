# quarrel.io — Stage 1

An original tropical pixel-art debate courtroom, built for the Digital Sidekick hackathon with **Next.js App Router, TypeScript, Tailwind CSS and reusable React components**.

This is a self-contained prototype on `quarrel-stage-1`. The existing SFU campus project is unchanged. **Stage 1 stops at the interface and local previews.** There is no multiplayer, backend, Supabase, authentication, real AI, debate adjudication, voice or video.

## Run locally

Use Node.js **22.12 or newer** and npm. From the repository root:

```sh
cd prototypes/quarrel-io
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). No account, `.env` file or external credentials are required. Dependencies need network access during installation; fonts and artwork are bundled locally for runtime.

For a production build:

```sh
npm run build
npm run start
```

Stop the development server before starting production on the same port. `npm run typecheck` runs TypeScript independently.

The production build script uses Next.js’s supported Webpack builder. Turbopack’s production worker encountered a local permission error in the development environment; Webpack built successfully. This changes the build tooling, not the Stage 1 feature scope.

## Explore the preview

- **Director’s booth:** choose Leo the lion, Zuri the zebra or Judge Moki the lemur, then select a character state. Each character retains its own selection.
- **States:** idle and speaking have simple animations. Listening, thinking, questioning, surprised, objection and verdict use labelled placeholder poses; they do not evaluate a debate.
- **Judge dialogue:** choose one of four sample lines or use the previous/next buttons. The speech bubble updates locally and Moki switches to speaking.
- **Practice argument:** write up to 500 characters and press Submit. It appends a clearly labelled entry to this tab’s transcript as Leo. Empty or whitespace-only submissions are disabled. No response or score is generated.
- **Objection:** shows a predefined judge line and the lion’s objection placeholder. It does not interrupt a real turn or decide a ruling.
- **Motion:** Pause motion stops the courtroom animations. The interface also respects the system’s reduced-motion preference.
- **Reset preview:** restores the initial character states, dialogue and sample transcript, clears the draft and resumes motion. Reloading also starts fresh; nothing is stored or transmitted.

The room code, topic, round and turn timer are demonstration placeholders. The timer does not count down and submissions do not advance rounds.

## Project structure

| File or directory | Responsibility |
| --- | --- |
| `src/app/` | App Router page, layout, metadata, local fonts and global/Tailwind styles |
| `src/components/quarrel-app.tsx` | Local preview state and composition |
| `src/components/courtroom.tsx` | Layered jungle scene, speech bubble, room/timer placeholders and judge bench |
| `src/components/character.tsx` | Reusable character wrapper, names, state and animation hooks |
| `src/components/pixel-art.tsx` | Original SVG pixel-art characters, scenery and bench |
| `src/components/preview-controls.tsx` | Independent character, state, dialogue, motion and reset controls |
| `src/components/debate-history.tsx` | Sample and local-only transcript entries |
| `src/components/argument-composer.tsx` | Accessible textarea, count and local Submit/Objection controls |
| `src/components/ui.tsx` | Shared pixel buttons, icons and section headings |
| `src/components/about-dialog.tsx` | Keyboard-accessible local-preview guide |
| `src/lib/preview.ts` | Typed character/state definitions and sample content |
| `docs/testing.md` | Stage 1 verification checklist and recorded results |

All character states share the `CharacterState` type so future stages can reuse the interface without inventing alternate state names. The current app only changes local React state. No later-stage services or rules are included.

## Artwork and accessibility

The lion, zebra, lemur, tropical scenery and bench are original SVG pixel art defined in code, with crisp grid-aligned edges. No film character is reproduced. See [the art notes](public/art/ART.md). Pixelify Sans and DM Sans are installed through Fontsource and bundled by Next.js.

Controls use native buttons, selects, labels and a modal dialog, with visible keyboard focus, live feedback for dialogue/actions, a skip link and reduced-motion styling. The courtroom and panels adapt to narrow screens. Follow [the testing checklist](docs/testing.md) to verify Stage 1 after changes.
