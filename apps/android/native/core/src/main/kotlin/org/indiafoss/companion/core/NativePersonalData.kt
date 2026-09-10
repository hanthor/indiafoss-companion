package org.indiafoss.companion.core

import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatterBuilder
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** One write the import would make; the local projection of the same record is compared as the same type. */
@Serializable
sealed class ImportWrite {
    /** Rating, disposition, triage and bookmark for one session: ranking entry plus bookmark and must-attend membership. */
    @Serializable
    data class Preference(val activityId: String, val rating: SessionRating, val bookmarked: Boolean) : ImportWrite()

    @Serializable
    data class NoteWrite(val activityId: String, val note: Note) : ImportWrite()

    @Serializable
    data class Comparison(val comparison: StoredComparison) : ImportWrite()

    /** One day's edits: fixed blocks, removals, replacements and locks whose session or block falls on that day. */
    @Serializable
    data class Plan(
        val day: String,
        val blocks: List<StoredBlock>,
        val removed: List<String>,
        val replacements: Map<String, String>,
        val locked: List<String>,
    ) : ImportWrite()

    /** A flexible block (including a booth visit) by id; `block == null` removes it. */
    @Serializable
    data class Block(val id: String, val block: StoredBlock?, val locked: Boolean = false) : ImportWrite()

    @Serializable
    data class Rooms(val prefs: Map<String, String>, val skipped: Map<String, List<String>>) : ImportWrite()

    @Serializable
    data class RoomsDecided(val decided: Boolean) : ImportWrite()

    /** The allowlisted card fields, in the transfer vocabulary. */
    @Serializable
    data class Profile(val fields: Map<String, String>, val socials: Map<String, String>) : ImportWrite()

    /** The explicit sharing selection, in the card's own `share` vocabulary. */
    @Serializable
    data class Selection(val share: Map<String, Boolean>) : ImportWrite()
}

enum class ImportStatus { ADD, CONFLICT }

@Serializable
data class ImportChange(
    /** `section:key`; stable across previews of the same file. */
    val id: String,
    val section: String,
    val eventId: String? = null,
    val label: String,
    /** CONFLICT means this device already holds a different value; the default is to keep it. */
    val status: ImportStatus,
    /** Exactly what this device held at preview time, re-checked before the write. */
    val current: ImportWrite? = null,
    val currentSummary: String? = null,
    val incomingSummary: String,
    val write: ImportWrite,
)

enum class ImportSkipReason(val label: String) {
    UNKNOWN_EVENT("not this programme"),
    MISSING("not in this programme"),
    AMBIGUOUS("repeated CFP entry"),
    WRONG_EVENT("other event"),
    UNASSIGNED("no event recorded"),
    DUPLICATE("listed twice in the file"),
}

@Serializable
data class ImportSkip(val section: String, val eventId: String? = null, val label: String, val reason: ImportSkipReason, val detail: String)

@Serializable
data class ImportPreview(
    val exportedAt: String,
    val changes: List<ImportChange>,
    /** Records shown to the attendee but never applied by this importer. */
    val skipped: List<ImportSkip>,
    /** Records already stored with exactly the same value. */
    val unchanged: Int,
    /** Sections this importer does not understand or does not store; reported, never written. */
    val unsupported: List<String>,
) {
    val additions: List<ImportChange> get() = changes.filter { it.status == ImportStatus.ADD }
    val conflicts: List<ImportChange> get() = changes.filter { it.status == ImportStatus.CONFLICT }
}

/** Thrown before any write when a previewed record changed underneath the preview. */
class PersonalDataStaleException(val labels: List<String>) :
    IllegalStateException("Local data changed after the preview: ${labels.joinToString(", ")}")

/**
 * The native side of the personal-data transfer (#240): the explicit export
 * allowlist over [PersonalState], and the pure import planner that resolves a
 * validated file against the current programme, previews additions and
 * conflicts (kept by default) and folds the chosen changes into a new state.
 *
 * Nothing here reads or writes storage. `PersonalDataRepository` in `:app`
 * snapshots the stores, calls [preview], re-checks every `current` with
 * [stale] and writes the result of [apply] under a journal so a failure part
 * way through rolls back.
 */
object NativePersonalData {
    const val FORMAT = "indiafoss-personal-data"
    const val SCHEMA_VERSION = 1

    /** Native-only section: blocks without a fixed time, which the PWA's custom blocks cannot carry. */
    const val FLEXIBLE_BLOCKS = "flexibleBlocks"

    /** Native-only unassigned section: edits whose session is not in the current programme. */
    const val UNASSIGNED_PLAN_EDITS = "planEdits"

    /** The id a planned booth visit's block carries: `visit-<stable booth id>`. */
    const val VISIT_PREFIX = "visit-"

    private val instant = DateTimeFormatterBuilder().appendInstant(3).toFormatter()

    fun isoInstant(millis: Long): String = instant.format(Instant.ofEpochMilli(millis))

    fun exportedAtNow(): String = isoInstant(System.currentTimeMillis())

