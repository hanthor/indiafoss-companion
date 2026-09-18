package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class RemindersTest {
    private val talk = Activity(
        id = "t", title = "Talk", start = "2025-09-20T10:15:00+05:30", end = "2025-09-20T10:30:00+05:30",
        locationId = "devroom",
    )
    private val bundle = EventBundle(
        id = "e", name = "E", timezone = "Asia/Kolkata",
        start = "2025-09-20T09:00:00+05:30", end = "2025-09-20T18:00:00+05:30", activities = listOf(talk),
        locations = listOf(Location("devroom", "Devroom 1 (AOSP)")),
    )
    private val now = Schedule.parseInstant("2025-09-20T09:40:00+05:30")

    @Test
    fun `must attend gets all three tiers in time order`() {
        val out = Reminders.compute(bundle, now, { Reminders.Tier.MUST_ATTEND })
        assertEquals(listOf("must-t", "soon-t", "start-t"), out.map { it.id }.sorted())
        assertEquals(out.sortedBy { it.atMs }, out)
        assertEquals(Schedule.parseInstant("2025-09-20T09:45:00+05:30"), out.first { it.id == "must-t" }.atMs)
    }

    @Test
    fun `planned gets starting soon only, silent gets none, and past alerts are dropped`() {
        assertEquals(listOf("soon-t"), Reminders.compute(bundle, now, { Reminders.Tier.PLANNED }).map { it.id })
        assertEquals(emptyList(), Reminders.compute(bundle, now, { Reminders.Tier.NONE }))
        val late = Schedule.parseInstant("2025-09-20T10:10:00+05:30")
        assertEquals(listOf("start-t"), Reminders.compute(bundle, late, { Reminders.Tier.MUST_ATTEND }).map { it.id })
    }

    @Test
    fun `numeric ids are stable and positive`() {
        assertEquals(Reminders.numericId("soon-abc"), Reminders.numericId("soon-abc"))
        assertTrue(Reminders.numericId("must-x") > 0)
    }

    @Test
    fun `every alert names the session, the room and the start, with no walk, and points at the session`() {
        val out = Reminders.compute(bundle, now, { Reminders.Tier.MUST_ATTEND })
        val soon = out.first { it.id == "soon-t" }
        assertEquals("In 15 min: Talk", soon.title)
        assertEquals("10:15 in Devroom 1 (AOSP)", soon.body)
        assertEquals("t", soon.activityId)
        assertEquals(Schedule.parseInstant("2025-09-20T10:00:00+05:30"), soon.atMs)
        assertEquals("Must attend · 10:15 in Devroom 1 (AOSP)", out.first { it.id == "must-t" }.body)
        val start = out.first { it.id == "start-t" }
        assertEquals("Starting now: Talk", start.title)
        assertEquals("Devroom 1 (AOSP) · you marked it must attend", start.body)
        assertTrue(out.none { "walk" in it.body.lowercase() || it.id.startsWith("leave-") })
    }

    @Test
    fun `an unknown room says only the start time`() {
        val noRoom = bundle.copy(locations = emptyList())
        val soon = Reminders.compute(noRoom, now, { Reminders.Tier.PLANNED }).single()
        assertEquals("Starts 10:15", soon.body)
    }

    @Test
    fun `a very long session title is trimmed on a word boundary`() {
        val long = "Mesquite MoCap: Democratizing Real-Time Motion Capture with Affordable Open-Source Hardware"
        val trimmed = Reminders.shortTitle(long)
        assertTrue(trimmed.length <= Reminders.MAX_TITLE)
        assertTrue(trimmed.endsWith("\u2026"))
        assertTrue(trimmed.startsWith("Mesquite MoCap"))
        assertEquals("Talk", Reminders.shortTitle("Talk"))
    }
}
