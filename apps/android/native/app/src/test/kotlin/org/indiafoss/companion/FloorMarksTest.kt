package org.indiafoss.companion

import androidx.compose.material3.lightColorScheme
import androidx.test.core.app.ApplicationProvider
import kotlinx.serialization.json.Json
import org.indiafoss.companion.ui.screens.FloorPlans
import org.indiafoss.companion.ui.screens.Floors
import org.indiafoss.companion.ui.screens.artworkColor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The artwork paints the maps draw: sentinels, hex fills, and the shipped `floors.json`. */
class FloorMarksTest {
    private val scheme = lightColorScheme()

    @Test fun sentinels() {
        assertNull(artworkColor("none", scheme))
        assertEquals(scheme.onSurface, artworkColor("text", scheme))
    }

    @Test fun hexFills() {
        assertEquals(
            androidx.compose.ui.graphics.Color(red = 0x79 / 255f, green = 0xF0 / 255f, blue = 0xA9 / 255f),
            artworkColor("#79F0A9", scheme),
        )
        assertEquals(
            androidx.compose.ui.graphics.Color.White,
            artworkColor("#FFFFFF", scheme),
        )
    }

    @Test fun unknownPaintsAreNull() {
        assertNull(artworkColor("", scheme))
        assertNull(artworkColor("red", scheme))
        assertNull(artworkColor("#fff", scheme))
        assertNull(artworkColor("#GGGGGG", scheme))
    }
}

/** The exported floor vectors both maps draw parse and every paint resolves. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FloorsJsonTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun load(): Floors {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        // The Gradle build copies the web export here; the file the APK draws.
        val text = context.assets.open("floors.json").bufferedReader().use { it.readText() }
        return json.decodeFromString(text)
    }

    @Test fun roomsKeepTheirProgrammeIds() {
        val floors = FloorPlans.load(ApplicationProvider.getApplicationContext())
        assertEquals(listOf("ground", "first"), floors.map { it.id })
        assertEquals(
            listOf("hall-1", "hall-2", "hall-3", "sponsor-booths", "hw-showcase", "lunch"),
            floors.first { it.id == "ground" }.rooms.map { it.id },
        )
        assertEquals(
            listOf("room-2", "room-3", "room-1", "hall-1-balcony", "silent"),
            floors.first { it.id == "first" }.rooms.map { it.id },
        )
    }

    @Test fun everyPaintResolves() {
        val scheme = lightColorScheme()
        for (floor in load().floors) {
            assert(floor.marks.isNotEmpty()) { "${floor.id} has no marks" }
            for (room in floor.rooms) {
                if (room.c != null) assertNotNull("${floor.id}/${room.id} color", artworkColor(room.c, scheme))
            }
            for (mark in floor.marks) {
                if (mark.f != "none") assertNotNull("${floor.id} mark fill ${mark.f}", artworkColor(mark.f, scheme))
                if (mark.s != null) assertNotNull("${floor.id} mark stroke ${mark.s}", artworkColor(mark.s, scheme))
            }
        }
    }
}
