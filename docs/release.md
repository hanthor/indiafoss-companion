# Release procedures

How the IndiaFOSS Companion is verified and distributed. Three apps, per
[ADR 0004](adr/0004-retire-the-capacitor-shell.md): the PWA (Web/iOS), the
native Compose client (Android), and P2P chat as its own dedicated app.

## Quality gate (must be green before release)

CI runs on every push to main and every PR (`.github/workflows/ci.yml`),
four jobs. All four are required by the branch ruleset, by name, and the
names below are the ones it checks for.

**checks** — format, lint, typecheck, unit + property tests, fixture
verification, venue validation (synthetic + 2026), PWA build, dependency audit
(report-only), and a CycloneDX SBOM (uploaded as the `sbom` artifact).

**e2e** — every Playwright suite, each named explicitly in `ci.yml`:
`tests/app.spec.ts` (browser E2E, via `test:e2e`), `tests/a11y.spec.ts`
(axe-core WCAG A/AA), `tests/camera.spec.ts` (the QR scanner, against
Chromium's fake capture device), `tests/offline.spec.ts` (the release-blocking
offline gate), `tests/simulate.spec.ts` (the day simulator), and
`tests/design.spec.ts` + `tests/updates.spec.ts` (design tokens and revision
handling).

`test:e2e` runs `app.spec.ts` alone, so **a spec that is not named in `ci.yml`
never runs at all**. `camera.spec.ts` was in that position — present, passing,
and executed by nothing — until it was added here. Adding a spec file is
therefore two steps, and this list is the check that the second one happened.

**native** — runs the Kotlin `:core` unit tests, Robolectric screen-render
tests, assembles a debug APK, checksums it (sha256), and uploads both.

**android-emulator** — boots an emulator, installs the native debug APK, and
runs the Maestro flows in `.maestro/` against it (see
[docs/android-testing.md](android-testing.md)).

### When each gate runs

A first job, `changes`, compares a pull request against its base and each
gate then decides at the job level whether it has anything to do:

