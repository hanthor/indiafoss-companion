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
import org.indiafoss.companion.core.Itinerary

private val Context.planStore: DataStore<Preferences> by preferencesDataStore(name = "plan-edits")

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

@Serializable
data class PlanEdits(val blocks: List<StoredBlock> = emptyList())

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

    suspend fun addBlock(block: StoredBlock) = update { it.copy(blocks = it.blocks.filterNot { b -> b.id == block.id } + block) }

    suspend fun removeBlock(id: String) = update { it.copy(blocks = it.blocks.filterNot { b -> b.id == id }) }
}
