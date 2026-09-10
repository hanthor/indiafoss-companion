package org.indiafoss.companion.core

import kotlinx.serialization.Serializable

/*
 * The attendee's personal state as the native stores persist it: ranking,
 * plan edits, and (below) the one aggregate the personal-data transfer reads
 * and writes (#240). These are plain serialisable records with no Android
 * dependency so the export/import logic in `NativePersonalData` runs on the
 * JVM; the DataStore adapters in `:app` (`RatingsStore`, `PlanEditsStore`)
 * persist them.
 */

/** Everything ranking knows about one session; mirrors the PWA's preference record. */
@Serializable
data class SessionRating(
    val rating: Double = Ranking.INITIAL_RATING,
    val comparisons: Int = 0,
    val disposition: String = "normal",
    /** Quick-pass answer: "yes" or "no". */
    val triage: String? = null,
    /** The session this one stood aside for in a clash (#271): carried for the PWA, which decides it; native does not read it. */
    val yieldedTo: String? = null,
)

@Serializable
data class StoredComparison(
    val id: String,
    val a: String,
    val b: String,
    val scoreA: Double,
    val at: Long,
    /** Answered as a scheduling clash (#271); carried for the PWA, which is where it is set. */
    val clash: Boolean = false,
)

@Serializable
data class RankingState(
    val ratings: Map<String, SessionRating> = emptyMap(),
    val comparisons: List<StoredComparison> = emptyList(),
    /** Room (track) id → "skip" | "love". */
    val rooms: Map<String, String> = emptyMap(),
    /** Sessions a room skip marked, so leaving Skip restores exactly those. */
    val roomSkipped: Map<String, List<String>> = emptyMap(),
    val roomsDecided: Boolean = false,
) {
    fun rating(id: String): SessionRating = ratings[id] ?: SessionRating()

    fun dispositionOf(id: String): Disposition = when (rating(id).disposition) {
        "must-attend" -> Disposition.MUST_ATTEND
        "not-interested" -> Disposition.NOT_INTERESTED
        "watch-later" -> Disposition.WATCH_LATER
        else -> Disposition.NORMAL
    }

    val answeredPairs: Set<String> get() = comparisons.map { Ranking.pairKey(it.a, it.b) }.toSet()

    val history: List<ComparisonEntry> get() = comparisons.map { ComparisonEntry(it.a, it.b, it.scoreA) }

    val roomPreferences: Map<String, RoomPreference>
        get() = rooms.mapNotNull { (id, pref) ->
            when (pref) {
                "skip" -> id to RoomPreference.SKIP
                "love", "stay" -> id to RoomPreference.LOVE
                else -> null
            }
        }.toMap()
}

/** A block of the attendee's own, as stored; see `Itinerary.CustomBlock`. */
@Serializable
data class StoredBlock(
    val id: String,
    val label: String,
    /** The day the block belongs to (YYYY-MM-DD), so a flexible one is placed on the right day. */
    val day: String,
    val start: String? = null,
    val end: String? = null,
    val durationMinutes: Int = 30,
    val locationId: String? = null,
) {
    fun toBlock() = Itinerary.CustomBlock(id, label, start, end, durationMinutes, locationId)
}

/**
 * Everything the attendee changed by hand, by stable id only (never by
 * resolved time or room), the same shape as the PWA's `PlanEdits`: blocks of
 * their own, sessions removed from the plan, and replacements chosen for a
 * slot. Resolved against the current bundle by `ResolvedPlan` (#221).
 */
@Serializable
data class PlanEdits(
    val blocks: List<StoredBlock> = emptyList(),
    val removed: List<String> = emptyList(),
    /** original activity id → replacement activity id. */
    val replacements: Map<String, String> = emptyMap(),
    val locked: List<String> = emptyList(),
)

/** A note on a session: carried for the PWA, which is where notes are written and read. */
@Serializable
data class Note(val body: String, val updatedAt: String)

/**
 * Everything the personal-data export reads and the import writes, as one
 * value: bookmarks and must-attend (`PreferencesStore`), ranking
 * (`RatingsStore`), plan edits (`PlanEditsStore`), the attendee's own card
 * (`ProfileStore`) and notes (`NotesStore`). Device settings, met contacts,
 * the handshake key and the reminder/calendar switches are deliberately not
 * part of it: they never enter the transfer file.
 */
@Serializable
data class PersonalState(
    val bookmarks: Set<String> = emptySet(),
    val mustAttend: Set<String> = emptySet(),
    val ranking: RankingState = RankingState(),
    val edits: PlanEdits = PlanEdits(),
    val profile: ContactCard = ContactCard(),
    val notes: Map<String, Note> = emptyMap(),
) {
    /** Disposition as the app shows it: the must-attend set folded over the stored one. */
    fun dispositionOf(id: String): String = if (id in mustAttend) "must-attend" else ranking.rating(id).disposition
}