    // ---------- Export ----------

    /**
     * The versioned file for this device's personal state: only the fields
     * listed here, scoped to the cached programme. Records whose session is
     * not in that programme go to `unassigned`, never guessed by title or id.
     * The handshake key, met contacts, identity envelope bookkeeping and the
     * device switches are not read at all.
     */
    fun export(state: PersonalState, bundle: EventBundle?, exportedAt: String = exportedAtNow()): JsonObject {
        val activities = bundle?.activities.orEmpty().associateBy { it.id }
        val referenced = LinkedHashSet<String>()
        fun known(id: String): Boolean = id in activities
        fun refer(id: String): String { referenced += id; return id }

        val preferences = ArrayList<JsonObject>()
        val unassignedPreferences = ArrayList<JsonObject>()
        val ids = (state.ranking.ratings.keys + state.bookmarks + state.mustAttend).sorted()
        for (id in ids) {
            val rating = state.ranking.rating(id)
            val record = buildJsonObject {
                put("activityId", id)
                put("rating", rating.rating)
                put("comparisons", rating.comparisons)
                put("disposition", state.dispositionOf(id))
                put("bookmarked", id in state.bookmarks)
                rating.triage?.let { put("triage", it) }
                rating.yieldedTo?.let { put("yieldedTo", it) }
            }
            if (known(id)) { refer(id); preferences += record } else unassignedPreferences += record
        }
        val notes = ArrayList<JsonObject>()
        val unassignedNotes = ArrayList<JsonObject>()
        for ((id, note) in state.notes.toSortedMap()) {
            val record = buildJsonObject { put("activityId", id); put("body", note.body); put("updatedAt", note.updatedAt) }
            if (known(id)) { refer(id); notes += record } else unassignedNotes += record
        }
        val comparisons = ArrayList<JsonObject>()
        val unassignedComparisons = ArrayList<JsonObject>()
        for (comparison in state.ranking.comparisons) {
            val record = buildJsonObject {
                put("id", comparison.id)
                put("activityA", comparison.a)
                put("activityB", comparison.b)
                put("scoreA", comparison.scoreA)
                put("createdAt", isoInstant(comparison.at))
                if (comparison.clash) put("clash", true)
            }
            if (known(comparison.a) && known(comparison.b)) { refer(comparison.a); refer(comparison.b); comparisons += record }
            else unassignedComparisons += record
        }

        // Plan edits are per day in the file: a block by its own day, a session by its day in the programme.
        fun dayOf(id: String): String? = activities[id]?.start?.let(Schedule::dayKey)
        val days = sortedMapOf<String, PlanDay>()
        fun day(key: String) = days.getOrPut(key) { PlanDay() }
        val flexible = LinkedHashMap<String, StoredBlock>()
        val boothVisits = LinkedHashMap<String, Int>()
        val booths = bundle?.booths.orEmpty().associateBy { it.id }
        for (block in state.edits.blocks) {
            if (block.toBlock().flexible) {
                flexible[block.id] = block
                val boothId = block.id.removePrefix(VISIT_PREFIX)
                if (block.id.startsWith(VISIT_PREFIX) && boothId in booths) boothVisits[boothId] = block.durationMinutes
            } else day(block.day).blocks += block
        }
        val strayLocked = ArrayList<String>()
        val strayRemoved = ArrayList<String>()
        val strayReplacements = LinkedHashMap<String, String>()
        val fixedBlockDay = state.edits.blocks.filter { !it.toBlock().flexible }.associate { it.id to it.day }
        for (id in state.edits.removed) {
            val at = dayOf(id) ?: fixedBlockDay[id]
            if (at != null) { if (known(id)) refer(id); day(at).removed += id } else strayRemoved += id
        }
        for (id in state.edits.locked) {
            if (id in flexible) continue // carried on the flexible block itself
            val at = dayOf(id) ?: fixedBlockDay[id]
            if (at != null) { if (known(id)) refer(id); day(at).locked += id } else strayLocked += id
        }
        for ((original, replacement) in state.edits.replacements) {
            val at = dayOf(original)
            if (at != null && known(replacement)) { refer(original); refer(replacement); day(at).replacements[original] = replacement }
            else strayReplacements[original] = replacement
        }
        val plans = buildJsonArray {
            for ((key, plan) in days) add(buildJsonObject {
                put("day", key)
                put("locked", JsonArray(plan.locked.map(::JsonPrimitive)))
                put("removed", JsonArray(plan.removed.map(::JsonPrimitive)))
                put("replacements", JsonObject(plan.replacements.mapValues { JsonPrimitive(it.value) }))
                put("customBlocks", buildJsonArray {
                    for (block in plan.blocks) add(buildJsonObject {
                        put("id", block.id)
                        put("label", block.label)
                        put("start", block.start!!)
                        put("end", block.end!!)
                        block.locationId?.let { put("locationId", it) }
                    })
                })
            })
        }
        val flexibleBlocks = buildJsonArray {
            for (block in flexible.values) add(buildJsonObject {
                put("id", block.id)
                put("label", block.label)
                put("day", block.day)
                put("durationMinutes", block.durationMinutes)
                block.locationId?.let { put("locationId", it) }
                if (block.id in state.edits.locked) put("locked", true)
            })
        }
        // Skip bookkeeping only names sessions of this programme; the ratings it marked travel as preferences.
        val skipped = state.ranking.roomSkipped.mapValues { (_, list) -> list.filter(::known).map(::refer) }

        val sections = buildJsonObject {
            if (preferences.isNotEmpty()) put("preferences", JsonArray(preferences))
            if (notes.isNotEmpty()) put("notes", JsonArray(notes))
            if (comparisons.isNotEmpty()) put("comparisons", JsonArray(comparisons))
            if (plans.isNotEmpty()) put("plans", plans)
            if (flexibleBlocks.isNotEmpty()) put(FLEXIBLE_BLOCKS, flexibleBlocks)
            put("rooms", buildJsonObject {
                put("prefs", JsonObject(state.ranking.rooms.mapValues { JsonPrimitive(it.value) }))
                put("skipped", JsonObject(skipped.mapValues { (_, list) -> JsonArray(list.map(::JsonPrimitive)) }))
            })
            put("roomsDecided", state.ranking.roomsDecided)
            if (boothVisits.isNotEmpty()) put("boothVisits", JsonObject(boothVisits.mapValues { JsonPrimitive(it.value) }))
        }
        val events = buildJsonArray {
            if (bundle != null) add(buildJsonObject {
                put("eventId", bundle.id)
                put("activities", buildJsonArray {
                    for (id in referenced) add(buildJsonObject {
                        put("eventId", bundle.id)
                        put("activityId", id)
                        activities[id]?.proposalId?.takeIf { it.isNotBlank() }?.let { put("proposalId", it) }
                    })
                })
                put("sections", sections)
            })
        }
        val unassigned = buildJsonObject {
            if (unassignedPreferences.isNotEmpty()) put("preferences", JsonArray(unassignedPreferences))
            if (unassignedNotes.isNotEmpty()) put("notes", JsonArray(unassignedNotes))
            if (unassignedComparisons.isNotEmpty()) put("comparisons", JsonArray(unassignedComparisons))
            if (strayLocked.isNotEmpty() || strayRemoved.isNotEmpty() || strayReplacements.isNotEmpty()) put(UNASSIGNED_PLAN_EDITS, buildJsonObject {
                put("locked", JsonArray(strayLocked.map(::JsonPrimitive)))
                put("removed", JsonArray(strayRemoved.map(::JsonPrimitive)))
                put("replacements", JsonObject(strayReplacements.mapValues { JsonPrimitive(it.value) }))
            })
        }
        val profile = profileFields(state.profile)
        val selection = selectionFields(state.profile)
        val file = buildJsonObject {
            put("format", FORMAT)
            put("schemaVersion", SCHEMA_VERSION)
            put("exportedAt", exportedAt)
            put("events", events)
            if (profile != null || selection != null) put("contact", buildJsonObject {
                profile?.let { put("profile", it) }
                selection?.let { put("selection", it) }
            })
            if (unassigned.isNotEmpty()) put("unassigned", unassigned)
        }
        // Fail the whole export rather than deliver a file the other side would reject.
        PersonalDataFiles.encode(file)
        PersonalDataValidation.validate(file)
        return file
    }

