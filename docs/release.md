# Release procedures

How the IndiaFOSS Companion is verified and distributed. The PWA is the primary
Web/iOS/Android distribution; the Capacitor Android build is an optional native
wrapper.

## Quality gate (must be green before release)

CI runs on every push and PR (`.github/workflows/ci.yml`), three jobs:

**checks** — format, lint, typecheck, unit + property tests, fixture
verification, venue validation (synthetic + 2026), PWA build, dependency audit
(report-only), and a CycloneDX SBOM (uploaded as the `sbom` artifact).

**e2e** — browser E2E (`tests/app.spec.ts`), accessibility checks
(`tests/a11y.spec.ts`, axe-core WCAG A/AA), and the release-blocking offline
gate (`tests/offline.spec.ts`).

**android** — builds the web app, syncs Capacitor, assembles a debug APK,
checksums it (sha256), and uploads both.

Run the full gate locally:

```bash
just ci        # check + browser E2E + a11y + offline gate
just sbom      # generate sbom.cdx.json locally (pnpm-aware, via cdxgen)
just audit     # production dependency audit
```

`just check` = format-check, lint, typecheck, tests, `verify-assets`, build.

## PWA / GitHub Pages

The static PWA deploys to GitHub Pages project sites via `pages.yml`:

- builds with the repository name as the base path (`SVELTE_BASE=/<repo>`),
- copies `index.html` → `404.html` so SPA deep links resolve,
- deploys with the official Pages actions.

Enable once: **Settings → Pages → Source: GitHub Actions**. Local check:

```bash
just pages-build indiafoss-companion
```

Deep links (`/activity/<id>`, `/speaker/<id>`, `/now?at=<location>`, etc.) work
through the `404.html` fallback and are base-path aware.

## Android APK / AAB

Debug APKs are produced in CI with a sha256 checksum. For release builds:

- an AAB and signed release APK require a signing keystore configured in the
  Gradle build; CI currently produces **clearly identified debug** artifacts.
- F-Droid / core distribution must contain **no mandatory Google Play Services
  or FCM** dependencies (local notifications only).

## iOS

The PWA is iOS-installable via Safari **Share → Add to Home Screen** (Apple
touch icon + standalone metadata are in the build). No App Store account or
separate iOS UI is required for the initial distribution.

## Supply chain

- `just sbom` / the CI `sbom` artifact produce a CycloneDX SBOM of the pnpm
  workspace.
- `just audit` (`pnpm audit --prod`) reports known advisories; report-only in
  CI until dependencies settle, then make blocking.
- Dependencies are pinned; new deps should be exact/pinned and from maintained
  packages.

## Release checklist

- [ ] `just ci` green locally and in CI (all three jobs).
- [ ] Accessibility suite passes; core flows operable by keyboard.
- [ ] Event data published and verified for the target event; stable ids
      preserved (see [event onboarding](./event-onboarding.md)).
- [ ] Venue asset validated and venue-team-confirmed; `_draft` removed
      (see [venue route review](./venue-route-review-checklist.md)).
- [ ] SBOM generated and dependency audit reviewed.
- [ ] GitHub Pages deploy succeeds; a production smoke test confirms the
      deployed app can launch offline, search, rank, route, and retain local
      state.
- [ ] Android artifact checksums recorded.

## Related docs

- [Event onboarding](./event-onboarding.md)
- [Venue route review checklist](./venue-route-review-checklist.md)
- [Contact sharing & QR scanning](./contact-sharing.md)
- [Calendar export](./calendar-export.md)
- [Privacy](./privacy.md)
- [Implementation phases](./phases.md)
