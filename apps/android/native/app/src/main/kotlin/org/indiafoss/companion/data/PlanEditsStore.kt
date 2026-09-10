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
import org.indiafoss.companion.core.PlanEdits
import org.indiafoss.companion.core.StoredBlock

private val Context.planStore: DataStore<Preferences> by preferencesDataStore(name = "plan-edits")

/**
 * The attendee's own plan items (#110): custom blocks with a fixed time and
 * flexible goals such as a booth visit. One JSON document in DataStore,
 * written whole, like the ranking state.
 */
class PlanEditsStore(private val context: Context) {
    private val key = stringPreferencesKey("plan-edits")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    val edits: Flow<PlanEdits> = context.planStore.data.map { prefs ->
        prefs[key]?.let { runCatching { json.decodeFromString<PlanEdits>(it) }.getOrNull() } ?: PlanEdits()
    }

    private suspend fun update(transform: (PlanEdits) -> PlanEdits) {
        context.planStore.edit { prefs ->
            val current = prefs[key]?.let { runCatching { json.decodeFromString<PlanEdits>(it) }.getOrNull() } ?: PlanEdits()
            prefs[key] = json.encodeToString(transform(current))
        }
    }

    /** Replace the whole document, only if it still equals `expected`; null restores unconditionally (see `PersonalDataRepository`). */
    suspend fun replace(expected: PlanEdits?, next: PlanEdits) {
        context.planStore.edit { prefs ->
            val current = prefs[key]?.let { runCatching { json.decodeFromString<PlanEdits>(it) }.getOrNull() } ?: PlanEdits()
            if (expected != null && current != expected) throw ConcurrentEditException("plan edits")
            prefs[key] = json.encodeToString(next)
        }
    }

    suspend fun addBlock(block: StoredBlock) = update { it.copy(blocks = it.blocks.filterNot { b -> b.id == block.id } + block) }

    suspend fun removeBlock(id: String) = update { it.copy(blocks = it.blocks.filterNot { b -> b.id == id }) }

    /** "Remove" on a planned row: the session leaves the plan, the rating is untouched (no dislike is learnt from a slot). */
    suspend fun removeSession(id: String) = update { if (id in it.removed) it else it.copy(removed = it.removed + id) }

    suspend fun restoreSession(id: String) = update { it.copy(removed = it.removed.filterNot { r -> r == id }) }
}