    private class PlanDay {
        val blocks = ArrayList<StoredBlock>()
        val removed = ArrayList<String>()
        val locked = ArrayList<String>()
        val replacements = LinkedHashMap<String, String>()
    }

    private const val FOSS_UNITED_PROFILE = "https://fossunited.org/u/"

    /** The card's allowlisted fields in the transfer vocabulary; blank fields are absent, never the identity envelope or the key. */
    fun profileProjection(card: ContactCard): ImportWrite.Profile {
        val fields = LinkedHashMap<String, String>()
        fun field(name: String, value: String) { if (value.isNotBlank()) fields[name] = value }
        field("fullName", card.fullName)
        field("organization", card.organization)
        field("email", card.email)
        field("phone", card.phone)
        field("website", card.website)
        field("matrixId", card.matrixId)
        field("neutrinoServerName", card.meshNodeId)
        field("ticketRef", card.ticketRef)
        if (card.fossUnitedUsername.isNotBlank()) fields["fossUnitedProfileUrl"] = FOSS_UNITED_PROFILE + card.fossUnitedUsername.trim()
        field("avatarUrl", card.avatarUrl)
        val socials = card.socials.filterKeys { it in PersonalDataValidation.SOCIAL_FIELDS }.filterValues { it.isNotBlank() }
        return ImportWrite.Profile(fields, socials)
    }

    private fun profileFields(card: ContactCard): JsonObject? {
        val projection = profileProjection(card)
        if (projection.fields.isEmpty() && projection.socials.isEmpty()) return null
        return buildJsonObject {
            for ((name, value) in projection.fields) put(name, value)
            put("socials", JsonObject(projection.socials.mapValues { JsonPrimitive(it.value) }))
        }
    }

