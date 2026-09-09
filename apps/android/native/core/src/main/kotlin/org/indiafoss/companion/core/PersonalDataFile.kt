package org.indiafoss.companion.core

import java.time.Instant
import java.time.format.DateTimeFormatterBuilder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/** Transport validation only: storage adapters must validate sections before applying them. */
object PersonalDataFiles {
    const val MAX_BYTES = 5 * 1024 * 1024
    data class Result(val data: JsonObject? = null, val issues: List<String> = emptyList()) {
        val ok: Boolean get() = data != null && issues.isEmpty()
    }

    private fun JsonElement?.text(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
    private fun nonempty(value: JsonElement?): Boolean = !value.text().isNullOrBlank()

    fun issues(value: JsonElement): List<String> {
        val root = value as? JsonObject ?: return listOf("personal data must be an object")
        val result = mutableListOf<String>()
        val version = (root["schemaVersion"] as? JsonPrimitive)?.takeUnless { it.isString }?.doubleOrNull
        if (version != 1.0) {
            result += if (version != null && version.isFinite() && version > 1 && version % 1 == 0.0) {
                "personal data schemaVersion is newer than the supported version"
            } else {
                "personal data schemaVersion must be the integer 1"
            }
        }
        if (root["format"].text() != "indiafoss-personal-data") result += "format must be indiafoss-personal-data"
        val time = root["exportedAt"].text()
        val validTime = time != null && Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z").matches(time) &&
            runCatching { DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(Instant.parse(time)) == time }.getOrDefault(false)
        if (!validTime) result += "exportedAt must use canonical UTC milliseconds"
        val events = root["events"] as? JsonArray ?: return result + "events must be an array"
        val eventIds = mutableSetOf<String>()
        for ((index, valueEvent) in events.withIndex()) {
            val path = "events[$index]."
            val event = valueEvent as? JsonObject
            if (event == null) { result += "${path}must be an object"; continue }
            val eventId = event["eventId"].text()
            if (!nonempty(event["eventId"])) result += "${path}eventId must be a non-empty string"
            if (eventId != null && !eventIds.add(eventId)) result += "${path}duplicate eventId"
            if (event["sections"] !is JsonObject) result += "${path}sections must be an object"
            val references = event["activities"] as? JsonArray
            if (references == null) { result += "${path}activities must be an array"; continue }
            val activityIds = mutableSetOf<String>()
            for ((at, valueReference) in references.withIndex()) {
                val refPath = "${path}activities[$at]."
                val reference = valueReference as? JsonObject
                if (reference == null) { result += "${refPath}must be an object"; continue }
                val activityId = reference["activityId"].text()
                if (!nonempty(reference["activityId"])) result += "${refPath}activityId must be a non-empty string"
                if (reference["eventId"] != event["eventId"]) result += "${refPath}eventId must match its event"
                if ("proposalId" in reference && !nonempty(reference["proposalId"])) result += "${refPath}proposalId must be a non-empty string"
                if (activityId != null && !activityIds.add(activityId)) result += "${refPath}duplicate activityId"
            }
        }
        if ("contact" in root && root["contact"] !is JsonObject) result += "contact must be an object"
        return result
    }

    private fun tooDeep(text: String): Boolean {
        var depth = 0
        var quoted = false
        var escaped = false
        for (char in text) {
            if (quoted) {
                if (escaped) escaped = false
                else if (char == '\\') escaped = true
                else if (char == '"') quoted = false
            } else if (char == '"') quoted = true
            else if (char == '[' || char == '{') {
                depth++
                if (depth > 64) return true
            } else if (char == ']' || char == '}') depth--
        }
        return false
    }

    fun decode(text: String): Result {
        if (text.length > MAX_BYTES || text.toByteArray(Charsets.UTF_8).size > MAX_BYTES) return Result(issues = listOf("personal data exceeds the 5 MiB limit"))
        if (tooDeep(text)) return Result(issues = listOf("personal data exceeds the nesting limit"))
        val value = runCatching { Json.parseToJsonElement(text) }.getOrElse { return Result(issues = listOf("personal data is not valid JSON")) }
        val problems = issues(value)
        return if (problems.isEmpty()) Result(data = value as JsonObject) else Result(issues = problems)
    }

    /** Keep raw JSON objects so unsupported optional sections survive a round trip. */
    fun encode(data: JsonObject): String {
        val text = data.toString()
        val decoded = decode(text)
        require(decoded.ok) { decoded.issues.joinToString("; ") }
        return text
    }
}
