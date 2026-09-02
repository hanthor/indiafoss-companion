package org.indiafoss.companion.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "companion")

/**
 * Bookmarks and the must-attend tier, stored on device. Same meaning as the
 * PWA's preferences, keyed by the bundle's stable activity ids, but a separate
 * store: the two apps do not share a sandbox.
 */
class PreferencesStore(private val context: Context) {
    private val bookmarkKey = stringSetPreferencesKey("bookmarks")
    private val mustAttendKey = stringSetPreferencesKey("must-attend")

    val bookmarks: Flow<Set<String>> =
        context.dataStore.data.map { it[bookmarkKey] ?: emptySet() }

    val mustAttend: Flow<Set<String>> =
        context.dataStore.data.map { it[mustAttendKey] ?: emptySet() }

    suspend fun toggleBookmark(id: String) = toggle(bookmarkKey, id)

    suspend fun toggleMustAttend(id: String) = toggle(mustAttendKey, id)

    private suspend fun toggle(
        key: androidx.datastore.preferences.core.Preferences.Key<Set<String>>,
        id: String,
    ) {
        context.dataStore.edit { preferences ->
            val current = preferences[key] ?: emptySet()
            preferences[key] = if (id in current) current - id else current + id
        }
    }
}
