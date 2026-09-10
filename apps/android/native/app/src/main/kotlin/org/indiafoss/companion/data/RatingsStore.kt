package org.indiafoss.companion.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.indiafoss.companion.core.Disposition
import org.indiafoss.companion.core.RankingState
import org.indiafoss.companion.core.SessionRating
import org.indiafoss.companion.core.StoredComparison

private val Context.rankingStore: DataStore<Preferences> by preferencesDataStore(name = "ranking")

/**
 * Ratings, answered pairs and room preferences, as one JSON document in
 * DataStore. Small (a few hundred sessions at most) and written whole, so a
 * crash mid-write can never leave half an answer behind.
 */
class RatingsStore(private val context: Context) {
    private val key = stringPreferencesKey("ranking-state")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    val state: Flow<RankingState> = context.rankingStore.data.map { prefs ->
        prefs[key]?.let { runCatching { json.decodeFromString<RankingState>(it) }.getOrNull() }
            ?: RankingState()
    }

    suspend fun update(transform: (RankingState) -> RankingState) {
        context.rankingStore.edit { prefs ->
            val current = prefs[key]?.let { runCatching { json.decodeFromString<RankingState>(it) }.getOrNull() }
                ?: RankingState()
            prefs[key] = json.encodeToString(transform(current))
        }
    }

    /** Replace the whole document, only if it still equals `expected`; null restores unconditionally (see `PersonalDataRepository`). */
    suspend fun replace(expected: RankingState?, next: RankingState) {
        context.rankingStore.edit { prefs ->
            val current = prefs[key]?.let { runCatching { json.decodeFromString<RankingState>(it) }.getOrNull() } ?: RankingState()
            if (expected != null && current != expected) throw ConcurrentEditException("ranking")
            prefs[key] = json.encodeToString(next)
        }
    }

    suspend fun setRating(id: String, rating: Double, comparisons: Int) = update { s ->
        s.copy(ratings = s.ratings + (id to s.rating(id).copy(rating = rating, comparisons = comparisons)))
    }

    suspend fun setDisposition(id: String, disposition: Disposition) = update { s ->
        s.copy(ratings = s.ratings + (id to s.rating(id).copy(disposition = disposition.stored())))
    }

    /** Quick pass: "no" rules the session out, "yes" keeps it in, null clears the answer. */
    suspend fun setTriage(id: String, answer: String?) = update { s ->
        val current = s.rating(id)
        val disposition = when {
            answer == "no" -> "not-interested"
            current.disposition == "not-interested" -> "normal"
            else -> current.disposition
        }
        s.copy(ratings = s.ratings + (id to current.copy(triage = answer, disposition = disposition)))
    }

    suspend fun record(comparison: StoredComparison) = update { s ->
        s.copy(comparisons = s.comparisons + comparison)
    }

    suspend fun forget(comparisonId: String) = update { s ->
        s.copy(comparisons = s.comparisons.filterNot { it.id == comparisonId })
    }

    /**
     * Room preference. Skip answers "no" for every talk in the room the
     * attendee has not answered themselves; leaving Skip restores just those.
     */
    suspend fun setRoom(trackId: String, pref: String?, sessionsInRoom: List<String>) = update { s ->
        var ratings = s.ratings
        var skipped = s.roomSkipped
        val was = s.rooms[trackId]
        if (was == "skip" && pref != "skip") {
            for (id in skipped[trackId].orEmpty()) {
                val r = ratings[id] ?: continue
                if (r.triage == "no") ratings = ratings + (id to r.copy(triage = null, disposition = "normal"))
            }
            skipped = skipped - trackId
        }
        if (pref == "skip" && was != "skip") {
            val marked = ArrayList<String>()
            for (id in sessionsInRoom) {
                val r = ratings[id] ?: SessionRating()
                if (r.triage != null) continue
                ratings = ratings + (id to r.copy(triage = "no", disposition = "not-interested"))
                marked += id
            }
            skipped = skipped + (trackId to marked)
        }
        val rooms = if (pref == null) s.rooms - trackId else s.rooms + (trackId to pref)
        s.copy(ratings = ratings, roomSkipped = skipped, rooms = rooms)
    }

    suspend fun markRoomsDecided() = update { it.copy(roomsDecided = true) }
}

private fun Disposition.stored(): String = when (this) {
    Disposition.MUST_ATTEND -> "must-attend"
    Disposition.NOT_INTERESTED -> "not-interested"
    Disposition.WATCH_LATER -> "watch-later"
    Disposition.NORMAL -> "normal"
}
