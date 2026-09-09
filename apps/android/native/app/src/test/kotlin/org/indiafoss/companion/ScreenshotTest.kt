package org.indiafoss.companion

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.indiafoss.companion.ui.screens.ActivityScreen
import androidx.test.core.app.ApplicationProvider
import org.indiafoss.companion.core.ContactCard
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.bundleJson
import org.indiafoss.companion.data.RankingState
import org.indiafoss.companion.data.StoredComparison
import org.indiafoss.companion.ui.LeaveByBanner
import org.indiafoss.companion.ui.screens.BoothScreen
import org.indiafoss.companion.ui.screens.ConnectScreen
import org.indiafoss.companion.core.ScheduleDiff
import org.indiafoss.companion.data.StoredBlock
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
                activity.id, {}, {}, {},
            )
        }
        compose.onNodeWithText(title).assertIsDisplayed()
    }

    @Test fun now() = shoot("now") { NowScreen(state(), {}, {}) {} }
    @Test fun schedule() = shoot("schedule") { ScheduleScreen(state(), {}, {}) {} }
    @Test fun plan() = shoot("plan") { PlanScreen(state(), {}, {}, { null }, {}) {} }
    @Test fun rank() = shoot("rank") { RankScreen(state(), { _, _ -> }, {}, { _, _ -> }, {}, { _, _ -> noUndo }, { noUndo }, { noUndo }, {}, {}, {}) {} }
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
    @Test fun speakerOpensFromTalk() {
        val talk = bundle.activities.first { it.speakerIds.isNotEmpty() }
        val person = bundle.person(talk.speakerIds.first())!!
        var opened: String? = null
        shoot("talk-speaker-link") {
            ActivityScreen(state(), talk.id, {}, {}, onOpenSpeaker = { opened = it }) {}
        }
        compose.onNodeWithText(person.name).performScrollTo().performClick()
        assertEquals(person.id, opened)
    }

    @Test fun explore() = shoot("explore") { ExploreScreen(state(), {}, {}, {}) {} }
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
    @Test fun welcome() = shoot("welcome") { WelcomeScreen(state(), {}, {}, {}) {} }
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
