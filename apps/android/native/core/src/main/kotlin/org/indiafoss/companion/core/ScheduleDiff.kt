package org.indiafoss.companion.core

/**
 * What changed between two revisions of the programme, by stable activity
 * id: the port of `diffBundles` in `@indiafoss/schedule`. Added, cancelled,
 * moved in time, moved room, retitled, speakers changed; anything else in
 * the bundle is metadata nobody needs a banner for.
 */
object ScheduleDiff {
    enum class Kind(val label: String) {
        ADDED("added"), CANCELLED("cancelled"), REINSTATED("reinstated"), TIME("moved"), ROOM("room changed"),
        TITLE("retitled"), SPEAKERS("speakers changed"),
    }

    data class Change(val activityId: String, val title: String, val kind: Kind)

    fun between(prev: EventBundle, next: EventBundle): List<Change> {
        val out = ArrayList<Change>()
        val before = prev.activities.associateBy { it.id }
        for (a in next.activities) {
            val old = before[a.id]
            if (old == null) { out += Change(a.id, a.title, Kind.ADDED); continue }
            if (a.cancelled && !old.cancelled) out += Change(a.id, a.title, Kind.CANCELLED)
            if (!a.cancelled && old.cancelled) out += Change(a.id, a.title, Kind.REINSTATED)
            if (a.start != old.start || a.end != old.end) out += Change(a.id, a.title, Kind.TIME)
            if (a.locationId != old.locationId) out += Change(a.id, a.title, Kind.ROOM)
            if (a.title != old.title) out += Change(a.id, a.title, Kind.TITLE)
            if (a.speakerIds != old.speakerIds) out += Change(a.id, a.title, Kind.SPEAKERS)
        }
        val nextIds = next.activities.map { it.id }.toSet()
        for (a in prev.activities) if (a.id !in nextIds) out += Change(a.id, a.title, Kind.CANCELLED)
        return out
    }

    /** "2 added, 1 moved, 1 cancelled", in a fixed order; empty when nothing changed. */
    fun summary(changes: List<Change>): String =
        Kind.entries.mapNotNull { kind ->
            val n = changes.count { it.kind == kind }
            if (n == 0) null else "$n ${kind.label}"
        }.joinToString(", ")

    /**
     * One change said in plain language: what it was and what it now is
     * (#312). The banner used to give only counts and a terse
     * "title: room changed (A → B)", which told an attendee that something
     * moved but not, in words, what.
     */
    data class Detail(val change: Change, val description: String) {
        val activityId: String get() = change.activityId
        val title: String get() = change.title
        val kind: Kind get() = change.kind
    }

    /**
     * How much a change can cost an attendee who acts on it late: a session
     * that is gone, or has moved in time or room, before a rename or a
     * change of speaker. Deliberately separate from the declaration order of
     * `Kind`, which `summary` reads and must not be reordered.
     */
    private val RANK = mapOf(
        Kind.CANCELLED to 0, Kind.TIME to 1, Kind.ROOM to 2, Kind.REINSTATED to 3,
        Kind.ADDED to 4, Kind.TITLE to 5, Kind.SPEAKERS to 6,
    )

    /** `Hall A`, or the raw id when the revision that used it did not name it. */
    private fun roomLabel(bundle: EventBundle, locationId: String?): String? =
        locationId?.let { bundle.location(it)?.name ?: it }

    /**
     * `10:00–11:00`, with the day when the caller needs it to be
     * unambiguous. Null for a flexible activity that has no slot at all.
     */
    private fun slotLabel(activity: Activity?, withDay: Boolean): String? {
        val start = activity?.start ?: return null
        val time = activity.end?.let { "${Schedule.formatTime(start)}\u2013${Schedule.formatTime(it)}" }
            ?: Schedule.formatTime(start)
        return if (withDay) "${Schedule.formatDayLabel(Schedule.dayKey(start))} $time" else time
    }

    private fun speakerLabel(bundle: EventBundle, ids: List<String>): String? =
        ids.map { bundle.person(it)?.name ?: it }.filter { it.isNotBlank() }
            .takeIf { it.isNotEmpty() }?.joinToString(", ")

    private fun describeTimeChange(before: Activity, after: Activity): String {
        // A session can gain or lose its slot entirely: `start` is optional
        // for a flexible activity.
        if (before.start == null && after.start != null) return "Now scheduled for ${slotLabel(after, true)}."
        if (before.start != null && after.start == null) return "No longer has a time; it was ${slotLabel(before, true)}."
        // Name the day only when the session actually moved to another one,
        // so a routine ten-minute shift does not read as a bigger change.
        val movedDay = Schedule.dayKey(before.start!!) != Schedule.dayKey(after.start!!)
        return "Moved from ${slotLabel(before, movedDay)} to ${slotLabel(after, movedDay)}."
    }

    private fun describeRoomChange(prev: EventBundle, next: EventBundle, before: Activity, after: Activity): String {
        // Each side is resolved against the revision it came from: a room
        // dropped in the new bundle is still named by the old one.
        val was = roomLabel(prev, before.locationId)
        val now = roomLabel(next, after.locationId)
        if (was == null && now != null) return "Room set to $now."
        if (was != null && now == null) return "No longer has a room; it was $was."
        return "Moved from $was to $now."
    }

    private fun describe(change: Change, prev: EventBundle, next: EventBundle): Detail {
        val before = prev.activities.firstOrNull { it.id == change.activityId }
        val after = next.activities.firstOrNull { it.id == change.activityId }
        val description = when (change.kind) {
            Kind.ADDED -> slotLabel(after, true)
                ?.let { slot -> "New session, $slot${roomLabel(next, after?.locationId)?.let { " in $it" } ?: ""}." }
                ?: "New session, no time announced yet."
            Kind.CANCELLED -> "No longer on the programme."
            Kind.REINSTATED -> "Back on the programme."
            Kind.TIME -> if (before != null && after != null) describeTimeChange(before, after) else "The time changed."
            Kind.ROOM -> if (before != null && after != null) describeRoomChange(prev, next, before, after) else "The room changed."
            Kind.TITLE -> before?.let { "Renamed from \u201c${it.title}\u201d." } ?: "The title changed."
            Kind.SPEAKERS -> {
                val was = before?.let { speakerLabel(prev, it.speakerIds) }
                val now = after?.let { speakerLabel(next, it.speakerIds) }
                when {
                    was == null -> "Speakers announced: ${now ?: "none listed"}."
                    now == null -> "No speakers listed now; they were $was."
                    else -> "Speakers changed from $was to $now."
                }
            }
        }
        return Detail(change, description)
    }

    /**
     * Every attendee-visible change between two revisions, each said in a
     * whole sentence (#312).
     *
     * Built on `between`, so the summary counts and the list cannot
     * disagree, and both bundles are needed because the "was" side of a move
     * can only be resolved against the revision it came from. The result is
     * always the complete list for the pair it was given: a caller without
     * the previous revision must say the programme changed and offer no
     * list, never part of one.
     */
    fun describe(prev: EventBundle, next: EventBundle): List<Detail> =
        between(prev, next)
            .map { describe(it, prev, next) }
            .sortedWith(compareBy({ RANK.getValue(it.kind) }, { it.title }))
}
