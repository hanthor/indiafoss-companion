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
    data class Item(val activity: Activity, val reason: Reason, val block: CustomBlock? = null)

    enum class Reason { MUST_ATTEND, BOOKMARKED, RANKED, BLOCK }

    /**
     * A block of the attendee's own (#110, the web solver's custom and
     * flexible items): a fixed one has a start and end and is placed before
     * any session; a flexible one has only a duration and takes the largest
     * free gap of the day once the sessions are placed. A booth visit is a
     * flexible block with the booth's location.
     */
    data class CustomBlock(
        val id: String,
        val label: String,
        val start: String? = null,
        val end: String? = null,
        val durationMinutes: Int = 30,
        val locationId: String? = null,
    ) {
        val flexible: Boolean get() = start == null || end == null
    }

    fun forDay(
        bundle: EventBundle,
        day: String,
        ratingOf: (String) -> Double,
        dispositionOf: (String) -> Disposition,
        bookmarked: (String) -> Boolean,
        minimumRating: Double = 0.0,
        blocks: List<CustomBlock> = emptyList(),
    ): List<Item> {
        val candidates = Schedule.activitiesForDay(bundle, day)
            .filter { !it.cancelled && it.type != "meal" && it.start != null && it.end != null }
            .filter { dispositionOf(it.id) != Disposition.NOT_INTERESTED }
        val placed = ArrayList<Item>()
        fun free(activity: Activity): Boolean = placed.none { overlaps(it.activity, activity) }
        fun take(items: List<Activity>, reason: Reason) {
            for (activity in items) if (free(activity)) placed += Item(activity, reason)
        }
        // The attendee's own fixed blocks come first: nothing displaces them.
        for (block in blocks.filter { !it.flexible && it.start!!.startsWith(day) }) {
            placed += Item(block.asActivity(), Reason.BLOCK, block)
        }
        take(candidates.filter { dispositionOf(it.id) == Disposition.MUST_ATTEND }, Reason.MUST_ATTEND)
        take(candidates.filter { bookmarked(it.id) }, Reason.BOOKMARKED)
        take(
            candidates.filter { ratingOf(it.id) >= minimumRating }
                .sortedWith(compareByDescending<Activity> { ratingOf(it.id) }.thenBy { it.start }),
            Reason.RANKED,
        )
        // Flexible blocks go into the largest free gap that fits, longest block first.
        val dayStart = Schedule.activitiesForDay(bundle, day).mapNotNull { it.start }.minOrNull()
        val dayEnd = Schedule.activitiesForDay(bundle, day).mapNotNull { it.end }.maxOrNull()
        if (dayStart != null && dayEnd != null) {
            for (block in blocks.filter { it.flexible }.sortedByDescending { it.durationMinutes }) {
                val gap = largestGap(placed.map { it.activity }, Schedule.parseInstant(dayStart), Schedule.parseInstant(dayEnd))
                    ?: continue
                val needed = block.durationMinutes * 60_000L
                if (gap.second - gap.first < needed) continue
                val offset = Schedule.offsetMinutes(dayStart)
                val start = Schedule.formatInstant(gap.first, offset)
                val end = Schedule.formatInstant(gap.first + needed, offset)
                val fixed = block.copy(start = start, end = end)
                placed += Item(fixed.asActivity(), Reason.BLOCK, fixed)
            }
        }
        return placed.sortedBy { it.activity.start }
    }

    private fun CustomBlock.asActivity(): Activity =
        Activity(id = id, title = label, type = "custom", start = start, end = end, locationId = locationId, flexible = flexible)

    /** The widest free window between placed items, as (startMs, endMs). */
    fun largestGap(placed: List<Activity>, dayStartMs: Long, dayEndMs: Long): Pair<Long, Long>? {
        val busy = placed.filter { it.start != null && it.end != null }
            .map { Schedule.parseInstant(it.start!!) to Schedule.parseInstant(it.end!!) }
            .sortedBy { it.first }
        var cursor = dayStartMs
        var best: Pair<Long, Long>? = null
        for ((s, e) in busy) {
            if (s > cursor && (best == null || s - cursor > best.second - best.first)) best = cursor to s
            if (e > cursor) cursor = e
        }
        if (dayEndMs > cursor && (best == null || dayEndMs - cursor > best.second - best.first)) best = cursor to dayEndMs
        return best
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
