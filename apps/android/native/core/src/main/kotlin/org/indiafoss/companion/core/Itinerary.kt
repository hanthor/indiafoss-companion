package org.indiafoss.companion.core

/**
 * A day's plan from the ratings: at every moment, the best-rated session the
 * attendee can actually be in. Must-attend sessions are placed first and
 * never displaced; then bookmarks, then the rest by rating, each taken only
 * when it does not overlap what is already placed. Not-interested sessions
 * and meals are never placed. This is the greedy core of the web solver
 * (`@indiafoss/solver`), enough for a native plan that agrees with the
 * ranking; walking time between rooms is left to the leave-by logic.
 */
object Itinerary {
    data class Item(val activity: Activity, val reason: Reason)

    enum class Reason { MUST_ATTEND, BOOKMARKED, RANKED }

    fun forDay(
        bundle: EventBundle,
        day: String,
        ratingOf: (String) -> Double,
        dispositionOf: (String) -> Disposition,
        bookmarked: (String) -> Boolean,
        minimumRating: Double = 0.0,
    ): List<Item> {
        val candidates = Schedule.activitiesForDay(bundle, day)
            .filter { !it.cancelled && it.type != "meal" && it.start != null && it.end != null }
            .filter { dispositionOf(it.id) != Disposition.NOT_INTERESTED }
        val placed = ArrayList<Item>()
        fun free(activity: Activity): Boolean = placed.none { overlaps(it.activity, activity) }
        fun take(items: List<Activity>, reason: Reason) {
            for (activity in items) if (free(activity)) placed += Item(activity, reason)
        }
        take(candidates.filter { dispositionOf(it.id) == Disposition.MUST_ATTEND }, Reason.MUST_ATTEND)
        take(candidates.filter { bookmarked(it.id) }, Reason.BOOKMARKED)
        take(
            candidates.filter { ratingOf(it.id) >= minimumRating }
                .sortedWith(compareByDescending<Activity> { ratingOf(it.id) }.thenBy { it.start }),
            Reason.RANKED,
        )
        return placed.sortedBy { it.activity.start }
    }

    fun overlaps(a: Activity, b: Activity): Boolean {
        val aStart = a.start ?: return false
        val aEnd = a.end ?: return false
        val bStart = b.start ?: return false
        val bEnd = b.end ?: return false
        return Schedule.parseInstant(aStart) < Schedule.parseInstant(bEnd) &&
            Schedule.parseInstant(bStart) < Schedule.parseInstant(aEnd)
    }
}
