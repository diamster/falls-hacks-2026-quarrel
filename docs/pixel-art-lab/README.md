# Pixel Art Lab

Mascot lawyers and pixel remasters of the eight original lawyers. Open **http://localhost:3000/pixel-lab** while `npm run dev` is running. In production builds the page returns 404 unless `QUARREL_PIXEL_LAB=true` is set.

## Files

| What | Where |
| --- | --- |
| Grid engine (48 × 56 cells, rendered ×2 into the cast's 96 × 112 viewBox) | `src/themes/art/pixel/grid.ts` |
| Mascots: boxy two-tone robot with pie, raccoon in a hoodie | `src/themes/art/pixel/mascots.ts` |
| Remasters of the eight original lawyers | `src/themes/art/pixel/remasters.ts` |
| Roster: asset IDs, Lawyer A/B mascot choice, accessories switch, art-style resolver | `src/themes/art/pixel/roster.ts` |
| SVG renderer with the existing `.sprite-body` / `.sprite-mouth` contract | `src/themes/art/pixel/pixel-sprite.tsx` |
| Lab page | `src/app/pixel-lab/` |
| Tests | `tests/pixel-art.test.tsx` |
| Reference images | `docs/pixel-art-lab/reference/` |

The existing sprite files (`pixel-art.tsx`, `characters.tsx`, `sidekicks.tsx`, backgrounds and benches) are unchanged.

## Common changes

- **Swap Lawyer A and B mascots:** edit `mascotLawyers` in `roster.ts`.
- **Turn theme accessories off:** set `MASCOT_ACCESSORIES = false` in `roster.ts`. Accessories are a Courtroom jabot/briefcase, a Jungle leaf/flower, a Superhero cape, and a Detective fedora.
- **Detective theme:** mascots and remasters are converted to equal-channel greys, as the noir tests require.

## Personal art setting

Settings → Personal display → **Lawyer artwork** is saved only in the viewer's browser, like the other display preferences. It never reaches the room, the opponent or the AI. The options are:

- **Theme default:** whatever the theme configuration specifies.
- **Original drawings**
- **Pixel remaster**
- **Mascots**

When the art is swapped, the accessible label keeps the lawyer's name and describes the drawing actually shown.

## Why pixels can look uneven, and what handles each cause

1. **Fractional coordinates in the art:** a shape that starts or ends at half a cell renders a sliver. The engine only accepts integer cells, and the tests check every rendered path.
2. **Antialiasing:** soft edges blend neighbouring cells. Every sprite uses `shape-rendering="crispEdges"`.
3. **Non-integer display scale:** a 48-cell sprite shown 64 px wide gives 1.33 device pixels per cell, so some cells get 1 pixel and others 2. The lab's size comparison flags this. Use widths that are whole multiples of 48 device pixels (48, 96, 144, 192…).
4. **Sub-pixel layout position:** even at a whole scale, a sprite that starts at x = 10.5 px straddles device pixels. The lab measures the rendered position.

Causes 3 and 4 depend on CSS in the app layout (character box sizes), not on the sprite data. Fixing them in the arena means editing the layout CSS, which was out of scope for this change.

## Flashcards

The lab shows each reaction (idle, talk, think, cheer) as a row of single-frame cards, next to a live animated card. Reactions have 2–4 frames each. `PixelCanvas.stamp` also accepts hand-drawn character rows with a palette, which is handy for small details.

In the app, sprites use the arena's existing CSS idle/speaking animations. The extra reaction frames are visible in the lab only; showing them in the arena would require arena changes.

## Reference images and originality

The reference sketches in `reference/` were supplied by the team. The sprites are original pixel drawings inspired by them, not traced. Differences from the references:

- The robot's face split is a straight seam, not a profile line.
- The raccoon's hoodie carries no lettering or logo.
- The robot is not named after any product.

Confirm you have the rights to the mascot designs before shipping them publicly.
