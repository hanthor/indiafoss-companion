package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ScheduleTest {
    private fun activity(id: String, start: String?, end: String?, cancelled: Boolean = false) =
        Activity(id = id, title = id, start = start, end = end, cancelled = cancelled)

    private val bundle = EventBundle(
        id = "t",
        name = "Test",
        timezone = "Asia/Kolkata",
        start = "2025-09-20T09:00:00+05:30",
        end = "2025-09-21T18:00:00+05:30",
        activities = listOf(
            activity("a", "2025-09-20T10:00:00+05:30", "2025-09-20T10:45:00+05:30"),
            activity("b", "2025-09-20T10:15:00+05:30", "2025-09-20T10:30:00+05:30"),
            activity("c", "2025-09-20T11:00:00+05:30", "2025-09-20T11:30:00+05:30"),
            activity("d", "2025-09-21T10:00:00+05:30", "2025-09-21T10:30:00+05:30"),
        ),
    )

    @Test
    fun `parses ISO instants with an offset the same way the web app does`() {
        assertEquals(1758343500000L, Schedule.parseInstant("2025-09-20T10:15:00+05:30"))
        // The same moment written in UTC must parse identically.
        assertEquals(
            Schedule.parseInstant("2025-09-20T10:15:00+05:30"),
            Schedule.parseInstant("2025-09-20T04:45:00Z"),
        )
        assertEquals(
            Schedule.parseInstant("2026-02-28T23:59:00Z") + 60_000,
            Schedule.parseInstant("2026-03-01T00:00:00Z"),
        )
    }

    @Test
    fun `formats time and day in the offset the instant carries`() {
        assertEquals("10:15", Schedule.formatTime("2025-09-20T10:15:00+05:30"))
        assertEquals("2025-09-20", Schedule.dayKey("2025-09-20T10:15:00+05:30"))
    }

    @Test
    fun `now state reports what is running and what is next`() {
        val state = Schedule.nowState(bundle, "2025-09-20T10:20:00+05:30")
        assertEquals(EventPhase.DURING, state.phase)
        assertEquals(listOf("a", "b"), state.current.map { it.id })
        assertEquals("c", state.next?.id)
        assertEquals("2025-09-20", state.day)
        assertEquals(0, state.dayIndex)
    }

    @Test
    fun `cancelled sessions never run and never come next`() {
        val withCancelled = bundle.copy(
            activities = bundle.activities.map {
                if (it.id == "c") it.copy(cancelled = true) else it
            },
        )
        val state = Schedule.nowState(withCancelled, "2025-09-20T10:50:00+05:30")
        assertTrue(state.current.isEmpty())
        assertEquals("d", state.next?.id)
    }

    @Test
    fun `event days and per-day listings are ordered`() {
        assertEquals(listOf("2025-09-20", "2025-09-21"), Schedule.eventDays(bundle))
        assertEquals(
            listOf("a", "b", "c"),
            Schedule.activitiesForDay(bundle, "2025-09-20").map { it.id },
        )
    }

    @Test
    fun `progress and minutes until are clamped and rounded like the web app`() {
        val a = bundle.activities.first()
        assertEquals(0f, Schedule.progress(a, "2025-09-20T09:00:00+05:30"))
        assertEquals(1f, Schedule.progress(a, "2025-09-20T12:00:00+05:30"))
        assertTrue(Schedule.progress(a, "2025-09-20T10:15:00+05:30") in 0.32f..0.35f)
        assertEquals(45, Schedule.minutesUntil("2025-09-20T11:00:00+05:30", "2025-09-20T10:15:00+05:30"))
        assertEquals(-15, Schedule.minutesUntil("2025-09-20T10:00:00+05:30", "2025-09-20T10:15:00+05:30"))
    }

    @Test
    fun `an empty programme has no next session`() {
        val empty = bundle.copy(activities = emptyList())
        assertNull(Schedule.nowState(empty, "2025-09-20T10:20:00+05:30").next)
    }
}
