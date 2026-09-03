package org.indiafoss.companion.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RankingTest {
    private fun ranked(id: String, start: String, end: String, rating: Double = Ranking.INITIAL_RATING) =
        RankedActivity(Activity(id = id, title = id, start = start, end = end), rating = rating)

    @Test
    fun `equal ratings expect an even split`() {
        assertEquals(0.5, Ranking.expectedScore(1200.0, 1200.0), 1e-9)
        assertTrue(Ranking.expectedScore(1400.0, 1200.0) > 0.7)
    }

    @Test
    fun `a win moves both ratings by the same amount in opposite directions`() {
        val update = Ranking.applyComparison(1200.0, 1200.0, Choice.A)
        assertEquals(1216.0, update.ratingA, 1e-9)
        assertEquals(1184.0, update.ratingB, 1e-9)
        assertTrue(!update.neither)
        assertEquals(2400.0, update.ratingA + update.ratingB, 1e-9)
    }

    @Test
    fun `neither leaves both ratings untouched`() {
        val update = Ranking.applyComparison(1300.0, 1100.0, Choice.NEITHER)
        assertEquals(1300.0, update.ratingA, 1e-9)
        assertEquals(1100.0, update.ratingB, 1e-9)
        assertTrue(update.neither)
    }

    @Test
    fun `pair keys are order independent`() {
        assertEquals(Ranking.pairKey("b", "a"), Ranking.pairKey("a", "b"))
    }

    @Test
    fun `clashing sessions with close ratings are offered first`() {
        val pool = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30"),
            ranked("b", "2025-09-20T10:30:00+05:30", "2025-09-20T11:30:00+05:30"),
            ranked("c", "2025-09-20T14:00:00+05:30", "2025-09-20T15:00:00+05:30"),
        )
        val candidate = Ranking.selectNext(pool, emptySet())
        assertNotNull(candidate)
        assertEquals(setOf("a", "b"), setOf(candidate.activityA.activity.id, candidate.activityB.activity.id))
        // Neither side ranked yet: a new pair, not a close call.
        assertEquals(Reason.NEW, candidate.reason)
    }

    @Test
    fun `sessions that do not overlap are never offered`() {
        val pool = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30"),
            ranked("c", "2025-09-20T14:00:00+05:30", "2025-09-20T15:00:00+05:30"),
        )
        assertNull(Ranking.selectNext(pool, emptySet()))
    }

    @Test
    fun `a clash settled by a wide gap is not asked again`() {
        val pool = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30", rating = 1200.0 + Ranking.SETTLED_GAP),
            ranked("b", "2025-09-20T10:30:00+05:30", "2025-09-20T11:30:00+05:30"),
        )
        assertNull(Ranking.selectNext(pool, emptySet()))
        val progress = Ranking.progress(pool, emptySet())
        assertEquals(1, progress.conflicts)
        assertEquals(0, progress.open)
    }

    @Test
    fun `a pair already answered is never offered again`() {
        val pool = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30"),
            ranked("b", "2025-09-20T10:30:00+05:30", "2025-09-20T11:30:00+05:30"),
        )
        assertNull(Ranking.selectNext(pool, setOf(Ranking.pairKey("a", "b"))))
    }

    @Test
    fun `not-interested sessions drop out of the pool`() {
        val pool = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30"),
            ranked("b", "2025-09-20T10:30:00+05:30", "2025-09-20T11:30:00+05:30")
                .copy(disposition = Disposition.NOT_INTERESTED),
        )
        assertNull(Ranking.selectNext(pool, emptySet()))
    }

    @Test
    fun `stability is one when nothing clashes and rises as a gap opens`() {
        val noClash = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30"),
            ranked("c", "2025-09-20T14:00:00+05:30", "2025-09-20T15:00:00+05:30"),
        )
        assertEquals(1.0, Ranking.stability(noClash), 1e-9)

        val undecided = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30"),
            ranked("b", "2025-09-20T10:30:00+05:30", "2025-09-20T11:30:00+05:30"),
        )
        assertEquals(0.0, Ranking.stability(undecided), 1e-9)

        val decided = listOf(
            undecided[0].copy(rating = 1300.0),
            undecided[1].copy(rating = 1100.0),
        )
        assertEquals(1.0, Ranking.stability(decided), 1e-9)
        assertTrue(abs(decided[0].rating - decided[1].rating) >= 2 * Ranking.K_FACTOR)
    }
}
