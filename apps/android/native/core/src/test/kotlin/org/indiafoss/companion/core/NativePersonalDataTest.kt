package org.indiafoss.companion.core

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The native half of the personal-data transfer (#240): the export allowlist,
 * the shared PWA fixture importing through CFP identity, the preview's
 * additions / conflicts / unresolved records, the stale check and the pure
 * apply. The PWA's storage tests cover the same scenarios on its side; the
 * two fixtures under packages/test-fixtures are what keep them in step.
 */
class NativePersonalDataTest {
    private fun fixtures(): File = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
        .map { File(it, "packages/test-fixtures/fixtures/personal-data/valid") }.first { it.isDirectory }

    private fun fixture(name: String): JsonObject = Json.parseToJsonElement(File(fixtures(), name).readText()).jsonObject

    private fun talk(id: String, proposal: String?, start: String = "2026-09-19T10:00:00+05:30", end: String = "2026-09-19T10:30:00+05:30") =
        Activity(id, "Title of $id", start = start, end = end, locationId = "hall-1", trackId = "other", proposalId = proposal)

    private fun bundle(vararg activities: Activity = arrayOf(talk("talk-a", "cfp-0"), talk("talk-b", "cfp-1", "2026-09-19T11:00:00+05:30", "2026-09-19T11:30:00+05:30"))) =
        EventBundle(
            "indiafoss-2026", "IndiaFOSS", "Asia/Kolkata", "2026-09-19T09:00:00+05:30", "2026-09-20T18:00:00+05:30",
            activities = activities.toList(),
            locations = listOf(Location("hall-1", "Hall 1")),
            booths = listOf(Booth("booth-1", "Booth One", locationId = "hall-1")),
            tracks = listOf(Track("devroom", "Devroom"), Track("other", "Other")),
        )

    /** The state behind `native-export.json`, including things that must never reach the file. */
    private fun nativeState() = PersonalState(
        bookmarks = setOf("talk-a"),
        mustAttend = setOf("talk-a"),
        ranking = RankingState(
            ratings = mapOf(
                "talk-a" to SessionRating(1232.0, 1, "normal", "yes"),
                "talk-b" to SessionRating(1168.0, 1, "normal"),
                "old-talk" to SessionRating(1200.0, 0, "not-interested"),
            ),
            comparisons = listOf(StoredComparison("cmp-1", "talk-a", "talk-b", 1.0, 1788915600000L)),
            rooms = mapOf("devroom" to "stay"),
            roomSkipped = mapOf("other" to listOf("talk-b", "gone-talk")),
            roomsDecided = true,
        ),
        edits = PlanEdits(
            blocks = listOf(
                StoredBlock("blk-1", "Coffee with Priya", "2026-09-19", "2026-09-19T11:30:00+05:30", "2026-09-19T12:00:00+05:30", 30),
                StoredBlock("visit-booth-1", "Visit Booth One", "2026-09-19", durationMinutes = 20, locationId = "hall-1"),
                StoredBlock("blk-2", "Find a quiet corner", "2026-09-19", durationMinutes = 15),
            ),
            removed = listOf("talk-b"),
            locked = listOf("blk-1"),
        ),
        profile = ContactCard(
            fullName = "Asha", email = "asha@example.org", matrixId = "@asha:example.org", fossUnitedUsername = "asha",
            socials = mapOf("github" to "https://github.com/asha"),
            share = mapOf("name" to true, "email" to false, "github" to true, "fossunited" to true),
            identityVersion = 1, retainedIdentity = mapOf("version" to "SECRET-ENVELOPE"),
        ),
        notes = mapOf("talk-b" to Note("ಕನ್ನಡ\nFollow up after the talk", "2026-09-09T01:00:00.000Z")),
    )

    private fun preview(file: JsonObject, state: PersonalState = PersonalState(), bundle: EventBundle? = bundle()): ImportPreview =
        NativePersonalData.preview(PersonalDataValidation.validate(file), state, bundle)

    private fun ImportPreview.change(id: String): ImportChange = changes.firstOrNull { it.id == id } ?: error("no change $id in ${changes.map { it.id }}")

    @Test
    fun `export is the shared native fixture and carries nothing private`() {
        val file = NativePersonalData.export(nativeState(), bundle(), "2026-09-10T08:00:00.000Z")
        assertEquals(fixture("native-export.json"), file)
        val text = PersonalDataFiles.encode(file)
        for (private in listOf("SECRET-ENVELOPE", "retainedIdentity", "identityVersion", "meshNodeId", "gone-talk", "\"met\""))
            assertFalse(private in text, "export must not carry $private")
        // Unassigned: the rating for a session no longer in the programme is kept, not guessed into the event.
        assertEquals("old-talk", file["unassigned"]!!.jsonObject["preferences"]!!.jsonArray[0].jsonObject["activityId"]!!.let { (it as JsonPrimitive).content })
    }

    @Test
    fun `export without a programme keeps every record under unassigned`() {
        val file = NativePersonalData.export(nativeState(), null, "2026-09-10T08:00:00.000Z")
        assertEquals(0, file["events"]!!.jsonArray.size)
        assertEquals(3, file["unassigned"]!!.jsonObject["preferences"]!!.jsonArray.size)
        assertNotNull(file["contact"])
        assertTrue(PersonalDataFiles.decode(PersonalDataFiles.encode(file)).ok)
    }

    @Test
    fun `the PWA export imports through CFP identity after a schedule move`() {
        val moved = bundle(talk("talk-a-moved", "cfp-0"), talk("talk-b", "cfp-1", "2026-09-19T11:00:00+05:30", "2026-09-19T11:30:00+05:30"))
        val result = preview(fixture("pwa-export.json"), bundle = moved)
        assertEquals(emptyList(), result.skipped)
        assertEquals(0, result.unchanged)
        assertTrue(result.changes.all { it.status == ImportStatus.ADD }, result.changes.toString())
        assertEquals(2, result.unsupported.size, result.unsupported.toString()) // itinerary and resolvedPlans: the plan is resolved here
        val preference = result.change("preferences:talk-a-moved")
        assertEquals("Title of talk-a-moved", preference.label)
        assertEquals("must-attend, bookmarked, quick pass yes, rating 1200", preference.incomingSummary)
        assertEquals(ImportWrite.Preference("talk-a-moved", SessionRating(1200.0, 0, "must-attend", "yes"), true), preference.write)
        val comparison = result.change("comparisons:comparison-1").write as ImportWrite.Comparison
        assertEquals(StoredComparison("comparison-1", "talk-a-moved", "talk-b", 1.0, 1788915600000L), comparison.comparison)
        val plan = result.change("plans:2026-09-19").write as ImportWrite.Plan
        assertEquals(listOf("talk-a-moved", "custom-lunch"), plan.locked)
        assertEquals(listOf("talk-b"), plan.removed)
        assertEquals(mapOf("talk-b" to "talk-a-moved"), plan.replacements)
        assertEquals(listOf(StoredBlock("custom-lunch", "Lunch with friends", "2026-09-19", "2026-09-19T12:00:00+05:30", "2026-09-19T12:30:00+05:30", 30)), plan.blocks)
        assertEquals(ImportWrite.Rooms(mapOf("devroom" to "stay"), mapOf("other" to listOf("talk-b"))), result.change("rooms").write)
        assertEquals(ImportWrite.RoomsDecided(true), result.change("roomsDecided").write)
        assertEquals("shares name", result.change("contact.selection").incomingSummary)

        val applied = NativePersonalData.apply(PersonalState(), result.changes, moved)
        assertEquals(setOf("talk-a-moved"), applied.mustAttend)
        assertEquals(setOf("talk-a-moved"), applied.bookmarks)
        assertEquals("must-attend", applied.dispositionOf("talk-a-moved"))
        assertNull(applied.ranking.ratings["talk-a"])
        assertEquals("ಕನ್ನಡ\nFollow up after the talk", applied.notes["talk-b"]?.body)
        assertEquals(listOf("talk-b"), applied.edits.removed)
        assertEquals(mapOf("talk-b" to "talk-a-moved"), applied.edits.replacements)
        assertEquals("Asha", applied.profile.fullName)
        assertEquals("asha@example.org", applied.profile.email)
        assertEquals(mapOf("name" to true, "email" to false, "github" to true), applied.profile.share)
        // The imported must-attend choice drives the resolved plan and, from it, the reminders.
        val plan2 = ResolvedPlan.forDay(moved, "2026-09-19", { 1200.0 }, { if (it in applied.mustAttend) Disposition.MUST_ATTEND else Disposition.NORMAL }, { it in applied.bookmarks },
            ResolvedPlan.Edits(removed = applied.edits.removed.toSet(), replacements = applied.edits.replacements, blocks = applied.edits.blocks.map { it.toBlock() }))
        assertTrue(plan2.feasible)
        assertTrue(plan2.items.any { it.id == "talk-a-moved" && it.source == ResolvedPlan.Source.MUST_ATTEND })
        val reminders = Reminders.forPlans(listOf(plan2), moved::location, Schedule.parseInstant("2026-09-19T08:00:00+05:30"), { if (it in applied.mustAttend) Disposition.MUST_ATTEND else Disposition.NORMAL })
        assertTrue(reminders.any { it.id == "must-talk-a-moved" }, reminders.map { it.id }.toString())
        // A second preview of the same file against the imported state finds nothing left to import.
        val again = preview(fixture("pwa-export.json"), applied, moved)
        assertEquals(emptyList(), again.changes.map { it.id })
        assertTrue(again.unchanged >= 8, again.unchanged.toString())
    }

    @Test
    fun `a repeated CFP entry needs an exact occurrence, otherwise the record is listed as ambiguous`() {
        val exact = bundle(talk("talk-a", "cfp-0"), talk("talk-a-2", "cfp-0", "2026-09-20T10:00:00+05:30", "2026-09-20T10:30:00+05:30"), talk("talk-b", "cfp-1"))
        assertEquals(emptyList(), preview(fixture("pwa-export.json"), bundle = exact).skipped)
        val repeated = bundle(talk("talk-a-x", "cfp-0"), talk("talk-a-y", "cfp-0", "2026-09-20T10:00:00+05:30", "2026-09-20T10:30:00+05:30"), talk("talk-b", "cfp-1"))
        val result = preview(fixture("pwa-export.json"), bundle = repeated)
        val skipped = result.skipped.first { it.section == "preferences" }
        assertEquals(ImportSkipReason.AMBIGUOUS, skipped.reason)
        assertEquals("talk-a (repeated CFP entry)", skipped.detail)
        assertTrue(result.skipped.any { it.section == "plans" && it.reason == ImportSkipReason.AMBIGUOUS })
        // The note on talk-b, which resolves, still imports; nothing is matched by title.
        assertNotNull(result.changes.firstOrNull { it.id == "notes:talk-b" })
        assertNull(result.changes.firstOrNull { it.section == "preferences" })
    }

    @Test
    fun `another event or no programme lists every record rather than dropping it`() {
        val other = preview(fixture("pwa-export.json"), bundle = bundle().copy(id = "indiafoss-2025"))
        assertTrue(other.changes.none { it.eventId != null })
        assertTrue(other.skipped.all { it.reason == ImportSkipReason.UNKNOWN_EVENT })
        assertTrue(other.skipped.any { it.section == "preferences" && it.label == "talk-a" })
        assertNotNull(other.changes.firstOrNull { it.id == "contact.profile" })
        val none = preview(fixture("pwa-export.json"), bundle = null)
        assertTrue(none.skipped.size >= 8)
    }

    @Test
    fun `a corrupt section is rejected before anything is planned`() {
        val file = fixture("pwa-export.json")
        fun corrupt(transform: (MutableMap<String, kotlinx.serialization.json.JsonElement>) -> Unit): JsonObject {
            val event = file["events"]!!.jsonArray[0].jsonObject.toMutableMap()
            val sections = event["sections"]!!.jsonObject.toMutableMap()
            transform(sections)
            event["sections"] = JsonObject(sections)
            return JsonObject(file.toMutableMap().also { it["events"] = kotlinx.serialization.json.JsonArray(listOf(JsonObject(event))) })
        }
        val badRating = corrupt { sections ->
            val record = sections["preferences"]!!.jsonArray[0].jsonObject.toMutableMap().also { it["rating"] = JsonPrimitive("high") }
            sections["preferences"] = kotlinx.serialization.json.JsonArray(listOf(JsonObject(record)))
        }
        assertEquals("events[0].sections.preferences[0].rating", assertFailsWith<PersonalDataException> { PersonalDataValidation.validate(badRating) }.path)
        val undeclared = corrupt { sections ->
            sections["notes"] = kotlinx.serialization.json.JsonArray(listOf(buildJsonObject { put("activityId", "talk-z"); put("body", "x"); put("updatedAt", "2026-09-09T01:00:00.000Z") }))
        }
        assertTrue(assertFailsWith<PersonalDataException> { PersonalDataValidation.validate(undeclared) }.path.contains("undeclared activity"))
        val badBooth = corrupt { sections -> sections["boothVisits"] = buildJsonObject { put("booth-1", 0) } }
        assertFailsWith<PersonalDataException> { PersonalDataValidation.validate(badBooth) }
        val badDay = corrupt { sections ->
            sections["plans"] = kotlinx.serialization.json.JsonArray(listOf(buildJsonObject {
                put("day", "2026-02-30"); put("locked", kotlinx.serialization.json.JsonArray(emptyList())); put("removed", kotlinx.serialization.json.JsonArray(emptyList()))
                put("replacements", buildJsonObject {}); put("customBlocks", kotlinx.serialization.json.JsonArray(emptyList()))
            }))
        }
        assertEquals("events[0].sections.plans[0].day", assertFailsWith<PersonalDataException> { PersonalDataValidation.validate(badDay) }.path)
        // The codec's own fixtures decode; the minimal one lacks the fields the section contract requires, on both platforms.
        assertFailsWith<PersonalDataException> { PersonalDataValidation.validate(fixture("minimal.json")) }
    }

    @Test
    fun `conflicts keep the current value by default and a record changed after the preview is stale`() {
        val state = PersonalState(
            bookmarks = emptySet(), mustAttend = emptySet(),
            ranking = RankingState(ratings = mapOf("talk-a" to SessionRating(1300.0, 3, "not-interested", "no"))),
            profile = ContactCard(fullName = "Asha", email = "asha@example.org", share = mapOf("name" to true, "email" to false)),
        )
        val result = preview(fixture("pwa-export.json"), state)
        val conflict = result.change("preferences:talk-a")
        assertEquals(ImportStatus.CONFLICT, conflict.status)
        assertEquals("not-interested, quick pass no, rating 1300", conflict.currentSummary)
        assertEquals("must-attend, bookmarked, quick pass yes, rating 1200", conflict.incomingSummary)
        assertEquals(ImportStatus.CONFLICT, result.change("contact.profile").status)
        // The explicit sharing-off choice on this device is a conflict, never silently switched on.
        val selection = result.change("contact.selection")
        assertEquals(ImportStatus.CONFLICT, selection.status)
        assertEquals("shares name", selection.currentSummary)
        // Applying only the additions leaves the explicit negative choice exactly as it was.
        val kept = NativePersonalData.apply(state, result.additions, bundle())
        assertEquals(SessionRating(1300.0, 3, "not-interested", "no"), kept.ranking.rating("talk-a"))
        assertEquals("Asha", kept.profile.fullName)
        assertEquals("ಕನ್ನಡ\nFollow up after the talk", kept.notes["talk-b"]?.body)
        // Nothing changed: safe. The rating edited after the preview: the write must not proceed.
        assertEquals(emptyList(), NativePersonalData.stale(result.changes, state, bundle()))
        val edited = state.copy(ranking = RankingState(ratings = mapOf("talk-a" to SessionRating(1350.0, 4, "not-interested", "no"))))
        assertEquals(listOf("Title of talk-a"), NativePersonalData.stale(result.changes, edited, bundle()))
        // A record that was new at preview time and exists now is stale too.
        val added = state.copy(notes = mapOf("talk-b" to Note("mine", "2026-09-10T00:00:00.000Z")))
        assertEquals(listOf("Title of talk-b"), NativePersonalData.stale(result.changes, added, bundle()))
    }

    @Test
    fun `private and unknown sections are reported as unsupported and never written`() {
        val base = fixture("pwa-export.json")
        val event = base["events"]!!.jsonArray[0].jsonObject.toMutableMap()
        event["sections"] = JsonObject(event["sections"]!!.jsonObject + mapOf("settings" to buildJsonObject { put("matrix-session", "token") }))
        val file = JsonObject(base.toMutableMap().also {
            it["events"] = kotlinx.serialization.json.JsonArray(listOf(JsonObject(event)))
            it["contact"] = JsonObject(base["contact"]!!.jsonObject + mapOf("matrixAccessToken" to JsonPrimitive("syt_secret")))
            it["deviceKeys"] = buildJsonObject { put("ed25519", "private") }
        })
        assertTrue(PersonalDataFiles.decode(file.toString()).ok)
        val result = preview(file)
        assertTrue("events[0].sections.settings" in result.unsupported, result.unsupported.toString())
        assertTrue("contact.matrixAccessToken" in result.unsupported)
        assertTrue("deviceKeys" in result.unsupported)
        val applied = NativePersonalData.apply(PersonalState(), result.changes, bundle())
        val text = Json.encodeToString(PersonalState.serializer(), applied)
        assertFalse("syt_secret" in text || "token" in text || "private" in text)
        // A later export of the imported state does not carry them either.
        assertFalse("syt_secret" in PersonalDataFiles.encode(NativePersonalData.export(applied, bundle())))
    }

    @Test
    fun `a native export round-trips through native import unchanged`() {
        val state = nativeState()
        val file = NativePersonalData.export(state, bundle(), "2026-09-10T08:00:00.000Z")
        val same = preview(file, state)
        assertEquals(emptyList(), same.changes.map { it.id })
        assertEquals(listOf("old-talk"), same.skipped.map { it.label })
        assertEquals(ImportSkipReason.UNASSIGNED, same.skipped.single().reason)
        val fresh = preview(file, PersonalState())
        assertTrue(fresh.changes.all { it.status == ImportStatus.ADD })
        val applied = NativePersonalData.apply(PersonalState(), fresh.changes, bundle())
        assertEquals(state.bookmarks, applied.bookmarks)
        assertEquals(state.mustAttend, applied.mustAttend)
        // The must-attend set is folded into the stored disposition on the way through; what the app shows is the same.
        assertEquals((state.ranking.ratings - "old-talk").mapValues { (id, r) -> r.copy(disposition = state.dispositionOf(id)) }, applied.ranking.ratings)
        for (id in listOf("talk-a", "talk-b")) assertEquals(state.dispositionOf(id), applied.dispositionOf(id))
        assertEquals(state.ranking.comparisons, applied.ranking.comparisons)
        assertEquals(state.ranking.rooms, applied.ranking.rooms)
        assertEquals(mapOf("other" to listOf("talk-b")), applied.ranking.roomSkipped)
        assertEquals(state.edits.blocks.toSet(), applied.edits.blocks.toSet())
        assertEquals(state.edits.removed, applied.edits.removed)
        assertEquals(state.edits.locked, applied.edits.locked)
        assertEquals(state.notes, applied.notes)
        assertEquals(state.profile.copy(identityVersion = Identity.VERSION, retainedIdentity = emptyMap()), applied.profile)
    }

    @Test
    fun `booth visits travel by stable id and a null cancels the visit`() {
        val visiting = PersonalState(edits = PlanEdits(blocks = listOf(StoredBlock("visit-booth-1", "Visit Booth One", "2026-09-19", durationMinutes = 20, locationId = "hall-1"))))
        val cancel = buildJsonObject {
            put("format", "indiafoss-personal-data"); put("schemaVersion", 1); put("exportedAt", "2026-09-10T08:00:00.000Z")
            put("events", kotlinx.serialization.json.JsonArray(listOf(buildJsonObject {
                put("eventId", "indiafoss-2026"); put("activities", kotlinx.serialization.json.JsonArray(emptyList()))
                put("sections", buildJsonObject { put("boothVisits", buildJsonObject { put("booth-1", kotlinx.serialization.json.JsonNull); put("booth-9", 30) }) })
            })))
        }
        val result = preview(cancel, visiting)
        val change = result.change("blocks:visit-booth-1")
        assertEquals(ImportStatus.CONFLICT, change.status)
        assertEquals("visit cancelled", change.incomingSummary)
        assertEquals("20 min on 2026-09-19", change.currentSummary)
        assertEquals("booth-9 (booth not in this programme)", result.skipped.single().detail)
        assertEquals(emptyList(), NativePersonalData.apply(visiting, result.changes, bundle()).edits.blocks)
        // From the PWA, a visit has no day: it is placed on the programme's first day and named as such.
        val fromPwa = preview(fixture("pwa-export.json").let { JsonObject(it.toMutableMap().also { m ->
            val event = m["events"]!!.jsonArray[0].jsonObject.toMutableMap()
            event["sections"] = JsonObject(event["sections"]!!.jsonObject + mapOf("boothVisits" to buildJsonObject { put("booth-1", 45) }))
            m["events"] = kotlinx.serialization.json.JsonArray(listOf(JsonObject(event)))
        }) })
        val visit = fromPwa.change("blocks:visit-booth-1").write as ImportWrite.Block
        assertEquals(StoredBlock("visit-booth-1", "Visit Booth One", "2026-09-19", durationMinutes = 45, locationId = "hall-1"), visit.block)
        assertEquals("Booth One", fromPwa.change("blocks:visit-booth-1").label)
    }

    @Test
    fun `a clash settlement keeps its stood-aside mark and clash flag through native`() {
        val result = preview(fixture("clash-settlement.json"))
        val loser = result.change("preferences:talk-b").write as ImportWrite.Preference
        assertEquals("talk-a", loser.rating.yieldedTo)
        val clash = result.change("comparisons:clash-1").write as ImportWrite.Comparison
        assertTrue(clash.comparison.clash)
        val applied = NativePersonalData.apply(PersonalState(), result.changes, bundle())
        assertEquals("talk-a", applied.ranking.yieldedTo("talk-b"))
        assertTrue(applied.ranking.history.single().clash)
        // Re-exported, the same two fields come back out for the PWA.
        val text = PersonalDataFiles.encode(NativePersonalData.export(applied, bundle()))
        assertTrue("\"yieldedTo\":\"talk-a\"" in text && "\"clash\":true" in text, text)
    }

    @Test
    fun `the same record twice in one file is imported once and named`() {
        val base = fixture("pwa-export.json")
        val event = base["events"]!!.jsonArray[0].jsonObject.toMutableMap()
        val notes = event["sections"]!!.jsonObject["notes"]!!.jsonArray
        // The codec rejects duplicate references, so the duplicate is a second note for the same resolved session under a different declared id.
        val activities = event["activities"]!!.jsonArray + buildJsonObject { put("eventId", "indiafoss-2026"); put("activityId", "talk-b-old"); put("proposalId", "cfp-1") }
        event["activities"] = kotlinx.serialization.json.JsonArray(activities)
        event["sections"] = JsonObject(event["sections"]!!.jsonObject + mapOf("notes" to kotlinx.serialization.json.JsonArray(notes + buildJsonObject {
            put("activityId", "talk-b-old"); put("body", "older"); put("updatedAt", "2026-09-08T01:00:00.000Z")
        })))
        val result = preview(JsonObject(base.toMutableMap().also { it["events"] = kotlinx.serialization.json.JsonArray(listOf(JsonObject(event))) }))
        assertEquals(1, result.changes.count { it.section == "notes" })
        assertIs<ImportSkip>(result.skipped.single { it.reason == ImportSkipReason.DUPLICATE })
    }
}
