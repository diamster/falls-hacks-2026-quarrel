# Stage 2.5 verification

Completed November 7, 2026 against local Supabase and the production app at `http://127.0.0.1:3001`. Earlier evidence remains in [Stage 1](testing.md) and [Stage 2](testing-stage-2.md).

November 7 follow-up: the app is moving to the authorized Supabase Cloud development project. See [Cloud setup and verification](stage-2-5-cloud.md) for that separate connection/testing record. The local-only results below remain unchanged historical evidence.

Scope: four themes in the existing private two-player application. Player A selects a persisted lobby theme; Player B receives it through the existing Realtime connection. Both-ready remains a confirmation only. No actual start, debate turns, AI, real objections/verdicts, character customization or team mode is implemented.

## Completed service checks — November 7, 2026

| Check | Observed result |
| --- | --- |
| `npx supabase migration up --local` | Applied the Stage 2.5 migration to the existing local stack; no reset or room-data deletion |
| `npm run test:db` | 84 PostgreSQL/pgTAP assertions passed: 48 preserved checks and 36 new theme checks |
| `npm test -- tests/room-api.test.ts` | 64 route-unit tests passed, including strict theme input and session authorization |
| `npm run test:supabase` | 15 real Auth/database/Realtime checks passed on an unchanged retry |
| `npm run test:api` | Actual application route checks passed, including all four theme choices and host/guest/outsider authorization boundaries |
| Full coverage suite | 157/157 tests passed; statements 99.80%, branches 95.84%, functions 100%, lines 100% |
| `npm run check` | Passed; all five test files passed, followed by the production build |
| Production build | Webpack compilation, TypeScript and static generation passed; `/api/rooms/theme` is present |

The database suite verifies default Jungle/unlocked state, solo capacity two, all four accepted IDs, host selection before a join, guest/outsider/public denials, invalid values, expiry, direct-write denial, unchanged readiness and member-only reads. An administrator-only test fixture sets `theme_locked` and verifies that even Player A cannot change a locked theme. This does not add a start or lock endpoint to the application. Existing capacity constraints and authorization policies remain in place.

Live Supabase tests observe actual room-table Realtime updates while the host cycles through all four themes, then read the matching state as the peer. They preserve readiness and verify recovery using fresh clients. Existing concurrent join, two-seat, private-read, forged-identity and elapsed disconnection checks remain. The first run timed out on the pre-existing readiness Realtime check during local service/resource contention; the unchanged retry passed. No assertion or timeout was weakened.

Vitest runs with one worker and a 15-second test-runner allowance to accommodate host load. Earlier runs with the default five-second deadline timed out in different existing SVG-heavy tests, without assertion failures. Assertions, coverage thresholds and application timing behavior remain unchanged. The final combined check used the committed configuration; its test phase completed in 59.45 seconds.

HTTP tests use separate cookie jars and real local Supabase. They cover theme persistence on recovery/token renewal, theme selection before joining, readiness preservation and rejection of invalid IDs, peer/outsider writes, forged player/slot/lock/mode/capacity fields, missing credentials and cross-origin writes. Unit/component transport mocks do not substitute for these real-service checks.

## Required feature checklist

| Requirement | Verification status |
| --- | --- |
| Room creation still works | Browser host created a six-character private room; real API/database checks passed |
| Room joining still works | Browser guest joined by invitation after the host selected Superhero; inherited the selected setting |
| Both players see the selected theme | All four settings observed in both player sessions |
| Player A can switch all four themes | Mouse and keyboard selection passed; choices remained available after both-ready |
| Player B sees changes immediately | Guest scene updated without refreshing after each host change; actual room-update subscription also passed |
| Refresh preserves the theme | Both browsers restored Courtroom, their names/seats and readiness after reload and server restart |
| Each setting has its correct judge and players | All twelve characters inspected across four desktop/mobile scenes; asset/configuration checks passed |
| Backgrounds and UI colors update | All four scenes inspected; noir contrast corrected and protected by palette contrast tests |
| Dialogue preview uses theme-specific samples | Selected sample text in every theme; matching judge name/style and sample indicator observed |
| Invalid values do not crash the app | Server/database rejection and configuration/component rendering fallback checks passed |
| Ready and connection indicators still work | Guest ready/unready updates reflected on host; connections recovered after server restart; real elapsed-disconnection test passed |
| Desktop and mobile remain usable | All four settings inspected at 1440px and 390px; additional Jungle inspection at 320px without horizontal overflow |

## Browser evidence

Review used two isolated cookie origins (`127.0.0.1` and `localhost`) in the in-app browser. These represent separate player sessions, **not separate native browser engines**. Native multi-engine testing has not been performed. Guest cards were disabled; host keyboard navigation restored focus after a successful change. Changing themes preserved both players' readiness.

Idle/speaking animation hooks were active, and Pause changed all three character animations to the paused state. Resume restored motion. The unchanged Stage 1 `/preview` still rendered the original Jungle scene on mobile, changed sample dialogue and paused motion. The final build produced no browser console errors or warnings during these checks. Expected connection errors occurred only while the server was deliberately stopped for rebuilding; recovery was verified afterward.

Captured and visually inspected screenshots:

- Jungle: [desktop](screenshots/stage25-jungle-desktop.png), [mobile](screenshots/stage25-jungle-mobile.png)
- Superhero: [desktop](screenshots/stage25-superhero-desktop.png), [mobile](screenshots/stage25-superhero-mobile.png)
- Detective: [desktop](screenshots/stage25-detective-desktop.png), [mobile](screenshots/stage25-detective-mobile.png)
- Courtroom: [desktop](screenshots/stage25-courtroom-desktop.png), [mobile](screenshots/stage25-courtroom-mobile.png)

The temporary browser-test room was removed after verification. The running app was left on a fresh create/join screen.

## Architecture boundaries and limits

- Theme IDs are validated on writes; unknown theme/character IDs fall back safely when rendering. Stable default character IDs belong to separate player registries; judges cannot be resolved as player choices.
- All judges reference the same neutrality policy. Personality/sample dialogue changes presentation only; no scoring or outcome logic exists.
- Stage 8 preparation is a player-character registry and optional selected-character type field. No selection UI, writes or additional selectable designs were added.
- Stage 9 preparation separates player identity, optional team membership and round-specific representative assignment. Only solo is playable, capacity remains two, and future/unknown mode metadata cannot enable extra seats.
- Local Supabase and local HTTP routes were exercised. Hosted Supabase, public deployment, production load, HTTPS reverse proxies and cross-device/native-engine compatibility are not claimed.
- No known Stage 2.5 functional failures remain from these checks. Local visual/service checks do not establish hosted deployment readiness or exhaustive browser compatibility.
