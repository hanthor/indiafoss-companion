package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals

class ItineraryTest {
    private fun act(id: String, start: String, end: String, type: String = "talk") =
        Activity(id = id, title = id, type = type, start = start, end = end)

    private val bundle = EventBundle(
        id = "e", name = "E", timezone = "Asia/Kolkata",
        start = "2025-09-20T09:00:00+05:30", end = "2025-09-20T18:00:00+05:30",
        activities = listOf(
            act("a", "2025-09-20T10:00:00+05:30", "2025-09-20T10:30:00+05:30"),
            act("b", "2025-09-20T10:00:00+05:30", "2025-09-20T10:30:00+05:30"),
            act("c", "2025-09-20T10:15:00+05:30", "2025-09-20T10:45:00+05:30"),
            act("lunch", "2025-09-20T12:00:00+05:30", "2025-09-20T13:00:00+05:30", type = "meal"),
            act("d", "2025-09-20T14:00:00+05:30", "2025-09-20T14:30:00+05:30"),
        ),
    )

    @Test
    fun `must attend wins over rating, then the best-rated free session`() {
        val ratings = mapOf("a" to 1300.0, "b" to 1200.0, "c" to 1250.0, "d" to 1100.0)
        val plan = Itinerary.forDay(
            bundle, "2025-09-20",
            ratingOf = { ratings[it] ?: 1200.0 },
            dispositionOf = { if (it == "b") Disposition.MUST_ATTEND else Disposition.NORMAL },
            bookmarked = { false },
        )
        assertEquals(listOf("b", "d"), plan.filter { it.reason != Itinerary.Reason.LUNCH }.map { it.activity.id })
        assertEquals(Itinerary.Reason.MUST_ATTEND, plan[0].reason)
        assertEquals(Itinerary.Reason.RANKED, plan.last().reason)
    }

    @Test
    fun `not interested and meals are never placed`() {
        val plan = Itinerary.forDay(
            bundle, "2025-09-20",
            ratingOf = { 1200.0 },
            dispositionOf = { if (it == "a") Disposition.NOT_INTERESTED else Disposition.NORMAL },
            bookmarked = { false },
        )
        assertEquals(listOf("b", "d"), plan.filter { it.reason != Itinerary.Reason.LUNCH }.map { it.activity.id })
    }

    @Test
    fun `a fixed block displaces sessions and a flexible one takes the largest gap`() {
        val fixed = Itinerary.CustomBlock("blk-1", "Coffee with Priya", "2025-09-20T10:00:00+05:30", "2025-09-20T10:45:00+05:30")
        val booth = Itinerary.CustomBlock("blk-2", "Visit the Zulip booth", durationMinutes = 30, locationId = "booths")
        val plan = Itinerary.forDay(
            bundle, "2025-09-20",
            ratingOf = { 1200.0 }, dispositionOf = { Disposition.NORMAL }, bookmarked = { false },
            blocks = listOf(fixed, booth),
        )
        assertEquals(listOf("blk-1", "blk-2", "d"), plan.filter { it.reason != Itinerary.Reason.LUNCH }.map { it.activity.id })
        // The largest gap runs from the block's end to lunch; the visit starts there.
        assertEquals("2025-09-20T10:45:00+05:30", plan[1].activity.start)
        assertEquals("2025-09-20T11:15:00+05:30", plan[1].activity.end)
        assertEquals(Itinerary.Reason.BLOCK, plan[1].reason)
    }

    @Test
    fun `per-room lunches produce one food-area break inside a whole-devroom gap`() {
        val morning = act("morning", "2025-09-20T11:00:00+05:30", "2025-09-20T12:00:00+05:30").copy(trackId = "track")
        val afternoon = act("afternoon", "2025-09-20T13:00:00+05:30", "2025-09-20T14:00:00+05:30").copy(trackId = "track")
        val lunch = act("room-lunch", "2025-09-20T12:00:00+05:30", "2025-09-20T13:00:00+05:30", "meal").copy(title = "Lunch break")
        val plan = Itinerary.forDay(
            bundle.copy(activities = listOf(morning, lunch, lunch.copy(id = "another-room-lunch"), afternoon)),
            "2025-09-20", { 1200.0 }, { Disposition.NORMAL }, { false }, stayTrackIds = setOf("track"),
        )
        assertEquals(listOf("morning", "flex-lunch-2025-09-20", "afternoon"), plan.map { it.activity.id })
        assertEquals("Lunch · food area", plan[1].activity.title)
        assertEquals("2025-09-20T12:00:00+05:30", plan[1].activity.start)
        assertEquals("2025-09-20T12:30:00+05:30", plan[1].activity.end)
    }

    @Test
    fun `lunch never displaces a talk or attendee block`() {
        val busy = act("busy", "2025-09-20T11:00:00+05:30", "2025-09-20T12:45:00+05:30")
        val after = act("after", "2025-09-20T13:00:00+05:30", "2025-09-20T14:00:00+05:30")
        val lunch = act("lunch", "2025-09-20T12:00:00+05:30", "2025-09-20T13:00:00+05:30", "meal")
        val plan = Itinerary.forDay(bundle.copy(activities = listOf(busy, lunch, after)), "2025-09-20", { 1200.0 }, { Disposition.NORMAL }, { false })
        assertEquals(listOf("busy", "after"), plan.map { it.activity.id })
        val ownLunch = Itinerary.CustomBlock("mine", "Lunch with friends", "2025-09-20T12:00:00+05:30", "2025-09-20T12:30:00+05:30")
        val ownPlan = Itinerary.forDay(bundle, "2025-09-20", { 1200.0 }, { Disposition.NORMAL }, { false }, blocks = listOf(ownLunch))
        assertEquals(1, ownPlan.count { it.activity.title.contains("Lunch", ignoreCase = true) })
    }

    @Test
    fun `instants round-trip through formatInstant`() {
        val iso = "2025-09-20T10:45:00+05:30"
        assertEquals(iso, Schedule.formatInstant(Schedule.parseInstant(iso), Schedule.offsetMinutes(iso)))
        assertEquals(330, Schedule.offsetMinutes(iso))
    }
}
