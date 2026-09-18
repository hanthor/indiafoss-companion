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
import org.indiafoss.companion.core.ContactCard
import org.indiafoss.companion.core.ContactContinuity
import org.indiafoss.companion.core.MetContact

private val Context.contactStore: DataStore<Preferences> by preferencesDataStore(name = "contacts")

/** The attendee's own card and the people they met, on device only. */
class ProfileStore(private val context: Context) {
    private val profileKey = stringPreferencesKey("profile")
    private val contactsKey = stringPreferencesKey("met")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    val profile: Flow<ContactCard> = context.contactStore.data.map { prefs ->
        prefs[profileKey]?.let { runCatching { json.decodeFromString<ContactCard>(it) }.getOrNull() } ?: ContactCard()
    }

    val contacts: Flow<List<MetContact>> = context.contactStore.data.map { prefs ->
        prefs[contactsKey]?.let { runCatching { json.decodeFromString<List<MetContact>>(it) }.getOrNull() }
            ?: emptyList()
    }

    suspend fun saveProfile(card: ContactCard) {
        context.contactStore.edit { it[profileKey] = json.encodeToString(card) }
    }

    /** Replace the attendee's own card, only if it still equals `expected`; met contacts are untouched (see `PersonalDataRepository`). */
    suspend fun replaceProfile(expected: ContactCard?, next: ContactCard) {
        context.contactStore.edit { prefs ->
            val current = prefs[profileKey]?.let { runCatching { json.decodeFromString<ContactCard>(it) }.getOrNull() } ?: ContactCard()
            if (expected != null && current != expected) throw ConcurrentEditException("contact card")
            prefs[profileKey] = json.encodeToString(next)
        }
    }

    /** Save a scanned card with key continuity; returns what happened for the message. */
    suspend fun addContact(contact: MetContact): ContactContinuity.Outcome {
        var outcome = ContactContinuity.Outcome.NEW
        context.contactStore.edit { prefs ->
            val current = prefs[contactsKey]?.let { runCatching { json.decodeFromString<List<MetContact>>(it) }.getOrNull() }
                ?: emptyList()
            val result = ContactContinuity.reconcile(current, contact)
            outcome = result.outcome
            prefs[contactsKey] = json.encodeToString(result.contacts)
        }
        return outcome
    }

    suspend fun removeContact(id: String) {
        context.contactStore.edit { prefs ->
            val current = prefs[contactsKey]?.let { runCatching { json.decodeFromString<List<MetContact>>(it) }.getOrNull() }
                ?: emptyList()
            prefs[contactsKey] = json.encodeToString(current.filterNot { it.id == id })
        }
    }
}
