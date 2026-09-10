package org.indiafoss.companion.core

/**
 * A day's plan from the ratings: at every moment, the best-rated session the
 * attendee can actually be in. Must-attend sessions are placed first and
 * never displaced; then bookmarks, then the rest by rating, each taken only
 * when it does not overlap what is already placed. Not-interested sessions
 * and source meal rows are never placed as talks. A talk that stood aside in
 * a clash (#271, `yieldsTo`) is left out only while its winner is live on the
 * day, and never when it is must-go. One lunch opportunity may
 * occupy a free official lunch window. This is the greedy core of the web solver
 * (`@indiafoss/solver`), enough for a native plan that agrees with the
 * ranking; walking time between rooms is left to the leave-by logic.
 */
object Itinerary {
    data class Item(val activity: Activity, val reason: Reason, val block: CustomBlock? = null)

    enum class Reason { MUST_ATTEND, BOOKMARKED, RANKED, BLOCK, LUNCH }

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
        stayTrackIds: Set<String> = emptySet(),
        yieldsTo: (String) -> String? = { null },
    ): List<Item> {
        val eligible = Schedule.activitiesForDay(bundle, day)
            .filter { !it.cancelled && it.type != "meal" && it.start != null && it.end != null }
            .filter { dispositionOf(it.id) != Disposition.NOT_INTERESTED }
        val yields = Yields.resolve(eligible, dispositionOf, stayTrackIds, yieldsTo)
        val candidates = eligible.filter { it.id !in yields.stoodAside }
        val selected = candidates.filter { it.trackId in stayTrackIds }
        val ranges = trackRanges(bundle, day, stayTrackIds)
        // A reserved block keeps other talks out, except the one the attendee chose over the devroom's own talk (#271).
        fun reserved(a: Activity): Boolean = ranges.any { (track, range) ->
            a.trackId != track && a.start!! < range.second && a.end!! > range.first && track !in yields.leftFor[a.id].orEmpty()
        }
        val placed = ArrayList<Item>()
        fun free(activity: Activity): Boolean = placed.none { overlaps(it.activity, activity) }
        fun take(items: List<Activity>, reason: Reason) {
            for (activity in items) if (free(activity)) placed += Item(activity, reason)
        }
        // The attendee's own fixed blocks come first: nothing displaces them.
        for (block in blocks.filter { !it.flexible && it.start!!.startsWith(day) }) {
            placed += Item(block.asActivity(), Reason.BLOCK, block)
        }
        take(selected, Reason.MUST_ATTEND)
        take(candidates.filter { dispositionOf(it.id) == Disposition.MUST_ATTEND && !reserved(it) }, Reason.MUST_ATTEND)
        take(candidates.filter { bookmarked(it.id) && !reserved(it) }, Reason.BOOKMARKED)
        take(
            candidates.filter { ratingOf(it.id) >= minimumRating && !reserved(it) }
                .sortedWith(compareByDescending<Activity> { ratingOf(it.id) }.thenBy { it.start }),
            Reason.RANKED,
        )
        // Flexible blocks go into the largest free gap that fits, longest block first.
        val dayStart = Schedule.activitiesForDay(bundle, day).mapNotNull { it.start }.minOrNull()
        val dayEnd = Schedule.activitiesForDay(bundle, day).mapNotNull { it.end }.maxOrNull()
        if (dayStart != null && dayEnd != null) {
            for (block in blocks.filter { it.flexible }.sortedByDescending { it.durationMinutes }) {
                val reservedBlocks = ranges.map { (track, range) -> Activity("reserved-$track", track, start = range.first, end = range.second) }
                val gap = largestGap(placed.map { it.activity } + reservedBlocks, Schedule.parseInstant(dayStart), Schedule.parseInstant(dayEnd))
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
        // Room lunch rows describe availability, not competing sessions. Place one
        // food-area break only after talks and attendee blocks have claimed their time.
        if (blocks.none { it.label.contains("lunch", ignoreCase = true) && (it.flexible || it.start!!.startsWith(day)) }) {
            lunchOpportunity(bundle, day, placed.map { it.activity })?.let {
                placed += Item(it, Reason.LUNCH)
            }
        }
        return placed.sortedBy { it.activity.start }
    }

    private fun lunchOpportunity(bundle: EventBundle, day: String, placed: List<Activity>): Activity? {
        val busy = placed.filter { it.start != null && it.end != null }
            .map { Schedule.parseInstant(it.start!!) to Schedule.parseInstant(it.end!!) }
            .sortedBy { it.first }
        if (busy.size < 2) return null
        val windows = Schedule.activitiesForDay(bundle, day)
            .filter { !it.cancelled && it.type == "meal" && it.title.contains("lunch", ignoreCase = true) && it.start != null && it.end != null }
            .sortedBy { it.start }
        val duration = 30 * 60_000L
        for (window in windows) {
            var cursor = maxOf(Schedule.parseInstant(window.start!!), busy.first().second)
            val end = minOf(Schedule.parseInstant(window.end!!), busy.last().first)
            for ((start, finish) in busy) {
                if (minOf(start, end) - cursor >= duration) {
                    val offset = Schedule.offsetMinutes(window.start!!)
                    return Activity(
                        id = "flex-lunch-$day", title = "Lunch · food area", type = "meal",
                        start = Schedule.formatInstant(cursor, offset),
                        end = Schedule.formatInstant(cursor + duration, offset),
                        flexible = true,
                    )
                }
                cursor = maxOf(cursor, finish)
                if (cursor >= end) break
            }
        }
        return null
    }

    private fun CustomBlock.asActivity(): Activity =
        Activity(id = id, title = label, type = "custom", start = start, end = end, locationId = locationId, flexible = flexible)

    private fun trackRanges(bundle: EventBundle, day: String, tracks: Set<String>): Map<String, Pair<String, String>> =
        Schedule.activitiesForDay(bundle, day).filter { it.trackId in tracks && !it.cancelled && it.type != "meal" && it.start != null && it.end != null }
            .groupBy { it.trackId!! }.mapValues { (_, sessions) -> sessions.minOf { it.start!! } to sessions.maxOf { it.end!! } }

    /**
     * Conflicts remain visible even where the greedy native plan can place
     * only one item. A must-go talk the attendee chose over a devroom's own
     * talk in a clash (#271) is not reported against that devroom.
     */
    fun stayConflicts(
        bundle: EventBundle,
        day: String,
        tracks: Set<String>,
        dispositionOf: (String) -> Disposition,
        yieldsTo: (String) -> String? = { null },
    ): List<Pair<Activity, Activity>> {
        val eligible = Schedule.activitiesForDay(bundle, day).filter { !it.cancelled && it.type != "meal" && it.start != null && it.end != null && dispositionOf(it.id) != Disposition.NOT_INTERESTED }
        val yields = Yields.resolve(eligible, dispositionOf, tracks, yieldsTo)
        val sessions = eligible.filter { it.id !in yields.stoodAside }
        val ranges = trackRanges(bundle, day, tracks)
        val result = ArrayList<Pair<Activity, Activity>>()
        for ((track, range) in ranges) {
            val selected = sessions.filter { it.trackId == track }
            for (a in selected) for (b in selected) if (a.id < b.id && overlaps(a, b)) result += a to b
            val representative = selected.firstOrNull() ?: continue
            for (other in sessions) {
                if (other.trackId == track || other.start!! >= range.second || other.end!! <= range.first) continue
                if (dispositionOf(other.id) != Disposition.MUST_ATTEND && other.trackId !in tracks) continue
                // The attendee chose this talk over the devroom's own: not a silent conflict.
                if (track in yields.leftFor[other.id].orEmpty()) continue
                result += representative to other
            }
        }
        return result.distinctBy { listOf(it.first.id, it.second.id).sorted() }
    }

    /**
     * Clash losses on a day (#271), the solver's `activeAfterYields` pass: a
     * session that stood aside is out while its winner is live; `leftFor`
     * maps each winner to the reserved devroom tracks the attendee left for
     * it, so a block can be left for one talk without dropping the reservation.
     */
    object Yields {
        data class Resolved(val stoodAside: Set<String>, val leftFor: Map<String, Set<String>>)

        fun resolve(
            eligible: List<Activity>,
            dispositionOf: (String) -> Disposition,
            stayTrackIds: Set<String>,
            yieldsTo: (String) -> String?,
        ): Resolved {
            val live = Ranking.activeAfterYields(eligible, { it.id }, { yieldsTo(it.id) }, { dispositionOf(it.id) == Disposition.MUST_ATTEND })
            val stoodAside = HashSet<String>()
            val leftFor = HashMap<String, MutableSet<String>>()
            for (a in eligible) {
                if (a.id in live) continue
                stoodAside += a.id
                val winner = yieldsTo(a.id) ?: continue
                val track = a.trackId ?: continue
                if (track in stayTrackIds) leftFor.getOrPut(winner) { HashSet() } += track
            }
            return Resolved(stoodAside, leftFor)
        }
    }

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
