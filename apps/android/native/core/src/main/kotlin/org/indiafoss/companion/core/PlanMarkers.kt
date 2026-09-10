package org.indiafoss.companion.core

/**
 * What the Schedule says about a session's place in the attendee's day, the
 * way the PWA marks its list and grid: a planned session carries a mark, a
 * must-attend one its own chip, and an interest that lost its slot is shown
 * standing aside rather than silently dropped.
 *
 * Derived from the resolved plan ([ResolvedPlan.forDay] — the greedy base
 * with removals and replacements layered on, #221) and the stored
 * preferences, so the Schedule agrees with Now, the map and the reminders
 * about what is planned. The PWA reads its saved, solver-resolved plan the
 * same way (`resolved-plan.svelte.ts`).
 */
enum class PlanMarker(val label: String) {
    NONE(""),
    /** Chosen for the day by rating alone: nothing explicit was said about it. */
    PLANNED("Planned"),
    /** Bookmarked or answered "yes", and in the day's plan. */
    INTERESTED("Interested"),
    /** Must-attend, and in the day's plan. */
    MUST_GO("Must go"),
    /** Bookmarked, "yes" or must-attend, but an overlapping session took the slot. */
    STOOD_ASIDE("Stood aside");

    companion object {
        fun derive(
            activities: List<Activity>,
            plan: ResolvedPlan.Plan,
            dispositionOf: (String) -> Disposition,
            bookmarked: (String) -> Boolean,
            triageOf: (String) -> String?,
        ): Map<String, PlanMarker> {
            val placed = plan.items.filter { it.isSession }.map { it.activity }
            val placedIds = placed.map { it.id }.toSet()
            return activities.associate { activity ->
                val disposition = dispositionOf(activity.id)
                val wanted = disposition == Disposition.MUST_ATTEND || bookmarked(activity.id) || triageOf(activity.id) == "yes"
                val marker = when {
                    activity.cancelled || disposition == Disposition.NOT_INTERESTED -> NONE
                    activity.id in placedIds -> when {
                        disposition == Disposition.MUST_ATTEND -> MUST_GO
                        wanted -> INTERESTED
                        else -> PLANNED
                    }
                    wanted && placed.any { it.id != activity.id && Itinerary.overlaps(it, activity) } -> STOOD_ASIDE
                    else -> NONE
                }
                activity.id to marker
            }
        }
    }
}
