# Native Compose client

`apps/android/native` is a standalone Jetpack Compose / Material 3 Android app
that reads the same published `EventBundle` as the web client. It is **the**
Android app — the Capacitor build was retired in
[ADR 0004](adr/0004-retire-the-capacitor-shell.md); see also
[ADR 0002](adr/0002-native-compose-client-rendered-natively.md) for why the
client renders natively rather than embedding a WebView.

## Screens

| Tab / route | State                                                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Now         | "Your plan now" (in progress / up next from the resolved plan, or its conflicts), then live sessions in every room with progress, then the programme's next session                            |
| Schedule    | per day; room chips, list or time × room grid (`ScheduleGrid`, the PWA's TimelineGrid rules), plan markers from the resolved plan (`PlanMarker`: planned / interested / must go / stood aside) |
| My plan     | the day planned from must-attend, devroom stays, bookmarks and ratings (`Itinerary`) with removals and blocks layered on top (`ResolvedPlan`); remove/restore; "Rank this day"                 |
| Rank        | devrooms (Not interested / Interested / Must go) → talks as swipe cards → overlaps one slot at a time, same rules as the PWA (`docs/ranking.md`), with the affinity prior and undo             |
| Welcome     | first run only, and from Settings: reminders permission, ticket reference, name and profiles for the card, then Rank (#107)                                                                    |
| Map         | the floor plan with what is on in every room, plus the room the resolved plan sends you to next                                                                                                |
| Settings    | reminders switch (POST_NOTIFICATIONS on 13+, exact-alarm hint on 12+), privacy, about                                                                                                          |
| Session     | detail, bookmark, must attend                                                                                                                                                                  |

Reminders are `AlarmManager` alarms (`ReminderScheduler`) recomputed from the
resolved plan whenever anything feeding it changes — bookmarks, must-attend
marks, ratings, devroom stays, blocks, removals, the bundle — and reconciled
with what was armed before (`Reminders.reconcile`): an entry that left the
plan has its alarm cancelled, an unchanged one is re-set under the same id,
so a refresh or a restart never arms it twice. `ReminderReceiver` posts the
notification. Ratings, answered pairs and room preferences live in
`RatingsStore` as one JSON document in DataStore.

Every tab carries the leave-by banner under its app bar: the next item in
the resolved plan counting down, tertiary-coloured within five minutes. When
the plan has a blocking conflict the banner says so and opens the plan.

## The resolved plan (#221)

`ResolvedPlan` (in `core`) is the one projection Now, the map destination,
the banner, the calendar export and the reminders read, the counterpart of
the PWA's `resolveDayPlan` + `applyItineraryEdits`. It is resolved from the
current bundle every time, never from a cached list of planned ids: the
greedy base (`Itinerary.forDay` — fixed blocks, devroom stays, must-attend,
bookmarks, then the best-rated free session, one lunch gap) with the saved
edits (`PlanEditsStore`: blocks, removals, replacements) layered on top.
A retimed session moves with the bundle, a cancelled one leaves and comes
back when reinstated, a replacement that left the schedule is a conflict.

Conflicts are explicit and block the plan: overlapping must-attend choices,
a devroom stay clashing with a must-go, overlapping blocks, an unknown
replacement. An infeasible day names no current/next item, no destination
and no reminders until it is resolved — the same rule as the PWA.

Deliberate differences from the PWA, rather than claims of identical output:

- **Base solver.** The PWA runs the DAG solver with travel/buffer
  constraints; native keeps the greedy `Itinerary`, which places sessions
  back to back. The two can pick different ranked fillers for the same
  ratings. Explicit choices (must-attend, stays, bookmarks, blocks,
  removals) resolve the same way on both.
- **Tight transfers are warnings, not conflicts.** The PWA's
  `travel-buffer` conflict makes a plan infeasible; the native base would
  trip it on most days, so `ResolvedPlan.ConflictKind.TRAVEL` (not enough
  walk time between two rooms, only when the walk is known) is shown beside
  the plan and does not block Now, the map or the reminders.
- **Every planned item gets reminders.** As on the web, an item in a
  feasible plan is planned-tier (must-attend where marked), including the
  programme's ranked pick for a slot and blocks of your own; earlier native
  builds only alerted for bookmarks and must-attend.
- **The Schedule's plan markers read the resolved plan.** `PlanMarker`
  (planned / interested / must go / stood aside, on the list and the room
  grid) is derived from `ResolvedPlan.forDay`, not the greedy base: a
  removed session loses its mark, a replacement carries one, and a
  bookmark or must-go that an overlapping planned item beat is shown
  standing aside rather than silently dropped. Blocks and the lunch gap
  are never "placed sessions" for this purpose.
- **Replacements have no native UI yet.** The store and the projection
  handle `replacements` (tested in `ResolvedPlanTest`), but the Plan screen
  offers remove/restore only; locking is stored but unused.
- **"Remove" does not learn dislike.** It records a removal by id; the
  rating is untouched. The old "Not this one" marked the talk not
  interested.
- **Day boundaries.** Native reads the venue day from `now` in the event's
  fixed offset (`IsoClock`), the PWA from `Intl` with the event timezone.

## The plan in the phone's calendar (#272)

Settings has an opt-in "Keep my plan in the calendar" switch. On, with
`READ_CALENDAR`/`WRITE_CALENDAR` granted, the app creates one local calendar
of its own ("IndiaFOSS", `ACCOUNT_TYPE_LOCAL`, written through
`CalendarContract` as a sync adapter) and keeps it equal to the plan: every
planned session of every day, with the room, the speakers and a ten-minute
reminder, and a `CUSTOM_APP_URI` deep link back into the app.

- `core/CalendarSync.kt` holds the decisions and is pure: `PlannedEntry` is
  the narrow input (`PlannedEntries.fromPlans` projects every feasible day
  of the resolved plan above into them; a day with a blocking conflict
  contributes nothing until it is resolved, the same rule as the
  reminders), `PlannedIdentity` is the row's identity following the
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
- `CompanionViewModel` reconciles whenever the resolved plan's inputs change
  (bundle, bookmarks, must-attend, ratings, devroom stays, blocks, removals,
  replacements) or the switch goes on,
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

Not native yet: plan replacements UI, the optional P2P chat.

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
