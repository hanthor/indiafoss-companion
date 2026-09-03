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
import org.indiafoss.companion.core.ContactCard

private val Context.contactStore: DataStore<Preferences> by preferencesDataStore(name = "contacts")

/** Someone met: their card as scanned, and where and when. */
@Serializable
data class MetContact(
    val id: String,
    val card: ContactCard,
    val vcard: String,
    val savedAt: Long,
    val metActivityId: String? = null,
    /** valid | invalid | unsigned | unchecked, from the card's signature at scan time. */
    val signature: String = "unsigned",
    val fingerprint: String? = null,
)

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

    suspend fun addContact(contact: MetContact) {
        context.contactStore.edit { prefs ->
            val current = prefs[contactsKey]?.let { runCatching { json.decodeFromString<List<MetContact>>(it) }.getOrNull() }
                ?: emptyList()
            // The same person scanned again updates their entry rather than duplicating it.
            val same = current.firstOrNull {
                it.card.fullName.isNotBlank() && it.card.fullName.equals(contact.card.fullName, ignoreCase = true)
            }
            val next = if (same != null) current.map { if (it.id == same.id) contact.copy(id = same.id) else it }
            else listOf(contact) + current
            prefs[contactsKey] = json.encodeToString(next)
        }
    }

    suspend fun removeContact(id: String) {
        context.contactStore.edit { prefs ->
            val current = prefs[contactsKey]?.let { runCatching { json.decodeFromString<List<MetContact>>(it) }.getOrNull() }
                ?: emptyList()
            prefs[contactsKey] = json.encodeToString(current.filterNot { it.id == id })
        }
    }
}
