package org.indiafoss.companion.core

/**
 * Local reminders, the same tiers and the same words as the web app
 * (docs/reminders.md): a must-attend session gets a heads-up 30 minutes
 * before, "starting soon" at 15 and an alert at the start; a planned one
 * gets starting soon; everything else is silent.
 *
 * Every alert names the session, the room and the start time, because a
 * reminder that does not say where to go is only half a reminder. The venue
 * is small, so no alert mentions a walk. Pure: the app hands the result to
 * AlarmManager.
 */
object Reminders {
    enum class Tier { MUST_ATTEND, PLANNED, NONE }

    data class Reminder(
        val id: String,
        val title: String,
        val body: String,
        val atMs: Long,
        /** The session the alert is about, so tapping it opens that session. */
        val activityId: String,
    )

    const val STARTING_SOON_MINUTES = 15

    /** A notification title gets one line on a phone; a longer session title is trimmed on a word. */
    const val MAX_TITLE = 56

    fun shortTitle(title: String, max: Int = MAX_TITLE): String {
        val trimmed = title.trim().replace(Regex("\\s+"), " ")
        if (trimmed.length <= max) return trimmed
        val cut = trimmed.substring(0, max - 1)
        val lastSpace = cut.lastIndexOf(' ')
        val kept = if (lastSpace > max * 0.6) cut.substring(0, lastSpace) else cut
        return kept.trimEnd(' ', ',', '.', ':', ';', '-') + "\u2026"
    }

    fun compute(
        bundle: EventBundle,
        nowMs: Long,
        tierFor: (String) -> Tier,
        lookaheadMinutes: Long = 24 * 60,
    ): List<Reminder> = compute(bundle.activities, bundle::location, nowMs, tierFor, lookaheadMinutes)

    /**
     * Alerts for every planned day (#221): only feasible plans count, and every
     * item in one is planned — must attend where the attendee said so, the
     * planned tier otherwise, blocks of their own included, the lunch gap not.
     * A day with a blocking conflict schedules nothing until it is resolved,
     * as on the web.
     */
    fun forPlans(
        plans: List<ResolvedPlan.Plan>,
        locationOf: (String?) -> Location?,
        nowMs: Long,
        dispositionOf: (String) -> Disposition,
        lookaheadMinutes: Long = 24 * 60,
    ): List<Reminder> {
        val planned = plans.filter { it.feasible }
            .flatMap { plan -> plan.items.filter { it.source != ResolvedPlan.Source.LUNCH }.map { it.activity } }
        return compute(
            planned, locationOf, nowMs,
            tierFor = { id -> if (dispositionOf(id) == Disposition.MUST_ATTEND) Tier.MUST_ATTEND else Tier.PLANNED },
            lookaheadMinutes = lookaheadMinutes,
        )
    }

    /** What AlarmManager has to do to go from the alarms set last time to `wanted`. */
    data class Reconciliation(
        /** Alarm ids to cancel: set before, not wanted now (left the plan, fired, or reminders switched off). */
        val cancel: Set<String>,
        /** Alarms to (re)set, one per id, so nothing is armed twice after a refresh or a restart. */
        val schedule: List<Reminder>,
        /** The ids armed afterwards, to remember for the next round. */
        val armed: Set<String>,
    )

    fun reconcile(previous: Set<String>, wanted: List<Reminder>): Reconciliation {
        val distinct = wanted.distinctBy { it.id }
        val next = distinct.map { it.id }.toSet()
        return Reconciliation(previous - next, distinct, next)
    }

    fun compute(
        activities: List<Activity>,
        locationOf: (String?) -> Location?,
        nowMs: Long,
        tierFor: (String) -> Tier,
        lookaheadMinutes: Long = 24 * 60,
    ): List<Reminder> {
        val out = ArrayList<Reminder>()
        val horizon = nowMs + lookaheadMinutes * 60_000
        for (activity in activities.distinctBy { it.id }) {
            if (activity.cancelled || activity.start == null || activity.end == null) continue
            val tier = tierFor(activity.id)
            if (tier == Tier.NONE) continue
            val startMs = Schedule.parseInstant(activity.start)
            if (startMs < nowMs || startMs > horizon) continue

            val name = shortTitle(activity.title)
            val room = locationOf(activity.locationId)?.name
            val startsAt = Schedule.formatTime(activity.start)
            /** "10:15 in Devroom 1 (AOSP)", or just the time when the room is unknown. */
            val whereAndWhen = if (room != null) "$startsAt in $room" else "Starts $startsAt"

            if (tier == Tier.MUST_ATTEND) {
                val headsUp = startMs - Schedule.MUST_ATTEND_HEADS_UP_MINUTES * 60_000L
                if (headsUp > nowMs) out += Reminder(
                    "must-${activity.id}",
                    "In ${Schedule.MUST_ATTEND_HEADS_UP_MINUTES} min: $name",
                    "Must attend · $whereAndWhen",
                    headsUp,
                    activity.id,
                )
                out += Reminder(
                    "start-${activity.id}",
                    "Starting now: $name",
                    listOfNotNull(room, "you marked it must attend").joinToString(" · "),
                    startMs,
                    activity.id,
                )
            }

            val soon = startMs - STARTING_SOON_MINUTES * 60_000L
            if (soon > nowMs) out += Reminder(
                "soon-${activity.id}", "In $STARTING_SOON_MINUTES min: $name", whereAndWhen, soon, activity.id,
            )
        }
        return out.sortedBy { it.atMs }
    }

    /** Stable 31-bit id for AlarmManager and the notification, from the string id. */
    fun numericId(id: String): Int {
        var hash = 0
        for (ch in id) hash = (hash * 31 + ch.code)
        return if (hash == Int.MIN_VALUE) 1 else kotlin.math.abs(hash).takeIf { it != 0 } ?: 1
    }
}
