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
        assertEquals(listOf("b", "d"), plan.map { it.activity.id })
        assertEquals(Itinerary.Reason.MUST_ATTEND, plan[0].reason)
        assertEquals(Itinerary.Reason.RANKED, plan[1].reason)
    }

    @Test
    fun `not interested and meals are never placed`() {
        val plan = Itinerary.forDay(
            bundle, "2025-09-20",
            ratingOf = { 1200.0 },
            dispositionOf = { if (it == "a") Disposition.NOT_INTERESTED else Disposition.NORMAL },
            bookmarked = { false },
        )
        assertEquals(listOf("b", "d"), plan.map { it.activity.id })
    }
}
