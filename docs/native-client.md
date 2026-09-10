# Native Compose client

`apps/android/native` is a standalone Jetpack Compose / Material 3 Android app
that reads the same published `EventBundle` as the web client. It is **the**
Android app — the Capacitor build was retired in
[ADR 0004](adr/0004-retire-the-capacitor-shell.md); see also
[ADR 0002](adr/0002-native-compose-client-rendered-natively.md) for why the
client renders natively rather than embedding a WebView.

## Screens

| Tab / route | State                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Now         | "Your plan now" (in progress / up next from the resolved plan, or its conflicts), then live sessions in every room with progress, then the programme's next session                              |
| Schedule    | per day; room chips, list or time × room grid (`ScheduleGrid`, the PWA's TimelineGrid rules), plan markers from the resolved plan (`PlanMarker`: planned / interested / must go / stood aside)   |
| My plan     | the day planned from must-attend, devroom stays, bookmarks and ratings (`Itinerary`) with removals and blocks layered on top (`ResolvedPlan`); remove/restore; "Stood aside … Reconsider" (#271) |
| Rank        | devrooms (Not interested / Interested / Must go) → talks as swipe cards → overlaps one slot at a time, one tap settling the slot (#271), same rules as the PWA (`docs/ranking.md`), with undo    |
| Welcome     | first run only, and from Settings: reminders permission, ticket reference, name and profiles for the card, then Rank (#107)                                                                      |
| Map         | the floor plan with what is on in every room, plus the room the resolved plan sends you to next                                                                                                  |
| Settings    | reminders switch (POST_NOTIFICATIONS on 13+, exact-alarm hint on 12+), appearance (wallpaper colours on 12+), phone calendar, personal-data export/import (#240), privacy, about                 |
| Session     | detail, bookmark, must attend                                                                                                                                                                    |

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
  removals, clash losses and the devroom left for one pick) resolve the
  same way on both.
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
  interested. (Standing aside in a clash is the same on both: an interest
  kept, not a dislike.)
- **Rank has no keyboard shortcuts and no `?mode=` link.** The PWA's Z-to-undo
  and forced steps are web affordances; native uses the step buttons and the
  Undo button. The settlement itself — one pick per slot, the note, Undo — is
  the same.
- **The devroom title in the pill.** Both clients show the track name's
  bracketed part ("Rust" from "Devroom 2 (Rust)"); native's `devroomTitle`
  is a small regex rather than the PWA's `splitTrackName`.
- **Day boundaries.** Native reads the venue day from `now` in the event's
  fixed offset (`IsoClock`), the PWA from `Intl` with the event timezone.

## Clash settlement (#271)

The overlaps step groups a time window's mutually overlapping candidates
into one settlement card (`Ranking.slots`, over `Ranking.livePool`), and one
tap on a session settles it the way the PWA does:

| Rule                     | Native                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One pick settles a slot  | `CompanionViewModel.pickInSlot(winner, members)` runs `Ranking.resolveClash`; every member the winner overlaps gets `SessionRating.yieldedTo = winner`; the window is not asked again (`livePool` drops them) |
| Standing aside ≠ dislike | `yieldedTo` is a field of its own beside `disposition`/`triage`; the comparison is stored with `clash = true`, and `AffinityModel.learn` then votes for the winner only                                       |
| Left out while live      | `Itinerary.forDay`/`ResolvedPlan.forDay` take `yieldsTo`; `Ranking.activeAfterYields` resolves the yields to a fixed point, so a loser returns when its winner is ruled out, cancelled or stands aside itself |
| Staggered members        | `resolveClash` leaves members the winner does not overlap alone (`unaffected`); the card says "Overlaps 1 of the other 2; the rest can still fit"                                                             |
| Must-go retained         | a must-go loser is `keptMustGo`: no yield, the comparison still recorded, the plan keeps its `MUST_ATTEND` conflict; the slot says so when several must-go talks clash                                        |
| Reserved devroom         | cards carry "STAYING FOR THIS DEVROOM · name" and the slot explains that another pick leaves the devroom for that slot only; `Itinerary.Yields.leftFor` exempts that winner from the block and keeps the rest |
| Undo                     | `Undo.before` holds every touched `SessionRating` verbatim (rating, comparisons, disposition, triage, `yieldedTo`); `undoLast` restores them and forgets the clash comparisons                                |
| Reconsider               | My plan lists the day's stood-aside talks whose winner is live (`UiState.stoodAsideOn`); Reconsider clears `yieldedTo`                                                                                        |

Any later direct answer on a talk (a card answer, a must-go mark) clears its
`yieldedTo`, as `setTalkChoice`/`setDisposition` do on the web. The fields
are the PWA's `ActivityPreference.yieldedTo` and `ComparisonRecord.clash`;
the shared personal-data fixture `clash-settlement.json` round-trips them
through both codecs.

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

## Personal data export and import (#240)

Settings → Personal data saves the versioned `indiafoss-personal-data` file
through the system file picker (`ACTION_CREATE_DOCUMENT`) and imports one
(`ACTION_OPEN_DOCUMENT`), both offline; the same file the PWA writes and
reads (see [the transfer architecture](architecture/personal-data-transfer.md)).

- `core/PersonalState.kt` is the one aggregate the transfer reads and
  writes: bookmarks and must-attend, `RankingState`, `PlanEdits`, the
  attendee's `ContactCard` and notes. The record types moved here from
  `:app` so the logic runs on the JVM; the DataStores in `app/data` persist
  them.
- `core/NativePersonalData.kt` projects the explicit export allowlist (the
  Keystore handshake key, met contacts, identity-envelope bookkeeping and
  the device switches are never read), and plans an import: every activity
  reference goes through `PortableActivities.resolve`, records are listed as
  additions or conflicts (kept unless ticked) with unresolved, unassigned and
  unsupported ones named, and `apply` folds the chosen changes into a new
  `PersonalState`. `core/PersonalDataValidation.kt` is the section contract,
  the same rules as the PWA's `validatePersonalData`.
- `app/data/PersonalDataRepository.kt` makes the write atomic across the
  five DataStores: the prior state goes to `files/personal-import.journal`
  first, each store is written with a compare-and-set against what the
  preview read, a failure restores every store from the journal, and
  `recover()` at launch restores a journal a dead process left behind.
  `PersonalDataRepositoryTest` rehearses all three.
- The stores' flows feed `UiState`, so the resolved plan, `ReminderScheduler`
  and the calendar sync re-derive from the imported choices without a restart.

Native-only carriage: blocks without a fixed time travel under
`sections.flexibleBlocks` (the PWA reports it and imports the rest), booth
visits also under `boothVisits` by stable ID, notes in a `NotesStore` with
no UI yet, and `locked` / `yieldedTo` / `clash` are stored and re-exported
without being read. Saved itineraries and resolved plans are reported, not
stored: the plan is resolved from the programme here. Nothing has moved a
file between real devices yet; the evidence is `NativePersonalDataTest`,
`PersonalDataRepositoryTest`, the `settingsImportPreview` render and the two
shared fixtures.

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

Not native yet: plan replacements UI, notes UI, the optional P2P chat.

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
`events/indiafoss-2026/normalized/event-bundle.json` — the Gradle
`copySeedBundle` task puts it in `assets/`, so the seed is the same canonical
bundle the publishing pipeline reads. On launch it fetches
`…/events/<id>/manifest.json`, and when that names a newer revision it
downloads the hash-addressed asset **in full and parses it** before replacing
the cache, so a half-finished download never evicts a good schedule. A failed
refresh is silent: offline is the normal case at a conference.

Settings carries a **Schedule data** card (#191) that keeps three facts apart,
all of them read from the published bundle:

- whether the organisers still call the programme a draft
  (`sourceMetadata.scheduleStatus`), reported as provisional and never as
  confirmed when the field is absent;
- when the programme was last imported upstream
  (`sourceMetadata.sourceUpdatedAt`), bucketed as current, ageing or stale;
- when _this device_ last reached the manifest, stated as when it looked rather
  than as how old the data is.

A bundle still coming from the APK's assets is named as such: it is as old as
the release. `ScheduleFreshness` in `core` holds the wording and the thresholds;
`apps/web/src/lib/schedule-freshness.ts` is its web twin.

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
