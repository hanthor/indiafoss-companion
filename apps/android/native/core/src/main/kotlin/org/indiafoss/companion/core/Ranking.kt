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
     * The most useful next pair: clashing sessions first, closest ratings
     * among those, then anything under-ranked. Null when nothing is left.
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
                if (pairKey(a.activity.id, b.activity.id) in alreadyCompared) continue
                val conflict = overlaps(a.activity, b.activity)
                val gap = abs(a.rating - b.rating)
                var score = 0.0
                var reason = Reason.UNDER_RANKED
                if (conflict) {
                    score += 100
                    if (gap <= 150) {
                        score += 50 - gap / 3
                        reason = Reason.CLOSE_RATINGS
                    } else {
                        reason = Reason.CONFLICT
                    }
                }
                if (a.comparisons < 3 || b.comparisons < 3) score += 20
                if (score <= 0) continue
                if (score > bestScore) {
                    bestScore = score
                    best = ComparisonCandidate(a, b, reason)
                }
            }
        }
        return best
    }

    /** Share of clashing pairs whose winner is settled, 0..1. */
    fun stability(pool: List<RankedActivity>): Double {
        val clashes = mutableListOf<Pair<RankedActivity, RankedActivity>>()
        for (i in pool.indices) {
            for (j in i + 1 until pool.size) {
                if (overlaps(pool[i].activity, pool[j].activity)) clashes += pool[i] to pool[j]
            }
        }
        if (clashes.isEmpty()) return 1.0
        val settled = clashes.count { (a, b) -> abs(a.rating - b.rating) >= 2 * K_FACTOR }
        return settled.toDouble() / clashes.size
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
