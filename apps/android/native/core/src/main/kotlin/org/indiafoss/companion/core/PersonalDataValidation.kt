package org.indiafoss.companion.core

import java.time.LocalDate
import java.time.OffsetDateTime
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/** One rule of the personal-data section contract broken; the path names the record. */
class PersonalDataException(val path: String) : IllegalArgumentException("Invalid personal data: $path")

/**
 * Section validation for a decoded personal-data file (#240), the same rules
 * as the PWA's `validatePersonalData`: after the envelope has been decoded
 * by [PersonalDataFiles], every supported section is checked for finite
 * numbers, enumerations, calendar days and timestamps, declared activity
 * references and unique records. Sections the importer does not understand
 * are reported in `unsupported`, never written. Nothing here touches storage;
 * the result is still an untrusted transport that `NativePersonalData` has to
 * resolve, preview and apply.
 */
object PersonalDataValidation {
    data class Validated(val file: JsonObject, val unsupported: List<String>)

    /** Sections both platforms understand; `flexibleBlocks` is the native-only one the PWA reports as unsupported. */
    val SECTIONS = listOf(
        "preferences", "notes", "comparisons", "itinerary", "resolvedPlans", "plans", "rooms", "roomsDecided", "boothVisits",
        NativePersonalData.FLEXIBLE_BLOCKS,
    )
    val UNASSIGNED_SECTIONS = listOf("preferences", "notes", "comparisons", "boothVisits", NativePersonalData.UNASSIGNED_PLAN_EDITS)
    val DISPOSITIONS = listOf("normal", "must-attend", "not-interested", "watch-later")
    val ROOM_PREFERENCES = listOf("skip", "love", "stay")
    val SOCIAL_FIELDS = listOf(
        "github", "gitlab", "linkedin", "mastodon", "bluesky", "x", "instagram", "youtube", "medium", "devto",
        "telegram", "whatsapp", "signal", "prav", "xmpp", "deltachat",
    )
    val PROFILE_FIELDS = listOf(
        "fullName", "organization", "email", "phone", "website", "matrixId", "neutrinoServerName", "ticketRef",
        "fossUnitedProfileUrl", "avatarUrl",
    )
    val SHARE_FIELDS = listOf(
        "name", "organization", "email", "phone", "website", "matrixId", "neutrinoServerName", "ticketRef",
        "fossUnitedProfileUrl", "photo",
    )
    private val TIMESTAMP = Regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$")
    private val DAY = Regex("^\\d{4}-\\d{2}-\\d{2}$")
    private const val MAX_SAFE = 9007199254740991.0

    private fun invalid(path: String): Nothing = throw PersonalDataException(path)

    fun obj(value: JsonElement?, path: String): JsonObject = value as? JsonObject ?: invalid(path)
    fun arr(value: JsonElement?, path: String): JsonArray = value as? JsonArray ?: invalid(path)
    fun text(value: JsonElement?, path: String, empty: Boolean = false): String {
        val primitive = value as? JsonPrimitive ?: invalid(path)
        if (!primitive.isString) invalid(path)
        if (!empty && primitive.content.isBlank()) invalid(path)
        return primitive.content
    }
    fun bool(value: JsonElement?, path: String): Boolean {
        val primitive = value as? JsonPrimitive ?: invalid(path)
        if (primitive.isString) invalid(path)
        return when (primitive.content) { "true" -> true; "false" -> false; else -> invalid(path) }
    }
    fun number(value: JsonElement?, path: String): Double {
        val primitive = value as? JsonPrimitive ?: invalid(path)
        if (primitive.isString) invalid(path)
        val result = primitive.doubleOrNull ?: invalid(path)
        if (!result.isFinite()) invalid(path)
        return result
    }
    fun safeInteger(value: JsonElement?, path: String): Long {
        val result = number(value, path)
        if (result % 1 != 0.0 || kotlin.math.abs(result) > MAX_SAFE) invalid(path)
        return result.toLong()
    }
    fun choice(value: JsonElement?, choices: List<String>, path: String): String {
        val result = text(value, path)
        if (result !in choices) invalid(path)
        return result
    }
    fun timestamp(value: JsonElement?, path: String): String {
        val result = text(value, path)
        if (!TIMESTAMP.matches(result)) invalid(path)
        runCatching { OffsetDateTime.parse(result) }.getOrElse { invalid(path) }
        day(JsonPrimitive(result.substring(0, 10)), path)
        return result
    }
    fun day(value: JsonElement?, path: String): String {
        val result = text(value, path)
        if (!DAY.matches(result)) invalid(path)
        if (runCatching { LocalDate.parse(result).toString() }.getOrNull() != result) invalid(path)
        return result
    }
    private fun unique(values: List<String>, path: String) {
        if (values.toSet().size != values.size) invalid(path)
    }

