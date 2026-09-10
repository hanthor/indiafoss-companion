package org.indiafoss.companion.core

/**
 * The plan as the phone's calendar should show it (#272): the narrow input
 * to the calendar-provider sync. The resolved plan projection of #221
 * (`PlannedEntries.fromPlans`) produces a list of these; the sync never
 * looks past them. Times are epoch milliseconds so the calendar row and the
 * plan compare without re-parsing offsets.
 */
data class PlannedEntry(
    val identity: PlannedIdentity,
    val title: String,
    val startMs: Long,
    val endMs: Long,
    val location: String? = null,
    val description: String? = null,
    /** A link back into the app, stored on the row so the calendar can open the session. */
    val appUri: String? = null,
)

/**
 * What makes a calendar row "this entry" across refreshes and restarts,
 * following the transfer contract of #247: the event, the CFP proposal where
 * there is one, and the exact occurrence (the activity id). A row is the same
 * entry when its occurrence key matches; when the programme is regenerated
 * with new activity ids, the same proposal in the same event is still the
 * same entry and is updated in place rather than deleted and re-added.
 */
data class PlannedIdentity(val eventId: String, val occurrenceId: String, val proposalId: String? = null) {
    /** Stored in the row's first sync column: `indiafoss/<event>/<occurrence>`. */
    val occurrenceKey: String get() = "$PREFIX/$eventId/$occurrenceId"

    /** Stored in the row's second sync column, or absent for entries without a CFP identity. */
    val proposalKey: String? get() = proposalId?.takeIf { it.isNotBlank() }?.let { "$PREFIX/$eventId/cfp/$it" }

    companion object {
        const val PREFIX = "indiafoss"

        fun of(eventId: String, activity: Activity) = PlannedIdentity(eventId, activity.id, activity.proposalId)
    }
}

/** A row in the app-owned calendar as the provider reports it. */
data class CalendarRow(
    val rowId: Long,
    val calendarId: Long,
    val occurrenceKey: String?,
    val proposalKey: String?,
    val title: String,
    val startMs: Long,
    val endMs: Long,
    val location: String? = null,
    val description: String? = null,
)

/** What to do to the provider so its rows equal the plan. */
sealed class CalendarOp {
    data class Insert(val entry: PlannedEntry) : CalendarOp()
    data class Update(val rowId: Long, val entry: PlannedEntry) : CalendarOp()
    data class Delete(val rowId: Long) : CalendarOp()
}

/**
 * Pure reconciliation of the planned entries against the rows the provider
 * holds in the app's own calendar: inserts for new entries, in-place updates
 * where the time, room, title or notes changed, deletes for rows that left
 * the plan, and deletes for any duplicate rows so a refresh or a restart
 * never doubles an entry. Rows from any other calendar are never touched,
 * whatever they carry, and neither is a row in the app's calendar that does
 * not carry the app's identity (one the attendee typed in themselves).
 */
object CalendarReconciler {
    fun reconcile(desired: List<PlannedEntry>, existing: List<CalendarRow>, ownedCalendarId: Long): List<CalendarOp> {
        val owned = existing.filter { it.calendarId == ownedCalendarId && it.occurrenceKey != null }
        val wanted = desired.distinctBy { it.identity.occurrenceKey }
        val wantedKeys = wanted.map { it.identity.occurrenceKey }.toSet()
        val claimed = HashSet<Long>()
        val ops = ArrayList<CalendarOp>()

        fun claim(row: CalendarRow, entry: PlannedEntry) {
            claimed += row.rowId
            if (!row.matches(entry)) ops += CalendarOp.Update(row.rowId, entry)
        }

        // First the exact occurrence: the lowest row id wins, the rest are duplicates.
        val byOccurrence = owned.groupBy { it.occurrenceKey!! }
        val pending = ArrayList<PlannedEntry>()
        for (entry in wanted) {
            val row = byOccurrence[entry.identity.occurrenceKey]?.minByOrNull { it.rowId }
            if (row == null) pending += entry else claim(row, entry)
        }
        // Then the same proposal under a regenerated occurrence id: only a row whose
        // own occurrence is no longer planned, and only when the match is unambiguous.
        val stale = owned.filter { it.rowId !in claimed && it.occurrenceKey !in wantedKeys }
        for (entry in pending.toList()) {
            val proposal = entry.identity.proposalKey ?: continue
            val candidates = stale.filter { it.proposalKey == proposal && it.rowId !in claimed }
            val siblings = pending.count { it.identity.proposalKey == proposal }
            if (candidates.size == 1 && siblings == 1) {
                claim(candidates.single(), entry)
                pending -= entry
            }
        }
        for (entry in pending) ops += CalendarOp.Insert(entry)
        for (row in owned) if (row.rowId !in claimed) ops += CalendarOp.Delete(row.rowId)
        return ops
    }

    private fun CalendarRow.matches(entry: PlannedEntry): Boolean =
        title == entry.title && startMs == entry.startMs && endMs == entry.endMs &&
            location.orEmpty() == entry.location.orEmpty() && description.orEmpty() == entry.description.orEmpty() &&
            occurrenceKey == entry.identity.occurrenceKey && proposalKey == entry.identity.proposalKey
}

/**
 * The resolved plan (#221) as calendar entries: every item of every feasible
 * day. A day with a blocking conflict contributes nothing, the same rule as
 * `Reminders.forPlans` — the attendee is asked to resolve it, and the
 * calendar follows once they have — so the calendar never shows a choice
 * that Now, the map and the reminders have refused.
 */
object PlannedEntries {
    fun fromPlans(bundle: EventBundle, plans: List<ResolvedPlan.Plan>): List<PlannedEntry> =
        plans.filter { it.feasible }.flatMap { plan ->
            plan.items.mapNotNull { item ->
                val a = item.activity
                val start = a.start ?: return@mapNotNull null
                val end = a.end ?: return@mapNotNull null
                val speakers = bundle.speakersOf(a).joinToString(", ") { it.name }
                val description = listOfNotNull(speakers.takeIf { it.isNotBlank() }, a.sourceUrl).joinToString("\n").ifBlank { null }
                PlannedEntry(
                    identity = PlannedIdentity.of(bundle.id, a),
                    title = a.title,
                    startMs = Schedule.parseInstant(start),
                    endMs = Schedule.parseInstant(end),
                    location = bundle.location(a.locationId)?.name,
                    description = description,
                    appUri = if (item.isSession) "indiafoss://activity/${a.id}" else null,
                )
            }
        }
}
