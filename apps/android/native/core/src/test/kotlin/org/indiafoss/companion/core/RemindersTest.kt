package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class RemindersTest {
    private val talk = Activity(
        id = "t", title = "Talk", start = "2025-09-20T10:15:00+05:30", end = "2025-09-20T10:30:00+05:30",
    )
    private val bundle = EventBundle(
        id = "e", name = "E", timezone = "Asia/Kolkata",
        start = "2025-09-20T09:00:00+05:30", end = "2025-09-20T18:00:00+05:30", activities = listOf(talk),
    )
    private val now = Schedule.parseInstant("2025-09-20T09:40:00+05:30")

    @Test
    fun `must attend gets all four tiers in time order`() {
        val out = Reminders.compute(bundle, now, { Reminders.Tier.MUST_ATTEND })
        assertEquals(listOf("leave-t", "must-t", "soon-t", "start-t"), out.map { it.id }.sorted())
        assertEquals(out.sortedBy { it.atMs }, out)
        assertEquals(Schedule.parseInstant("2025-09-20T09:45:00+05:30"), out.first { it.id == "must-t" }.atMs)
    }

    @Test
    fun `planned gets two, silent gets none, and past alerts are dropped`() {
        assertEquals(listOf("leave-t", "soon-t"), Reminders.compute(bundle, now, { Reminders.Tier.PLANNED }).map { it.id }.sorted())
        assertEquals(emptyList(), Reminders.compute(bundle, now, { Reminders.Tier.NONE }))
        val late = Schedule.parseInstant("2025-09-20T10:10:00+05:30")
        assertEquals(listOf("start-t"), Reminders.compute(bundle, late, { Reminders.Tier.MUST_ATTEND }).map { it.id })
    }

    @Test
    fun `numeric ids are stable and positive`() {
        assertEquals(Reminders.numericId("soon-abc"), Reminders.numericId("soon-abc"))
        assertTrue(Reminders.numericId("must-x") > 0)
    }
}
