package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ScheduleDiffTest {
    private fun act(id: String, title: String = id, start: String = "2025-09-20T10:00:00+05:30", room: String? = "audi-1", cancelled: Boolean = false) =
        Activity(id = id, title = title, start = start, end = "2025-09-20T10:30:00+05:30", locationId = room, cancelled = cancelled)

    private fun bundle(vararg activities: Activity) = EventBundle(
        id = "e", name = "E", timezone = "Asia/Kolkata",
        start = "2025-09-20T09:00:00+05:30", end = "2025-09-20T18:00:00+05:30",
        activities = activities.toList(),
        locations = listOf(Location("audi-1", "Audi 1"), Location("audi-2", "Audi 2")),
    )

    @Test
    fun `finds added, cancelled, moved, room, title and speaker changes by id`() {
        val prev = bundle(act("a"), act("b"), act("c"), act("d"), act("gone"))
        val next = bundle(
            act("a", start = "2025-09-20T11:00:00+05:30"),
            act("b", room = "audi-2"),
            act("c", title = "c renamed"),
            act("d", cancelled = true),
            act("new"),
        )
        val changes = ScheduleDiff.between(prev, next)
        assertEquals(
            listOf(ScheduleDiff.Kind.TIME, ScheduleDiff.Kind.ROOM, ScheduleDiff.Kind.TITLE, ScheduleDiff.Kind.CANCELLED, ScheduleDiff.Kind.ADDED, ScheduleDiff.Kind.CANCELLED),
            changes.map { it.kind },
        )
        assertEquals("10:00 → 11:00", changes[0].detail)
        assertEquals("Audi 1 → Audi 2", changes[1].detail)
        assertEquals("1 added, 2 cancelled, 1 moved, 1 room changed, 1 retitled", ScheduleDiff.summary(changes))
    }

    @Test
    fun `an identical revision is a no-op`() {
        val b = bundle(act("a"))
        assertTrue(ScheduleDiff.between(b, b).isEmpty())
        assertEquals("", ScheduleDiff.summary(emptyList()))
    }
}
