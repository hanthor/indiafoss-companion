package org.indiafoss.companion.core

/**
 * What changed between two revisions of the programme, by stable activity
 * id: the port of `diffBundles` in `@indiafoss/schedule`. Added, cancelled,
 * moved in time, moved room, retitled, speakers changed; anything else in
 * the bundle is metadata nobody needs a banner for.
 */
object ScheduleDiff {
    enum class Kind(val label: String) {
        ADDED("added"), CANCELLED("cancelled"), TIME("moved"), ROOM("room changed"),
        TITLE("retitled"), SPEAKERS("speakers changed"),
    }

    data class Change(val activityId: String, val title: String, val kind: Kind, val detail: String? = null)

    fun between(prev: EventBundle, next: EventBundle): List<Change> {
        val out = ArrayList<Change>()
        val before = prev.activities.associateBy { it.id }
        for (a in next.activities) {
            val old = before[a.id]
            if (old == null) { out += Change(a.id, a.title, Kind.ADDED); continue }
            if (a.cancelled && !old.cancelled) out += Change(a.id, a.title, Kind.CANCELLED)
            if (a.start != old.start || a.end != old.end) {
                val detail = listOfNotNull(old.start?.let(Schedule::formatTime), a.start?.let(Schedule::formatTime)).joinToString(" → ")
                out += Change(a.id, a.title, Kind.TIME, detail.ifBlank { null })
            }
            if (a.locationId != old.locationId) {
                out += Change(a.id, a.title, Kind.ROOM, "${next.location(old.locationId)?.name ?: old.locationId ?: "?"} → ${next.location(a.locationId)?.name ?: a.locationId ?: "?"}")
            }
            if (a.title != old.title) out += Change(a.id, a.title, Kind.TITLE, old.title)
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
}
