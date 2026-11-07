# Original quarrel.io pixel art

The art is defined in `src/components/pixel-art.tsx` using SVG paths on a two-unit pixel grid. It uses original designs and does not trace or reproduce film characters, purchased asset packs or external images.

- **Leo**: golden lion, rust-orange mane, turquoise neckerchief; confident smile and hands-on-hips stance.
- **Zuri**: zebra with irregular charcoal stripes, coral vest and a raised hand.
- **Judge Moki**: gray ring-tailed lemur, cream collar, forest-charcoal robe, gold pendant and wooden gavel.
- **Courtroom**: turquoise sky, stepped jungle canopy layers, warm sun, palms, vines, flowers, wood platform and a wooden bench with a dark inset nameplate.

`CharacterSprite` exposes `.sprite-body` and `.sprite-mouth` hooks for the idle/speaking CSS animations. The sprite view box is 96 × 112, the courtroom is 960 × 440, and the judge's bench is 192 × 92. Each sprite supplies an accessible descriptive title. Scenery and the bench are decorative. `JungleBackdrop` uses internal responsive SVG groups at viewport widths up to 850px to bring palms and flowers into the cropped mobile/tablet composition. All artwork is bundled locally and needs no external credentials or runtime image service.

## Stage 2.5 environments and cast

The Jungle SVG source remains unchanged. Three additional settings live in `src/themes/art/backgrounds.tsx`, `benches.tsx` and `characters.tsx`. `src/themes/art/index.tsx` supplies their common SVG wrappers; `src/themes/assets.tsx` maps the central theme asset IDs to the preserved Jungle art or these new components.

| Theme | Environment | Default Player A | Default Player B | Judge |
| --- | --- | --- | --- | --- |
| Jungle | Tropical wood court, palms, vines and flowers | Leo — `jungle-lion` | Zuri — `jungle-zebra` | Judge Moki — `jungle-moki` |
| Superhero | Gothic rooftop, layered skyline, searchlight and metal bench | Nova — `superhero-scout` | Kit — `superhero-inventor` | Rook — `superhero-rook` |
| Detective | Grayscale office, rainy windows, Venetian blinds and desk | Quinn — `detective-reporter` | Ellis — `detective-witness` | Detective Vale — `detective-vale` |
| Courtroom | Paneled wood courtroom, curtains, legal scales and bench | Morgan — `courtroom-advocate-a` | Casey — `courtroom-advocate-b` | Judge Rowan — `courtroom-rowan` |

Rook is an original teal-and-gold superhero sidekick, with an original costume and emblem. The rooftop uses genre elements rather than Batman/Robin artwork, names or trademarked logos. Vale wears a fedora and trench coat; Rowan wears judicial robes. The added player designs belong to their respective setting. These are the two default player designs for each theme, not extra customization choices.

The new assets retain the same 96 × 112 character, 960 × 440 environment and 192 × 92 bench coordinate systems, stepped silhouettes and two-unit character grid as Jungle. They use the same body/mouth animation hooks, simple idle/speaking CSS and reduced-motion behavior. Other character states remain placeholders. Unique React `useId` values keep SVG titles/patterns independent when previews and the arena render together. Decorative scenery is hidden from assistive technology; character titles and visible labels describe each participant.

Theme palettes, speech-bubble treatments, timings and original sample dialogue live in `src/themes/`, separate from the art renderers. Player and judge registries are separate; a player cannot select a judge asset through a character ID. All judges share the same future neutrality policy: personality controls presentation only. No image service, remote asset credentials, AI judging, objection animation or verdict generation is connected.
