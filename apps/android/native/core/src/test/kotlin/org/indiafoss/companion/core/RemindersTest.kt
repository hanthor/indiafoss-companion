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
    /** A fifteen-minute walk, so leave-now and starting-soon stay separate alerts. */
    private val farWalk: (String?) -> Int? = { 900 }
    private val now = Schedule.parseInstant("2025-09-20T09:40:00+05:30")

    @Test
    fun `must attend gets all four tiers in time order`() {
        val out = Reminders.compute(bundle, now, { Reminders.Tier.MUST_ATTEND }, walkSecondsTo = farWalk)
        assertEquals(listOf("leave-t", "must-t", "soon-t", "start-t"), out.map { it.id }.sorted())
        assertEquals(out.sortedBy { it.atMs }, out)
        assertEquals(Schedule.parseInstant("2025-09-20T09:45:00+05:30"), out.first { it.id == "must-t" }.atMs)
    }

    @Test
    fun `planned gets two, silent gets none, and past alerts are dropped`() {
        assertEquals(
            listOf("leave-t", "soon-t"),
            Reminders.compute(bundle, now, { Reminders.Tier.PLANNED }, walkSecondsTo = farWalk).map { it.id }.sorted(),
        )
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
    fun `every alert names the session, the room and the walk, and points at the session`() {
        val out = Reminders.compute(bundle, now, { Reminders.Tier.MUST_ATTEND }, walkSecondsTo = farWalk)
        val soon = out.first { it.id == "soon-t" }
        assertEquals("In 15 min: Talk", soon.title)
        assertEquals("10:15 in Devroom 1 (AOSP) · 15 min walk", soon.body)
        val leave = out.first { it.id == "leave-t" }
        assertEquals("Leave now: Talk", leave.title)
        assertEquals("15 min walk to Devroom 1 (AOSP) · starts 10:15", leave.body)
        assertEquals("t", leave.activityId)
        assertEquals("Must attend · 10:15 in Devroom 1 (AOSP) · 15 min walk", out.first { it.id == "must-t" }.body)
        assertEquals("Starting now: Talk", out.first { it.id == "start-t" }.title)
    }

    @Test
    fun `a short walk merges starting-soon into leave-now, and no location drops the walk`() {
        val near = Reminders.compute(bundle, now, { Reminders.Tier.PLANNED }, walkSecondsTo = { 120 })
        assertEquals(listOf("leave-t"), near.map { it.id })
        assertEquals("2 min walk to Devroom 1 (AOSP) · starts 10:15", near[0].body)
        // With no location set the default walk allowance puts leave-now on top of
        // starting-soon, so they collapse to the one alert that says where to go.
        val unknown = Reminders.compute(bundle, now, { Reminders.Tier.PLANNED })
        assertEquals(listOf("leave-t"), unknown.map { it.id })
        assertEquals("Devroom 1 (AOSP) · starts 10:15", unknown[0].body)
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
