package org.indiafoss.companion

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasContentDescription
import org.junit.Assert.assertEquals
import org.indiafoss.companion.ui.screens.ActivityScreen
import androidx.test.core.app.ApplicationProvider
import org.indiafoss.companion.core.ContactCard
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.bundleJson
import org.indiafoss.companion.core.RankingState
import org.indiafoss.companion.core.StoredComparison
import org.indiafoss.companion.ui.LeaveByBanner
import org.indiafoss.companion.ui.screens.BoothScreen
import org.indiafoss.companion.ui.screens.ConnectScreen
import org.indiafoss.companion.core.ScheduleDiff
import org.indiafoss.companion.core.StoredBlock
import org.indiafoss.companion.ui.screens.ExploreScreen
import org.indiafoss.companion.ui.screens.MapScreen
import org.indiafoss.companion.ui.screens.NowScreen
import org.indiafoss.companion.ui.screens.PlanScreen
import org.indiafoss.companion.ui.screens.RankScreen
import org.indiafoss.companion.ui.screens.ScheduleScreen
import org.indiafoss.companion.ui.screens.SettingsScreen
import org.indiafoss.companion.ui.screens.WelcomeScreen
import org.indiafoss.companion.ui.theme.CompanionTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * Renders every screen with the seed bundle at a Pixel-sized viewport and
 * writes PNGs to app/build/screenshots: the only way to look at the UI in a
 * sandbox with no device. Asserts only that each screen renders.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class ScreenshotTest {
    private val noUndo = CompanionViewModel.Undo(emptyMap(), emptyList())
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val bundle: EventBundle by lazy {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        context.assets.open("event-bundle.json").bufferedReader().use { bundleJson.decodeFromString(it.readText()) }
    }

    private fun state(now: String = "2026-09-26T10:20:00+05:30") = UiState(
        loading = false, bundle = bundle, now = now,
        bookmarks = setOf("act-28laimsqbf"), mustAttend = setOf("act-28laimsqbf"),
        currentLocation = "audi-1",
    )

    private fun shoot(name: String, content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent { CompanionTheme(dynamicColor = false) { content() } }
        capture(name)
    }

    /** Draw whatever is on screen now: after a tap, for a second frame of the same content. */
    private fun capture(name: String) {
        compose.waitForIdle()
        // Draw the window's view tree ourselves: Robolectric has no real
        // choreographer for the test rule's window capture to wait on.
        val view = compose.activity.window.decorView
        val width = 1233
        val height = 2673
        view.measure(
            android.view.View.MeasureSpec.makeMeasureSpec(width, android.view.View.MeasureSpec.EXACTLY),
            android.view.View.MeasureSpec.makeMeasureSpec(height, android.view.View.MeasureSpec.EXACTLY),
        )
        view.layout(0, 0, width, height)
        compose.waitForIdle()
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bitmap))
        val dir = File("build/screenshots").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 90, it) }
    }

    @Test fun planLunchBreak() {
        val template = bundle.activities.first()
        val morning = template.copy(id = "morning", title = "Morning session", type = "talk", start = "2026-09-26T11:00:00+05:30", end = "2026-09-26T12:00:00+05:30")
        val lunch = template.copy(id = "lunch", title = "Lunch break", type = "meal", start = "2026-09-26T12:00:00+05:30", end = "2026-09-26T13:00:00+05:30")
        val afternoon = morning.copy(id = "afternoon", title = "Afternoon session", start = "2026-09-26T13:00:00+05:30", end = "2026-09-26T14:00:00+05:30")
        shoot("plan-lunch-break") {
            PlanScreen(state().copy(bundle = bundle.copy(activities = listOf(morning, lunch, lunch.copy(id = "other-room-lunch"), afternoon))), {}, {}, { null }, {}) {}
        }
        compose.onNodeWithText("Lunch · food area").performScrollTo().assertIsDisplayed()
    }

    @Test fun longSessionTitle() {
        val title = "Bypassing Android MTP: pushing a native C++ daemon via ADB for fast file transfers"
        val activity = bundle.activities.first().copy(title = title)
        shoot("session-long-title") {
            ActivityScreen(
                state().copy(bundle = bundle.copy(activities = listOf(activity))),
                activity.id, {}, {}, onBack = {},
            )
        }
        compose.onNodeWithText(title).assertIsDisplayed()
    }

    @Test fun now() = shoot("now") { NowScreen(state(), {}, {}) {} }

    /** Two overlapping must-go choices: Now says so instead of naming a destination (#221). */
    @Test fun nowPlanConflict() {
        val first = bundle.activities.first { it.start != null && it.type != "meal" && it.start!!.startsWith("2026-09-26") }
        val clash = first.copy(id = "clash", title = "A clashing must-go talk")
        shoot("now-plan-conflict") {
            NowScreen(state().copy(bundle = bundle.copy(activities = bundle.activities + clash), mustAttend = setOf(first.id, "clash"), bookmarks = emptySet()), {}, {}) {}
        }
        compose.onNodeWithText("Your plan has conflicting choices").assertIsDisplayed()
    }

    /** A removed session is gone from Now and the banner alike, and the map points at the plan's next room. */
    @Test fun nowAndMapFollowRemoval() {
        val first = state().todayPlan!!.nextPlanned(state().now)!!
        val removed = state().copy(removedFromPlan = setOf(first.id), mustAttend = emptySet())
        val after = removed.todayPlan!!.nextPlanned(removed.now)
        assertEquals(false, after?.id == first.id)
        shoot("map-destination") { MapScreen(removed, {}) {} }
        compose.onNode(hasText("for you:", substring = true)).assertIsDisplayed()
    }

    @Test fun planRemoved() {
        val planned = state().todayPlan!!.items.first { it.source == org.indiafoss.companion.core.ResolvedPlan.Source.RANKED }
        shoot("plan-removed") { PlanScreen(state().copy(removedFromPlan = setOf(planned.id)), {}, {}, { null }, {}) {} }
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("Removed: ${planned.title}"))
        compose.onNodeWithText("Restore").assertIsDisplayed()
    }

    @Test fun schedule() = shoot("schedule") { ScheduleScreen(state(), {}, {}) {} }

    /** The must-attend fixture session sits on day 1 and is placed, so the list marks it "Must go" (#110). */
    @Test fun scheduleMarkers() {
        shoot("schedule-markers") { ScheduleScreen(state(), {}, {}) {} }
        compose.onNodeWithText("All rooms").assertIsDisplayed()
        compose.onNodeWithTag("schedule-list").performScrollToNode(hasText("Must go"))
        compose.onNodeWithText("Must go").assertIsDisplayed()
    }

    @Test fun scheduleRoomGrid() {
        var opened: String? = null
        compose.setContent { CompanionTheme(dynamicColor = false) { ScheduleScreen(state(), {}, {}) { opened = it } } }
        compose.onNodeWithText("Room grid").performClick()
        capture("schedule-grid")
        compose.onNodeWithContentDescription("Schedule by room and time").assertExists()
        // Every room with a session that day is a column as well as a chip.
        compose.onAllNodesWithText("Room 1").assertCountEquals(2)
        // Narrow to the fixture's room: one column, and the must-go cell carries its mark and opens the talk.
        compose.onAllNodesWithText("Room 1")[0].performClick()
        compose.waitForIdle()
        compose.onAllNodesWithText("Room 1").assertCountEquals(2)
        compose.onAllNodesWithText("Hall 1").assertCountEquals(1)
        capture("schedule-grid-room")
        val cell = compose.onNode(hasContentDescription("Must go, ", substring = true))
        cell.assertExists()
        cell.performScrollTo()
        cell.performClick()
        assertEquals("act-28laimsqbf", opened)
    }

    @Test fun scheduleRoomFilter() {
        shoot("schedule-room") { ScheduleScreen(state(), {}, {}) {} }
        // The sixth chip is off-screen at phone width: bring it in before tapping.
        compose.onNodeWithTag("room-chips").performScrollToNode(hasText("Room 2"))
        compose.onNodeWithText("Room 2").performClick()
        capture("schedule-room")
        // Only that room's sessions remain: the count line no longer says the whole day.
        compose.onNodeWithText("3 sessions").assertIsDisplayed()
    }
    @Test fun plan() = shoot("plan") { PlanScreen(state(), {}, {}, { null }, {}) {} }
    @Test fun rank() = shoot("rank") { RankScreen(state(), { _, _ -> }, {}, { _, _ -> }, {}, { _, _ -> noUndo }, { noUndo }, { noUndo }, {}, {}, {}) {} }
    /** The devroom cards carry the official 2026 patterns (the PWA's planning cards). */
    @Test fun rankDevrooms() {
        shoot("rank-devrooms") {
            RankScreen(state(), { _, _ -> }, {}, { _, _ -> }, {}, { _, _ -> noUndo }, { noUndo }, { noUndo }, {}, {}, {}, startWithDevrooms = true) {}
        }
        compose.onNode(hasText("Which devrooms are for you?", substring = true)).assertIsDisplayed()
    }
    @Test fun rankTalks() = shoot("rank-talks") {
        RankScreen(state().copy(ranking = RankingState(roomsDecided = true)), { _, _ -> }, {}, { _, _ -> }, {}, { _, _ -> noUndo }, { noUndo }, { noUndo }, {}, {}, {}) {}
    }
    @Test fun rankSlots() = shoot("rank-slots") {
        val one = StoredComparison("cmp-1", "act-28lagehf47", "act-28la68il6o", 1.0, 0L)
        RankScreen(state().copy(ranking = RankingState(roomsDecided = true, comparisons = listOf(one))), { _, _ -> }, {}, { _, _ -> }, {}, { _, _ -> noUndo }, { noUndo }, { noUndo }, {}, {}, {}) {}
    }
    @Test fun map() = shoot("map") { MapScreen(state(), {}) {} }
    @Test fun mapLongCurrentTalk() = shoot("map-long-current-talk") {
        val talk = bundle.activities.first().copy(
            id = "map-long", title = "Bypassing Android MTP: pushing a native C++ daemon via ADB for fast file transfers",
            locationId = "hall-1", start = "2026-09-26T10:00:00+05:30", end = "2026-09-26T11:00:00+05:30",
        )
        MapScreen(state().copy(bundle = bundle.copy(activities = listOf(talk))), {}) {}
    }
    @Test fun speakerDetail() = shoot("speaker-detail") {
        val person = bundle.people.first { !it.bio.isNullOrBlank() }
        org.indiafoss.companion.ui.screens.SpeakerScreen(state(), person.id, {}) {}
    }

    @Test fun speakerOpensFromTalk() {
        val talk = bundle.activities.first { it.speakerIds.isNotEmpty() }
        val person = bundle.person(talk.speakerIds.first())!!
        var opened: String? = null
        shoot("talk-speaker-link") {
            ActivityScreen(state(), talk.id, {}, {}, onOpenSpeaker = { opened = it }) {}
        }
        compose.onNode(hasScrollAction()).performScrollToNode(hasText(person.name))
        compose.onNodeWithText(person.name).performClick()
        assertEquals(person.id, opened)
    }

    @Test fun explore() {
        shoot("explore") { ExploreScreen(state(), {}, {}, {}) {} }
        // The 2026 devroom gallery (the PWA's home gallery) sits above booths and speakers.
        compose.onNodeWithText("Find your devroom").assertIsDisplayed()
        compose.onNodeWithText("Android Open Source Project (AOSP)").assertIsDisplayed()
    }

    /** No 2026 artwork for another event: the gallery is absent, nothing inherits a pattern (#33). */
    @Test fun exploreOtherEventHasNoGallery() {
        shoot("explore-archive") { ExploreScreen(state().copy(bundle = bundle.copy(id = "indiafoss-2025")), {}, {}, {}) {} }
        compose.onAllNodesWithText("Find your devroom").assertCountEquals(0)
    }

    /** The masthead reads the event's dates from the bundle and its phase from the clock. */
    @Test fun nowBeforeTheConference() {
        shoot("now-before") { NowScreen(state("2026-09-20T10:00:00+05:30"), {}, {}) {} }
        compose.onNode(hasText("BEFORE THE CONFERENCE", substring = true)).assertIsDisplayed()
        compose.onNodeWithText(bundle.name).assertIsDisplayed()
    }

    @Test fun nowRecap() {
        shoot("now-recap") { NowScreen(state("2026-10-01T10:00:00+05:30"), {}, {}) {} }
        compose.onNode(hasText("THAT'S A WRAP", substring = true)).assertIsDisplayed()
    }

    @Test fun eventDatesFormat() {
        assertEquals("26–27 September 2026", org.indiafoss.companion.ui.eventDates("2026-09-26T09:00:00+05:30", "2026-09-27T18:00:00+05:30"))
        assertEquals("26 September 2026", org.indiafoss.companion.ui.eventDates("2026-09-26", "2026-09-26"))
        assertEquals("30 September – 2 October 2026", org.indiafoss.companion.ui.eventDates("2026-09-30", "2026-10-02"))
    }
    @Test fun booth() = shoot("booth") {
        // The published draft has no booth catalogue; this is test-only content.
        val booth = org.indiafoss.companion.core.Booth("test-booth", "Sample community booth", description = "Meet the community")
        BoothScreen(state().copy(bundle = bundle.copy(booths = listOf(booth))), booth.id, { _, _ -> }, {}) {}
    }
    @Test fun nowUpdated() = shoot("now-updated") {
        val update = ScheduleUpdate(7, listOf(ScheduleDiff.Change("act-28laimsqbf", "Why Documentation Shouldn't Feel Like Plain Text", ScheduleDiff.Kind.TIME, "10:15 → 11:00")))
        NowScreen(state().copy(update = update, blocks = listOf(StoredBlock("visit-1", "Visit the sample booth", "2026-09-26"))), {}, {}) {}
    }
    @Test fun connect() = shoot("connect") {
        ConnectScreen(
            ContactCard(fullName = "Asha Menon", organization = "FOSS United", socials = mapOf("github" to "https://github.com/asha")),
            emptyList(), fingerprint = "8a79ebf182010f3a91c20d4e", onSave = {}, onScan = {}, onRemoveContact = {},
        ) {}
    }
    @Test fun settings() = shoot("settings") { SettingsScreen(state(), {}, {}) {} }
    @Test fun settingsCalendarOn() {
        shoot("settings-calendar-on") {
            SettingsScreen(state().copy(calendarSyncEnabled = true, calendarSyncStatus = "6 entries in the IndiaFOSS calendar · 2 added"), {}, {}) {}
        }
        compose.onNodeWithText("Disconnect and remove the calendar").performScrollTo().assertIsDisplayed()
    }
    /** Settings offers the personal-data file both ways, offline (#240). */
    @Test fun settingsPersonalData() {
        shoot("settings-personal-data") { SettingsScreen(state(), {}, {}) {} }
        compose.onNodeWithText("Save personal data").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Import from a file").assertIsDisplayed()
    }
    /** An import preview: new records ticked, what this phone holds differently kept unless ticked, unresolved records named. */
    @Test fun settingsImportPreview() {
        val preview = org.indiafoss.companion.core.ImportPreview(
            exportedAt = "2026-09-09T01:00:00.000Z",
            changes = listOf(
                org.indiafoss.companion.core.ImportChange(
                    "preferences:act-28laimsqbf", "preferences", "indiafoss-2026", "Why Documentation Shouldn't Feel Like Plain Text",
                    org.indiafoss.companion.core.ImportStatus.ADD, incomingSummary = "must-attend, bookmarked, rating 1200",
                    write = org.indiafoss.companion.core.ImportWrite.Preference("act-28laimsqbf", org.indiafoss.companion.core.SessionRating(disposition = "must-attend"), true),
                ),
                org.indiafoss.companion.core.ImportChange(
                    "contact.profile", "contact.profile", null, "contact card", org.indiafoss.companion.core.ImportStatus.CONFLICT,
                    current = org.indiafoss.companion.core.ImportWrite.Profile(mapOf("fullName" to "Asha"), emptyMap()), currentSummary = "1 field, 0 social links",
                    incomingSummary = "3 fields, 1 social link", write = org.indiafoss.companion.core.ImportWrite.Profile(mapOf("fullName" to "Asha Menon"), emptyMap()),
                ),
            ),
            skipped = listOf(org.indiafoss.companion.core.ImportSkip("preferences", "indiafoss-2026", "talk-old", org.indiafoss.companion.core.ImportSkipReason.AMBIGUOUS, "talk-old (repeated CFP entry)")),
            unchanged = 3,
            unsupported = listOf("events[0].sections.settings"),
        )
        var applied: Set<String>? = null
        shoot("settings-import-preview") {
            SettingsScreen(state().copy(importPreview = preview), {}, {}, onApplyImport = { applied = it }) {}
        }
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("New on this phone (1)"))
        compose.onNodeWithText("New on this phone (1)").assertIsDisplayed()
        compose.onNodeWithText("Different on this phone (1) — kept unless ticked").assertIsDisplayed()
        compose.onNodeWithText("Here: 1 field, 0 social links").assertIsDisplayed()
        compose.onNodeWithText("Already the same here: 3").assertIsDisplayed()
        compose.onNode(hasText("talk-old — repeated CFP entry", substring = true)).assertIsDisplayed()
        compose.onNodeWithText("events[0].sections.settings").assertIsDisplayed()
        // Only the addition is ticked; importing sends exactly that id.
        compose.onNodeWithText("Import 1 selected").performClick()
        assertEquals(setOf("preferences:act-28laimsqbf"), applied)
    }
    @Test fun welcome() = shoot("welcome") { WelcomeScreen(state(), {}, {}) {} }
    @Test fun banner() = shoot("banner") { LeaveByBanner(state("2026-09-26T09:58:00+05:30")) {} }
}

