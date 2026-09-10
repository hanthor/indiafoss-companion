package org.indiafoss.companion.core

/**
 * The attendee's resolved plan for one day: the one projection Now, the map
 * destination, the leave-by banner, the calendar export and the reminders all
 * read (#221), so a session removed, replaced, retimed or cancelled disagrees
 * on none of them.
 *
 * It is the native counterpart of the PWA's `resolveDayPlan`: the greedy
 * base plan (`Itinerary.forDay`, from must-attend, devroom reservations,
 * interested/bookmarked talks and ratings) with the saved edits layered on
 * top the way `applyItineraryEdits` does — removals drop an item, a
 * replacement swaps one in, a replacement that has left the schedule becomes
 * a conflict rather than a destination. It is always resolved from the
 * current bundle, never from a cached list of planned ids, so a retimed
 * session moves and a cancelled one leaves (and comes back when reinstated).
 *
 * Conflicts are explicit: overlapping must-attend choices, devroom clashes
 * and overlapping blocks make the plan infeasible, and an infeasible plan
 * names no current/next item, no destination and no reminders — the attendee
 * is asked to resolve it, as on the web. A tight transfer between rooms is a
 * warning only (see docs/native-client.md for why that differs from the PWA).
 */
object ResolvedPlan {
    /** The saved edits, by stable activity/block id only. */
    data class Edits(
        val locked: Set<String> = emptySet(),
        val removed: Set<String> = emptySet(),
        /** original activity id → replacement activity id. */
        val replacements: Map<String, String> = emptyMap(),
        val blocks: List<Itinerary.CustomBlock> = emptyList(),
    ) {
        companion object { val NONE = Edits() }
    }

    enum class Source { MUST_ATTEND, BOOKMARKED, RANKED, BLOCK, LUNCH, REPLACEMENT }

    data class Item(
        val activity: Activity,
        val source: Source,
        /** From a manual edit: a block of the attendee's own or a replacement. */
        val manual: Boolean,
        val locked: Boolean,
        val flexible: Boolean,
        val block: Itinerary.CustomBlock? = null,
        val replacedActivityId: String? = null,
    ) {
        val id: String get() = activity.id
        val title: String get() = activity.title
        val start: String get() = activity.start ?: error("planned item ${activity.id} has no start")
        val end: String get() = activity.end ?: error("planned item ${activity.id} has no end")
        val locationId: String? get() = activity.locationId

        /** A programme session the activity screen can open; false for a block or the lunch gap. */
        val isSession: Boolean get() = source != Source.BLOCK && source != Source.LUNCH

        fun inProgress(now: String): Boolean {
            val nowMs = Schedule.parseInstant(now)
            return Schedule.parseInstant(start) <= nowMs && nowMs < Schedule.parseInstant(end)
        }
    }

    /** Blocking kinds make the plan infeasible; the rest are warnings shown beside it. */
    enum class ConflictKind(val blocking: Boolean) {
        OVERLAP(true),
        MUST_ATTEND(true),
        DEVROOM(true),
        UNKNOWN_ACTIVITY(true),
        INVALID_TIME(true),
        TRAVEL(false),
    }

    data class Conflict(val kind: ConflictKind, val a: String, val b: String? = null, val message: String)

    data class Plan(val day: String, val items: List<Item>, val conflicts: List<Conflict>) {
        val feasible: Boolean get() = conflicts.none { it.kind.blocking }
        val blockingConflicts: List<Conflict> get() = conflicts.filter { it.kind.blocking }
        val warnings: List<Conflict> get() = conflicts.filter { !it.kind.blocking }
        val plannedIds: Set<String> get() = items.map { it.id }.toSet()

        /** The item running at `now`, if the plan is feasible. */
        fun inProgress(now: String): Item? = if (!feasible) null else items.firstOrNull { it.inProgress(now) }

        /**
         * The item to show as "your plan now": in progress, or else the next one
         * that has not ended — the PWA's `nextPlannedItem`. Null while the plan
         * has a blocking conflict, so a stale choice is never a destination.
         */
        fun nextPlanned(now: String): Item? {
            if (!feasible) return null
            val nowMs = Schedule.parseInstant(now)
            return items.firstOrNull { Schedule.parseInstant(it.end) > nowMs }
        }

        /** The next item that has not started, within `horizonMinutes`: what the leave-by banner counts down to. */
        fun upcoming(now: String, horizonMinutes: Int = 180): Item? {
            if (!feasible) return null
            val nowMs = Schedule.parseInstant(now)
            val horizon = horizonMinutes * 60_000L
            return items.firstOrNull {
                val start = Schedule.parseInstant(it.start)
                start >= nowMs && start - nowMs <= horizon
            }
        }

        /** Where to go: the current-or-next item, only when it has a room (a block without one has no invented map pin). */
        fun destination(now: String): Item? = nextPlanned(now)?.takeIf { it.locationId != null }
    }

