# Native Compose client

`apps/android/native` is a standalone Jetpack Compose / Material 3 Android app
that reads the same published `EventBundle` as the web client. It is separate
from the Capacitor build in `apps/android/capacitor`, which remains the
shipping Android app; see
[ADR 0002](adr/0002-native-compose-client-rendered-natively.md) for why both
exist.

## Layout

```
apps/android/native
├── core/   pure-JVM Kotlin: bundle model, schedule maths, Elo ranking (same selection rules as the PWA: overlaps only, settled gaps skipped — docs/ranking.md)
└── app/    Compose UI, DataStore preferences, bundle repository
```

`:core` has no Android dependency, so its tests run on the JVM in seconds:

```sh
cd apps/android/native && ./gradlew :core:test
```

It is a deliberate port of the small slice of `@indiafoss/schedule` and
`@indiafoss/elo` that the screens need, with the same expectations encoded as
unit tests. If you change the TypeScript engines, change these too — the tests
are what keeps the two in step.

## Building

```sh
cd apps/android/native && ./gradlew :app:assembleDebug
```

Needs a JDK 17+ and an Android SDK with platform 35. CI builds it on every PR
(the `Native Compose client` job) and uploads the debug APK as `native-apk`.

## Data

The app opens on a bundle copied at build time from
`apps/web/static/events/indiafoss-2025/event-bundle.json` — the Gradle
`copySeedBundle` task puts it in `assets/`, so the seed can never drift from
what the web client publishes. On launch it fetches
`…/events/<id>/manifest.json`, and when that names a newer revision it
downloads the hash-addressed asset **in full and parses it** before replacing
the cache, so a half-finished download never evicts a good schedule. A failed
refresh is silent: offline is the normal case at a conference.

Bookmarks and must-attend live in `DataStore` preferences, keyed by activity
id — the same ids the web client uses.

## Theming

`CompanionTheme` uses `dynamicLightColorScheme`/`dynamicDarkColorScheme` on
Android 12+, so the app takes the user's wallpaper palette. Below that it falls
back to a scheme seeded from mint (`#0fb556`). Typography is stock M3. There is
deliberately no IndiaFOSS wordmark, pixel font or brand chrome here — that is
the Capacitor app's identity, not this one's.
