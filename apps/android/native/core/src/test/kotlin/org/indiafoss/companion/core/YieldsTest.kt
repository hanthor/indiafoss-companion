package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Clash losses in the itinerary (#271), the cases of the PWA solver's `yields.test.ts`. */
class YieldsTest {
    private val day = "2026-09-26"
    private fun make(id: String, start: String, end: String, track: String = "devroom-rust") = Activity(
        id = id, title = id, type = "talk",
        start = "${day}T$start:00+05:30", end = "${day}T$end:00+05:30",
        trackId = track, locationId = track,
    )

    private fun bundle(vararg activities: Activity) = EventBundle(
        id = "fixture", name = "Fixture", timezone = "Asia/Kolkata",
        start = "${day}T08:00:00+05:30", end = "${day}T18:00:00+05:30",
        activities = activities.toList(),
    )

    private fun ids(items: List<Itinerary.Item>) = items.filter { it.reason != Itinerary.Reason.LUNCH }.map { it.activity.id }

    private fun plan(
        b: EventBundle,
        ratingOf: (String) -> Double = { 1200.0 },
        dispositionOf: (String) -> Disposition = { Disposition.NORMAL },
        yieldsTo: (String) -> String? = { null },
        stay: Set<String> = emptySet(),
    ) = Itinerary.forDay(b, day, ratingOf, dispositionOf, { false }, stayTrackIds = stay, yieldsTo = yieldsTo)

    @Test
    fun `a talk that stood aside is left out while its winner is live, and comes back when it is not`() {
        val b = bundle(make("a", "11:00", "11:30", "x"), make("b", "11:00", "11:30", "y"), make("c", "11:00", "11:30", "z"))
        val yieldsTo = { id: String -> if (id == "b" || id == "c") "a" else null }
        val ratingOf = { id: String -> if (id == "c") 1400.0 else 1200.0 }
        assertEquals(listOf("a"), ids(plan(b, ratingOf = ratingOf, yieldsTo = yieldsTo)))
        // The winner leaves the day: the losers are live again and the best of them is planned.
        val dispositionOf = { id: String -> if (id == "a") Disposition.NOT_INTERESTED else Disposition.NORMAL }
        assertEquals(listOf("c"), ids(plan(b, ratingOf = ratingOf, dispositionOf = dispositionOf, yieldsTo = yieldsTo)))
    }

    @Test
    fun `a must-go loser never stands aside and the explicit conflict is still reported`() {
        val b = bundle(make("a", "11:00", "11:30", "x"), make("b", "11:00", "11:30", "y"))
        val dispositionOf = { id: String -> if (id == "a" || id == "b") Disposition.MUST_ATTEND else Disposition.NORMAL }
        val yieldsTo = { id: String -> if (id == "b") "a" else null }
        val p = ResolvedPlan.forDay(b, day, { 1200.0 }, dispositionOf, { false }, yieldsTo = yieldsTo)
        assertEquals(listOf(ResolvedPlan.ConflictKind.MUST_ATTEND), p.blockingConflicts.map { it.kind })
        assertEquals(setOf("a", "b"), setOf(p.blockingConflicts.single().a, p.blockingConflicts.single().b))
    }

    @Test
    fun `a later compatible talk is not suppressed by a stood-aside neighbour`() {
        // w (11:00–13:00) stood aside for x (11:00–11:30); y (12:30–13:00) overlaps only w.
        val b = bundle(make("w", "11:00", "13:00", "x"), make("x", "11:00", "11:30", "y"), make("y", "12:30", "13:00", "z"))
        assertEquals(listOf("x", "y"), ids(plan(b, yieldsTo = { if (it == "w") "x" else null })))
    }

    @Test
    fun `leaving a reserved devroom for one talk keeps the rest of the block`() {
        val b = bundle(
            make("d1", "10:00", "10:30"), make("d2", "10:30", "11:00"), make("d3", "11:15", "11:45"),
            make("elsewhere", "10:45", "11:00", "other"), make("tempting", "11:15", "11:45", "other"),
        )
        val ratingOf = { id: String -> if (id == "tempting") 1500.0 else 1200.0 }
        val yieldsTo = { id: String -> if (id == "d2") "elsewhere" else null }
        val p = ResolvedPlan.forDay(b, day, ratingOf, { Disposition.NORMAL }, { false }, stayTrackIds = setOf("devroom-rust"), yieldsTo = yieldsTo)
        assertTrue(p.feasible, p.conflicts.toString())
        // d2 is replaced by the chosen talk; the reservation still keeps 'tempting' out of 11:15.
        assertEquals(listOf("d1", "elsewhere", "d3"), p.items.filter { it.source != ResolvedPlan.Source.LUNCH }.map { it.id })
    }

    @Test
    fun `a must-go winner over a reserved devroom talk is not a devroom conflict`() {
        val b = bundle(make("d1", "10:00", "10:30"), make("d2", "10:30", "11:00"), make("elsewhere", "10:45", "11:00", "other"))
        val dispositionOf = { id: String -> if (id == "elsewhere") Disposition.MUST_ATTEND else Disposition.NORMAL }
        val yieldsTo = { id: String -> if (id == "d2") "elsewhere" else null }
        val p = ResolvedPlan.forDay(b, day, { 1200.0 }, dispositionOf, { false }, stayTrackIds = setOf("devroom-rust"), yieldsTo = yieldsTo)
        assertTrue(p.feasible, p.conflicts.toString())
        assertEquals(listOf("d1", "elsewhere"), p.items.filter { it.source != ResolvedPlan.Source.LUNCH }.map { it.id })
        // Without the yield the same must-go is a devroom conflict, as before.
        val before = ResolvedPlan.forDay(b, day, { 1200.0 }, dispositionOf, { false }, stayTrackIds = setOf("devroom-rust"))
        assertEquals(listOf(ResolvedPlan.ConflictKind.DEVROOM), before.blockingConflicts.map { it.kind })
    }
}
