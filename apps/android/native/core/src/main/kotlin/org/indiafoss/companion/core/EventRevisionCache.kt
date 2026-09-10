package org.indiafoss.companion.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.security.MessageDigest
import java.time.Instant

/** A revision is known only while its associated, verified bundle is readable. */
class EventRevisionCache(
    private val directory: File,
    private val eventId: String,
    private val write: (File, String) -> Unit = ::writeFileAtomically,
) {
    private val recordFile = File(directory, "$eventId-schedule.json")
    private val legacyFile = File(directory, "$eventId-bundle.json")

    data class Snapshot(val bundle: EventBundle, val revision: Int?)

    @Serializable
    private data class Record(val schemaVersion: Int = 1, val manifest: EventManifest, val body: String)

    /** Legacy bundle-only caches remain usable, but their separate revision stamps are not trusted. */
    fun read(): Snapshot? {
        val current = runCatching {
            val record = bundleJson.decodeFromString<Record>(recordFile.readText())
            require(record.schemaVersion == 1) { "Unsupported schedule cache" }
            Snapshot(validate(record.manifest, record.body), record.manifest.revision)
        }.getOrNull()
        if (current != null) return current
        return runCatching { Snapshot(decodeBundle(legacyFile.readText(), eventId), null) }.getOrNull()
    }

    /**
     * Validation happens before mutation. Recheck the current revision at commit time so a slower
     * download cannot replace a newer one. A single rename commits both the bundle and its stamp.
     */
    fun adopt(manifest: EventManifest, body: String): Snapshot = synchronized(commitLock) {
        val bundle = validate(manifest, body)
        val current = read()
        if (current?.revision != null && current.revision >= manifest.revision) return@synchronized current
        write(recordFile, bundleJson.encodeToString(Record(manifest = manifest, body = body)))
        Snapshot(bundle, manifest.revision)
    }

    fun validateManifest(manifest: EventManifest): String {
        require(manifest.schemaVersion == 1) { "Unsupported manifest version" }
        require(manifest.eventId == eventId) { "Manifest belongs to another event" }
        require(manifest.revision > 0) { "Invalid event revision" }
        require(manifest.generatedAt != null) { "Missing manifest timestamp" }
        Instant.parse(manifest.generatedAt)
        val asset = manifest.assets["event"] ?: error("Manifest has no event asset")
        require(EVENT_ASSET.matches(asset)) { "Invalid event asset name" }
        return asset
    }

    private fun validate(manifest: EventManifest, body: String): EventBundle {
        val asset = validateManifest(manifest)
        val digest = MessageDigest.getInstance("SHA-256").digest(body.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        require(asset == "event.${digest.take(8)}.json") { "Event asset digest does not match manifest" }
        return decodeBundle(body, eventId)
    }

    companion object {
        private val EVENT_ASSET = Regex("event\\.[0-9a-f]{8}\\.json")
        // Serialise commits across repository instances in this application process.
        private val commitLock = Any()

        fun decodeBundle(body: String, eventId: String): EventBundle {
            val json = bundleJson.parseToJsonElement(body).jsonObject
            val version = json["schemaVersion"]?.jsonPrimitive
            require(version != null && !version.isString && version.intOrNull == 1) { "Unsupported event bundle version" }
            val bundle = bundleJson.decodeFromString<EventBundle>(body)
            require(bundle.id == eventId) { "Bundle belongs to another event" }
            return bundle
        }
    }
}
