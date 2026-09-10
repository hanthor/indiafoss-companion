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
        assertEquals("1 added, 2 cancelled, 1 moved, 1 room changed, 1 retitled", ScheduleDiff.summary(changes))
    }

    @Test
    fun `an identical revision is a no-op`() {
        val b = bundle(act("a"))
        assertTrue(ScheduleDiff.between(b, b).isEmpty())
        assertEquals("", ScheduleDiff.summary(emptyList()))
    }

    // ---------- Each change said in a sentence (#312) ----------

    private fun described(prev: EventBundle, next: EventBundle) =
        ScheduleDiff.describe(prev, next).map { it.title to it.description }

    @Test
    fun `a move within a day states both times and does not name the day`() {
        val prev = bundle(act("a", title = "Packaging"))
        val next = bundle(act("a", title = "Packaging", start = "2025-09-20T11:00:00+05:30").copy(end = "2025-09-20T11:30:00+05:30"))
        assertEquals(listOf("Packaging" to "Moved from 10:00\u201310:30 to 11:00\u201311:30."), described(prev, next))
    }

    @Test
    fun `a move to another day names both days`() {
        val prev = bundle(act("a", title = "Packaging"))
        val next = bundle(act("a", title = "Packaging", start = "2025-09-21T10:00:00+05:30").copy(end = "2025-09-21T10:30:00+05:30"))
        assertEquals(
            listOf("Packaging" to "Moved from Sat 20 Sep 10:00\u201310:30 to Sun 21 Sep 10:00\u201310:30."),
            described(prev, next),
        )
    }

    @Test
    fun `a room dropped from the new bundle is still named from the old one`() {
        val prev = bundle(act("a", title = "Packaging", room = "audi-1"))
        // The new revision no longer publishes Audi 1 at all.
        val next = EventBundle(
            id = "e", name = "E", timezone = "Asia/Kolkata",
            start = "2025-09-20T09:00:00+05:30", end = "2025-09-20T18:00:00+05:30",
            activities = listOf(act("a", title = "Packaging", room = "audi-2")),
            locations = listOf(Location("audi-2", "Audi 2")),
        )
        assertEquals(listOf("Packaging" to "Moved from Audi 1 to Audi 2."), described(prev, next))
    }

    @Test
    fun `an unnamed room falls back to its raw id, never to unknown`() {
        val prev = bundle(act("a", title = "Packaging", room = "audi-1"))
        val next = bundle(act("a", title = "Packaging", room = "hall-x"))
        assertEquals(listOf("Packaging" to "Moved from Audi 1 to hall-x."), described(prev, next))
    }

    @Test
    fun `gaining and losing a room and a time are said as such`() {
        val prev = bundle(act("a", title = "Roomless", room = null), act("b", title = "Timed"))
        val next = bundle(
            act("a", title = "Roomless", room = "audi-2"),
            act("b", title = "Timed").copy(start = null, end = null),
        )
        assertEquals(
            listOf(
                "Timed" to "No longer has a time; it was Sat 20 Sep 10:00\u201310:30.",
                "Roomless" to "Room set to Audi 2.",
            ),
            described(prev, next),
        )
    }

    @Test
    fun `added, cancelled, reinstated, renamed and speaker changes each have their own sentence`() {
        val prev = bundle(
            act("cut", title = "Cut"), act("back", title = "Back", cancelled = true),
            act("named", title = "Old name"),
            act("spoken", title = "Spoken").copy(speakerIds = listOf("p1")),
        )
        val next = EventBundle(
            id = "e", name = "E", timezone = "Asia/Kolkata",
            start = "2025-09-20T09:00:00+05:30", end = "2025-09-20T18:00:00+05:30",
            activities = listOf(
                act("cut", title = "Cut", cancelled = true), act("back", title = "Back"),
                act("named", title = "New name"),
                act("spoken", title = "Spoken").copy(speakerIds = listOf("p2", "p3")),
                act("fresh", title = "Fresh"),
            ),
            locations = listOf(Location("audi-1", "Audi 1"), Location("audi-2", "Audi 2")),
            people = listOf(Person("p1", "Asha Menon"), Person("p2", "Dev Rao")),
        )
        assertEquals(
            listOf(
                "Cut" to "No longer on the programme.",
                "Back" to "Back on the programme.",
                "Fresh" to "New session, Sat 20 Sep 10:00\u201310:30 in Audi 1.",
                "New name" to "Renamed from \u201cOld name\u201d.",
                // An unnamed speaker id falls back to the id, as an unnamed room does.
                "Spoken" to "Speakers changed from Asha Menon to Dev Rao, p3.",
            ),
            described(prev, next),
        )
    }

    @Test
    fun `the list leads with what costs most if acted on late`() {
        val prev = bundle(
            act("t", title = "Timed"), act("r", title = "Roomed"), act("n", title = "Named"),
            act("x", title = "Gone"),
        )
        val next = bundle(
            act("t", title = "Timed", start = "2025-09-20T12:00:00+05:30").copy(end = "2025-09-20T12:30:00+05:30"),
            act("r", title = "Roomed", room = "audi-2"),
            act("n", title = "Renamed"),
            act("fresh", title = "Fresh"),
        )
        assertEquals(
            listOf(ScheduleDiff.Kind.CANCELLED, ScheduleDiff.Kind.TIME, ScheduleDiff.Kind.ROOM, ScheduleDiff.Kind.ADDED, ScheduleDiff.Kind.TITLE),
            ScheduleDiff.describe(prev, next).map { it.kind },
        )
    }

    /** The list and the counts come from one diff, so they cannot disagree. */
    @Test
    fun `the description list has exactly the changes the summary counts`() {
        val prev = bundle(act("a"), act("b"))
        val next = bundle(act("a", room = "audi-2"), act("b", title = "b renamed"), act("c"))
        val described = ScheduleDiff.describe(prev, next)
        assertEquals(ScheduleDiff.between(prev, next).size, described.size)
        assertEquals("1 added, 1 room changed, 1 retitled", ScheduleDiff.summary(described.map { it.change }))
        assertTrue(described.all { it.description.isNotBlank() })
    }
}
