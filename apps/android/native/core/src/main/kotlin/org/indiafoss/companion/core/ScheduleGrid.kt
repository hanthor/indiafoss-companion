package org.indiafoss.companion.core

/**
 * The time × room grid the PWA draws on Schedule (`TimelineGrid.svelte`),
 * as numbers a screen can lay out: one column per room, one slot per
 * session with its offset and height in minutes of wall time, and lanes for
 * sessions that overlap inside one room. Pure Kotlin so the rules can be
 * tested without a renderer; the Compose grid only multiplies minutes by a
 * pixel scale.
 *
 * Semantics mirror the web component deliberately:
 * - a session needs a room, a start and an end after its start to be drawn;
 * - rooms are ordered by id with numeric-aware comparison (`hall-2` before `hall-10`);
 * - the day starts at the earliest start and ends at the latest end, never
 *   shorter than an hour;
 * - hour ticks fall on whole hours of the event's offset;
 * - inside a room, a session takes the first lane that is free by its start.
 */
object ScheduleGrid {
    /** The web draws 12px minimum at 2px per minute: six minutes of height. */
    const val MIN_SLOT_MINUTES = 6

    data class Slot(
        val activity: Activity,
        /** Minutes from the start of the grid. */
        val topMinutes: Int,
        /** Never below [MIN_SLOT_MINUTES], so a lightning talk stays tappable. */
        val heightMinutes: Int,
        /** Zero-based lane inside the column. */
        val lane: Int,
        /** Lanes in the column, always at least one. */
        val lanes: Int,
    )

    data class Column(val locationId: String, val name: String, val slots: List<Slot>)

    data class Tick(val minutesFromStart: Int, val label: String)

    data class Layout(
        /** Epoch millis of the top of the grid. */
        val startMs: Long,
        val totalMinutes: Int,
        val ticks: List<Tick>,
        val columns: List<Column>,
    )

    /** Rooms with at least one session among [activities], in the bundle's order: the PWA's room filter chips. */
    fun rooms(bundle: EventBundle, activities: List<Activity>): List<Location> {
        val used = activities.mapNotNull { it.locationId }.toSet()
        return bundle.locations.filter { it.id in used }
    }

    fun layout(bundle: EventBundle, activities: List<Activity>, day: String): Layout {
        val drawable = activities.filter { drawable(it) }
        val starts = activities.mapNotNull { it.start }.sorted()
        val ends = activities.mapNotNull { it.end }.sorted()
        val offset = starts.firstOrNull()?.let(Schedule::offsetMinutes) ?: DEFAULT_OFFSET_MINUTES
        val startMs = starts.firstOrNull()?.let(Schedule::parseInstant)
            ?: Schedule.parseInstant("${day}T00:00:00" + offsetSuffix(offset))
        val endMs = ends.lastOrNull()?.let(Schedule::parseInstant) ?: (startMs + HOUR_MS)
        val totalMinutes = maxOf(60L, (endMs - startMs) / MINUTE_MS).toInt()

        val ticks = ArrayList<Tick>()
        val offsetMs = offset * MINUTE_MS
        var tick = Math.floorDiv(startMs + offsetMs + HOUR_MS - 1, HOUR_MS) * HOUR_MS - offsetMs
        while (tick <= endMs + MINUTE_MS) {
            ticks += Tick(((tick - startMs) / MINUTE_MS).toInt(), Schedule.formatTime(Schedule.formatInstant(tick, offset)))
            tick += HOUR_MS
        }

        val columns = drawable.groupBy { it.locationId!! }
            .toSortedMap(naturalOrder)
            .map { (locationId, sessions) ->
                Column(locationId, bundle.location(locationId)?.name ?: locationId, lanes(sessions, startMs))
            }
        return Layout(startMs, totalMinutes, ticks, columns)
    }

    /** Lane assignment for one room: first-fit by start, the web's §11.2 rule. */
    fun lanes(sessions: List<Activity>, startMs: Long): List<Slot> {
        val sorted = sessions.filter { drawable(it) }.sortedBy { Schedule.parseInstant(it.start!!) }
        val laneEnds = ArrayList<Long>()
        val assigned = sorted.map { activity ->
            val s = Schedule.parseInstant(activity.start!!)
            val e = Schedule.parseInstant(activity.end!!)
            var lane = laneEnds.indexOfFirst { it <= s }
            if (lane == -1) {
                lane = laneEnds.size
                laneEnds += 0L
            }
            laneEnds[lane] = maxOf(laneEnds[lane], e)
            activity to lane
        }
        val lanes = maxOf(1, laneEnds.size)
        return assigned.map { (activity, lane) ->
            val s = Schedule.parseInstant(activity.start!!)
            val e = Schedule.parseInstant(activity.end!!)
            Slot(
                activity = activity,
                topMinutes = ((s - startMs) / MINUTE_MS).toInt(),
                heightMinutes = maxOf(MIN_SLOT_MINUTES.toLong(), (e - s) / MINUTE_MS).toInt(),
                lane = lane,
                lanes = lanes,
            )
        }
    }

    private fun drawable(a: Activity): Boolean =
        a.locationId != null && a.start != null && a.end != null &&
            Schedule.parseInstant(a.end) > Schedule.parseInstant(a.start)

    private fun offsetSuffix(minutes: Int): String {
        val sign = if (minutes < 0) '-' else '+'
        val abs = kotlin.math.abs(minutes)
        return "%c%02d:%02d".format(sign, abs / 60, abs % 60)
    }

    /** `localeCompare(…, { numeric: true })`: digit runs compare by value, the rest by text. */
    val naturalOrder: Comparator<String> = Comparator { a, b ->
        val ta = tokens(a)
        val tb = tokens(b)
        for (i in 0 until minOf(ta.size, tb.size)) {
            val x = ta[i]
            val y = tb[i]
            val c = if (x.all { it.isDigit() } && y.all { it.isDigit() }) {
                x.toBigInteger().compareTo(y.toBigInteger()).takeIf { it != 0 } ?: x.length.compareTo(y.length)
            } else {
                x.compareTo(y, ignoreCase = true).takeIf { it != 0 } ?: x.compareTo(y)
            }
            if (c != 0) return@Comparator c
        }
        ta.size.compareTo(tb.size)
    }

    private fun tokens(s: String): List<String> = Regex("\\d+|\\D+").findAll(s).map { it.value }.toList()

    private const val MINUTE_MS = 60_000L
    private const val HOUR_MS = 3_600_000L
    private const val DEFAULT_OFFSET_MINUTES = 330
}