| Gate                                       | Runs on a pull request when the PR touches                                                                                                                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Format · Lint · Typecheck · Test · Build` | anything — it is cheap, and it is the job that format-checks the markdown                                                                                                                                                                                                  |
| `Playwright E2E (with time-travel)`        | `apps/web/**`, `packages/**`, `events/**`, `tools/**`, the root `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `tsconfig.base.json` / `eslint.config.js`, or `ci.yml` itself                                                                                  |
| `Native Compose client`                    | `apps/android/**` (Gradle wrapper, plugins and the version catalog included), `apps/web/static/venues/**` and `events/**` (both are copied into the APK), `packages/test-fixtures/**`, `packages/model/**`, `.maestro/**`, `scripts/**`, `.github/scripts/**`, or `ci.yml` |
| `Android emulator (Maestro)`               | the same paths as the native job, and only after the native job has **succeeded** — it reuses that job's APK                                                                                                                                                               |

On a push to main, a `workflow_call` (the schedule sync validates its
candidate this way) and a manual `workflow_dispatch`, every gate runs
unconditionally, so main always carries full evidence regardless of what the
merged PR touched.

The `Detect changed paths` job writes the decision it took to its step
summary, so a PR whose gates were skipped shows why without reading the
filter.

A gate the filter switches off is recorded as **skipped, not passed**. That
satisfies the ruleset — a skipped required check is a conclusion, whereas a
missing one is not, which is why the filter lives in job-level `if:`
conditions rather than an `on.paths` trigger filter — but it is not evidence
that the code is fine. If a docs-only PR turns out to need the native or
web gates (a path the table above does not list), add the path to the
`changes` job rather than working around it; to force a full run on a
branch, dispatch `ci.yml` by hand.

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
  Gradle build; ordinary PR CI produces **clearly identified debug** artifacts; the rolling
  nightly uses the persistent signing procedure below.
- F-Droid / core distribution must contain **no mandatory Google Play Services
  or FCM** dependencies (local notifications only).

### Our F-Droid repository

The [repository implementation plan](tasks/own-fdroid-repository.md) specifies a
shared Companion/Chat update catalogue using the existing signed APKs and a
separate index key. The [IndiaFOSS Preview repository](https://hanthor.github.io/indiafoss-android-repo/fdroid/repo/)
is now deployed with the reviewed Companion Preview (index fingerprint
`AD932C530715E9CAA39415F94E007002FB3DA0DD2583FF92DFC7F6DFE46CCCC2`). Chat
metadata remains disabled until a signed public Chat APK and its upgrade path
are verified. Direct APK downloads remain available.

### Nightly signing and upgrades

The nightly workflow builds a non-debuggable release APK, signs it outside
Gradle, and verifies its certificate before moving the nightly tag or publishing.
PR CI uses a disposable test key; it never receives the distribution key.
Missing credentials, an invalid signature or a certificate mismatch stop
publication and leave the previous nightly available.

Configure these once, using an existing recoverable signing identity if one is
available:

| GitHub setting                     | Value                                          |
| ---------------------------------- | ---------------------------------------------- |
| Secret `NIGHTLY_KEYSTORE_BASE64`   | Base64 of an encrypted PKCS12 keystore         |
| Secret `NIGHTLY_KEYSTORE_PASSWORD` | Store and private-key password (same password) |
| Variable `NIGHTLY_KEY_ALIAS`       | Alias of the signing private key               |
| Variable `NIGHTLY_CERT_SHA256`     | SHA-256 of the DER signing certificate         |

Keep an encrypted keystore backup and its password in maintainer-controlled
storage separate from GitHub Actions. Record the owner and verify that the
backup opens before configuring publication. Never commit the key, print its
base64/password, put it in build artifacts, or store it in Gradle caches.
Repository secrets cannot serve as the only recoverable backup. Do not rotate
the key to resolve a workflow failure.

The workflow emits `*.apk.signing.json` containing the certificate fingerprint,
APK checksum, source revision and version. Compare the installed certificate
with that fingerprint before advising an upgrade. The application ID stays
`org.indiafoss.companion.nativeapp`; version codes increase with nightly runs.

**Existing runner-signed installations:** previous nightlies used disposable
debug keys. A new persistent certificate does not authorise updates to those
installations. Keep the old app installed with its data; do not uninstall or
clear storage to bypass Android's signature check. Export any data the installed
version can export and retain the original files. Complete native/PWA transfer
is tracked in #240; an export alone is not a proven restoration path. Unless the
original key can be recovered, those installations need a separately verified
migration before replacement.

Acceptance has two levels:

- CI signs the release APK twice with one disposable identity, verifies the
  certificate, and rejects missing-key and wrong-certificate configurations.
  This tests signing, not an on-device upgrade.
- Before closing #226, build two successive actual nightlies, record both
  fingerprints/version codes, then upgrade on a phone without uninstalling.
  Confirm saved choices, edited plans, ticket, contacts and card identity remain
  intact. Record the exact APKs and device evidence; do not substitute CI APKs.

### Update channels

Attendees keep Companion current through **Obtainium** (tracking the GitHub
release page) or **our own F-Droid Preview repository**. Both deliver the same
signed APK that the direct download link serves, so the signing identity never
changes between channels. Chat remains on its release page until its own
repository inclusion is verified. We do not direct attendees to any
third-party app store. Attendee-facing instructions and the state of the
F-Droid repository are in [install-channels.md](./install-channels.md).

## iOS

The PWA is iOS-installable via Safari **Share → Add to Home Screen** (Apple
touch icon + standalone metadata are in the build). No App Store account or
separate iOS UI is required for the initial distribution.

## What a published revision guarantees

Publishing a change mid-conference is safe because the client's update path is
network-first with a short timeout, downloads the new asset in full before
replacing anything, and keys the attendee's own data by stable activity id.
`tests/updates.spec.ts` holds that to account:

- an applied revision keeps bookmarks, must-attend marks and ratings attached
  to the sessions they were made on, and the plan still pins them;
- a revision that changes nothing is never offered and is not downloaded
  again on the next visit;
- an unreachable manifest leaves the cached programme fully usable, and the
  update is picked up once the network returns.

Each of those carries a positive control, so the assertions cannot pass
because the banner is broken. The change types the banner reports (added,
cancelled, time, room, title, speaker, recording) are unit-tested in
`packages/schedule`.

## Supply chain

- `just sbom` / the CI `sbom` artifact produce a CycloneDX SBOM of the pnpm
  workspace.
- `just audit` (`pnpm audit --prod`) reports known advisories; report-only in
  CI until dependencies settle, then make blocking.
- Dependencies are pinned; new deps should be exact/pinned and from maintained
  packages.

## Release checklist

- [ ] `just ci` green locally and in CI (all four jobs **passed** on main —
      a skipped gate on a PR is not a pass; see "When each gate runs").
- [ ] Accessibility suite passes; core flows operable by keyboard.
- [ ] Event data published and verified for the target event; stable ids
      preserved (see [event onboarding](./event-onboarding.md)).
- [ ] Venue asset validated and venue-team-confirmed; `_draft` removed
      (see [venue route review](./venue-route-review-checklist.md)).
- [ ] SBOM generated and dependency audit reviewed.
- [ ] GitHub Pages deploy succeeds; a production smoke test confirms the
      deployed app can launch offline, search, rank, route, and retain local
      state.
- [ ] **Capability record produced, validated and committed** beside its
      evidence under `docs/evidence/records/<id>.json`, and linked from the
      release notes. `just release-record <id> <event> <chat sha> <bindings>
<aar sha256> <apk sha256>` writes the pins and refuses an invalid record;
      the claims are filled in by hand from `docs/evidence/`. A release without
      a valid capability record is not a release.

### Release scenarios

Each scenario a release exercises produces an evidence file under
`docs/evidence/` in the `<what>-<yyyy-mm-dd>.md` convention (exact revisions,
exact command, raw output, conclusion), and the record's claim for it points at
that file through `evidence`. A scenario that was not run is recorded as not
run in `limitations`, never omitted.

- [ ] fresh install (`scenario.fresh-install`)
- [ ] upgrade over the installed build (`scenario.upgrade`)
- [ ] airplane mode (`scenario.airplane-mode`)
- [ ] WAN loss with LAN retained (`scenario.wan-loss-lan-retained`)
- [ ] permission denial (`scenario.permission-denial`)
- [ ] background and lock (`scenario.background-lock`)
- [ ] restart (`scenario.restart`)
- [ ] lost acknowledgement (`scenario.lost-acknowledgement`)
- [ ] low storage (`scenario.low-storage`)
- [ ] key rotation (`scenario.key-rotation`)
- [ ] account expiry (`scenario.account-expiry`)
- [ ] gateway restore (`scenario.gateway-restore`)

Two rules from the contract (`packages/model/src/contracts/capability-record.ts`)
apply to everyone who reads a record, the app included: **an unknown
capability is unavailable**, never "probably fine"; and **`supported: false` is
a record, distinct from absence**, saying somebody looked, on what, and what
they found. The capability names and their meanings live in
`packages/model/src/capabilities.ts`; the app's Settings page renders the
current record through `supportsCapability()` and shows every row as
unavailable unless the record says otherwise.

## Related docs

- [Evidence and capability records](./evidence/README.md)
- [Event onboarding](./event-onboarding.md)
- [Install channels](./install-channels.md)
- [Venue route review checklist](./venue-route-review-checklist.md)
- [Contact sharing & QR scanning](./contact-sharing.md)
- [Calendar export](./calendar-export.md)
- [Privacy](./privacy.md)
- [Implementation phases](./phases.md)
