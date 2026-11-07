# Stage 2 verification

Scope: private two-player rooms only. Original artwork and Stage 1 local preview remain available at `/preview`. No debate turns, AI, real objections or verdicts were added.

## Automated results — November 7, 2026

| Check | Result |
| --- | --- |
| `npm run check` | 90 tests in 4 files passed, then production compilation, TypeScript and route generation passed |
| Coverage | Statements 99.47% (376/378), branches 97.56% (321/329), functions 100% (104/104), lines 100% (274/274); existing thresholds retained |
| `npm run test:db` | 48 real PostgreSQL/pgTAP assertions passed |
| `npm run test:supabase` | 10 real Auth/database/Realtime integration checks passed |
| `npm run test:api` | Actual Next.js route checks passed with separate cookie jars and local Supabase |
| Stage 1 regression | All original 21 tests preserved, with page tests now targeting `/preview` |

Unit/component tests mock the HTTP/WebSocket transport. They exercise the real React UI and client hook, including recovery, timeouts, request serialization, offline events, copy-link fallback, full/invalid rooms and own readiness. Server unit tests use a mocked Supabase client and test validated inputs, strict origins, HttpOnly cookies, identity verification, refresh, failures and privacy. Coverage is not proof of database security or visual correctness.

The separate real database tests cover authenticated membership reads, denial of anonymous/outsider reads, no direct row writes, invalid inputs, expiry, fixed slots, readiness, authenticated heartbeat and the insert/update-only publication. Real integration tests verify competing joiners have only one winner, actual authorized Realtime delivery, denial of a direct peer update and forged-ID RPC, refresh recovery and the elapsed disconnect timeout.

Real application HTTP tests verify six-character codes, names and slots, full/nonexistent-room errors, both-ready state in two sessions, cookie recovery and actual token renewal, unknown player-ID/slot fields, forged/missing sessions, and cross-origin writes. Responses are private/no-store. These are real services, not a fake local backend.

## Browser checks

The production app runs at `http://127.0.0.1:3001`. Three **isolated cookie origins in the same in-app browser** were used: `127.0.0.1`, `localhost`, and `localhost.`. This is not a claim of three separate browser engines. Native Chrome automation was unavailable because computer-control permission was not granted.

- Created room as Alex (lion/A), followed its room-code invitation in the second origin as Sam (zebra/B).
- Verified names and connection/readiness updates on both pages through the real backend.
- Both-ready confirmation appeared on both pages; no debate started.
- Refreshed both pages and recovered the correct seats and readiness.
- Third isolated session received a nonexistent-code error, then a full-room error for the occupied room.
- Navigated B away from the lobby and observed A show Sam disconnected with both-ready confirmation removed. Returning B recovered the same seat; readiness could be re-enabled and confirmation returned.
- No unexpected warnings or errors appeared in the inspected A/B production consoles.
- Copied the invitation through the visible control and observed success feedback.
- Inspected desktop at 1440 × 1000 and phone at 390 × 844, with no horizontal overflow. Original characters, names and controls remained visible. The mobile confirmation layout was adjusted to keep its text comfortably readable.
- Preserved Stage 1 page loads through the Art preview link.

Saved evidence: [desktop lobby](screenshots/stage2-desktop.png) and [mobile lobby](screenshots/stage2-mobile.png).

## Required manual cross-browser checklist

1. Start local Supabase and the app using README instructions.
2. Open Browser A and a separate Browser B/private window. Ordinary tabs share a session.
3. A creates a room with a name. Check the six-character code and share URL.
4. B opens the share URL (or enters the code), supplies a different name, and joins as the zebra.
5. Toggle A ready, then B ready. Confirm both pages show each other's states and the start confirmation only when both are ready and connected.
6. Refresh both browsers. Verify their names, slots and readiness persist.
7. Try a third browser/private profile. The occupied room must reject it. Try a well-formed nonexistent code too.
8. Close B's room tab. Within roughly 45 seconds A should show B disconnected and withhold both-ready confirmation. Reopen B's room in the same browser and verify recovery. A disconnected seat stays reserved.
9. Run `npm run test:api` to exercise forged peer identifiers, forged sessions, missing credentials and cross-origin writes. Run `npm run test:db` and `npm run test:supabase` for direct database/RLS and realtime checks.
10. Check desktop/mobile fit, keyboard navigation, pause/resume and browser console. Expected HTTP 404/409 entries from rejected room requests are not app runtime errors.

## Verification limits and fixes

- Full tests in separate native browsers remain unperformed due to computer-control permissions. Browser-engine/device compatibility and deployment across devices require follow-up; isolated-cookie browser sessions and real independent HTTP/Supabase clients were tested instead.
- No hosted Supabase project, public deployment, HTTPS reverse proxy, production load or deliberate abuse load was tested. Development anonymous-sign-in limits are configured for local tests.
- First Realtime integration run encountered container startup queue timeouts. An unchanged retry after service warmup passed; authorization policies were not relaxed.
- Real HTTP tests exposed NextURL's loopback-host normalization. Origin checking now uses the actual Host and protocol, preserving exact same-origin authorization; a regression test covers it.
- Review found temporary Auth errors could clear recovery cookies. The server now retains cookies on network/server/rate-limit errors; regression tests cover returned errors as well as thrown failures.
- Realtime DELETE events do not honor row-level read policies. The dedicated project publication now publishes inserts/updates only, verified by PostgreSQL tests. Applying this setting to a shared Supabase project would affect that project's other realtime tables.
- Successful coverage and source tests do not establish visual quality, production security certification or native cross-browser compatibility. GitHub Actions configuration is included; its remote execution result is not claimed here.

## Standalone repository migration — November 7, 2026

The completed Stage 2 project moved to `diamster/falls-hacks-2026-quarrel`, with the app at the repository root. The three quarrel-only commits were retained through history extraction; the destination's initial commit and MIT license were preserved. No campus source/history was imported. Runtime source, artwork, migrations, dependency files and tests were byte-for-byte identical to the completed Stage 2 source (`1861f4e` in the former repository). Only repository instructions, setup paths and the root-level CI workflow changed.

Validation from the standalone checkout: `npm ci` succeeded; `npm run check` passed all 90 tests, unchanged coverage gates and the production build; `npm run test:db` passed 48 assertions; `npm run test:supabase` passed 10 live checks; `npm run test:api` passed against the new checkout's server at port 3001. The first live Realtime run timed out while the production build was running and the local service was starting its subscription processing; an unchanged retry after the build completed passed. No timeout or assertion was weakened.

Browser inspection of the migrated build passed at 1440 × 1000 and 390 × 844, without horizontal overflow or unexpected console warnings/errors. The preserved `/preview` page and navigation back to the Stage 2 lobby loaded correctly. The earlier browser-engine/hosting limits above remain applicable; this was a repository migration, not a new feature stage or hosted deployment. Local Supabase data was reused and `.env.local` remains ignored.
