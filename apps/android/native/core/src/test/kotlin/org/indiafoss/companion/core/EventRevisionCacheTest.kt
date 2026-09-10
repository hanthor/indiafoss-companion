package org.indiafoss.companion.core

import java.io.File
import java.nio.file.Files
import java.security.MessageDigest
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class EventRevisionCacheTest {
    private val dir = Files.createTempDirectory("event-revision-test").toFile()
    private val cache get() = EventRevisionCache(dir, "indiafoss-2026")
    private val timestamp = "2026-09-09T01:00:00.000Z"

    private fun body(name: String = "IndiaFOSS", cancelled: Boolean = false) = """
        {"schemaVersion":1,"id":"indiafoss-2026","name":"$name","timezone":"Asia/Kolkata",
        "start":"2026-09-19T09:00:00+05:30","end":"2026-09-20T18:00:00+05:30",
        "activities":[{"id":"talk","title":"Talk","cancelled":$cancelled}]}
    """.trimIndent()

    private fun manifest(body: String, revision: Int = 1): EventManifest {
        val hash = MessageDigest.getInstance("SHA-256").digest(body.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        return EventManifest(eventId = "indiafoss-2026", revision = revision, generatedAt = timestamp, assets = mapOf("event" to "event.${hash.take(8)}.json"))
    }

    @AfterTest
    fun cleanUp() { dir.deleteRecursively() }

    @Test
    fun `metadata only and reinstated revisions survive restart without touching attendee data`() {
        val preferences = File(dir, "attendee-preferences")
        preferences.writeText("private choices and notes")
        val cancelled = body(cancelled = true)
        cache.adopt(manifest(cancelled), cancelled)
        val renamed = body(name = "IndiaFOSS 2026", cancelled = true)
        assertTrue(ScheduleDiff.between(cache.read()!!.bundle, EventRevisionCache.decodeBundle(renamed, "indiafoss-2026")).isEmpty())
        cache.adopt(manifest(renamed, 2), renamed)
        assertEquals("IndiaFOSS 2026", cache.read()!!.bundle.name)
        assertEquals(2, cache.read()!!.revision)
        val reinstated = body(name = "IndiaFOSS 2026")
        val previous = cache.read()!!.bundle
        cache.adopt(manifest(reinstated, 3), reinstated)
        val restarted = cache.read()!!
        assertEquals(3, restarted.revision)
        assertFalse(restarted.bundle.activities.single().cancelled)
        val diff = ScheduleDiff.between(previous, restarted.bundle)
        assertEquals(listOf(ScheduleDiff.Kind.REINSTATED), diff.map { it.kind })
        assertEquals("1 reinstated", ScheduleDiff.summary(diff))
        assertEquals("private choices and notes", preferences.readText())
    }

    @Test
    fun `failed replacement preserves complete previous revision and permits retry`() {
        val old = body()
        cache.adopt(manifest(old), old)
        val next = body(name = "Updated")
        val failing = EventRevisionCache(dir, "indiafoss-2026") { target, text ->
            writeFileAtomically(target, text) { _, _ -> error("interrupted before rename") }
        }
        assertFailsWith<Exception> { failing.adopt(manifest(next, 2), next) }
        assertEquals(1, cache.read()!!.revision)
        assertEquals("IndiaFOSS", cache.read()!!.bundle.name)
        cache.adopt(manifest(next, 2), next)
        assertEquals(2, cache.read()!!.revision)
        assertEquals("Updated", cache.read()!!.bundle.name)
    }

    @Test
    fun `interruption after rename restores bundle and revision together`() {
        val old = body()
        cache.adopt(manifest(old), old)
        val next = body(name = "Updated")
        val failing = EventRevisionCache(dir, "indiafoss-2026") { target, text ->
            writeFileAtomically(target, text)
            error("interrupted after rename")
        }
        assertFailsWith<Exception> { failing.adopt(manifest(next, 2), next) }
        assertEquals(2, cache.read()!!.revision)
        assertEquals("Updated", cache.read()!!.bundle.name)
    }

    @Test
    fun `incomplete temporary files and standalone revision stamps cannot claim adoption`() {
        File(dir, "indiafoss-2026-revision").writeText("999")
        File(dir, "indiafoss-2026-schedule.json.abandoned.tmp").writeText("{broken")
        assertNull(cache.read())
        File(dir, "indiafoss-2026-bundle.json").writeText(body())
        assertNull(cache.read()!!.revision)
        cache.adopt(manifest(body(), 2), body())
        assertEquals(2, cache.read()!!.revision)
    }

    @Test
    fun `corrupt committed cache falls back without a known revision and can refresh again`() {
        File(dir, "indiafoss-2026-bundle.json").writeText(body(name = "Legacy"))
        cache.adopt(manifest(body(), 8), body())
        File(dir, "indiafoss-2026-schedule.json").writeText("{broken")
        assertEquals("Legacy", cache.read()!!.bundle.name)
        assertNull(cache.read()!!.revision)
        cache.adopt(manifest(body(), 8), body())
        assertEquals(8, cache.read()!!.revision)
    }

    @Test
    fun `a late older download cannot replace a newer revision`() {
        val newest = body(name = "Newest")
        cache.adopt(manifest(newest, 9), newest)
        val adopted = cache.adopt(manifest(body(), 8), body())
        assertEquals(9, adopted.revision)
        assertEquals("Newest", cache.read()!!.bundle.name)
    }

    @Test
    fun `wrong event version digest and asset path leave the previous record unchanged`() {
        val old = body()
        cache.adopt(manifest(old), old)
        val record = File(dir, "indiafoss-2026-schedule.json")
        val before = record.readText()
        val next = body(name = "Updated")
        val valid = manifest(next, 2)
        val invalid = listOf(
            valid.copy(eventId = "another-event"), valid.copy(schemaVersion = 2), valid.copy(revision = 0),
            valid.copy(assets = emptyMap()), valid.copy(assets = mapOf("event" to "../event.json")),
            valid.copy(assets = mapOf("event" to "event.00000000.json")), valid.copy(generatedAt = null),
        )
        for (candidate in invalid) {
            assertFailsWith<Exception> { cache.adopt(candidate, next) }
            assertEquals(before, record.readText())
        }
        for (candidate in listOf(
            next.replace("\"schemaVersion\":1", "\"schemaVersion\":2"),
            next.replace("\"schemaVersion\":1", "\"schemaVersion\":\"1\""),
            next.replace("indiafoss-2026", "another-event"), "{broken",
        )) {
            assertFailsWith<Exception> { cache.adopt(manifest(candidate, 2), candidate) }
            assertEquals(before, record.readText())
        }
    }

    @Test
    fun `a published asset verifies with the actual publisher digest convention`() {
        val root = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
            .first { File(it, "pnpm-workspace.yaml").isFile }
        val published = File(root, "events/indiafoss-2026/published")
        val manifest = bundleJson.decodeFromString<EventManifest>(File(published, "manifest.json").readText())
        val raw = File(published, manifest.assets.getValue("event")).readText()
        cache.adopt(manifest, raw)
        assertEquals(manifest.revision, cache.read()!!.revision)
        assertEquals("indiafoss-2026", cache.read()!!.bundle.id)
    }
}