    /** `null` preserves an explicit cancellation rather than silently dropping that choice. */
    private fun boothDuration(value: JsonElement?, path: String) {
        if (value is JsonNull) return
        val minutes = safeInteger(value, path)
        if (minutes < 1 || minutes > 1440) invalid(path)
    }

    private fun records(value: JsonElement?, path: String, check: (JsonObject, String) -> String) {
        val keys = arr(value, path).mapIndexed { index, item -> check(obj(item, "$path[$index]"), "$path[$index]") }
        unique(keys, path)
    }

    private fun personalRecords(sections: JsonObject, path: String, reference: (JsonElement?, String) -> String) {
        sections["preferences"]?.let {
            records(it, "$path.preferences") { record, at ->
                val id = reference(record["activityId"], "$at.activityId")
                number(record["rating"], "$at.rating")
                if (safeInteger(record["comparisons"], "$at.comparisons") < 0) invalid("$at.comparisons")
                choice(record["disposition"], DISPOSITIONS, "$at.disposition")
                bool(record["bookmarked"], "$at.bookmarked")
                if ("triage" in record) choice(record["triage"], listOf("yes", "no"), "$at.triage")
                if ("yieldedTo" in record) text(record["yieldedTo"], "$at.yieldedTo")
                id
            }
        }
        sections["notes"]?.let {
            records(it, "$path.notes") { record, at ->
                val id = reference(record["activityId"], "$at.activityId")
                text(record["body"], "$at.body", empty = true)
                timestamp(record["updatedAt"], "$at.updatedAt")
                id
            }
        }
        sections["comparisons"]?.let {
            records(it, "$path.comparisons") { record, at ->
                val a = reference(record["activityA"], "$at.activityA")
                val b = reference(record["activityB"], "$at.activityB")
                if (a == b) invalid(at)
                if (number(record["scoreA"], "$at.scoreA") !in listOf(0.0, 0.5, 1.0)) invalid("$at.scoreA")
                timestamp(record["createdAt"], "$at.createdAt")
                if ("clash" in record) bool(record["clash"], "$at.clash")
                text(record["id"], "$at.id")
            }
        }
    }

