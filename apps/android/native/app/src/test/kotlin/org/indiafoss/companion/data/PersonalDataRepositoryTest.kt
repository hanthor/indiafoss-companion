package org.indiafoss.companion.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import java.io.File
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.ContactCard
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.ImportStatus
import org.indiafoss.companion.core.Note
import org.indiafoss.companion.core.PersonalState
import org.indiafoss.companion.core.RankingState
import org.indiafoss.companion.core.SessionRating
import org.indiafoss.companion.core.Track
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * The import is all or nothing across five stores (#240): a write that fails
 * part way, a store edited after the preview, and a process that died with
 * the journal on disk all leave the prior state. The fake stores rehearse
 * the failures; the last test runs the real DataStores once.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PersonalDataRepositoryTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()

    /** In-memory stores with the same compare-and-set contract as the DataStore adapters. */
    private class FakeStores(var state: PersonalState) : PersonalStores {
        val writes = ArrayList<PersonalStore>()
        override suspend fun read(): PersonalState = state
        override suspend fun write(store: PersonalStore, expected: PersonalState?, next: PersonalState) {
            writes += store
            val current = state
            fun <T> check(name: String, was: T, want: T?) { if (want != null && was != want) throw ConcurrentEditException(name) }
            state = when (store) {
                PersonalStore.CHOICES -> { check("choices", current.bookmarks to current.mustAttend, expected?.let { it.bookmarks to it.mustAttend }); current.copy(bookmarks = next.bookmarks, mustAttend = next.mustAttend) }
                PersonalStore.RANKING -> { check("ranking", current.ranking, expected?.ranking); current.copy(ranking = next.ranking) }
                PersonalStore.EDITS -> { check("plan edits", current.edits, expected?.edits); current.copy(edits = next.edits) }
                PersonalStore.PROFILE -> { check("contact card", current.profile, expected?.profile); current.copy(profile = next.profile) }
                PersonalStore.NOTES -> { check("notes", current.notes, expected?.notes); current.copy(notes = next.notes) }
            }
        }
    }

    private val fixture: String by lazy {
        generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
            .map { File(it, "packages/test-fixtures/fixtures/personal-data/valid/pwa-export.json") }.first { it.isFile }.readText()
    }

    private val bundle = EventBundle(
        "indiafoss-2026", "IndiaFOSS", "Asia/Kolkata", "2026-09-19T09:00:00+05:30", "2026-09-20T18:00:00+05:30",
        activities = listOf(
            Activity("talk-a", "Talk A", start = "2026-09-19T10:00:00+05:30", end = "2026-09-19T10:30:00+05:30", proposalId = "cfp-0"),
            Activity("talk-b", "Talk B", start = "2026-09-19T11:00:00+05:30", end = "2026-09-19T11:30:00+05:30", proposalId = "cfp-1"),
        ),
        tracks = listOf(Track("devroom", "Devroom"), Track("other", "Other")),
    )

    private val before = PersonalState(
        bookmarks = setOf("talk-b"),
        ranking = RankingState(ratings = mapOf("talk-b" to SessionRating(1250.0, 2, "normal", "yes"))),
        profile = ContactCard(fullName = "Priya"),
        notes = mapOf("talk-a" to Note("mine", "2026-09-10T00:00:00.000Z")),
    )

    private fun journal() = File(context.filesDir, "test-${System.nanoTime()}.journal")

    @Test
    fun `a failure part way through restores every store and leaves no journal`() = runBlocking {
        val stores = FakeStores(before)
        val journal = journal()
        val repository = PersonalDataRepository(stores, journal)
        val preview = assertIs<PersonalDataRepository.PreviewResult.Ok>(repository.preview(fixture, bundle)).preview
        assertTrue(preview.changes.isNotEmpty())
        repository.beforeWrite = { store -> if (store == PersonalStore.PROFILE) throw IllegalStateException("disk full") }
        val result = repository.apply(preview.changes, bundle)
        assertEquals(PersonalDataRepository.ApplyResult.Failed("disk full"), result)
        assertEquals(before, stores.state)
        assertFalse(journal.exists())
        // The stores written before the failure were written back.
        assertEquals(listOf(PersonalStore.CHOICES, PersonalStore.RANKING, PersonalStore.EDITS) + PersonalStore.values().toList(), stores.writes)
    }

    @Test
    fun `a store edited after the preview refuses the write and nothing is imported`() = runBlocking {
        val stores = FakeStores(before)
        val repository = PersonalDataRepository(stores, journal())
        val preview = assertIs<PersonalDataRepository.PreviewResult.Ok>(repository.preview(fixture, bundle)).preview
        // The attendee changes their mind about talk-a between the preview and the apply: the planner's stale check catches it first.
        stores.state = before.copy(mustAttend = setOf("talk-a"))
        val stale = repository.apply(preview.changes, bundle)
        assertEquals(PersonalDataRepository.ApplyResult.Stale(listOf("Talk A")), stale)
        assertEquals(before.copy(mustAttend = setOf("talk-a")), stores.state)
        // An edit that lands between the stale check and a store's own write is refused by that store and rolled back.
        stores.state = before
        repository.beforeWrite = { store -> if (store == PersonalStore.EDITS) stores.state = stores.state.copy(edits = stores.state.edits.copy(removed = listOf("talk-a"))) }
        val raced = repository.apply(preview.changes, bundle)
        assertEquals(PersonalDataRepository.ApplyResult.Stale(listOf("plan edits")), raced)
        assertEquals(before, stores.state)
    }

    @Test
    fun `a journal left by a process that died mid-import is restored at the next launch`() = runBlocking {
        val journal = journal()
        journal.writeText(Json { encodeDefaults = true }.encodeToString(before))
        // Two of five stores were written before the process died.
        val stores = FakeStores(before.copy(bookmarks = setOf("talk-a"), ranking = RankingState()))
        val repository = PersonalDataRepository(stores, journal)
        assertTrue(repository.recover())
        assertEquals(before, stores.state)
        assertFalse(journal.exists())
        assertFalse(repository.recover())
    }

    @Test
    fun `a rejected file is named and nothing is read for writing`() = runBlocking {
        val repository = PersonalDataRepository(FakeStores(before), journal())
        assertIs<PersonalDataRepository.PreviewResult.Rejected>(repository.preview("{", bundle))
        val corrupt = fixture.replace("\"rating\": 1200", "\"rating\": \"high\"")
        val rejected = assertIs<PersonalDataRepository.PreviewResult.Rejected>(repository.preview(corrupt, bundle))
        assertTrue("preferences[0].rating" in rejected.reason, rejected.reason)
    }

    @Test
    fun `the real DataStores take a preview and give it back in an export`() = runBlocking {
        val preferences = PreferencesStore(context)
        val ratings = RatingsStore(context)
        val planEdits = PlanEditsStore(context)
        val profiles = ProfileStore(context)
        val notes = NotesStore(context)
        val repository = PersonalDataRepository(DataStorePersonalStores(preferences, ratings, planEdits, profiles, notes), journal())
        val preview = assertIs<PersonalDataRepository.PreviewResult.Ok>(repository.preview(fixture, bundle)).preview
        assertTrue(preview.changes.all { it.status == ImportStatus.ADD })
        assertIs<PersonalDataRepository.ApplyResult.Applied>(repository.apply(preview.changes, bundle))
        val after = repository.snapshot()
        assertEquals(setOf("talk-a"), after.mustAttend)
        assertEquals(setOf("talk-a"), after.bookmarks)
        assertEquals("ಕನ್ನಡ\nFollow up after the talk", after.notes["talk-b"]?.body)
        assertEquals(listOf("talk-b"), after.edits.removed)
        assertEquals("Asha", after.profile.fullName)
        val exported = repository.export(bundle, "2026-09-10T08:00:00.000Z")
        assertTrue("\"activityId\":\"talk-a\"" in exported)
        assertTrue("Follow up after the talk" in exported)
        // The same file again: everything is already here.
        val again = assertIs<PersonalDataRepository.PreviewResult.Ok>(repository.preview(fixture, bundle)).preview
        assertEquals(emptyList(), again.changes)
    }
}
