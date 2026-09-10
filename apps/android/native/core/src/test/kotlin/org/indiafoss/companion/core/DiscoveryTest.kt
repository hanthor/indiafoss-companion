package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DiscoveryTest {
    private val day = "2026-09-26"
    private fun talk(id: String, track: String, start: String = "10:00", end: String = "10:30") =
        Activity(id, id, trackId = track, devroomId = track, locationId = track, tags = listOf(track), start = "${day}T$start:00+05:30", end = "${day}T$end:00+05:30")
    private fun bundle(activities: List<Activity>) = EventBundle("fixture", "Fixture", "Asia/Kolkata", "${day}T08:00:00+05:30", "${day}T18:00:00+05:30", activities = activities)

    @Test
    fun `direct positive choices train discovery without comparisons`() {
        val pool = listOf(RankedActivity(talk("liked", "rust"), interest = "yes"), RankedActivity(talk("unrelated", "design")), RankedActivity(talk("similar", "rust")))
        val model = AffinityModel.learn(pool, emptyList())
        assertEquals(listOf("similar", "unrelated"), model.discoveryDeck(pool).map { it.id })
        assertTrue(model.affinity.getValue("track:rust") > 0)
    }

    @Test
    fun `cold discovery samples tracks and excludes direct dislikes`() {
        val pool = listOf(RankedActivity(talk("a", "rust")), RankedActivity(talk("b", "rust")), RankedActivity(talk("c", "design")), RankedActivity(talk("d", "systems")), RankedActivity(talk("no", "design"), disposition = Disposition.NOT_INTERESTED, interest = "no"))
        val deck = AffinityModel.learn(pool, emptyList()).discoveryDeck(pool)
        assertEquals(2, deck.take(2).map { it.trackId }.distinct().size)
        assertTrue(deck.none { it.id == "no" })
    }

    @Test
    fun `whole track reserves gaps but not another programme in the same room`() {
        val b = bundle(listOf(talk("a", "docs", "10:00", "10:30"), talk("b", "docs", "11:00", "11:30"), talk("gap", "other", "10:30", "11:00"), talk("afternoon", "aosp", "14:00", "14:30").copy(locationId = "docs")))
        val plan = Itinerary.forDay(b, day, { 1200.0 }, { Disposition.NORMAL }, { false }, stayTrackIds = setOf("docs"))
        assertEquals(listOf("a", "b", "afternoon"), plan.map { it.activity.id })
        val conflicts = Itinerary.stayConflicts(b, day, setOf("docs"), dispositionOf = { if (it == "gap") Disposition.MUST_ATTEND else Disposition.NORMAL })
        assertTrue(conflicts.any { it.second.id == "gap" })
    }
    @Test fun `exploration survives recomputing the deck after each answer`() {
        val pool = listOf("liked-1", "liked-2", "liked-3").map { RankedActivity(talk(it, "rust"), interest = "yes") } + listOf(RankedActivity(talk("a-similar", "rust")), RankedActivity(talk("z-different", "design")))
        assertEquals("z-different", AffinityModel.learn(pool, emptyList()).discoveryDeck(pool).first().id)
    }

    @Test fun `negative feedback demotes similar unanswered talks`() {
        val pool = listOf(RankedActivity(talk("no", "rust"), interest = "no", disposition = Disposition.NOT_INTERESTED), RankedActivity(talk("a-similar", "rust")), RankedActivity(talk("z-different", "design")))
        assertEquals("z-different", AffinityModel.learn(pool, emptyList()).discoveryDeck(pool).first().id)
    }

}
