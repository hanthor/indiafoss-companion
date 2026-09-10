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
| Now         | "Your plan now" (in progress / up next from the resolved plan, or its conflicts), then live sessions in every room with progress, then the programme's next session                |
| Schedule    | per day, bookmark from the list                                                                                                                                                    |
| My plan     | the day planned from must-attend, devroom stays, bookmarks and ratings (`Itinerary`) with removals and blocks layered on top (`ResolvedPlan`); remove/restore; "Rank this day"     |
| Rank        | devrooms (Not interested / Interested / Must go) → talks as swipe cards → overlaps one slot at a time, same rules as the PWA (`docs/ranking.md`), with the affinity prior and undo |
| Welcome     | first run only, and from Settings: reminders permission, ticket reference, name and profiles for the card, then Rank (#107)                                                        |
| Map         | the floor plan with what is on in every room, plus the room the resolved plan sends you to next                                                                                    |
| Settings    | reminders switch (POST_NOTIFICATIONS on 13+, exact-alarm hint on 12+), appearance (wallpaper colours on 12+), privacy, about                                                       |
| Session     | detail, bookmark, must attend                                                                                                                                                      |

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
- **Replacements have no native UI yet.** The store and the projection
  handle `replacements` (tested in `ResolvedPlanTest`), but the Plan screen
  offers remove/restore only; locking is stored but unused.
- **"Remove" does not learn dislike.** It records a removal by id; the
  rating is untouched. The old "Not this one" marked the talk not
  interested.
- **Day boundaries.** Native reads the venue day from `now` in the event's
  fixed offset (`IsoClock`), the PWA from `Intl` with the event timezone.

Walk times come from the venue graph (`venue.graph.json` and
`venue.metadata.json`, shipped in assets; `Routing` is the web package's
shortest-walk logic ported, with the fastest / avoid-stairs / accessible
profiles and tests): once a location is set, the banner says "LEAVE IN N
MIN · WALK M MIN" (start minus the walk minus a five-minute buffer) and a
tapped room on the map says how far it is. `indiafoss://activity/<id>`,
`indiafoss://location/<id>` and `indiafoss://speaker/<id>` open the right
screen from a launch or a running app.

Native feel: edge-to-edge, predictive back, pull-to-refresh on Now, the
system share sheet for cards and calendars, Material You colour on the
everyday screens (see Theming and branding below).

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
scheme, `LargeTextScreenshotTest` at 1.5× font scale and
`DynamicColorScreenshotTest` with Material You on) and writes PNGs to
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

## Theming and branding

`ui/theme/Theme.kt` carries the IndiaFOSS 2026 tokens with one role each,
mirroring `apps/web/src/app.css` (`BrandColors`: mint, mint-ink, pale green,
ink, paper/surface/raised, text/muted/faint, line, amber, and the semantic
danger/warning/success — never brand green). They are placed in their
Material 3 roles as `LightScheme`/`DarkScheme`, and exposed unchanged as
`LocalBrand` / `MaterialTheme.brand`.

On Android 12+ the everyday screens (Schedule, My plan, Map, Explore lists,
Settings, detail pages) take the user's wallpaper palette by default;
Settings → Appearance → "Use wallpaper colours" switches that off, and older
devices use the event scheme. The event surfaces read `LocalBrand` and keep
their identity under either: the Now masthead (event name, dates, day or
recap), the welcome flow (`EventIdentity`), the devroom gallery on Explore
and the devroom cards in Rank. Light or dark follows the system.

Typography (`ui/theme/Type.kt`) is Inter — 600 headings with tight tracking,
400 body — with Space Mono for compact metadata only (`Typography.meta`,
`Typography.eyebrow`: time · room lines and capitalised eyebrows), the same
choice the PWA made in [the 8 September review](reviews/branding-2026-09-08.md).
Both fonts ship in `res/font` (SIL OFL 1.1) so nothing is fetched at run
time; the pixel face stays on the official wordmark and is not bundled.

The eight official 2026 devroom patterns ship as WebP in
`res/drawable-nodpi` (`ui/DevroomArt.kt`, keyed exactly as
`apps/web/src/lib/devroom-art.ts`) and appear on Explore, Rank and as a
sliver beside the track chip on session cards, only for the `indiafoss-2026`
bundle. Provenance, licences, checksums and the render script are in
[`apps/android/native/branding/README.md`](../apps/android/native/branding/README.md);
the decisions and CI screenshots are in
[the native branding review](reviews/native-branding-2026-09-10.md).

The launcher is this project's own calendar-and-pin glyph on the event mint,
no FOSS United mark; IndiaFOSS Chat keeps its speech-bubble icon, so the two
apps are told apart by silhouette. The splash plate is the brand paper token
in both themes. The Settings "About" card keeps the unofficial community
project disclosure.