    /** The explicit `share` entries, in the transfer vocabulary (`fossunited` → `fossUnitedProfileUrl`). */
    fun selectionProjection(card: ContactCard): ImportWrite.Selection = ImportWrite.Selection(
        card.share.filterKeys { it in PersonalDataValidation.SHARE_FIELDS || it == "fossunited" || it in PersonalDataValidation.SOCIAL_FIELDS },
    )

    private fun selectionFields(card: ContactCard): JsonObject? {
        val share = selectionProjection(card).share
        if (share.isEmpty()) return null
        return buildJsonObject {
            for ((key, on) in share) {
                if (key in PersonalDataValidation.SOCIAL_FIELDS) continue
                put(if (key == "fossunited") "fossUnitedProfileUrl" else key, on)
            }
            put("socials", JsonObject(share.filterKeys { it in PersonalDataValidation.SOCIAL_FIELDS }.mapValues { JsonPrimitive(it.value) }))
        }
    }

    // ---------- Import: preview ----------

    private class Planner(val state: PersonalState, val bundle: EventBundle?) {
        val changes = LinkedHashMap<String, ImportChange>()
        val skipped = ArrayList<ImportSkip>()
        val unsupported = ArrayList<String>()
        var unchanged = 0

        fun consider(id: String, section: String, eventId: String?, label: String, write: ImportWrite, describe: (ImportWrite) -> String) {
            if (id in changes) {
                skipped += ImportSkip(section, eventId, label, ImportSkipReason.DUPLICATE, "the file carries this record twice")
                return
            }
            val current = currentOf(write, state, bundle)
            when {
                current == null -> changes[id] = ImportChange(id, section, eventId, label, ImportStatus.ADD, incomingSummary = describe(write), write = write)
                current == write -> unchanged += 1
                else -> changes[id] = ImportChange(
                    id, section, eventId, label, ImportStatus.CONFLICT,
                    current = current, currentSummary = describe(current), incomingSummary = describe(write), write = write,
                )
            }
        }
    }

    private data class Failure(val id: String, val status: String)

    private fun skipReason(failures: List<Failure>): ImportSkipReason = when {
        failures.any { it.status == "ambiguous" } -> ImportSkipReason.AMBIGUOUS
        failures.any { it.status == "wrong-event" } -> ImportSkipReason.WRONG_EVENT
        else -> ImportSkipReason.MISSING
    }

    private fun detail(failures: List<Failure>): String = failures.joinToString(", ") { (id, status) ->
        "$id (${when (status) { "ambiguous" -> "repeated CFP entry"; "wrong-event" -> "other event"; else -> "not in this programme" }})"
    }

