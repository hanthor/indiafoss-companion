package org.indiafoss.companion.data

import android.content.Context
import java.io.File
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.ImportChange
import org.indiafoss.companion.core.ImportPreview
import org.indiafoss.companion.core.NativePersonalData
import org.indiafoss.companion.core.PersonalDataException
import org.indiafoss.companion.core.PersonalDataFiles
import org.indiafoss.companion.core.PersonalDataValidation
import org.indiafoss.companion.core.PersonalState
import org.indiafoss.companion.core.writeFileAtomically

/** The five places personal state lives, written in this order by an import. */
enum class PersonalStore { CHOICES, RANKING, EDITS, PROFILE, NOTES }

/**
 * Reads and compare-and-set writes over the personal stores, so the
 * repository's journal and rollback can be tested against a fake as well as
 * the real DataStores. `expected == null` restores unconditionally.
 */
interface PersonalStores {
    suspend fun read(): PersonalState
    suspend fun write(store: PersonalStore, expected: PersonalState?, next: PersonalState)
}

/** The real stores: bookmarks/must-attend, ranking, plan edits, the attendee's card and notes. */
class DataStorePersonalStores(
    private val preferences: PreferencesStore,
    private val ratings: RatingsStore,
    private val planEdits: PlanEditsStore,
    private val profiles: ProfileStore,
    private val notes: NotesStore,
) : PersonalStores {
    override suspend fun read(): PersonalState = PersonalState(
        bookmarks = preferences.bookmarks.first(),
        mustAttend = preferences.mustAttend.first(),
        ranking = ratings.state.first(),
        edits = planEdits.edits.first(),
        profile = profiles.profile.first(),
        notes = notes.notes.first(),
    )

    override suspend fun write(store: PersonalStore, expected: PersonalState?, next: PersonalState) {
        when (store) {
            PersonalStore.CHOICES -> preferences.replaceChoices(expected?.bookmarks, expected?.mustAttend, next.bookmarks, next.mustAttend)
            PersonalStore.RANKING -> ratings.replace(expected?.ranking, next.ranking)
            PersonalStore.EDITS -> planEdits.replace(expected?.edits, next.edits)
            PersonalStore.PROFILE -> profiles.replaceProfile(expected?.profile, next.profile)
            PersonalStore.NOTES -> notes.replace(expected?.notes, next.notes)
        }
    }
}

/**
 * The personal-data transfer on native (#240): export the allowlisted state
 * as the versioned file, preview a file against the stores and the cached
 * programme, and apply the chosen changes.
 *
 * Native keeps personal state in five DataStores with no transaction across
 * them, so [apply] is made atomic by a journal: the state before the import
 * is written to `personal-import.journal` first; every store is then written
 * with a compare-and-set against what the preview read (a store edited in
 * between refuses the write); on any failure every store is restored from the
 * journal in-process, and [recover] restores it again at the next launch if
 * the process died part way. Either way the prior state is what survives:
 * an import is all of its changes or none of them.
 */
class PersonalDataRepository(
    private val stores: PersonalStores,
    private val journal: File,
) {
    constructor(context: Context, stores: PersonalStores) : this(stores, File(context.filesDir, JOURNAL))

    sealed class PreviewResult {
        data class Ok(val preview: ImportPreview) : PreviewResult()
        data class Rejected(val reason: String) : PreviewResult()
    }

    sealed class ApplyResult {
        data class Applied(val changes: Int) : ApplyResult()
        /** Something in the preview changed on this device before the write; nothing was imported. */
        data class Stale(val labels: List<String>) : ApplyResult()
        /** A write failed and the prior state was restored. */
        data class Failed(val reason: String) : ApplyResult()
    }

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val lock = Mutex()

    /** Test hook: runs before each store is written, so a failure part way can be rehearsed. */
    internal var beforeWrite: suspend (PersonalStore) -> Unit = {}

    suspend fun snapshot(): PersonalState = stores.read()

    /** The versioned file text for this device, offline; fails whole rather than producing a partial file. */
    suspend fun export(bundle: EventBundle?, exportedAt: String = NativePersonalData.exportedAtNow()): String =
        PersonalDataFiles.encode(NativePersonalData.export(stores.read(), bundle, exportedAt))

    /** Decode, validate and plan a file; nothing is written. */
    suspend fun preview(text: String, bundle: EventBundle?): PreviewResult {
        val decoded = PersonalDataFiles.decode(text)
        val file = decoded.data ?: return PreviewResult.Rejected(decoded.issues.joinToString("; "))
        val validated = try {
            PersonalDataValidation.validate(file)
        } catch (e: PersonalDataException) {
            return PreviewResult.Rejected(e.message ?: "Invalid personal data")
        }
        return PreviewResult.Ok(NativePersonalData.preview(validated, stores.read(), bundle))
    }

    /** Write the chosen changes, all or none. */
    suspend fun apply(changes: List<ImportChange>, bundle: EventBundle?): ApplyResult = lock.withLock {
        val before = stores.read()
        val stale = NativePersonalData.stale(changes, before, bundle)
        if (stale.isNotEmpty()) return ApplyResult.Stale(stale)
        val after = NativePersonalData.apply(before, changes, bundle)
        writeFileAtomically(journal, json.encodeToString(before))
        try {
            for (store in PersonalStore.values()) {
                beforeWrite(store)
                stores.write(store, before, after)
            }
            journal.delete()
            ApplyResult.Applied(changes.size)
        } catch (e: Exception) {
            restore(before)
            journal.delete()
            if (e is ConcurrentEditException) ApplyResult.Stale(listOf(e.store)) else ApplyResult.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    /**
     * The recovery gate, run before anything reads the stores at launch: a
     * journal left behind means an import did not finish, and the state it
     * holds is put back. Returns true when something was restored.
     */
    suspend fun recover(): Boolean = lock.withLock {
        if (!journal.isFile) return false
        val before = runCatching { json.decodeFromString<PersonalState>(journal.readText()) }.getOrNull()
        if (before != null) restore(before)
        journal.delete()
        before != null
    }

    private suspend fun restore(state: PersonalState) {
        for (store in PersonalStore.values()) stores.write(store, null, state)
    }

    companion object {
        const val JOURNAL = "personal-import.journal"
    }
}
