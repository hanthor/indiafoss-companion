# IndiaFOSS Companion

> **AI-generated disclaimer:** This project and its current implementation were generated with AI assistance. It is an unofficial community project, is not produced or endorsed by FOSS United, and requires human review before production use.

Offline-first conference companion for [IndiaFOSS](https://indiafoss.fossunited.org/).

**Conference schedule + adaptive Elo ranking + personal itinerary optimization + indoor SVG navigation.**

The app answers four questions on the conference floor:

1. What is happening right now?
2. What should I do next?
3. How do I get there?
4. When sessions overlap, which one do I prefer?

## Try it

- Web/PWA: <https://hanthor.github.io/indiafoss-companion/> (deployed from
  `main`; installable, works offline after the first load).
- Android: the rolling **nightly** pre-release on the Releases page carries
  the latest debug APK and its SHA-256. P2P chat is compiled in only when the
  build had the Neutrino bindings (see `apps/android/capacitor/neutrino`).

## Status

Phases 0–8 of `docs/phases.md` have landed: canonical model and FOSS United
adapter, schedule, Elo ranking, itinerary solver with manual edits, venue
routing, schedule-aware navigation, booth directory, production sync, calendar
export, contact sharing + QR scanning, and optional Matrix messaging. Remaining
work is Android polish (#12), the native Material 3 client (#10), the real
2026 programme (#2) and release hardening (#13).

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
- **Typography**: Space Mono for labels and Inter for body text, with
  [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) (OFL) as
  the bundled display face. FFF Forward, used on the IndiaFOSS site, is not
  redistributable, so it is referenced first and only used when a visitor
  already has it; the app ships nothing that needs a licence (#33).
- **Conference rooms on Matrix**: FOSDEM-style public rooms on the organiser's
  homeserver (`reilly.asia`), one per hall plus announcements and hallway,
  joined from any existing Matrix account via Element links; provisioned by
  `tools/matrix-rooms` (`docs/messaging.md`).
- **Indoor navigation**: SVG venue map with A\* routing, accessible profiles,
  and leave-by calculations.
- **Optional peer-to-peer chat**: session, booth and direct chats over
  Bluetooth/Wi-Fi mesh through an embedded Neutrino node in the Android app,
  with typing, files and photos and an offline outbox. Off until you switch
  it on in Settings; public Matrix ids on contact cards open in Element.
- **Handshake contact cards**: signed friend-card QR codes with pixel key
  badges and "met during" context; nothing leaves the device.

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
  matrix/              Matrix client-server layer: sync, offline outbox, handoff links
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

The parallel **native Compose client** (`apps/android/native`) builds on its
own, with no Node step — see [docs/native-client.md](docs/native-client.md):

```bash
cd apps/android/native && ./gradlew :core:test :app:assembleDebug
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
- [Optional Matrix messaging](docs/messaging.md) — rooms, DMs, Neutrino handoff, threat model
- [Privacy](docs/privacy.md)
- [Release procedures](docs/release.md)
- [Architecture decisions (ADRs)](docs/adr/README.md)
- [Implementation phases](docs/phases.md)

## Design

The web app follows the IndiaFOSS 2026 landing page: FOSS United's v3 tokens
(mint `hsl(144 92% 37%)`, near-black `#141414`, light `hsl(0 0% 94%)` /
dark `hsl(0 0% 8%)` surfaces, 1 px hairline borders, 16 px card radii, soft
shadows), the pixel display face for headings (`FFF Forward` when installed,
bundled `Press Start 2P` fallback — FFF Forward's licence forbids
redistribution, so it is not shipped), `Space Mono` for uppercase meta lines
and `Inter` for body text. All fonts are bundled locally so the PWA looks the
same offline. Tokens live in `apps/web/src/app.css`.

## License

AGPL-3.0-or-later — see [LICENSE](LICENSE).

The IndiaFOSS logo assets are from the official
[`fossunited/Branding`](https://github.com/fossunited/Branding) repository and
are distributed under its CC BY-SA 4.0 license. Their use here does not imply
official FOSS United endorsement.
