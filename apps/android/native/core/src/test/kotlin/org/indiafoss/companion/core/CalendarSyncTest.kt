package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CalendarSyncTest {
    private val owned = 7L
    private val other = 9L
    private val t0 = Schedule.parseInstant("2026-09-26T10:00:00+05:30")
    private val hour = 3_600_000L

    private fun entry(id: String, proposal: String? = null, title: String = "Talk $id", start: Long = t0, room: String? = "Audi 1") =
        PlannedEntry(PlannedIdentity("indiafoss-2026", id, proposal), title, start, start + hour, room, "Asha Menon", "indiafoss://activity/$id")

    private fun row(rowId: Long, entry: PlannedEntry, calendarId: Long = owned) = CalendarRow(
        rowId, calendarId, entry.identity.occurrenceKey, entry.identity.proposalKey,
        entry.title, entry.startMs, entry.endMs, entry.location, entry.description,
    )

    @Test
    fun `identity keys carry event, occurrence and CFP proposal`() {
        val id = PlannedIdentity.of("indiafoss-2026", Activity(id = "act-1", title = "T", proposalId = "cfp-42"))
        assertEquals("indiafoss/indiafoss-2026/act-1", id.occurrenceKey)
        assertEquals("indiafoss/indiafoss-2026/cfp/cfp-42", id.proposalKey)
        assertEquals(null, PlannedIdentity("indiafoss-2026", "act-2", "").proposalKey)
    }

    @Test
    fun `an empty calendar gets one insert per entry, and nothing on the second pass`() {
        val desired = listOf(entry("a"), entry("b", start = t0 + hour))
        val ops = CalendarReconciler.reconcile(desired, emptyList(), owned)
        assertEquals(desired.map { CalendarOp.Insert(it) }, ops)
        val rows = desired.mapIndexed { i, e -> row(i + 1L, e) }
        assertEquals(emptyList(), CalendarReconciler.reconcile(desired, rows, owned))
    }

    @Test
    fun `a moved, renamed or re-roomed session is updated in place`() {
        val before = entry("a")
        val moved = entry("a", start = t0 + 2 * hour, title = "Talk a (moved)", room = "Hall 2")
        val ops = CalendarReconciler.reconcile(listOf(moved), listOf(row(3, before)), owned)
        assertEquals(listOf(CalendarOp.Update(3, moved)), ops)
    }

    @Test
    fun `an entry that leaves the plan is deleted and the others are left alone`() {
        val a = entry("a")
        val b = entry("b", start = t0 + hour)
        val ops = CalendarReconciler.reconcile(listOf(a), listOf(row(1, a), row(2, b)), owned)
        assertEquals(listOf(CalendarOp.Delete(2)), ops)
    }

    @Test
    fun `duplicate rows collapse to the lowest id and a repeated entry is inserted once`() {
        val a = entry("a")
        val ops = CalendarReconciler.reconcile(listOf(a, a), listOf(row(5, a), row(2, a), row(8, a)), owned)
        assertEquals(setOf<CalendarOp>(CalendarOp.Delete(5), CalendarOp.Delete(8)), ops.toSet())
        assertEquals(listOf(CalendarOp.Insert(a)), CalendarReconciler.reconcile(listOf(a, a), emptyList(), owned))
    }

    @Test
    fun `rows in other calendars are never touched even when they look like ours`() {
        val a = entry("a")
        val gone = entry("gone")
        val foreign = listOf(row(11, a, other), row(12, gone, other), row(13, a.copy(title = "Edited by hand"), other))
        assertEquals(listOf(CalendarOp.Insert(a)), CalendarReconciler.reconcile(listOf(a), foreign, owned))
        assertEquals(emptyList(), CalendarReconciler.reconcile(emptyList(), foreign, owned))
    }

    @Test
    fun `a row without the app identity in the app calendar is not ours to remove`() {
        val typedIn = CalendarRow(20, owned, null, null, "Dinner with friends", t0, t0 + hour)
        assertEquals(emptyList(), CalendarReconciler.reconcile(emptyList(), listOf(typedIn), owned))
    }

    @Test
    fun `a regenerated occurrence id for the same proposal updates the row in place`() {
        val old = entry("act-old", proposal = "cfp-42")
        val renewed = entry("act-new", proposal = "cfp-42", start = t0 + hour)
        val ops = CalendarReconciler.reconcile(listOf(renewed), listOf(row(4, old)), owned)
        assertEquals(listOf(CalendarOp.Update(4, renewed)), ops)
        // The update carries the new occurrence key, so the next pass is exact and silent.
        assertEquals(emptyList(), CalendarReconciler.reconcile(listOf(renewed), listOf(row(4, renewed)), owned))
    }

    @Test
    fun `an ambiguous proposal match is not guessed at`() {
        val one = entry("act-1", proposal = "cfp-42")
        val two = entry("act-2", proposal = "cfp-42", start = t0 + 3 * hour)
        val renewed = entry("act-9", proposal = "cfp-42")
        val ops = CalendarReconciler.reconcile(listOf(renewed), listOf(row(1, one), row(2, two)), owned)
        assertEquals(setOf<CalendarOp>(CalendarOp.Insert(renewed), CalendarOp.Delete(1), CalendarOp.Delete(2)), ops.toSet())
        // Two planned occurrences of one proposal against one stale row: insert both, drop the row.
        val twice = CalendarReconciler.reconcile(listOf(one, two), listOf(row(3, renewed)), owned)
        assertEquals(setOf<CalendarOp>(CalendarOp.Insert(one), CalendarOp.Insert(two), CalendarOp.Delete(3)), twice.toSet())
    }

    @Test
    fun `the exact occurrence wins over a proposal match`() {
        val a = entry("act-1", proposal = "cfp-42")
        val stale = entry("act-old", proposal = "cfp-42")
        val ops = CalendarReconciler.reconcile(listOf(a), listOf(row(1, stale), row(2, a)), owned)
        assertEquals(listOf(CalendarOp.Delete(1)), ops)
    }

    @Test
    fun `disconnecting means every owned entry goes and nothing else does`() {
        val a = entry("a")
        val b = entry("b")
        val ops = CalendarReconciler.reconcile(emptyList(), listOf(row(1, a), row(2, b), row(3, a, other)), owned)
        assertEquals(setOf<CalendarOp>(CalendarOp.Delete(1), CalendarOp.Delete(2)), ops.toSet())
    }

    @Test
    fun `the native itinerary becomes entries with identity, room, speakers and a deep link`() {
        val bundle = EventBundle(
            id = "indiafoss-2026", name = "IndiaFOSS 2026", timezone = "Asia/Kolkata",
            start = "2026-09-26T09:00:00+05:30", end = "2026-09-27T18:00:00+05:30",
            activities = listOf(
                Activity(id = "act-1", title = "Talk", start = "2026-09-26T10:00:00+05:30", end = "2026-09-26T10:30:00+05:30", locationId = "audi-1", speakerIds = listOf("p1"), proposalId = "cfp-1", sourceUrl = "https://example.org/t"),
                Activity(id = "unscheduled", title = "Later"),
            ),
            people = listOf(Person("p1", "Asha Menon")),
            locations = listOf(Location("audi-1", "Audi 1")),
        )
        val block = Itinerary.CustomBlock("visit-1", "Visit the booth", "2026-09-26T12:00:00+05:30", "2026-09-26T12:30:00+05:30")
        val items = listOf(
            Itinerary.Item(bundle.activities[0], Itinerary.Reason.BOOKMARKED),
            Itinerary.Item(bundle.activities[1], Itinerary.Reason.RANKED),
            Itinerary.Item(Activity("visit-1", "Visit the booth", type = "custom", start = block.start, end = block.end), Itinerary.Reason.BLOCK, block),
        )
        val entries = PlannedEntries.fromItinerary(bundle, items)
        assertEquals(2, entries.size)
        val talk = entries[0]
        assertEquals(PlannedIdentity("indiafoss-2026", "act-1", "cfp-1"), talk.identity)
        assertEquals("Talk", talk.title)
        assertEquals(Schedule.parseInstant("2026-09-26T10:00:00+05:30"), talk.startMs)
        assertEquals(talk.startMs + 30 * 60_000L, talk.endMs)
        assertEquals("Audi 1", talk.location)
        assertEquals("Asha Menon\nhttps://example.org/t", talk.description)
        assertEquals("indiafoss://activity/act-1", talk.appUri)
        val visit = entries[1]
        assertEquals("indiafoss/indiafoss-2026/visit-1", visit.identity.occurrenceKey)
        assertTrue(visit.appUri == null && visit.identity.proposalKey == null)
    }
}
