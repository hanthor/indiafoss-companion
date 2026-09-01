# IndiaFOSS Companion

> **AI-generated disclaimer:** This project and its current implementation were generated with AI assistance. It is an unofficial community project, is not produced or endorsed by FOSS United, and requires human review before production use.

Offline-first conference companion for [IndiaFOSS](https://indiafoss.fossunited.org/).

**Conference schedule + adaptive Elo ranking + personal itinerary optimization + indoor SVG navigation.**

The app answers four questions on the conference floor:

1. What is happening right now?
2. What should I do next?
3. How do I get there?
4. When sessions overlap, which one do I prefer?

## Status

Implementation is proceeding in phases (see `docs/phases.md`). Currently:
**Phase 0 (bootstrap) complete** — monorepo, SvelteKit PWA, Capacitor Android
wrapper, lint/typecheck/test/build all green, CI configured.

## Highlights

- **Offline-first**: after one event download, everything (schedule, search,
  map, routing, Elo, itinerary) works in airplane mode.
- **No account, no tracking**: attendee state (preferences, Elo, itinerary,
  notes) lives only in local IndexedDB.
- **Canonical event model**: every upstream source (FOSS United, Pretalx,
  fixtures) is normalized into one schema; components never read raw upstream
  data.
- **Historical fixture**: IndiaFOSS 2025 is the golden integration fixture
  until 2026 data is published.
- **Adaptive Elo ranking**: rank conflicting sessions head-to-head, and the
  itinerary solver builds a feasible plan around your preferences.
- **Indoor navigation**: SVG venue map with A\* routing, accessible profiles,
  and leave-by calculations.

## Repository layout

```text
apps/
  web/                 SvelteKit + Svelte 5 PWA
  android/capacitor/   Capacitor Android wrapper
packages/
  model/               canonical domain model + validation
  schedule/            schedule engine (grouping, filtering, time math)
  elo/                 Elo rating engine + comparison selection
  solver/              itinerary solver (weighted DAG)
  venue/               venue routing graph, A*/Dijkstra pathfinding
  search/              local offline search
  storage/             IndexedDB persistence
  sources/             event source adapters
  test-fixtures/       shared fixtures
tools/
  event-sync/          fetch/normalize/validate/publish event bundles
  venue-validator/     venue SVG/graph/metadata validation
  fixture-recorder/    capture upstream responses as fixtures
events/
  indiafoss-2025/      historical fixture (raw + normalized)
  indiafoss-2026/      venue floor plan fixture
  synthetic/           hand-authored edge-case fixture
```

## Prerequisites

- Node.js ≥ 20.19
- pnpm 11 (`corepack enable` or `npm i -g pnpm`)

## Development

```bash
pnpm install          # install workspace
pnpm -r test          # run all package tests
pnpm -r typecheck     # typecheck everything
pnpm -r lint          # lint everything
pnpm format:check     # prettier check
pnpm dev              # not yet wired; run apps/web directly:
```

```bash
pnpm --filter @indiafoss/web dev
```

Build the web PWA:

```bash
pnpm --filter @indiafoss/web build   # outputs apps/web/build (PWA + SW)
```

Android (requires Android SDK + JDK 21):

```bash
pnpm --filter @indiafoss/android exec cap add android   # once
pnpm --filter @indiafoss/android build                  # sync web assets
cd apps/android/capacitor/android && ./gradlew assembleDebug
```

### iOS

The web app is already an iOS-compatible PWA. On iOS Safari, use **Share →
Add to Home Screen**. The build includes the Apple touch icon and standalone
web-app metadata; no App Store account or separate iOS UI is required for the
initial distribution. A Capacitor iOS wrapper can be added later if App Store
or native notification distribution becomes necessary.

### GitHub Pages

The static PWA can be hosted on GitHub Pages project sites. The `pages.yml`
workflow builds with the repository name as the base path, copies `index.html`
to `404.html` for SPA deep links, and deploys using the official Pages actions.
Enable **Settings → Pages → Source: GitHub Actions** once in the repository.

For local verification:

```bash
just pages-build indiafoss-companion
```

## Testing

Vitest is used everywhere; property tests use `fast-check`. Playwright drives
browser E2E (`apps/web/tests/app.spec.ts`), the release-blocking offline gate
(`tests/offline.spec.ts`), and automated accessibility checks
(`tests/a11y.spec.ts`, axe-core WCAG A/AA).

```bash
just check        # format, lint, typecheck, tests, asset verification, build
just ci           # check + browser E2E + a11y + offline gate
just a11y         # accessibility suite only
just sbom         # generate a CycloneDX SBOM (pnpm-aware)
```

## Documentation

- [Event onboarding](docs/event-onboarding.md) — bring a new event into the app
- [Venue route review checklist](docs/venue-route-review-checklist.md) — finalise the venue graph
- [Contact sharing & QR scanning](docs/contact-sharing.md)
- [Calendar export](docs/calendar-export.md)
- [Privacy](docs/privacy.md)
- [Release procedures](docs/release.md)
- [Architecture decisions (ADRs)](docs/adr/README.md)
- [Implementation phases](docs/phases.md)

## License

AGPL-3.0-or-later — see [LICENSE](LICENSE).

The IndiaFOSS logo assets are from the official
[`fossunited/Branding`](https://github.com/fossunited/Branding) repository and
are distributed under its CC BY-SA 4.0 license. Their use here does not imply
official FOSS United endorsement.