/** The same screens in the dark scheme. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-night-xxhdpi")
class DarkScreenshotTest {
    private val noUndo = CompanionViewModel.Undo(emptyMap(), emptyList())
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val bundle: EventBundle by lazy {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        context.assets.open("event-bundle.json").bufferedReader().use { bundleJson.decodeFromString(it.readText()) }
    }

    private fun shoot(name: String, content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent { CompanionTheme(darkTheme = true, dynamicColor = false) { content() } }
        compose.waitForIdle()
        val view = compose.activity.window.decorView
        view.measure(
            android.view.View.MeasureSpec.makeMeasureSpec(1233, android.view.View.MeasureSpec.EXACTLY),
            android.view.View.MeasureSpec.makeMeasureSpec(2673, android.view.View.MeasureSpec.EXACTLY),
        )
        view.layout(0, 0, 1233, 2673)
        compose.waitForIdle()
        val bitmap = Bitmap.createBitmap(1233, 2673, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bitmap))
        File("build/screenshots").apply { mkdirs() }
        File("build/screenshots/$name-dark.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 90, it) }
    }

    private fun state() = UiState(loading = false, bundle = bundle, now = "2026-09-26T10:20:00+05:30", mustAttend = setOf("act-28laimsqbf"), currentLocation = "audi-1")

    @Test fun now() = shoot("now") { NowScreen(state(), {}, {}) {} }
    @Test fun map() = shoot("map") { MapScreen(state(), {}) {} }
    @Test fun rank() = shoot("rank") { RankScreen(state(), { _, _ -> }, {}, { _, _ -> }, {}, { _, _ -> noUndo }, { noUndo }, { noUndo }, {}, {}, {}) {} }
}

/**
 * The touched screens at 1.5× font scale (Android's "Larger" display size):
 * nothing clips, the mono metadata and the masthead still fit, buttons wrap.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class LargeTextScreenshotTest {
    private val noUndo = CompanionViewModel.Undo(emptyMap(), emptyList())
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val bundle: EventBundle by lazy {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        context.assets.open("event-bundle.json").bufferedReader().use { bundleJson.decodeFromString(it.readText()) }
    }

    private fun shoot(name: String, content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent {
            val density = androidx.compose.ui.platform.LocalDensity.current
            androidx.compose.runtime.CompositionLocalProvider(
                androidx.compose.ui.platform.LocalDensity provides androidx.compose.ui.unit.Density(density.density, fontScale = 1.5f),
            ) { CompanionTheme(dynamicColor = false) { content() } }
        }
        compose.waitForIdle()
        val view = compose.activity.window.decorView
        view.measure(
            android.view.View.MeasureSpec.makeMeasureSpec(1233, android.view.View.MeasureSpec.EXACTLY),
            android.view.View.MeasureSpec.makeMeasureSpec(2673, android.view.View.MeasureSpec.EXACTLY),
        )
        view.layout(0, 0, 1233, 2673)
        compose.waitForIdle()
        val bitmap = Bitmap.createBitmap(1233, 2673, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bitmap))
        File("build/screenshots").apply { mkdirs() }
        File("build/screenshots/$name-large-text.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 90, it) }
    }

    private fun state() = UiState(loading = false, bundle = bundle, now = "2026-09-26T10:20:00+05:30", mustAttend = setOf("act-28laimsqbf"), currentLocation = "audi-1")

    @Test fun now() {
        shoot("now") { NowScreen(state(), {}, {}) {} }
        compose.onNodeWithText(bundle.name).assertIsDisplayed()
    }
    @Test fun schedule() {
        shoot("schedule") { ScheduleScreen(state(), {}, {}) {} }
        compose.onNodeWithText("Day 1").assertIsDisplayed()
    }
    @Test fun welcome() {
        shoot("welcome") { WelcomeScreen(state(), {}, {}) {} }
        compose.onNodeWithText("SET UP IN A MINUTE").assertIsDisplayed()
        compose.onNodeWithText("Turn on reminders").assertIsDisplayed()
    }
    @Test fun explore() {
        shoot("explore") { ExploreScreen(state(), {}, {}, {}) {} }
        compose.onNodeWithText("Find your devroom").assertIsDisplayed()
    }
    @Test fun rank() = shoot("rank") { RankScreen(state(), { _, _ -> }, {}, { _, _ -> }, {}, { _, _ -> noUndo }, { noUndo }, { noUndo }, {}, {}, {}) {} }
    @Test fun settings() {
        shoot("settings") { SettingsScreen(state(), {}, {}) {} }
        // Refresh state leads the screen (#191): what the schedule is and how
        // old it is, before any of the switches.
        compose.onNodeWithText("Schedule data").assertIsDisplayed()
        compose.onNodeWithText("Appearance").performScrollTo().assertIsDisplayed()
    }
}

/**
 * Material You on (the launch default on Android 12+): the everyday scheme
 * comes from the device palette, while the welcome hero and the Now masthead
 * stay on the ink surface with the mint accent. The PNGs are the evidence;
 * the assertions only check the event surfaces are still there.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class DynamicColorScreenshotTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val bundle: EventBundle by lazy {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        context.assets.open("event-bundle.json").bufferedReader().use { bundleJson.decodeFromString(it.readText()) }
    }

    private fun shoot(name: String, content: @androidx.compose.runtime.Composable () -> Unit) {
        compose.setContent { CompanionTheme(dynamicColor = true) { content() } }
        compose.waitForIdle()
        val view = compose.activity.window.decorView
        view.measure(
            android.view.View.MeasureSpec.makeMeasureSpec(1233, android.view.View.MeasureSpec.EXACTLY),
            android.view.View.MeasureSpec.makeMeasureSpec(2673, android.view.View.MeasureSpec.EXACTLY),
        )
        view.layout(0, 0, 1233, 2673)
        compose.waitForIdle()
        val bitmap = Bitmap.createBitmap(1233, 2673, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bitmap))
        File("build/screenshots").apply { mkdirs() }
        File("build/screenshots/$name-dynamic.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 90, it) }
    }

    private fun state() = UiState(loading = false, bundle = bundle, now = "2026-09-26T10:20:00+05:30", mustAttend = setOf("act-28laimsqbf"), currentLocation = "audi-1")

    @Test fun now() {
        shoot("now") { NowScreen(state(), {}, {}) {} }
        compose.onNodeWithText(bundle.name).assertIsDisplayed()
    }
    @Test fun welcome() {
        shoot("welcome") { WelcomeScreen(state(), {}, {}) {} }
        compose.onNodeWithText("SET UP IN A MINUTE").assertIsDisplayed()
    }
    @Test fun schedule() = shoot("schedule") { ScheduleScreen(state(), {}, {}) {} }
}
