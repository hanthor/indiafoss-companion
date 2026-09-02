# 0002 — The native client renders natively, with a Kotlin port of the core engines

- Status: **Accepted**
- Date: 2026-09-02
- Deciders: James (maintainer)
- Related: [ADR 0001](0001-native-android-client-standalone-vs-neutrino-fork.md),
  issue #10 (native Material 3 Android client), issue #34 (roadmap)

## Context

ADR 0001 fixed codebase ownership: the native Android client is standalone and
consumes the published `EventBundle`, rather than being a feature layer inside
the Element X Neutrino fork. It deliberately left one thing open — how much of
the UI is actually native:

> Whether the shell embeds the web app in a hardened WebView surface or renders
> bundle data natively is an implementation choice for issue #10.

Until now the answer was "WebView": the Capacitor wrapper in
`apps/android/capacitor` ships the PWA with a Material 3 status/navigation-bar
treatment. On device that reads as a website in a frame — the app carries the
IndiaFOSS wordmark and pixel display font, uses web scrolling and web
transitions, and ignores the device's own colour scheme.

The maintainer asked for "the Material 3 native design for the Android app,
none of the IndiaFOSS branding … a true native experience, maybe use the
Google I/O app as inspiration", and chose, explicitly:

1. a **native Compose client** reading the same published bundle, over a
   restyled WebView; and
2. **neutral M3 with mint only as the seed** — dynamic colour where the device
   offers it, a mint-seeded scheme where it does not, and no wordmark or pixel
   font.

The open cost from ADR 0001 was that the domain engines are TypeScript and
"cannot be reused directly" by a Kotlin client, which is why that ADR expected
the native app to stay thin.

## Decision

**The native client renders the bundle natively in Jetpack Compose, and the
small slice of domain logic it needs is ported to a pure-Kotlin `:core` module
under `apps/android/native`.**

- `:core` is a plain JVM module with no Android dependencies: the bundle model
  (`kotlinx.serialization`, `ignoreUnknownKeys`), the schedule maths
  (`parseInstant`, `dayKey`, `nowState`, `progress`) and the Elo ranking
  (`expectedScore`, `applyComparison`, `selectNext`). It is unit-tested against
  the same expectations as the TypeScript originals, so drift is a test
  failure rather than a surprise on someone's phone.
- `:app` is the Compose UI: Now, Schedule, My plan, Map and session detail,
  behind a `NavigationBar`, with `DataStore` for bookmarks and must-attend.
- Theming is `dynamicLightColorScheme`/`dynamicDarkColorScheme` on Android 12+,
  falling back to a scheme seeded from mint (`#0fb556`) below it. Stock M3
  typography. No wordmark, no Press Start 2P, no brand chrome.
- The bundle the app opens with is copied from
  `apps/web/static/events/<id>/event-bundle.json` at build time, so the seed
  asset can never drift from what the web client publishes. At runtime the app
  follows the same manifest → hash-addressed asset → download-before-replace
  contract as the PWA.

The Capacitor app is **not** replaced. It remains the shipping Android
distribution and the only one with the camera, handshake, ranking and messaging
surfaces; the native client is the parallel, native-feel client it was always
allowed to become, and it grows screen by screen.

## Consequences

### Positive

- The app behaves like an Android app: dynamic colour, M3 motion and
  components, real back stack, predictable-back-friendly navigation.
- No brand chrome to maintain in two places; the device supplies the palette.
- `:core` is testable on the JVM in seconds, with no emulator.

### Negative / costs

- **The ported logic is duplicated.** Schedule and Elo now exist in TypeScript
  and Kotlin. Mitigation: the port is small and deliberately dumb (no solver,
  no venue routing, no search), and both sides carry the same unit tests.
- **Feature lag.** The native client starts well behind the PWA — no scan, no
  handshake, no chat, no ranking UI. This is accepted: it is an additive
  second client, and the Capacitor build keeps shipping.
- **A second Android build in CI** (~2–3 minutes). Accepted.

### Follow-ups

- Port the ranking UI (`:core` already has the engine) and the venue map.
- Decide whether the native client ever ships to users, or stays a CI artifact
  until it reaches parity on the core loop.
