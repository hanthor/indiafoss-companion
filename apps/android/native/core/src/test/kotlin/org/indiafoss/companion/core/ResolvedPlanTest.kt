package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ResolvedPlanTest {
    private val day = "2026-09-26"
    private fun iso(t: String) = "${day}T$t:00+05:30"
    private fun act(id: String, start: String, end: String, room: String? = "hall-1", type: String = "talk") =
        Activity(id = id, title = id, type = type, start = iso(start), end = iso(end), locationId = room)

    private val a = act("a", "10:00", "10:30")
    private val b = act("b", "10:00", "10:30", room = "hall-2")
    private val c = act("c", "11:00", "11:30", room = "hall-2")
    private val d = act("d", "14:00", "14:30")

    private fun bundle(vararg activities: Activity) = EventBundle(
        id = "e", name = "E", timezone = "Asia/Kolkata",
        start = iso("09:00"), end = iso("18:00"),
        activities = activities.toList(),
        locations = listOf(Location("hall-1", "Hall 1"), Location("hall-2", "Hall 2")),
    )

    private fun plan(
        bundle: EventBundle,
        mustAttend: Set<String> = emptySet(),
        bookmarks: Set<String> = emptySet(),
        edits: ResolvedPlan.Edits = ResolvedPlan.Edits.NONE,
        stay: Set<String> = emptySet(),
        walk: (String, String) -> Int? = { _, _ -> null },
    ) = ResolvedPlan.forDay(
        bundle, day,
        ratingOf = { 1200.0 },
        dispositionOf = { if (it in mustAttend) Disposition.MUST_ATTEND else Disposition.NORMAL },
        bookmarked = { it in bookmarks },
        edits = edits, stayTrackIds = stay, walkSeconds = walk,
    )

    @Test
    fun `current and next come from the plan, not the whole programme`() {
        val p = plan(bundle(a, b, c, d), mustAttend = setOf("b"))
        assertEquals(listOf("b", "c", "d"), p.items.map { it.id })
        assertTrue(p.feasible)
        // 10:10: b is in progress; a runs too but is not the attendee's.
        assertEquals("b", p.inProgress(iso("10:10"))?.id)
        assertEquals("b", p.nextPlanned(iso("10:10"))?.id)
        assertEquals("c", p.upcoming(iso("10:10"))?.id)
        // 10:45: nothing running, c is next, and it is the destination too.
        assertNull(p.inProgress(iso("10:45")))
        assertEquals("c", p.nextPlanned(iso("10:45"))?.id)
        assertEquals("hall-2", p.destination(iso("10:45"))?.locationId)
        // Past the last item there is nothing left today.
        assertNull(p.nextPlanned(iso("15:00")))
        assertNull(p.upcoming(iso("10:45"), horizonMinutes = 10))
    }

    @Test
    fun `a removed session leaves the plan and comes back when the removal is dropped`() {
        val removed = plan(bundle(a, c, d), bookmarks = setOf("a"), edits = ResolvedPlan.Edits(removed = setOf("a")))
        assertEquals(listOf("c", "d"), removed.items.map { it.id })
        assertEquals("c", removed.nextPlanned(iso("09:00"))?.id)
        assertFalse("a" in removed.plannedIds)
        val restored = plan(bundle(a, c, d), bookmarks = setOf("a"))
        assertEquals(listOf("a", "c", "d"), restored.items.map { it.id })
        assertEquals(ResolvedPlan.Source.BOOKMARKED, restored.items[0].source)
    }

    @Test
    fun `a replacement swaps in and a replacement that left the schedule is a conflict, not a destination`() {
        val swapped = plan(bundle(a, b, c), edits = ResolvedPlan.Edits(replacements = mapOf("a" to "b")))
        assertEquals(listOf("b", "c"), swapped.items.map { it.id })
        assertEquals("a", swapped.items[0].replacedActivityId)
        assertTrue(swapped.items[0].manual)
        assertEquals(ResolvedPlan.Source.REPLACEMENT, swapped.items[0].source)

        val gone = plan(bundle(a, b.copy(cancelled = true), c), edits = ResolvedPlan.Edits(replacements = mapOf("a" to "b")))
        assertFalse(gone.feasible)
        assertEquals(ResolvedPlan.ConflictKind.UNKNOWN_ACTIVITY, gone.conflicts.single().kind)
        assertNull(gone.nextPlanned(iso("09:00")))
        assertNull(gone.destination(iso("09:00")))
        assertNull(gone.upcoming(iso("09:00")))
    }

    @Test
    fun `two overlapping must-go choices are an explicit conflict with no destination`() {
        val p = plan(bundle(a, b, c), mustAttend = setOf("a", "b"))
        assertFalse(p.feasible)
        val conflict = p.blockingConflicts.single()
        assertEquals(ResolvedPlan.ConflictKind.MUST_ATTEND, conflict.kind)
        assertEquals(setOf("a", "b"), setOf(conflict.a, conflict.b))
        assertTrue(conflict.message.contains("must attend"))
        assertNull(p.nextPlanned(iso("09:00")))
        // Removing one of them from the plan resolves it.
        val resolved = plan(bundle(a, b, c), mustAttend = setOf("a", "b"), edits = ResolvedPlan.Edits(removed = setOf("b")))
        assertTrue(resolved.feasible)
        assertEquals("a", resolved.nextPlanned(iso("09:00"))?.id)
    }

    @Test
    fun `a revised start or room follows the current bundle`() {
        val before = plan(bundle(a, c), mustAttend = setOf("c"))
        assertEquals("c", before.upcoming(iso("10:35"))?.id)
        assertEquals(iso("11:00"), before.upcoming(iso("10:35"))?.start)
        val retimed = bundle(a, c.copy(start = iso("12:00"), end = iso("12:30"), locationId = "hall-1"))
        val after = plan(retimed, mustAttend = setOf("c"))
        assertEquals(iso("12:00"), after.nextPlanned(iso("10:35"))?.start)
        assertEquals("hall-1", after.destination(iso("10:35"))?.locationId)
        // Within a 3 h horizon it still counts down; with a 30 min horizon it does not yet.
        assertEquals("c", after.upcoming(iso("10:35"))?.id)
        assertNull(after.upcoming(iso("10:35"), horizonMinutes = 30))
    }

    @Test
    fun `a cancelled must-go leaves the plan and is back when reinstated`() {
        val cancelled = plan(bundle(a, c.copy(cancelled = true), d), mustAttend = setOf("c"))
        assertFalse("c" in cancelled.plannedIds)
        assertTrue(cancelled.feasible)
        assertEquals("d", cancelled.upcoming(iso("10:35"), horizonMinutes = 600)?.id)
        val reinstated = plan(bundle(a, c, d), mustAttend = setOf("c"))
        assertEquals("c", reinstated.upcoming(iso("10:35"))?.id)
        assertEquals(ResolvedPlan.Source.MUST_ATTEND, reinstated.items.first { it.id == "c" }.source)
    }

    @Test
    fun `overlapping fixed blocks are a conflict and a block without a room is never a destination`() {
        val coffee = Itinerary.CustomBlock("blk-1", "Coffee", iso("10:00"), iso("10:20"))
        val call = Itinerary.CustomBlock("blk-2", "Call home", iso("10:10"), iso("10:30"))
        val clash = plan(bundle(c), edits = ResolvedPlan.Edits(blocks = listOf(coffee, call)))
        assertFalse(clash.feasible)
        assertEquals(ResolvedPlan.ConflictKind.OVERLAP, clash.blockingConflicts.single().kind)

        val alone = plan(bundle(c), edits = ResolvedPlan.Edits(blocks = listOf(coffee)))
        assertTrue(alone.feasible)
        val next = alone.nextPlanned(iso("09:00"))!!
        assertEquals("blk-1", next.id)
        assertFalse(next.isSession)
        assertNull(alone.destination(iso("09:00")))
        assertEquals("blk-1", alone.upcoming(iso("09:00"))?.id)
    }

    @Test
    fun `a devroom reservation clashing with a must-go is a conflict`() {
        val track = act("t1", "10:00", "11:00", room = "hall-2").copy(trackId = "aosp")
        val p = plan(bundle(a, track), mustAttend = setOf("a"), stay = setOf("aosp"))
        assertFalse(p.feasible)
        assertEquals(ResolvedPlan.ConflictKind.DEVROOM, p.blockingConflicts.single().kind)
    }

    @Test
    fun `a tight transfer is a warning, not an infeasible plan`() {
        val first = act("first", "10:00", "10:30", room = "hall-1")
        val second = act("second", "10:32", "11:00", room = "hall-2")
        val p = plan(bundle(first, second), mustAttend = setOf("first", "second"), walk = { _, _ -> 300 })
        assertTrue(p.feasible)
        assertEquals(ResolvedPlan.ConflictKind.TRAVEL, p.warnings.single().kind)
        assertEquals("first", p.nextPlanned(iso("09:00"))?.id)
        // Same room: no walk, no warning.
        assertTrue(plan(bundle(first, second.copy(locationId = "hall-1")), mustAttend = setOf("first", "second"), walk = { _, _ -> 300 }).warnings.isEmpty())
    }

    @Test
    fun `reminders come from feasible plans only and every planned item gets a tier`() {
        val now = Schedule.parseInstant(iso("09:00"))
        val ok = plan(bundle(a, c, d), mustAttend = setOf("c"), bookmarks = setOf("a"))
        val ids = Reminders.forPlans(listOf(ok), { null }, now, { if (it == "c") Disposition.MUST_ATTEND else Disposition.NORMAL }).map { it.id }
        assertTrue("must-c" in ids && "start-c" in ids, ids.toString())
        assertTrue("leave-a" in ids, ids.toString())
        // d is only the programme's pick, and still on the plan, so it is planned too.
        assertTrue("leave-d" in ids, ids.toString())
        assertTrue(ids.none { it.startsWith("must-a") })

        val conflicted = plan(bundle(a, b, c), mustAttend = setOf("a", "b"))
        assertEquals(emptyList(), Reminders.forPlans(listOf(conflicted), { null }, now, { Disposition.MUST_ATTEND }))

        // The lunch gap is never an alert; a block of the attendee's own is.
        val lunch = act("lunch", "12:00", "13:00", room = null, type = "meal")
        val withLunch = plan(bundle(a, lunch, d), bookmarks = setOf("a"), edits = ResolvedPlan.Edits(blocks = listOf(Itinerary.CustomBlock("blk", "Coffee", iso("11:00"), iso("11:20")))))
        val lunchIds = Reminders.forPlans(listOf(withLunch), { null }, now, { Disposition.NORMAL }).map { it.id }
        assertTrue(lunchIds.none { it.contains("flex-lunch") }, lunchIds.toString())
        assertTrue("leave-blk" in lunchIds, lunchIds.toString())
    }

    @Test
    fun `reconciling cancels what left the plan and never arms an id twice`() {
        val now = Schedule.parseInstant(iso("09:00"))
        val withA = plan(bundle(a, c), bookmarks = setOf("a", "c"))
        val first = Reminders.reconcile(emptySet(), Reminders.forPlans(listOf(withA), { null }, now, { Disposition.NORMAL }))
        assertEquals(emptySet(), first.cancel)
        assertEquals(setOf("leave-a", "leave-c"), first.armed)
        // A refresh with the same plan re-sets the same ids and cancels nothing: no duplicates.
        val again = Reminders.reconcile(first.armed, Reminders.forPlans(listOf(withA), { null }, now, { Disposition.NORMAL }))
        assertEquals(emptySet(), again.cancel)
        assertEquals(first.armed, again.armed)
        assertEquals(again.schedule.size, again.schedule.map { it.id }.toSet().size)
        // a leaves the plan: its alarm is cancelled, c's stays.
        val withoutA = plan(bundle(a, c), bookmarks = setOf("a", "c"), edits = ResolvedPlan.Edits(removed = setOf("a")))
        val after = Reminders.reconcile(again.armed, Reminders.forPlans(listOf(withoutA), { null }, now, { Disposition.NORMAL }))
        assertEquals(setOf("leave-a"), after.cancel)
        assertEquals(setOf("leave-c"), after.armed)
        // Reminders off: everything armed is cancelled.
        assertEquals(setOf("leave-c"), Reminders.reconcile(after.armed, emptyList()).cancel)
    }
}
