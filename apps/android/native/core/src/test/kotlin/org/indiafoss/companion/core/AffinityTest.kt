package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AffinityTest {
    private fun act(id: String, track: String, start: String, end: String) =
        Activity(id = id, title = id, start = start, end = end, trackId = track, tags = listOf("Beginner"))

    private val a1 = RankedActivity(act("a1", "aosp", "2025-09-20T10:00:00+05:30", "2025-09-20T10:30:00+05:30"), 1216.0, 1)
    private val s1 = RankedActivity(act("s1", "science", "2025-09-20T10:00:00+05:30", "2025-09-20T10:30:00+05:30"), 1184.0, 1)
    private val a2 = RankedActivity(act("a2", "aosp", "2025-09-20T11:00:00+05:30", "2025-09-20T11:30:00+05:30"))
    private val s2 = RankedActivity(act("s2", "science", "2025-09-20T11:00:00+05:30", "2025-09-20T11:30:00+05:30"))

    @Test
    fun `a pick lifts unranked talks of the same track and lowers the other`() {
        val model = AffinityModel.learn(listOf(a1, s1, a2, s2), listOf(ComparisonEntry("a1", "s1", 1.0)))
        assertTrue(model.affinity.getValue("track:aosp") > 0)
        assertTrue(model.affinity.getValue("track:science") < 0)
        assertTrue(model.ratingWithPrior(a2) > model.ratingWithPrior(s2))
    }

    @Test
    fun `a loved room lifts its talks under a settled gap and the prior fades with evidence`() {
        val model = AffinityModel.learn(listOf(a2, s2), emptyList(), mapOf("aosp" to RoomPreference.LOVE))
        val lift = model.ratingWithPrior(a2) - 1200.0
        assertTrue(lift > 20 && lift < Ranking.SETTLED_GAP)
        assertEquals(1200.0, model.ratingWithPrior(a2.copy(comparisons = 3)), 1e-9)
        assertEquals(1200.0, model.ratingWithPrior(s2), 1e-9)
    }

    @Test
    fun `the taste line names tracks with enough evidence`() {
        val model = AffinityModel.learn(
            listOf(a1, s1, a2, s2),
            listOf(ComparisonEntry("a1", "s1", 1.0), ComparisonEntry("a2", "s2", 1.0)),
        )
        val line = model.tasteLine(listOf(Track("aosp", "AOSP"), Track("science", "Science")))
        assertTrue("AOSP ↑" in line && "Science ↓" in line, line)
    }
}
