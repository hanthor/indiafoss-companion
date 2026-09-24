package org.indiafoss.companion.core

/**
 * The one card the Now grid draws in gold, the same rule as the PWA's
 * `goTarget` in apps/web/src/lib/now-page.ts.
 *
 * Your plan's talk first. With nothing left in the plan today, the
 * programme's next session, labelled as that and not as your choice. Nothing
 * while the plan has conflicting choices, when no destination can be picked
 * for the attendee (#221), and nothing for a personal block, which has no
 * card to light.
 */
object NowGo {
    const val GOING = "You're going"
    const val UP_NEXT = "Up next"

    data class Target(val id: String, val label: String)

    fun target(
        planConflicted: Boolean,
        planItemId: String?,
        planItemIsSession: Boolean,
        gridIds: Set<String>,
        programmeNextId: String?,
    ): Target? {
        if (planConflicted) return null
        if (planItemId != null) {
            return if (planItemIsSession && planItemId in gridIds) Target(planItemId, GOING) else null
        }
        return programmeNextId?.takeIf { it in gridIds }?.let { Target(it, UP_NEXT) }
    }
}
