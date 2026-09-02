package org.indiafoss.companion.core

/**
 * Schedule maths on ISO-8601 strings with a fixed offset, ported from
 * `@indiafoss/schedule`. Deliberately string-based: the bundle's instants
 * already carry the event's offset, so nothing needs a timezone database.
 */
object Schedule {
    /** Must-attend sessions get an earlier nudge than an ordinary bookmark. */
    const val MUST_ATTEND_HEADS_UP_MINUTES = 30

    /** Epoch millis for an ISO instant such as `2025-09-20T10:15:00+05:30`. */
    fun parseInstant(iso: String): Long {
        val match = INSTANT.matchEntire(iso.trim())
            ?: throw IllegalArgumentException("Invalid ISO instant: $iso")
        val (y, mo, d, h, mi) = match.destructured.toList().take(5).map { it.toInt() }
        val seconds = match.groupValues[6].ifEmpty { "0" }.toInt()
        val days = daysFromCivil(y, mo, d)
        val local = days * 86_400L + h * 3600L + mi * 60L + seconds
        return (local - offsetSeconds(match.groupValues[7])) * 1000L
    }

    /** `10:15` for an instant, in the offset the instant itself carries. */
    fun formatTime(iso: String): String = iso.substring(11, 16)

    /** `2025-09-20` for an instant, in the offset the instant itself carries. */
    fun dayKey(iso: String): String = iso.substring(0, 10)

    /** Distinct day keys with at least one placed activity, in order. */
    fun eventDays(bundle: EventBundle): List<String> =
        bundle.activities.mapNotNull { it.start }.map(::dayKey).distinct().sorted()

    fun activitiesForDay(bundle: EventBundle, day: String): List<Activity> =
        bundle.activities
            .filter { it.start != null && dayKey(it.start) == day }
            .sortedWith(compareBy({ it.start }, { it.locationId ?: "" }))

    /** Sessions running at `now`, the next one, and which event day it is. */
    fun nowState(bundle: EventBundle, now: String): NowState {
        val nowMs = parseInstant(now)
        val placed = bundle.activities.filter { !it.cancelled && it.start != null && it.end != null }
        val current = placed.filter {
            parseInstant(it.start!!) <= nowMs && nowMs < parseInstant(it.end!!)
        }.sortedBy { it.start }
        val next = placed.filter { parseInstant(it.start!!) > nowMs }.minByOrNull { it.start!! }
        val days = eventDays(bundle)
        val today = dayKey(now).takeIf { days.contains(it) }
        return NowState(
            phase = when {
                days.isEmpty() -> EventPhase.BEFORE
                nowMs < parseInstant(bundle.start) -> EventPhase.BEFORE
                nowMs > parseInstant(bundle.end) -> EventPhase.AFTER
                else -> EventPhase.DURING
            },
            current = current,
            next = next,
            day = today,
            dayIndex = today?.let { days.indexOf(it) } ?: 0,
        )
    }

    /** How far through a session `now` is, 0..1. */
    fun progress(activity: Activity, now: String): Float {
        val start = activity.start?.let(::parseInstant) ?: return 0f
        val end = activity.end?.let(::parseInstant) ?: return 0f
        if (end <= start) return 0f
        val fraction = (parseInstant(now) - start).toDouble() / (end - start).toDouble()
        return fraction.coerceIn(0.0, 1.0).toFloat()
    }

    /** Whole minutes from `now` until `iso`, negative once it has passed. */
    fun minutesUntil(iso: String, now: String): Long {
        val delta = parseInstant(iso) - parseInstant(now)
        return Math.floorDiv(delta + if (delta > 0) 59_999 else 0, 60_000L)
    }

    private val INSTANT =
        Regex("""(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|z|[+-]\d{2}:?\d{2})?""")

    private fun offsetSeconds(raw: String): Long {
        if (raw.isEmpty() || raw.equals("Z", ignoreCase = true)) return 0
        val sign = if (raw.startsWith("-")) -1 else 1
        val digits = raw.drop(1).replace(":", "")
        return sign * (digits.take(2).toLong() * 3600 + digits.drop(2).toLong() * 60)
    }

    /** Days since the epoch for a civil date (Howard Hinnant's algorithm). */
    private fun daysFromCivil(year: Int, month: Int, day: Int): Long {
        val y = if (month <= 2) year - 1 else year
        val era = Math.floorDiv(y.toLong(), 400L)
        val yoe = y - era * 400
        val doy = (153 * (month + (if (month > 2) -3 else 9)) + 2) / 5 + day - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468
    }
}

enum class EventPhase { BEFORE, DURING, AFTER }

data class NowState(
    val phase: EventPhase,
    val current: List<Activity>,
    val next: Activity?,
    val day: String?,
    val dayIndex: Int,
)
