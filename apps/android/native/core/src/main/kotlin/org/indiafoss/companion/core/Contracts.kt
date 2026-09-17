package org.indiafoss.companion.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.net.URI
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/**
 * Kotlin ports of the cross-boundary contract validators in
 * `packages/model/src/contracts/` (ADR 0009). They take a parsed JSON tree,
 * never a deserialised data class, because the input is something this app
 * did not write. The golden fixtures under `packages/test-fixtures/fixtures/`
 * hold both platforms to the same verdicts; see ContractConformanceTest.
 *
 * Issue messages must *contain* the substrings the fixture index expects, so
 * wording here mirrors the TypeScript rather than improving on it.
 */
const val EVENT_MANIFEST_SCHEMA_VERSION = 1
const val CONTACT_CARD_SCHEMA_VERSION = 1

enum class SchemaCompatibility { SUPPORTED, FORWARD, UNSUPPORTED }

/** Classify a candidate `schemaVersion` against the version this build implements. */
fun schemaCompatibility(value: JsonElement?, supported: Int): SchemaCompatibility {
    val version = value.asInt() ?: return SchemaCompatibility.UNSUPPORTED
    if (version < 1) return SchemaCompatibility.UNSUPPORTED
    if (version == supported) return SchemaCompatibility.SUPPORTED
    return if (version > supported) SchemaCompatibility.FORWARD else SchemaCompatibility.UNSUPPORTED
}

