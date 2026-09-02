# Implementation phases

Tracked against the engineering specification in the project docs. Each phase
lands on `main` with tests green.

| Phase | Deliverable                                                                    | Status                               |
| ----- | ------------------------------------------------------------------------------ | ------------------------------------ |
| 0     | Bootstrap: monorepo, SvelteKit PWA, Capacitor wrapper, tooling, CI             | ✅ done                              |
| 1     | Canonical model, source adapters, 2025 fixture, bundle validator               | ✅ done                              |
| 2     | Schedule app: list + grid, detail, speakers, search, filters, bookmarks, clock | ✅ done                              |
| 3     | Elo engine, comparison queue, ranking UI, dispositions                         | ✅ done                              |
| 4     | Itinerary solver: DAG, locks, backups, flexible activities                     | ✅ done                              |
| 5     | Venue engine: SVG map, routing graph, A\*, textual routes, validator           | ✅ done                              |
| 6     | Schedule-aware navigation: leave-by, QR location                               | ✅ done                              |
| 7     | Booth experience: directory, map linkage, booth activities                     | ✅ done                              |
| 8     | Production sync: event-sync, diffs, update UI                                  | ✅ done                              |
| 9     | Android polish: notifications, deep links, F-Droid/Play flavors                | 🚧 partial (M3 shell, deep links)    |
| 10    | Release hardening: a11y, perf, offline E2E, SBOM, signed releases              | 🚧 partial (a11y, SBOM, offline E2E) |

## Phase 0 acceptance

- [x] web build green (SvelteKit + Vite, PWA with service worker + manifest)
- [x] Android wrapper scaffolds and syncs (`cap add android` + `cap sync`)
- [x] PWA installable (manifest, icons, sw.js)
- [x] CI green (format, lint, typecheck, test, build, audit, Android APK)
- [x] format / lint / typecheck / unit tests wired across the workspace

## Beyond the numbered phases

See `roadmap.md` (mirror of tracking issue #34) for everything after Phase 10.

- Optional Matrix messaging (issue #11) — `packages/matrix`, `/chat`,
  Neutrino/QR handoff; see `docs/messaging.md`.
- Contact sharing, QR scanning, calendar export, editable itinerary (issues
  #5, #8, #14, #4) landed with PR #15.

## Notes

- Android Gradle/APK builds run in CI (Android SDK + JDK 21); no local SDK required for web work.
- Playwright E2E and accessibility checks arrive with Phase 2.
