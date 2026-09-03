# Native Compose client

`apps/android/native` is a standalone Jetpack Compose / Material 3 Android app
that reads the same published `EventBundle` as the web client. Since
2026-09-03 it is the Android app being built towards release: the owner's
direction is a fully native-feeling Compose app, and the Capacitor build in
`apps/android/capacitor` stays only until this one reaches parity (see
[ADR 0002](adr/0002-native-compose-client-rendered-natively.md) and the
roadmap's decisions log).

## Screens

| Tab / route | State                                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Now         | live sessions with progress, up next                                                                                                         |
| Schedule    | per day, bookmark from the list                                                                                                              |
| My plan     | the day planned from must-attend, bookmarks and ratings (`Itinerary`); "Rank this day"                                                       |
| Rank        | rooms (Skip / OK / Love) → quick pass (Yes / No) → head to head, same rules as the PWA (`docs/ranking.md`), with the affinity prior and undo |
| Map         | rooms and what is on in each (the floor plan is not drawn natively yet)                                                                      |
| Settings    | reminders switch (POST_NOTIFICATIONS on 13+, exact-alarm hint on 12+), privacy, about                                                        |
| Session     | detail, bookmark, must attend                                                                                                                |

Reminders are `AlarmManager` alarms (`ReminderScheduler`) recomputed from the
plan whenever bookmarks, must-attend marks or the bundle change, so a change
of plan cancels alarms that no longer apply; `ReminderReceiver` posts the
notification. Ratings, answered pairs and room preferences live in
`RatingsStore` as one JSON document in DataStore.

Every tab carries the leave-by banner under its app bar: the next session
that matters (must attend, then the earliest bookmark, then the programme's
next talk, never a break) counting down, tertiary-coloured within five
minutes.

Walk times come from the venue graph (`venue.graph.json` and
`venue.metadata.json`, shipped in assets; `Routing` is the web package's
shortest-walk logic ported, with the fastest / avoid-stairs / accessible
profiles and tests): once a location is set, the banner says "LEAVE IN N
MIN · WALK M MIN" (start minus the walk minus a five-minute buffer) and a
tapped room on the map says how far it is. `indiafoss://activity/<id>`,
`indiafoss://location/<id>` and `indiafoss://speaker/<id>` open the right
screen from a launch or a running app.

Not native yet: signed cards (the PWA signs its QR with a per-device
WebCrypto key; the native card is unsigned and the scanner treats every card
as unsigned), custom plan blocks, booth-visit goals, the day simulator, the
optional P2P chat.

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

## Looking at it without a device

`./gradlew :app:testDebugUnitTest` renders every screen with the seed bundle
under Robolectric (`ScreenshotTest`) and writes PNGs to
`app/build/screenshots`; CI uploads them as `native-screenshots` on every
PR, so a change to a screen can be looked at from the Actions page.

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
