package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals

class PlanMarkersTest {
    private fun activity(id: String, start: String, end: String, cancelled: Boolean = false) =
        Activity(id = id, title = id, start = "2025-09-20T$start:00+05:30", end = "2025-09-20T$end:00+05:30", locationId = "hall", cancelled = cancelled)

    private val bundle = EventBundle(
        id = "t", name = "Test", timezone = "Asia/Kolkata",
        start = "2025-09-20T09:00:00+05:30", end = "2025-09-20T18:00:00+05:30",
        activities = listOf(
            activity("keynote", "10:00", "10:45"),
            activity("clash", "10:15", "10:30"),
            activity("bookmarked", "11:00", "11:30"),
            activity("loser", "11:00", "11:30"),
            activity("plain", "12:00", "12:30"),
            activity("skipped", "13:00", "13:30"),
            activity("gone", "14:00", "14:30", cancelled = true),
            activity("alone", "15:00", "15:30"),
            activity("spare", "16:00", "16:30"),
        ),
    )

    private val mustAttend = setOf("keynote", "clash")
    private val bookmarks = setOf("bookmarked", "loser", "gone")
    private val triage = mapOf("plain" to null, "skipped" to "no", "alone" to "yes")
    private val ratings = mapOf("bookmarked" to 1600.0, "loser" to 1500.0, "plain" to 1400.0)

    private fun disposition(id: String) = when {
        id in mustAttend -> Disposition.MUST_ATTEND
        id == "skipped" -> Disposition.NOT_INTERESTED
        else -> Disposition.NORMAL
    }

    private fun markers(edits: ResolvedPlan.Edits = ResolvedPlan.Edits.NONE): Map<String, PlanMarker> {
        val plan = ResolvedPlan.forDay(
            bundle, "2025-09-20",
            ratingOf = { ratings[it] ?: Ranking.INITIAL_RATING },
            dispositionOf = ::disposition,
            bookmarked = { it in bookmarks },
            edits = edits,
        )
        return PlanMarker.derive(bundle.activities, plan, ::disposition, { it in bookmarks }, { triage[it] })
    }

    @Test
    fun `a placed must-attend session is a must-go`() {
        assertEquals(PlanMarker.MUST_GO, markers()["keynote"])
    }

    @Test
    fun `a must-attend session displaced by another must-attend stands aside rather than vanishing`() {
        assertEquals(PlanMarker.STOOD_ASIDE, markers()["clash"])
    }

    @Test
    fun `a bookmark in the plan is an interest, the bookmark it beat stands aside`() {
        assertEquals(PlanMarker.INTERESTED, markers()["bookmarked"])
        assertEquals(PlanMarker.STOOD_ASIDE, markers()["loser"])
    }

    @Test
    fun `a session chosen by rating alone is only planned`() {
        assertEquals(PlanMarker.PLANNED, markers()["plain"])
    }

    @Test
    fun `a quick-pass yes that made the plan is an interest`() {
        assertEquals(PlanMarker.INTERESTED, markers()["alone"])
    }

    @Test
    fun `not-interested and cancelled sessions carry no marker`() {
        assertEquals(PlanMarker.NONE, markers()["skipped"])
        assertEquals(PlanMarker.NONE, markers()["gone"])
    }

    @Test
    fun `an interest that nothing overlaps and nothing placed is not stood aside`() {
        // Unplaced for some other reason (here: not in this day's plan at all) is not a lost clash.
        val lone = activity("lone", "16:00", "16:30")
        val empty = ResolvedPlan.Plan("2025-09-20", emptyList(), emptyList())
        val result = PlanMarker.derive(listOf(lone), empty, { Disposition.NORMAL }, { true }, { null })
        assertEquals(PlanMarker.NONE, result["lone"])
    }

    @Test
    fun `a session removed from the plan loses its mark and the bookmark it beat is no longer stood aside`() {
        // Removing the winner (#221) drops its mark; the resolved plan does not refill the slot,
        // so nothing planned overlaps the beaten bookmark any more and it is not stood aside either.
        val result = markers(ResolvedPlan.Edits(removed = setOf("bookmarked")))
        assertEquals(PlanMarker.NONE, result["bookmarked"])
        assertEquals(PlanMarker.NONE, result["loser"])
    }

    @Test
    fun `a replacement is planned in the slot it took and the original is not`() {
        // "spare" is removed from the base so it only enters the plan as the replacement for "plain".
        val result = markers(ResolvedPlan.Edits(removed = setOf("spare"), replacements = mapOf("plain" to "spare")))
        assertEquals(PlanMarker.NONE, result["plain"])
        assertEquals(PlanMarker.PLANNED, result["spare"])
    }

    @Test
    fun `blocks and lunch opportunities never count as placed sessions`() {
        val lunch = Itinerary.Item(activity("flex-lunch", "12:30", "13:00"), Itinerary.Reason.LUNCH)
        val block = Itinerary.CustomBlock("own", "Coffee", "2025-09-20T12:30:00+05:30", "2025-09-20T13:00:00+05:30")
        val blockItem = Itinerary.Item(Activity(block.id, block.label, type = "custom", start = block.start, end = block.end), Itinerary.Reason.BLOCK, block)
        val wanted = activity("wanted", "12:30", "13:00")
        val plan = ResolvedPlan.resolve(bundle, "2025-09-20", listOf(lunch, blockItem))
        val result = PlanMarker.derive(listOf(wanted), plan, { Disposition.NORMAL }, { true }, { null })
        assertEquals(PlanMarker.NONE, result["wanted"])
    }
}
