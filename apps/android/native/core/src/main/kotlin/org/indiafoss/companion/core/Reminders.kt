package org.indiafoss.companion.core

/**
 * Local reminders, the same tiers as the web app (docs/reminders.md): a
 * must-attend session gets a heads-up 30 minutes before, "starting soon"
 * at 15, "leave now" at 10 and an alert at the start; a bookmarked one gets
 * starting soon and leave now; everything else is silent. Pure: the app
 * hands the result to AlarmManager.
 */
object Reminders {
    enum class Tier { MUST_ATTEND, PLANNED, NONE }

    data class Reminder(val id: String, val title: String, val body: String, val atMs: Long)

    const val STARTING_SOON_MINUTES = 15
    const val LEAVE_MINUTES = 10

    fun compute(
        bundle: EventBundle,
        nowMs: Long,
        tierFor: (String) -> Tier,
        lookaheadMinutes: Long = 24 * 60,
    ): List<Reminder> {
        val out = ArrayList<Reminder>()
        val horizon = nowMs + lookaheadMinutes * 60_000
        for (activity in bundle.activities) {
            if (activity.cancelled || activity.start == null || activity.end == null) continue
            val tier = tierFor(activity.id)
            if (tier == Tier.NONE) continue
            val startMs = Schedule.parseInstant(activity.start)
            if (startMs < nowMs || startMs > horizon) continue
            if (tier == Tier.MUST_ATTEND) {
                val headsUp = startMs - Schedule.MUST_ATTEND_HEADS_UP_MINUTES * 60_000L
                if (headsUp > nowMs) out += Reminder(
                    "must-${activity.id}", "Don't miss this",
                    "${activity.title} starts in ${Schedule.MUST_ATTEND_HEADS_UP_MINUTES} min — it's on your must-attend list.",
                    headsUp,
                )
                out += Reminder(
                    "start-${activity.id}", "Starting now",
                    "${activity.title} is starting. You marked it must attend.", startMs,
                )
            }
            val soon = startMs - STARTING_SOON_MINUTES * 60_000L
            if (soon > nowMs) out += Reminder(
                "soon-${activity.id}", "Starting soon",
                "${activity.title} begins in $STARTING_SOON_MINUTES min.", soon,
            )
            val leave = startMs - LEAVE_MINUTES * 60_000L
            if (leave > nowMs) out += Reminder(
                "leave-${activity.id}", "Leave now", "Time to head to ${activity.title}.", leave,
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
