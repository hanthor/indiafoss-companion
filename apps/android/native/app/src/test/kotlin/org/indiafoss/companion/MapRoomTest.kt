package org.indiafoss.companion

import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.Location
import org.indiafoss.companion.ui.screens.FloorRoom
import org.junit.Assert.assertEquals
import org.junit.Test

class MapRoomTest {
    private val room = FloorRoom("hall-1", "Hall 1", key = "audi-1", cx = 0.0, cy = 0.0, d = "")
    private fun bundle(vararg ids: String) = EventBundle(
        id = "test", name = "Test", timezone = "Asia/Kolkata",
        start = "2026-09-26T09:00:00+05:30", end = "2026-09-26T18:00:00+05:30",
        locations = ids.map { Location(id = it, name = it) },
    )

    @Test fun currentRoomIdWinsOverLegacyAlias() {
        assertEquals("hall-1", room.programmeLocationId(bundle("hall-1", "audi-1")))
    }

    @Test fun olderProgrammeCanStillUseLegacyAlias() {
        assertEquals("audi-1", room.programmeLocationId(bundle("audi-1")))
    }

    @Test fun unknownOrUnloadedProgrammeKeepsGeometryId() {
        assertEquals("hall-1", room.programmeLocationId(bundle()))
        assertEquals("hall-1", room.programmeLocationId(null))
    }
}