private fun JsonElement?.asString(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

/** A JSON number that is an integer, as TypeScript's `Number.isInteger` sees it. */
private fun JsonElement?.asInt(): Int? {
    val primitive = this as? JsonPrimitive ?: return null
    if (primitive.isString) return null
    val number = primitive.content.toDoubleOrNull() ?: return null
    if (number != Math.floor(number) || number.isInfinite()) return null
    return number.toInt()
}

private fun JsonElement?.render(): String = this?.toString() ?: "undefined"

/**
 * Whether a string parses as a timestamp the way `Date.parse` accepts the
 * published data: ISO-8601 with an offset, a local date-time (a space in
 * place of `T` included, which the organiser's API emits), or a bare date.
 */
fun isInstant(value: String): Boolean {
    val text = value.trim().replaceFirst(Regex("^(\\d{4}-\\d{2}-\\d{2}) "), "$1T")
    val parsers = listOf<(String) -> Any>(
        { OffsetDateTime.parse(it) },
        { LocalDateTime.parse(it) },
        { LocalDate.parse(it) },
    )
    return parsers.any { parse ->
        try {
            parse(text)
            true
        } catch (_: DateTimeParseException) {
            false
        }
    }
}

fun requireString(record: JsonObject, field: String, path: String = ""): List<String> {
    val at = "$path$field"
    val value = record[field].asString() ?: return listOf("$at must be a string")
    if (value.isBlank()) return listOf("$at must be a non-empty string")
    return emptyList()
}

fun optionalString(record: JsonObject, field: String, path: String = ""): List<String> =
    if (record[field] == null) emptyList() else requireString(record, field, path)

fun requireInstant(record: JsonObject, field: String, path: String = ""): List<String> {
    val issues = requireString(record, field, path)
    if (issues.isNotEmpty()) return issues
    val value = record[field].asString()!!
    if (!isInstant(value)) return listOf("$path$field must be an ISO-8601 timestamp, got \"$value\"")
    return emptyList()
}

fun optionalInstant(record: JsonObject, field: String, path: String = ""): List<String> =
    if (record[field] == null) emptyList() else requireInstant(record, field, path)

fun requireLiteral(record: JsonObject, field: String, allowed: List<String>, path: String = ""): List<String> {
    val at = "$path$field"
    val value = record[field].asString() ?: return listOf("$at must be a string")
    if (value !in allowed) return listOf("$at must be one of ${allowed.joinToString(", ")}; got \"$value\"")
    return emptyList()
}

fun requireArray(record: JsonObject, field: String, nonEmpty: Boolean = false, path: String = ""): List<String> {
    val at = "$path$field"
    val value = record[field] as? JsonArray ?: return listOf("$at must be an array")
    if (nonEmpty && value.isEmpty()) return listOf("$at must not be empty")
    return emptyList()
}

fun collectDuplicates(ids: List<String>, label: String): List<String> {
    val seen = mutableSetOf<String>()
    val issues = mutableListOf<String>()
    for (id in ids) {
        if (!seen.add(id)) issues += "duplicate $label id: $id"
    }
    return issues
}

fun collectSchemaVersionIssues(record: JsonObject, supported: Int, contract: String): List<String> =
    when (schemaCompatibility(record["schemaVersion"], supported)) {
        SchemaCompatibility.SUPPORTED -> emptyList()
        SchemaCompatibility.FORWARD -> listOf(
            "$contract schemaVersion ${record["schemaVersion"].render()} is newer than the supported version $supported; keep the previous value",
        )
        SchemaCompatibility.UNSUPPORTED -> listOf(
            "$contract schemaVersion must be the integer $supported, got ${record["schemaVersion"].render()}",
        )
    }

/** Shape only, either flavour: `@localpart:server` or a mesh `@n:<64-hex>`. */
fun isMatrixUserId(value: String?): Boolean {
    if (value == null || !value.startsWith("@")) return false
    val colon = value.indexOf(':')
    return colon >= 2 && colon != value.length - 1
}

private val ASSET_FILENAME = Regex("^[A-Za-z0-9._-]+$")

/** Port of `collectEventManifestIssues` in `contracts/event-manifest.ts`. */
fun collectEventManifestIssues(value: JsonElement?): List<String> {
    val record = value as? JsonObject ?: return listOf("manifest must be an object")
    val issues = mutableListOf<String>()
    issues += collectSchemaVersionIssues(record, EVENT_MANIFEST_SCHEMA_VERSION, "manifest")
    issues += requireString(record, "eventId")
    issues += requireInstant(record, "generatedAt")
    issues += optionalInstant(record, "sourceUpdatedAt")
    issues += optionalString(record, "timezone")
    issues += optionalString(record, "bundleDigest")

    val revision = record["revision"].asInt()
    if (revision == null || revision < 1) {
        issues += "revision must be a positive integer, got ${record["revision"].render()}"
    }

    val assets = record["assets"] as? JsonObject
    if (assets == null) {
        issues += "assets must be an object mapping role to filename"
    } else {
        if (assets.isEmpty()) issues += "assets must not be empty"
        for ((role, filename) in assets) {
            val name = filename.asString()
            if (name == null || name.isBlank()) {
                issues += "assets.$role must be a non-empty filename"
            } else if (!ASSET_FILENAME.matches(name)) {
                // A path separator here would let a manifest point outside the published directory.
                issues += "assets.$role must be a plain filename, got \"$name\""
            }
        }
    }
    return issues
}

/** Forward-only, same event: the rule the publisher and the PWA use. */
fun supersedes(candidate: EventManifest, current: EventManifest?): Boolean {
    if (current == null) return true
    if (candidate.eventId != current.eventId) return false
    return candidate.revision > current.revision
}

private val TRUSTS = listOf("claimed", "profile-matched", "binding-valid", "verified", "revoked")
private val KINDS = listOf("classic", "mesh")

private fun collectClaimIssues(value: JsonElement?, index: Int): List<String> {
    val at = "accounts[$index]."
    val record = value as? JsonObject ?: return listOf("accounts[$index] must be an object")
    val issues = mutableListOf<String>()
    issues += requireLiteral(record, "kind", KINDS, at)
    issues += requireLiteral(record, "trust", TRUSTS, at)
    issues += optionalString(record, "bindingId", at)
    val userId = record["userId"].asString()
    if (!isMatrixUserId(userId)) {
        issues += "${at}userId must be a Matrix user id, got ${record["userId"].render()}"
    } else if (record["kind"].asString() == "mesh" && !userId!!.startsWith("@n:")) {
        issues += "${at}userId is marked mesh but is not an @n: identity"
    }
    return issues
}

private fun collectProfileIssues(value: JsonElement?): List<String> {
    if (value == null) return listOf("profile must be an object (use {} for an empty profile)")
    val record = value as? JsonObject ?: return listOf("profile must be an object")
    val issues = mutableListOf<String>()
    for (field in listOf("displayName", "pronouns", "tagline", "organisation")) {
        issues += optionalString(record, field, "profile.")
    }
    val links = record["links"]
    if (links != null) {
        issues += requireArray(record, "links", path = "profile.")
        if (links is JsonArray) {
            links.forEachIndexed { i, link ->
                val text = link.asString()
                if (text == null) {
                    issues += "profile.links[$i] must be a string"
                    return@forEachIndexed
                }
                val scheme = try {
                    URI(text).takeIf { it.isAbsolute }?.scheme
                } catch (_: Exception) {
                    null
                }
                if (scheme == null) {
                    issues += "profile.links[$i] must be an absolute URL"
                } else if (scheme != "https" && scheme != "mailto") {
                    issues += "profile.links[$i] must be https: or mailto:, got $scheme:"
                }
            }
        }
    }
    return issues
}

/** Port of `collectContactCardIssues` in `contracts/contact-card.ts`. Structure only, never the signature. */
fun collectContactCardIssues(value: JsonElement?): List<String> {
    val record = value as? JsonObject ?: return listOf("card must be an object")
    val issues = mutableListOf<String>()
    issues += collectSchemaVersionIssues(record, CONTACT_CARD_SCHEMA_VERSION, "card")
    issues += requireString(record, "cardKey")
    issues += requireInstant(record, "issuedAt")
    issues += optionalInstant(record, "expiresAt")
    issues += optionalString(record, "signature")
    issues += optionalString(record, "eventId")
    issues += collectProfileIssues(record["profile"])
    issues += requireArray(record, "accounts")

    val accounts = record["accounts"] as? JsonArray
    if (accounts != null) {
        val userIds = mutableListOf<String>()
        accounts.forEachIndexed { index, claim ->
            issues += collectClaimIssues(claim, index)
            (claim as? JsonObject)?.get("userId").asString()?.let { userIds += it }
        }
        issues += collectDuplicates(userIds, "account")
    }

    val issuedAt = record["issuedAt"].asString()
    val expiresAt = record["expiresAt"].asString()
    if (issuedAt != null && expiresAt != null && isInstant(issuedAt) && isInstant(expiresAt)) {
        if (!instantMillis(expiresAt).let { it > instantMillis(issuedAt) }) issues += "expiresAt must be after issuedAt"
    }
    return issues
}

private fun instantMillis(value: String): Long {
    val text = value.trim().replaceFirst(Regex("^(\\d{4}-\\d{2}-\\d{2}) "), "$1T")
    return try {
        OffsetDateTime.parse(text).toInstant().toEpochMilli()
    } catch (_: DateTimeParseException) {
        try {
            LocalDateTime.parse(text).toEpochSecond(java.time.ZoneOffset.UTC) * 1000
        } catch (_: DateTimeParseException) {
            LocalDate.parse(text).toEpochDay() * 86_400_000
        }
    }
}
