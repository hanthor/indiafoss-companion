package org.indiafoss.companion.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.indiafoss.companion.core.Note

private val Context.notesStore: DataStore<Preferences> by preferencesDataStore(name = "notes")

/**
 * Session notes by activity id (#240). The native client has no notes UI yet:
 * this store exists so notes written in the PWA survive a pass through native
 * and come back out in an export, rather than disappearing. One JSON document,
 * written whole, like the ranking state.
 */
class NotesStore(private val context: Context) {
    private val key = stringPreferencesKey("notes")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private fun decode(text: String?): Map<String, Note> =
        text?.let { runCatching { json.decodeFromString<Map<String, Note>>(it) }.getOrNull() } ?: emptyMap()

    val notes: Flow<Map<String, Note>> = context.notesStore.data.map { decode(it[key]) }

    /** Replace every note, only if the store still holds `expected`; null restores unconditionally (see `PersonalDataRepository`). */
    suspend fun replace(expected: Map<String, Note>?, next: Map<String, Note>) {
        context.notesStore.edit { prefs ->
            if (expected != null && decode(prefs[key]) != expected) throw ConcurrentEditException("notes")
            prefs[key] = json.encodeToString(next)
        }
    }
}

/** A store changed between the moment the import read it and the moment it wrote; the write is refused. */
class ConcurrentEditException(val store: String) : IllegalStateException("$store changed while the import was being applied")
