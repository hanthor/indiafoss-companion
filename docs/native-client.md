# Native Compose client

`apps/android/native` is a standalone Jetpack Compose / Material 3 Android app
that reads the same published `EventBundle` as the web client. It is **the**
Android app — the Capacitor build was retired in
[ADR 0004](adr/0004-retire-the-capacitor-shell.md); see also
[ADR 0002](adr/0002-native-compose-client-rendered-natively.md) for why the
client renders natively rather than embedding a WebView.

## Screens

| Tab / route | State                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Now         | live sessions with progress, up next                                                                                                                                               |
| Schedule    | per day, bookmark from the list                                                                                                                                                    |
| My plan     | the day planned from must-attend, bookmarks and ratings (`Itinerary`); "Rank this day"                                                                                             |
| Rank        | devrooms (Not interested / Interested / Must go) → talks as swipe cards → overlaps one slot at a time, same rules as the PWA (`docs/ranking.md`), with the affinity prior and undo |
| Welcome     | first run only, and from Settings: reminders permission, ticket reference, name and profiles for the card, then Rank (#107)                                                        |
| Map         | rooms and what is on in each (the floor plan is not drawn natively yet)                                                                                                            |
| Settings    | reminders switch (POST_NOTIFICATIONS on 13+, exact-alarm hint on 12+), privacy, about                                                                                              |
| Session     | detail, bookmark, must attend                                                                                                                                                      |

Reminders are `AlarmManager` alarms (`ReminderScheduler`) recomputed from the
plan whenever bookmarks, must-attend marks or the bundle change, so a change
of plan cancels alarms that no longer apply; `ReminderReceiver` posts the
notification. Ratings, answered pairs and room preferences live in
`RatingsStore` as one JSON document in DataStore.

## The plan in the phone's calendar (#272)

Settings has an opt-in "Keep my plan in the calendar" switch. On, with
`READ_CALENDAR`/`WRITE_CALENDAR` granted, the app creates one local calendar
of its own ("IndiaFOSS", `ACCOUNT_TYPE_LOCAL`, written through
`CalendarContract` as a sync adapter) and keeps it equal to the plan: every
planned session of every day, with the room, the speakers and a ten-minute
reminder, and a `CUSTOM_APP_URI` deep link back into the app.

- `core/CalendarSync.kt` holds the decisions and is pure: `PlannedEntry` is
  the narrow input (what the attendee means to be at, as the native
  itinerary produces it today and the resolved-plan projection of #221 can
  produce later), `PlannedIdentity` is the row's identity following the
  transfer contract of #247 (event, CFP proposal where there is one, exact
  occurrence; stored in the row's `SYNC_DATA1`/`SYNC_DATA2`), and
  `CalendarReconciler` turns desired entries plus the rows the provider holds
  into inserts, in-place updates and deletes. A session that moves, is
  renamed or changes room is updated, never re-added; a regenerated
  programme that gives the same proposal a new activity id still updates the
  row in place when the match is unambiguous; a row that left the plan is
  deleted; duplicate rows collapse, so a refresh or a restart never doubles
  an entry; rows in any other calendar, and rows in the app's calendar
  without the app's identity, are never touched.
- `app/calendar/CalendarSync.kt` is the thin `ContentResolver` adapter: it
  finds or creates the calendar, reads only that calendar's rows, and applies
  the reconciler's ops in one batch. `disconnect()` removes the calendar and
  everything in it.
- `CompanionViewModel` reconciles whenever the plan's inputs change
  (bundle, bookmarks, must-attend, ratings, blocks) or the switch goes on,
  which includes every launch. There is no background job yet: a programme
  revision that arrives while the app is closed reaches the calendar the
  next time the app opens.
- Turning the switch off, or "Disconnect and remove the calendar", deletes
  the app's calendar. A permission denied at the prompt leaves the switch
  off and nothing touched; a permission withdrawn later is reported in the
  status line under the switch.

The `.ics` share on My plan stays as the portable fallback for any calendar
app; Settings says plainly that an imported file is a snapshot that does not
update. `CalendarSyncTest` in `:core` covers the reconciliation; the
`:app` test of the same name runs the adapter against an in-memory stand-in
for the provider under Robolectric. Nothing here has been exercised against
a real device's calendar provider yet.

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

Native feel: edge-to-edge, predictive back, pull-to-refresh on Now, the
system share sheet for cards and calendars, Material You colour.

Not native yet: custom plan blocks, booth-visit goals, the day simulator,
the optional P2P chat.

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
under Robolectric (`ScreenshotTest`, plus `DarkScreenshotTest` for the dark
scheme) and writes PNGs to `app/build/screenshots`; CI uploads them as `native-screenshots` on every
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
the PWA's identity, not this one's.
