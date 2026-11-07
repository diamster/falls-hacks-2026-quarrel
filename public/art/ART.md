# Original quarrel.io pixel art

The art is defined in `src/components/pixel-art.tsx` using SVG paths on a two-unit pixel grid. It uses original designs and does not trace or reproduce film characters, purchased asset packs or external images.

- **Leo**: golden lion, rust-orange mane, turquoise neckerchief; confident smile and hands-on-hips stance.
- **Zuri**: zebra with irregular charcoal stripes, coral vest and a raised hand.
- **Judge Moki**: gray ring-tailed lemur, cream collar, forest-charcoal robe, gold pendant and wooden gavel.
- **Courtroom**: turquoise sky, stepped jungle canopy layers, warm sun, palms, vines, flowers, wood platform and a wooden bench with a dark inset nameplate.

`CharacterSprite` exposes `.sprite-body` and `.sprite-mouth` hooks for the idle/speaking CSS animations. The sprite view box is 96 × 112, the courtroom is 960 × 440, and the judge's bench is 192 × 92. Each sprite supplies an accessible descriptive title. Scenery and the bench are decorative. `JungleBackdrop` uses internal responsive SVG groups at viewport widths up to 850px to bring palms and flowers into the cropped mobile/tablet composition. All artwork is bundled locally and needs no external credentials or runtime image service.
