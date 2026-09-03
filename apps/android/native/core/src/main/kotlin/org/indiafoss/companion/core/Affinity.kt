package org.indiafoss.companion.core

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** One answered comparison, as stored on the device. */
data class ComparisonEntry(val activityA: String, val activityB: String, val scoreA: Double)

/** What the attendee said about a room before ranking. */
enum class RoomPreference { SKIP, LOVE }

/**
 * Taste per track, session type and tag, learnt from the comparison history
 * and the sessions ruled out — a port of `learnAffinity` in `@indiafoss/elo`
 * (docs/ranking.md). A pick for A over B is a vote for everything A is and
 * against everything B is; "not interested" is a vote against; a loved room
 * starts with a head of votes. Votes are shrunk towards zero so one pick
 * cannot demote a whole track.
 */
class AffinityModel(val affinity: Map<String, Double>, val evidence: Map<String, Int>) {
    companion object {
        const val SHRINKAGE = 3
        const val MAX_PRIOR_OFFSET = 60.0
        const val LOVED_ROOM_VOTES = 6

        fun keysOf(activity: Activity): List<String> = buildList {
            add("type:${activity.type}")
            activity.trackId?.let { add("track:$it") }
            activity.tags.forEach { add("tag:${it.trim().lowercase()}") }
        }

        fun learn(
            activities: Collection<RankedActivity>,
            history: Collection<ComparisonEntry>,
            rooms: Map<String, RoomPreference> = emptyMap(),
        ): AffinityModel {
            val byId = activities.associateBy { it.activity.id }
            val votes = HashMap<String, Double>()
            val evidence = HashMap<String, Int>()
            fun vote(id: String, weight: Double) {
                val ranked = byId[id] ?: return
                for (key in keysOf(ranked.activity)) {
                    votes[key] = (votes[key] ?: 0.0) + weight
                    evidence[key] = (evidence[key] ?: 0) + 1
                }
            }
            for (entry in history) {
                val swing = (entry.scoreA - 0.5) * 2
                if (swing == 0.0) continue
                vote(entry.activityA, swing)
                vote(entry.activityB, -swing)
            }
            for (ranked in byId.values) {
                if (ranked.disposition == Disposition.NOT_INTERESTED) vote(ranked.activity.id, -1.0)
            }
            for ((trackId, pref) in rooms) {
                val key = "track:$trackId"
                val weight = if (pref == RoomPreference.LOVE) LOVED_ROOM_VOTES else -LOVED_ROOM_VOTES
                votes[key] = (votes[key] ?: 0.0) + weight
                evidence[key] = (evidence[key] ?: 0) + LOVED_ROOM_VOTES
            }
            val affinity = votes.mapValues { (key, total) -> total / ((evidence[key] ?: 0) + SHRINKAGE) }
            return AffinityModel(affinity, evidence)
        }
    }

    /** Rating offset for a session: mean affinity over its keys, capped. */
    fun priorOffset(activity: Activity): Double {
        val keys = keysOf(activity).filter { it in affinity }
        if (keys.isEmpty()) return 0.0
        val mean = keys.sumOf { affinity[it] ?: 0.0 } / keys.size
        return max(-MAX_PRIOR_OFFSET, min(MAX_PRIOR_OFFSET, mean * MAX_PRIOR_OFFSET))
    }

    /** The prior fades as a session collects its own comparisons; gone after three. */
    fun ratingWithPrior(ranked: RankedActivity): Double {
        val weight = max(0.0, 1.0 - ranked.comparisons / 3.0)
        if (weight == 0.0) return ranked.rating
        return ranked.rating + priorOffset(ranked.activity) * weight
    }

    fun apply(pool: List<RankedActivity>): List<RankedActivity> =
        pool.map { it.copy(rating = ratingWithPrior(it)) }

    /** Tracks pulling up or down, for the "learning your taste" line. */
    fun tasteLine(tracks: List<Track>): String {
        val names = tracks.associate { "track:${it.id}" to it.name }
        return affinity.entries
            .filter { (key, value) -> key in names && (evidence[key] ?: 0) >= 2 && abs(value) >= 0.2 }
            .sortedByDescending { abs(it.value) }
            .take(3)
            .joinToString(" · ") { (key, value) -> "${names[key]} ${if (value > 0) "↑" else "↓"}" }
    }
}