    /**
     * Validate every known section, including unresolved events and unassigned
     * records. Throws [PersonalDataException] on the first broken rule.
     */
    fun validate(file: JsonObject): Validated {
        val unsupported = ArrayList<String>()
        val events = arr(file["events"], "events")
        for ((index, item) in events.withIndex()) {
            val event = obj(item, "events[$index]")
            val path = "events[$index].sections"
            val sections = obj(event["sections"], path)
            val references = arr(event["activities"], "events[$index].activities")
                .map { text(obj(it, "events[$index].activities")["activityId"], "events[$index].activities") }.toSet()
            val reference: (JsonElement?, String) -> String = { value, at ->
                val id = text(value, at)
                if (id !in references) invalid("$at (undeclared activity)")
                id
            }
            fun ids(value: JsonElement?, at: String, check: (JsonElement?, String) -> String = reference): List<String> {
                val result = arr(value, at).map { check(it, at) }
                unique(result, at)
                return result
            }
            personalRecords(sections, path, reference)
            sections["itinerary"]?.let {
                val record = obj(it, "$path.itinerary")
                timestamp(record["generatedAt"], "$path.itinerary.generatedAt")
                ids(record["activityIds"], "$path.itinerary.activityIds")
            }
            sections["resolvedPlans"]?.let {
                records(it, "$path.resolvedPlans") { record, at ->
                    ids(record["activityIds"], "$at.activityIds")
                    day(record["day"], "$at.day")
                }
            }
            sections["plans"]?.let {
                records(it, "$path.plans") { record, at ->
                    val custom = HashSet<String>()
                    records(record["customBlocks"], "$at.customBlocks") { block, location ->
                        val id = text(block["id"], "$location.id")
                        if (id in references) invalid("$location.id (activity collision)")
                        custom += id
                        text(block["label"], "$location.label")
                        val start = timestamp(block["start"], "$location.start")
                        val end = timestamp(block["end"], "$location.end")
                        if (OffsetDateTime.parse(end).toInstant() <= OffsetDateTime.parse(start).toInstant()) invalid("$location.end")
                        if ("flexible" in block) bool(block["flexible"], "$location.flexible")
                        if ("locationId" in block) text(block["locationId"], "$location.locationId")
                        id
                    }
                    val planRef: (JsonElement?, String) -> String = { value, location ->
                        val id = text(value, location)
                        if (id in custom) id else reference(JsonPrimitive(id), location)
                    }
                    ids(record["locked"], "$at.locked", planRef)
                    ids(record["removed"], "$at.removed", planRef)
                    for ((original, replacement) in obj(record["replacements"], "$at.replacements")) {
                        planRef(JsonPrimitive(original), "$at.replacements")
                        planRef(replacement, "$at.replacements")
                    }
                    day(record["day"], "$at.day")
                }
            }
            sections["rooms"]?.let {
                val rooms = obj(it, "$path.rooms")
                for ((id, value) in obj(rooms["prefs"], "$path.rooms.prefs")) {
                    if (id.isBlank()) invalid("$path.rooms.prefs")
                    choice(value, ROOM_PREFERENCES, "$path.rooms.prefs")
                }
                for ((id, value) in obj(rooms["skipped"], "$path.rooms.skipped")) {
                    if (id.isBlank()) invalid("$path.rooms.skipped")
                    ids(value, "$path.rooms.skipped")
                }
            }
            sections["roomsDecided"]?.let { bool(it, "$path.roomsDecided") }
            sections["boothVisits"]?.let {
                for ((id, value) in obj(it, "$path.boothVisits")) {
                    if (id.isBlank()) invalid("$path.boothVisits")
                    boothDuration(value, "$path.boothVisits")
                }
            }
            sections[NativePersonalData.FLEXIBLE_BLOCKS]?.let {
                records(it, "$path.${NativePersonalData.FLEXIBLE_BLOCKS}") { block, at ->
                    val id = text(block["id"], "$at.id")
                    if (id in references) invalid("$at.id (activity collision)")
                    text(block["label"], "$at.label")
                    day(block["day"], "$at.day")
                    val minutes = safeInteger(block["durationMinutes"], "$at.durationMinutes")
                    if (minutes < 1 || minutes > 1440) invalid("$at.durationMinutes")
                    if ("locationId" in block) text(block["locationId"], "$at.locationId")
                    if ("locked" in block) bool(block["locked"], "$at.locked")
                    id
                }
            }
            unsupported += sections.keys.filter { it !in SECTIONS }.map { "$path.$it" }
        }
        file["unassigned"]?.let {
            val sections = obj(it, "unassigned")
            personalRecords(sections, "unassigned") { value, at -> text(value, at) }
            sections["boothVisits"]?.let { visits ->
                records(visits, "unassigned.boothVisits") { record, at ->
                    boothDuration(record["minutes"], "$at.minutes")
                    text(record["boothId"], "$at.boothId")
                }
            }
            sections[NativePersonalData.UNASSIGNED_PLAN_EDITS]?.let { edits ->
                val record = obj(edits, "unassigned.${NativePersonalData.UNASSIGNED_PLAN_EDITS}")
                for (key in listOf("locked", "removed")) record[key]?.let { list -> arr(list, "unassigned.$key").forEach { id -> text(id, "unassigned.$key") } }
                record["replacements"]?.let { map -> obj(map, "unassigned.replacements").values.forEach { id -> text(id, "unassigned.replacements") } }
            }
            unsupported += sections.keys.filter { it !in UNASSIGNED_SECTIONS }.map { "unassigned.$it" }
        }
        file["contact"]?.let {
            val contact = obj(it, "contact")
            for ((key, fields, strings) in listOf(Triple("profile", PROFILE_FIELDS, true), Triple("selection", SHARE_FIELDS, false))) {
                val record = contact[key]?.let { value -> obj(value, "contact.$key") } ?: continue
                for (field in fields) record[field]?.let { value ->
                    if (strings) text(value, "contact.$key.$field", empty = true) else bool(value, "contact.$key.$field")
                }
                record["socials"]?.let { value ->
                    val socials = obj(value, "contact.$key.socials")
                    for (field in SOCIAL_FIELDS) socials[field]?.let { social ->
                        if (strings) text(social, "contact.$key.socials.$field", empty = true) else bool(social, "contact.$key.socials.$field")
                    }
                }
            }
            unsupported += contact.keys.filter { it != "profile" && it != "selection" }.map { "contact.$it" }
        }
        unsupported += file.keys.filter { it !in listOf("format", "schemaVersion", "exportedAt", "events", "contact", "unassigned") }
        return Validated(file, unsupported)
    }
}
