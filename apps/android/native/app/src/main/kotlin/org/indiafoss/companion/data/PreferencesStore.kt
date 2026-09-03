package org.indiafoss.companion.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
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

    private val remindersKey = booleanPreferencesKey("reminders-enabled")

    /** Off until switched on in Settings; nothing is scheduled before that. */
    val remindersEnabled: Flow<Boolean> = context.dataStore.data.map { it[remindersKey] ?: false }

    suspend fun setRemindersEnabled(on: Boolean) {
        context.dataStore.edit { it[remindersKey] = on }
    }

    private val onboardingKey = booleanPreferencesKey("onboarding-done")

    /** Null until the store has been read; false brings up the welcome screen once (#107). */
    val onboardingDone: Flow<Boolean> = context.dataStore.data.map { it[onboardingKey] ?: false }

    suspend fun setOnboardingDone(done: Boolean) {
        context.dataStore.edit { it[onboardingKey] = done }
    }

    private val profileKey = stringPreferencesKey("routing-profile")

    /** fastest | avoid-stairs | accessible, as the web's routing preference. */
    val routingProfile: Flow<String> = context.dataStore.data.map { it[profileKey] ?: "fastest" }

    suspend fun setRoutingProfile(profile: String) {
        context.dataStore.edit { it[profileKey] = profile }
    }

    private val locationKey = stringPreferencesKey("current-location")

    val location: Flow<String?> = context.dataStore.data.map { it[locationKey] }

    suspend fun setLocation(locationId: String?) {
        context.dataStore.edit { if (locationId == null) it.remove(locationKey) else it[locationKey] = locationId }
    }

    suspend fun toggleBookmark(id: String) = toggle(bookmarkKey, id)

    suspend fun toggleMustAttend(id: String) = toggle(mustAttendKey, id)

    suspend fun setMustAttend(id: String, on: Boolean) {
        context.dataStore.edit { preferences ->
            val current = preferences[mustAttendKey] ?: emptySet()
            preferences[mustAttendKey] = if (on) current + id else current - id
        }
    }

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