    private fun JsonElement?.str(): String = (this as? JsonPrimitive)?.content.orEmpty()
    private fun JsonElement?.num(): Double = (this as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0
    private fun JsonElement?.boolean(): Boolean = (this as? JsonPrimitive)?.content == "true"
    private fun JsonObject.records(section: String): List<JsonObject> = (this[section] as? JsonArray)?.map { it.jsonObject }.orEmpty()
    private fun JsonElement?.strings(): List<String> = (this as? JsonArray)?.map { it.str() }.orEmpty()

    /**
     * Build the preview for a validated file against this device's state and
     * cached programme. Every activity reference goes through the shared
     * CFP/occurrence contract; a record with any unresolved reference is
     * listed by name, never dropped or matched by title.
     */
    fun preview(validated: PersonalDataValidation.Validated, state: PersonalState, bundle: EventBundle?): ImportPreview {
        val planner = Planner(state, bundle)
        planner.unsupported += validated.unsupported
        val file = validated.file
        for ((index, item) in (file["events"] as JsonArray).withIndex()) importEvent(planner, item.jsonObject, index)
        (file["contact"] as? JsonObject)?.let { importContact(planner, it) }
        (file["unassigned"] as? JsonObject)?.let { unassigned ->
            for ((section, value) in unassigned) {
                if (section == UNASSIGNED_PLAN_EDITS) {
                    val record = value.jsonObject
                    val ids = record["locked"].strings() + record["removed"].strings() +
                        (record["replacements"] as? JsonObject)?.keys.orEmpty()
                    for (id in ids.distinct()) planner.skipped += ImportSkip(
                        "plans", null, id, ImportSkipReason.UNASSIGNED, "no event recorded; keep the file to retry after a programme update",
                    )
                    continue
                }
                if (value !is JsonArray) continue
                for (record in value.map { it.jsonObject }) planner.skipped += ImportSkip(
                    section, null,
                    if (section == "comparisons") "${record["activityA"].str()} vs ${record["activityB"].str()}"
                    else (record["activityId"] ?: record["boothId"]).str(),
                    ImportSkipReason.UNASSIGNED, "no event recorded; keep the file to retry after a programme update",
                )
            }
        }
        return ImportPreview(file["exportedAt"].str(), planner.changes.values.toList(), planner.skipped, planner.unchanged, planner.unsupported)
    }

    private fun importEvent(planner: Planner, event: JsonObject, index: Int) {
        val eventId = event["eventId"].str()
        val sections = event["sections"]!!.jsonObject
        val bundle = planner.bundle
        val path = "events[$index].sections"
        if (bundle == null || bundle.id != eventId) {
            skipAll(planner, eventId, sections, ImportSkipReason.UNKNOWN_EVENT, "this programme is not on this device")
            return
        }
        val resolutions = (event["activities"] as JsonArray).map { it.jsonObject }.associate { reference ->
            val id = reference["activityId"].str()
            id to PortableActivities.resolve(
                PortableActivityReference(reference["eventId"].str(), id, (reference["proposalId"] as? JsonPrimitive)?.content),
                bundle.id, bundle.activities,
            )
        }
        val titles = bundle.activities.associate { it.id to it.title }
        fun resolveAll(ids: Collection<String>): Pair<Map<String, String>, List<Failure>> {
            val resolved = LinkedHashMap<String, String>()
            val failures = ArrayList<Failure>()
            for (id in ids) {
                val result = resolutions[id] ?: ActivityResolution("missing")
                if (result.status == "matched" && result.activityId != null) resolved[id] = result.activityId else failures += Failure(id, result.status)
            }
            return resolved to failures
        }
        fun skip(section: String, label: String, failures: List<Failure>) {
            planner.skipped += ImportSkip(section, eventId, label, skipReason(failures), detail(failures))
        }
        fun title(local: String) = titles[local] ?: local

        for (record in sections.records("preferences")) {
            val activityId = record["activityId"].str()
            val (ids, failures) = resolveAll(listOf(activityId))
            if (failures.isNotEmpty()) { skip("preferences", activityId, failures); continue }
            val local = ids.getValue(activityId)
            val yielded = (record["yieldedTo"] as? JsonPrimitive)?.content?.let { resolutions[it]?.takeIf { r -> r.status == "matched" }?.activityId }
            val write = ImportWrite.Preference(
                local,
                SessionRating(
                    rating = record["rating"].num(),
                    comparisons = record["comparisons"].num().toInt(),
                    disposition = record["disposition"].str(),
                    triage = (record["triage"] as? JsonPrimitive)?.content,
                    yieldedTo = yielded,
                ),
                bookmarked = record["bookmarked"].boolean(),
            )
            planner.consider("preferences:$local", "preferences", eventId, title(local), write, ::describePreference)
        }
        for (record in sections.records("notes")) {
            val activityId = record["activityId"].str()
            val (ids, failures) = resolveAll(listOf(activityId))
            if (failures.isNotEmpty()) { skip("notes", activityId, failures); continue }
            val local = ids.getValue(activityId)
            val write = ImportWrite.NoteWrite(local, Note(record["body"].str(), record["updatedAt"].str()))
            planner.consider("notes:$local", "notes", eventId, title(local), write, ::describeNote)
        }
        for (record in sections.records("comparisons")) {
            val a = record["activityA"].str()
            val b = record["activityB"].str()
            val (ids, failures) = resolveAll(listOf(a, b))
            if (failures.isNotEmpty()) { skip("comparisons", "$a vs $b", failures); continue }
            val write = ImportWrite.Comparison(StoredComparison(
                record["id"].str(), ids.getValue(a), ids.getValue(b), record["scoreA"].num(),
                OffsetDateTime.parse(record["createdAt"].str()).toInstant().toEpochMilli(),
                clash = record["clash"].boolean(),
            ))
            planner.consider("comparisons:${write.comparison.id}", "comparisons", eventId, "${title(ids.getValue(a))} vs ${title(ids.getValue(b))}", write) {
                val c = (it as ImportWrite.Comparison).comparison
                "${title(c.a)} vs ${title(c.b)}: ${c.scoreA}"
            }
        }
        // The plan is resolved from the programme on this device; a saved projection has nothing to restore.
        if ("itinerary" in sections) planner.unsupported += "$path.itinerary (the plan is resolved from the programme here)"
        if ("resolvedPlans" in sections) planner.unsupported += "$path.resolvedPlans (the plan is resolved from the programme here)"

        for (record in sections.records("plans")) {
            val day = record["day"].str()
            val customBlocks = record.records("customBlocks")
            val custom = customBlocks.map { it["id"].str() }.toSet()
            val replacements = (record["replacements"] as? JsonObject)?.mapValues { it.value.str() }.orEmpty()
            val locked = record["locked"].strings()
            val removed = record["removed"].strings()
            val references = (locked + removed + replacements.keys + replacements.values).filter { it !in custom }.distinct()
            val (ids, failures) = resolveAll(references)
            if (failures.isNotEmpty()) { skip("plans", "plan for $day", failures); continue }
            fun map(id: String) = ids[id] ?: id
            val blocks = customBlocks.map { block ->
                val start = block["start"].str()
                val end = block["end"].str()
                val minutes = ((OffsetDateTime.parse(end).toInstant().toEpochMilli() - OffsetDateTime.parse(start).toInstant().toEpochMilli()) / 60_000L).toInt()
                StoredBlock(block["id"].str(), block["label"].str(), day, start, end, maxOf(1, minutes), (block["locationId"] as? JsonPrimitive)?.content)
            }
            val write = ImportWrite.Plan(day, blocks, removed.map(::map), replacements.entries.associate { map(it.key) to map(it.value) }, locked.map(::map))
            planner.consider("plans:$day", "plans", eventId, "plan edits for $day", write, ::describePlan)
        }
        val flexibleIds = HashSet<String>()
        for (record in sections.records(FLEXIBLE_BLOCKS)) {
            val id = record["id"].str()
            flexibleIds += id
            val block = StoredBlock(
                id, record["label"].str(), record["day"].str(), durationMinutes = record["durationMinutes"].num().toInt(),
                locationId = (record["locationId"] as? JsonPrimitive)?.content,
            )
            planner.consider("blocks:$id", FLEXIBLE_BLOCKS, eventId, block.label, ImportWrite.Block(id, block, record["locked"].boolean()), ::describeBlock)
        }
        (sections["rooms"] as? JsonObject)?.let { rooms ->
            val prefs = rooms["prefs"]!!.jsonObject.mapValues { it.value.str() }
            val skippedIn = rooms["skipped"]!!.jsonObject.mapValues { it.value.strings() }
            val tracks = bundle.tracks.map { it.id }.toSet()
            val unknownTracks = (prefs.keys + skippedIn.keys).filter { it !in tracks }
            val (ids, failures) = resolveAll(skippedIn.values.flatten().distinct())
            if (unknownTracks.isNotEmpty() || failures.isNotEmpty()) {
                planner.skipped += ImportSkip(
                    "rooms", eventId, "devroom choices",
                    if (failures.isNotEmpty()) skipReason(failures) else ImportSkipReason.MISSING,
                    (unknownTracks.map { "$it (room not in this programme)" } + (if (failures.isNotEmpty()) listOf(detail(failures)) else emptyList())).joinToString(", "),
                )
            } else {
                val write = ImportWrite.Rooms(prefs, skippedIn.mapValues { (_, list) -> list.map { ids.getValue(it) } })
                planner.consider("rooms", "rooms", eventId, "devroom choices", write, ::describeRooms)
            }
        }
        sections["roomsDecided"]?.let {
            val write = ImportWrite.RoomsDecided(it.boolean())
            planner.consider("roomsDecided", "roomsDecided", eventId, "devroom step", write) { w -> if ((w as ImportWrite.RoomsDecided).decided) "decided" else "not decided" }
        }
        (sections["boothVisits"] as? JsonObject)?.let { visits ->
            val booths = bundle.booths.associateBy { it.id }
            val days = Schedule.eventDays(bundle)
            for ((boothId, value) in visits) {
                val booth = booths[boothId]
                if (booth == null) {
                    planner.skipped += ImportSkip("boothVisits", eventId, boothId, ImportSkipReason.MISSING, "$boothId (booth not in this programme)")
                    continue
                }
                val id = VISIT_PREFIX + boothId
                if (id in flexibleIds) continue // the same visit, with its day, came as a flexible block
                val block = if (value is JsonNull) null else StoredBlock(
                    id, "Visit ${booth.name}",
                    day = booth.availableDates?.firstOrNull() ?: days.firstOrNull() ?: Schedule.dayKey(bundle.start),
                    durationMinutes = value.num().toInt(), locationId = booth.locationId,
                )
                planner.consider("blocks:$id", "boothVisits", eventId, booth.name, ImportWrite.Block(id, block), ::describeBlock)
            }
        }
    }

    private fun skipAll(planner: Planner, eventId: String, sections: JsonObject, reason: ImportSkipReason, detail: String) {
        fun push(section: String, label: String) { planner.skipped += ImportSkip(section, eventId, label, reason, detail) }
        for (section in listOf("preferences", "notes")) for (record in sections.records(section)) push(section, record["activityId"].str())
        for (record in sections.records("comparisons")) push("comparisons", "${record["activityA"].str()} vs ${record["activityB"].str()}")
        if ("itinerary" in sections) push("itinerary", "saved itinerary")
        for (record in sections.records("plans")) push("plans", "plan for ${record["day"].str()}")
        for (record in sections.records("resolvedPlans")) push("resolvedPlans", "resolved plan for ${record["day"].str()}")
        for (record in sections.records(FLEXIBLE_BLOCKS)) push(FLEXIBLE_BLOCKS, record["label"].str())
        if ("rooms" in sections) push("rooms", "devroom choices")
        if ("roomsDecided" in sections) push("roomsDecided", "devroom step")
        for (boothId in (sections["boothVisits"] as? JsonObject)?.keys.orEmpty()) push("boothVisits", boothId)
    }

    private fun importContact(planner: Planner, contact: JsonObject) {
        (contact["profile"] as? JsonObject)?.let { source ->
            val fields = PersonalDataValidation.PROFILE_FIELDS.mapNotNull { name -> source[name]?.str()?.takeIf { it.isNotBlank() }?.let { name to it } }.toMap()
            val socials = (source["socials"] as? JsonObject)?.filterKeys { it in PersonalDataValidation.SOCIAL_FIELDS }
                ?.mapValues { it.value.str() }?.filterValues { it.isNotBlank() }.orEmpty()
            planner.consider("contact.profile", "contact.profile", null, "contact card", ImportWrite.Profile(fields, socials), ::describeProfile)
        }
        (contact["selection"] as? JsonObject)?.let { source ->
            val share = LinkedHashMap<String, Boolean>()
            for (name in PersonalDataValidation.SHARE_FIELDS) source[name]?.let { share[if (name == "fossUnitedProfileUrl") "fossunited" else name] = it.boolean() }
            (source["socials"] as? JsonObject)?.filterKeys { it in PersonalDataValidation.SOCIAL_FIELDS }?.forEach { (network, on) -> share[network] = on.boolean() }
            planner.consider("contact.selection", "contact.selection", null, "contact sharing selection", ImportWrite.Selection(share), ::describeSelection)
        }
    }

    // ---------- Local projections ----------

    private fun dayOf(bundle: EventBundle?, id: String): String? = bundle?.activities?.firstOrNull { it.id == id }?.start?.let(Schedule::dayKey)

    /** This device's value for the record a write targets, projected as the same type; null when it holds nothing. */
    fun currentOf(write: ImportWrite, state: PersonalState, bundle: EventBundle?): ImportWrite? = when (write) {
        is ImportWrite.Preference -> {
            val id = write.activityId
            if (id !in state.ranking.ratings && id !in state.bookmarks && id !in state.mustAttend) null
            else ImportWrite.Preference(id, state.ranking.rating(id).copy(disposition = state.dispositionOf(id)), id in state.bookmarks)
        }
        is ImportWrite.NoteWrite -> state.notes[write.activityId]?.let { ImportWrite.NoteWrite(write.activityId, it) }
        is ImportWrite.Comparison -> state.ranking.comparisons.firstOrNull { it.id == write.comparison.id }?.let { ImportWrite.Comparison(it) }
        is ImportWrite.Plan -> {
            val day = write.day
            val fixedOnDay = state.edits.blocks.filter { !it.toBlock().flexible && it.day == day }
            val onDay = { id: String -> dayOf(bundle, id) == day || fixedOnDay.any { it.id == id } }
            val current = ImportWrite.Plan(
                day, fixedOnDay, state.edits.removed.filter(onDay),
                state.edits.replacements.filterKeys(onDay), state.edits.locked.filter(onDay),
            )
            if (current.blocks.isEmpty() && current.removed.isEmpty() && current.replacements.isEmpty() && current.locked.isEmpty()) null else current
        }
        is ImportWrite.Block -> state.edits.blocks.firstOrNull { it.id == write.id }?.let { ImportWrite.Block(write.id, it, write.id in state.edits.locked) }
            ?: if (write.block == null) ImportWrite.Block(write.id, null) else null
        is ImportWrite.Rooms -> {
            // Skip bookkeeping is compared over this programme's sessions, as the export projects it.
            val known = bundle?.activities.orEmpty().map { it.id }.toSet()
            val current = ImportWrite.Rooms(state.ranking.rooms, state.ranking.roomSkipped.mapValues { (_, list) -> list.filter { it in known } })
            // No room choice yet is "nothing here", as an unset PWA setting is; an empty incoming choice then matches it.
            if (current.prefs.isEmpty() && current.skipped.values.all { it.isEmpty() } && (write.prefs.isNotEmpty() || write.skipped.values.any { it.isNotEmpty() })) null else current
        }
        is ImportWrite.RoomsDecided -> if (!state.ranking.roomsDecided && write.decided) null else ImportWrite.RoomsDecided(state.ranking.roomsDecided)
        is ImportWrite.Profile -> profileProjection(state.profile).takeIf { it.fields.isNotEmpty() || it.socials.isNotEmpty() }
        is ImportWrite.Selection -> selectionProjection(state.profile).takeIf { it.share.isNotEmpty() }
    }

    /** The labels of the chosen changes whose local value differs from what the preview showed; empty means safe to write. */
    fun stale(changes: List<ImportChange>, state: PersonalState, bundle: EventBundle?): List<String> =
        changes.filter { currentOf(it.write, state, bundle) != it.current }.map { it.label }

    // ---------- Apply ----------

    /** Fold the chosen changes into a new state; pure, so a failed write can fall back to the old one. */
    fun apply(state: PersonalState, changes: List<ImportChange>, bundle: EventBundle?): PersonalState =
        changes.fold(state) { current, change -> applyOne(current, change.write, bundle) }

    private fun applyOne(state: PersonalState, write: ImportWrite, bundle: EventBundle?): PersonalState = when (write) {
        is ImportWrite.Preference -> {
            val id = write.activityId
            val must = write.rating.disposition == "must-attend"
            state.copy(
                bookmarks = if (write.bookmarked) state.bookmarks + id else state.bookmarks - id,
                mustAttend = if (must) state.mustAttend + id else state.mustAttend - id,
                ranking = state.ranking.copy(ratings = state.ranking.ratings + (id to write.rating)),
            )
        }
        is ImportWrite.NoteWrite -> state.copy(notes = state.notes + (write.activityId to write.note))
        is ImportWrite.Comparison -> state.copy(ranking = state.ranking.copy(
            comparisons = state.ranking.comparisons.filterNot { it.id == write.comparison.id } + write.comparison,
        ))
        is ImportWrite.Plan -> {
            val day = write.day
            val edits = state.edits
            val fixedOnDay = edits.blocks.filter { !it.toBlock().flexible && it.day == day }.map { it.id }.toSet()
            val onDay = { id: String -> dayOf(bundle, id) == day || id in fixedOnDay }
            state.copy(edits = edits.copy(
                blocks = edits.blocks.filterNot { it.id in fixedOnDay } + write.blocks,
                removed = edits.removed.filterNot(onDay) + write.removed,
                replacements = edits.replacements.filterKeys { !onDay(it) } + write.replacements,
                locked = edits.locked.filterNot(onDay) + write.locked,
            ))
        }
        is ImportWrite.Block -> {
            val edits = state.edits
            val blocks = edits.blocks.filterNot { it.id == write.id } + listOfNotNull(write.block)
            val locked = edits.locked.filterNot { it == write.id } + (if (write.locked && write.block != null) listOf(write.id) else emptyList())
            state.copy(edits = edits.copy(blocks = blocks, locked = locked))
        }
        is ImportWrite.Rooms -> state.copy(ranking = state.ranking.copy(rooms = write.prefs, roomSkipped = write.skipped))
        is ImportWrite.RoomsDecided -> state.copy(ranking = state.ranking.copy(roomsDecided = write.decided))
        is ImportWrite.Profile -> {
            val f = write.fields
            state.copy(profile = state.profile.copy(
                fullName = f["fullName"].orEmpty(),
                organization = f["organization"].orEmpty(),
                email = f["email"].orEmpty(),
                phone = f["phone"].orEmpty(),
                website = f["website"].orEmpty(),
                matrixId = f["matrixId"].orEmpty(),
                meshNodeId = f["neutrinoServerName"].orEmpty(),
                ticketRef = f["ticketRef"].orEmpty(),
                fossUnitedUsername = f["fossUnitedProfileUrl"]?.removePrefix(FOSS_UNITED_PROFILE)?.trim('/').orEmpty(),
                avatarUrl = f["avatarUrl"].orEmpty(),
                socials = write.socials,
            ))
        }
        is ImportWrite.Selection -> state.copy(profile = state.profile.copy(share = write.share))
    }

    // ---------- Summaries ----------

    private fun describePreference(write: ImportWrite): String {
        val p = write as ImportWrite.Preference
        val parts = arrayListOf(p.rating.disposition)
        if (p.bookmarked) parts += "bookmarked"
        p.rating.triage?.let { parts += "quick pass $it" }
        parts += "rating ${p.rating.rating.toLong()}"
        return parts.joinToString(", ")
    }

    private fun describeNote(write: ImportWrite): String {
        val body = (write as ImportWrite.NoteWrite).note.body.replace(Regex("\\s+"), " ").trim()
        return if (body.length > 60) body.substring(0, 57) + "…" else body.ifEmpty { "(empty note)" }
    }

    private fun describePlan(write: ImportWrite): String {
        val p = write as ImportWrite.Plan
        return "${p.locked.size} locked, ${p.removed.size} removed, ${p.replacements.size} replaced, ${p.blocks.size} custom"
    }

    private fun describeBlock(write: ImportWrite): String {
        val block = (write as ImportWrite.Block).block ?: return "visit cancelled"
        return "${block.durationMinutes} min on ${block.day}"
    }

    private fun describeRooms(write: ImportWrite): String {
        val prefs = (write as ImportWrite.Rooms).prefs
        return if (prefs.isEmpty()) "no room choices" else prefs.entries.joinToString(", ") { "${it.key}: ${it.value}" }
    }

    private fun describeProfile(write: ImportWrite): String {
        val p = write as ImportWrite.Profile
        val fields = p.fields.size
        val socials = p.socials.size
        return "$fields field${if (fields == 1) "" else "s"}, $socials social link${if (socials == 1) "" else "s"}"
    }

    private fun describeSelection(write: ImportWrite): String {
        val on = (write as ImportWrite.Selection).share.filterValues { it }.keys.filter { it !in PersonalDataValidation.SOCIAL_FIELDS }
        return if (on.isEmpty()) "shares nothing" else "shares ${on.joinToString(", ")}"
    }
}
