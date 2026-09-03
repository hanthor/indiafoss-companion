package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CalendarTest {
    @Test
    fun `instants become UTC stamps and events carry an alarm`() {
        assertEquals("20250920T044500Z", Calendar.utcStamp("2025-09-20T10:15:00+05:30"))
        val bundle = EventBundle(
            id = "e", name = "IndiaFOSS 2025", timezone = "Asia/Kolkata",
            start = "2025-09-20T09:00:00+05:30", end = "2025-09-21T18:00:00+05:30",
            activities = listOf(Activity(id = "t", title = "Talk; one, two", start = "2025-09-20T10:15:00+05:30", end = "2025-09-20T10:30:00+05:30", locationId = "audi-1")),
            locations = listOf(Location(id = "audi-1", name = "Audi 1")),
        )
        val ics = Calendar.ics(bundle, bundle.activities)
        assertTrue(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0"))
        assertTrue("SUMMARY:Talk\\; one\\, two" in ics)
        assertTrue("DTSTART:20250920T044500Z" in ics && "DTEND:20250920T050000Z" in ics)
        assertTrue("LOCATION:Audi 1" in ics && "TRIGGER:-PT10M" in ics)
        assertTrue(ics.endsWith("END:VCALENDAR\r\n"))
    }
}
