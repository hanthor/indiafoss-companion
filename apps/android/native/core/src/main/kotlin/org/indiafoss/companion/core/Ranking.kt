package org.indiafoss.companion.core

import kotlin.math.abs
import kotlin.math.pow

/**
 * Elo rating for session ranking, ported from `@indiafoss/elo` so the native
 * client produces the same order as the PWA for the same answers.
 *
 *   E_A = 1 / (1 + 10^((R_B - R_A)/400))
 *   R'_A = R_A + K * (S_A - E_A)
 */
object Ranking {
    const val INITIAL_RATING = 1200.0
    const val K_FACTOR = 32.0

    /** Expected score of A against B. */
    fun expectedScore(ratingA: Double, ratingB: Double): Double =
        1.0 / (1.0 + 10.0.pow((ratingB - ratingA) / 400.0))

    /** Apply one comparison and return the updated pair. */
    fun applyComparison(ratingA: Double, ratingB: Double, choice: Choice): RatingUpdate {
        val k = choice.k
        if (k == 0.0) return RatingUpdate(ratingA, ratingB, neither = true)
        val expectedA = expectedScore(ratingA, ratingB)
        return RatingUpdate(
            ratingA = ratingA + k * (choice.scoreA - expectedA),
            ratingB = ratingB + k * ((1 - choice.scoreA) - (1 - expectedA)),
            neither = false,
        )
    }

    /** Stable key for a pair so a comparison is never offered twice. */
    fun pairKey(idA: String, idB: String): String =
        if (idA < idB) "$idA|$idB" else "$idB|$idA"

    /**
     * A clash whose ratings differ by at least this much is settled: one
     * ordinary result cannot flip it, so asking is a wasted tap.
     */
    const val SETTLED_GAP = 2 * K_FACTOR

    /**
     * The next pair worth asking about, mirroring `@indiafoss/elo` (#90): only
     * sessions that overlap in time, not already answered, and not settled by
     * a wide rating gap. Closest calls first; a pair neither side of which has
     * been ranked yet counts as new. Null when nothing is left to decide.
     */
    fun selectNext(
        pool: List<RankedActivity>,
        alreadyCompared: Set<String>,
    ): ComparisonCandidate? {
        val eligible = pool.filter { it.disposition != Disposition.NOT_INTERESTED && !it.activity.cancelled }
        if (eligible.size < 2) return null
        var best: ComparisonCandidate? = null
        var bestScore = 0.0
        for (i in eligible.indices) {
            for (j in i + 1 until eligible.size) {
                val a = eligible[i]
                val b = eligible[j]
                if (!overlaps(a.activity, b.activity)) continue
                if (pairKey(a.activity.id, b.activity.id) in alreadyCompared) continue
                val gap = abs(a.rating - b.rating)
                if (gap >= SETTLED_GAP) continue
                val lowInfo = a.comparisons < 3 || b.comparisons < 3
                val fresh = a.comparisons == 0 && b.comparisons == 0
                val score = 100 + (SETTLED_GAP - gap) + (if (lowInfo) 20 else 0) + (if (fresh) 5 else 0)
                val reason = when {
                    fresh -> Reason.NEW
                    gap <= SETTLED_GAP / 2 -> Reason.CLOSE_RATINGS
                    else -> Reason.CONFLICT
                }
                if (best == null || score > bestScore) {
                    bestScore = score
                    best = ComparisonCandidate(a, b, reason)
                }
            }
        }
        return best
    }

    /** Overlapping pairs still needing an answer, and those already settled. */
    data class Progress(val conflicts: Int, val settled: Int) {
        val open: Int get() = conflicts - settled
    }

    fun progress(pool: List<RankedActivity>, alreadyCompared: Set<String>): Progress {
        val eligible = pool.filter { it.disposition != Disposition.NOT_INTERESTED && !it.activity.cancelled }
        var conflicts = 0
        var settled = 0
        for (i in eligible.indices) {
            for (j in i + 1 until eligible.size) {
                val a = eligible[i]
                val b = eligible[j]
                if (!overlaps(a.activity, b.activity)) continue
                conflicts++
                if (pairKey(a.activity.id, b.activity.id) in alreadyCompared ||
                    abs(a.rating - b.rating) >= SETTLED_GAP
                ) {
                    settled++
                }
            }
        }
        return Progress(conflicts, settled)
    }

    /** Share of clashing pairs whose winner is settled, 0..1. */
    fun stability(pool: List<RankedActivity>, alreadyCompared: Set<String> = emptySet()): Double {
        val p = progress(pool, alreadyCompared)
        if (p.conflicts == 0) return 1.0
        return p.settled.toDouble() / p.conflicts
    }

    private fun overlaps(a: Activity, b: Activity): Boolean {
        val aStart = a.start ?: return false
        val aEnd = a.end ?: return false
        val bStart = b.start ?: return false
        val bEnd = b.end ?: return false
        return Schedule.parseInstant(aStart) < Schedule.parseInstant(bEnd) &&
            Schedule.parseInstant(bStart) < Schedule.parseInstant(aEnd)
    }
}

enum class Choice(val scoreA: Double, val k: Double) {
    A(1.0, Ranking.K_FACTOR),
    B(0.0, Ranking.K_FACTOR),
    TIE(0.5, Ranking.K_FACTOR),
    NEITHER(0.5, 0.0),
}

enum class Disposition { NORMAL, MUST_ATTEND, NOT_INTERESTED, WATCH_LATER }

enum class Reason { CONFLICT, CLOSE_RATINGS, UNDER_RANKED, NEW }

data class RankedActivity(
    val activity: Activity,
    val rating: Double = Ranking.INITIAL_RATING,
    val comparisons: Int = 0,
    val disposition: Disposition = Disposition.NORMAL,
)

data class RatingUpdate(val ratingA: Double, val ratingB: Double, val neither: Boolean)

data class ComparisonCandidate(
    val activityA: RankedActivity,
    val activityB: RankedActivity,
    val reason: Reason,
)
