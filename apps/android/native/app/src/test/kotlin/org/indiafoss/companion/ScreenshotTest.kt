package org.indiafoss.companion

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.core.app.ApplicationProvider
import org.indiafoss.companion.core.ContactCard
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.bundleJson
import org.indiafoss.companion.ui.LeaveByBanner
import org.indiafoss.companion.ui.screens.ConnectScreen
import org.indiafoss.companion.ui.screens.ExploreScreen
import org.indiafoss.companion.ui.screens.MapScreen
import org.indiafoss.companion.ui.screens.NowScreen
import org.indiafoss.companion.ui.screens.PlanScreen
import org.indiafoss.companion.ui.screens.RankScreen
import org.indiafoss.companion.ui.screens.ScheduleScreen
import org.indiafoss.companion.ui.screens.SettingsScreen
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
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val bundle: EventBundle by lazy {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        context.assets.open("event-bundle.json").bufferedReader().use { bundleJson.decodeFromString(it.readText()) }
    }

    private fun state(now: String = "2025-09-20T10:20:00+05:30") = UiState(
        loading = false, bundle = bundle, now = now,
        bookmarks = setOf("act-c8ak0iov2l"), mustAttend = setOf("act-c8ak0iov2l"),
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

    @Test fun now() = shoot("now") { NowScreen(state(), {}, {}) {} }
    @Test fun schedule() = shoot("schedule") { ScheduleScreen(state(), {}, {}) {} }
    @Test fun plan() = shoot("plan") { PlanScreen(state(), {}, {}, { null }, {}) {} }
    @Test fun rank() = shoot("rank") { RankScreen(state(), { _, _ -> }, { _, _ -> }, {}, { _, _, _ -> }, { _, _ -> }, {}) {} }
    @Test fun map() = shoot("map") { MapScreen(state(), {}) {} }
    @Test fun explore() = shoot("explore") { ExploreScreen(state(), {}, {}) {} }
    @Test fun connect() = shoot("connect") {
        ConnectScreen(ContactCard(fullName = "Asha Menon", organization = "FOSS United", socials = mapOf("github" to "https://github.com/asha")), emptyList(), {}, {}, {}) {}
    }
    @Test fun settings() = shoot("settings") { SettingsScreen(state(), {}) {} }
    @Test fun banner() = shoot("banner") { LeaveByBanner(state("2025-09-20T09:58:00+05:30")) {} }
}