    /** The whole projection for a day: base plan, explicit choices, edits, conflicts. */
    fun forDay(
        bundle: EventBundle,
        day: String,
        ratingOf: (String) -> Double,
        dispositionOf: (String) -> Disposition,
        bookmarked: (String) -> Boolean,
        edits: Edits = Edits.NONE,
        stayTrackIds: Set<String> = emptySet(),
        walkSeconds: (String, String) -> Int? = { _, _ -> null },
        minimumRating: Double = 0.0,
    ): Plan {
        val base = Itinerary.forDay(bundle, day, ratingOf, dispositionOf, bookmarked, minimumRating, edits.blocks, stayTrackIds)
        val conflicts = ArrayList<Conflict>()
        val sessions = Schedule.activitiesForDay(bundle, day)
            .filter { !it.cancelled && it.type != "meal" && it.start != null && it.end != null }
        // Two must-go choices in the same slot: the greedy base keeps one, the attendee must choose.
        val must = sessions.filter { dispositionOf(it.id) == Disposition.MUST_ATTEND && it.id !in edits.removed }
        for (i in must.indices) for (j in i + 1 until must.size) {
            if (Itinerary.overlaps(must[i], must[j])) conflicts += Conflict(
                ConflictKind.MUST_ATTEND, must[i].id, must[j].id,
                "\"${must[i].title}\" and \"${must[j].title}\" are both must attend and overlap.",
            )
        }
        for ((a, b) in Itinerary.stayConflicts(bundle, day, stayTrackIds, dispositionOf)) {
            if (a.id in edits.removed || b.id in edits.removed) continue
            conflicts += Conflict(ConflictKind.DEVROOM, a.id, b.id, "\"${a.title}\" clashes with \"${b.title}\" in a devroom you are staying for.")
        }
        return resolve(bundle, day, base, edits, walkSeconds, conflicts.distinctBy { setOf(it.a, it.b) })
    }

    /**
     * Layer the edits over a base plan, the PWA's `applyItineraryEdits`:
     * removals, replacements, then chronological order and neighbour checks.
     * A manual item is never dropped silently; what cannot stand is a conflict.
     */
    fun resolve(
        bundle: EventBundle,
        day: String,
        base: List<Itinerary.Item>,
        edits: Edits = Edits.NONE,
        walkSeconds: (String, String) -> Int? = { _, _ -> null },
        extraConflicts: List<Conflict> = emptyList(),
    ): Plan {
        // Cancelled sessions are not lookup targets: a replacement pointing at one is a conflict.
        val activities = bundle.activities.filter { !it.cancelled }.associateBy { it.id }
        val conflicts = ArrayList(extraConflicts)
        val items = ArrayList<Item>()
        for (item in base) {
            val id = item.activity.id
            if (id in edits.removed) continue
            val start = item.activity.start ?: continue
            val end = item.activity.end ?: continue
            when (item.reason) {
                Itinerary.Reason.BLOCK -> {
                    val block = item.block
                    if (Schedule.parseInstant(end) <= Schedule.parseInstant(start)) {
                        conflicts += Conflict(ConflictKind.INVALID_TIME, id, message = "\"${item.activity.title}\" ends before it starts.")
                    }
                    items += Item(item.activity, Source.BLOCK, manual = true, locked = id in edits.locked, flexible = block?.flexible ?: false, block = block)
                }
                Itinerary.Reason.LUNCH -> items += Item(item.activity, Source.LUNCH, manual = false, locked = false, flexible = true)
                else -> {
                    val replacementId = edits.replacements[id]
                    if (replacementId != null) {
                        val replacement = activities[replacementId]
                        if (replacement?.start == null || replacement.end == null) {
                            conflicts += Conflict(
                                ConflictKind.UNKNOWN_ACTIVITY, replacementId,
                                message = "The replacement you chose for \"${item.activity.title}\" is no longer in the schedule.",
                            )
                            continue
                        }
                        items += Item(replacement, Source.REPLACEMENT, manual = true, locked = replacementId in edits.locked, flexible = false, replacedActivityId = id)
                        continue
                    }
                    val source = when (item.reason) {
                        Itinerary.Reason.MUST_ATTEND -> Source.MUST_ATTEND
                        Itinerary.Reason.BOOKMARKED -> Source.BOOKMARKED
                        else -> Source.RANKED
                    }
                    items += Item(item.activity, source, manual = false, locked = id in edits.locked, flexible = false)
                }
            }
        }
        items.sortWith(compareBy({ Schedule.parseInstant(it.start) }, { Schedule.parseInstant(it.end) }))

        for (i in 0 until items.size - 1) {
            val cur = items[i]
            val next = items[i + 1]
            val curEnd = Schedule.parseInstant(cur.end)
            val nextStart = Schedule.parseInstant(next.start)
            if (curEnd > nextStart) {
                conflicts += Conflict(ConflictKind.OVERLAP, cur.id, next.id, "\"${cur.title}\" overlaps \"${next.title}\".")
                continue
            }
            if (cur.flexible || next.flexible) continue
            val from = cur.locationId ?: continue
            val to = next.locationId ?: continue
            if (from == to) continue
            val walk = walkSeconds(from, to) ?: continue
            if (curEnd + walk * 1000L > nextStart) conflicts += Conflict(
                ConflictKind.TRAVEL, cur.id, next.id,
                "Not enough time to reach \"${next.title}\" (about ${(walk + 59) / 60} min walk).",
            )
        }
        return Plan(day, items, conflicts)
    }
}
