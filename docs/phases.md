# Implementation phases

Tracked against the engineering specification in the project docs. Each phase
lands on `main` with tests green.

| Phase | Deliverable                                                                    | Status  |
| ----- | ------------------------------------------------------------------------------ | ------- |
| 0     | Bootstrap: monorepo, SvelteKit PWA, Capacitor wrapper, tooling, CI             | ✅ done |
| 1     | Canonical model, source adapters, 2025 fixture, bundle validator               | ⏳ next |
| 2     | Schedule app: list + grid, detail, speakers, search, filters, bookmarks, clock | pending |
| 3     | Elo engine, comparison queue, ranking UI, dispositions                         | pending |
| 4     | Itinerary solver: DAG, locks, backups, flexible activities                     | pending |
| 5     | Venue engine: SVG map, routing graph, A\*, textual routes, validator           | pending |
| 6     | Schedule-aware navigation: leave-by, QR location                               | pending |
| 7     | Booth experience: directory, map linkage, booth activities                     | pending |
| 8     | Production sync: event-sync, diffs, update UI                                  | pending |
| 9     | Android polish: notifications, deep links, F-Droid/Play flavors                | pending |
| 10    | Release hardening: a11y, perf, offline E2E, SBOM, signed releases              | pending |

## Phase 0 acceptance

- [x] web build green (SvelteKit + Vite, PWA with service worker + manifest)
- [x] Android wrapper scaffolds and syncs (`cap add android` + `cap sync`)
- [x] PWA installable (manifest, icons, sw.js)
- [x] CI green (format, lint, typecheck, test, build, audit, Android APK)
- [x] format / lint / typecheck / unit tests wired across the workspace

## Notes

- Android Gradle/APK builds run in CI (Android SDK + JDK 21); no local SDK required for web work.
- Playwright E2E and accessibility checks arrive with Phase 2.
