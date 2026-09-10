package org.indiafoss.companion.core

import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BoundedFileCacheTest {
    private val dir: File = Files.createTempDirectory("photo-cache-test").toFile()
    private var now = 1_000_000L
    private val clock = { now += 1_000; now }

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    private fun bytes(size: Int, fill: Int = 7) = ByteArray(size) { fill.toByte() }

    @Test
    fun `stores and returns bytes by any key`() {
        val cache = BoundedFileCache(dir, maxBytes = 1_000, clock = clock)
        assertTrue(cache.put("https://example.org/a.png?x=1", bytes(10, 1)))
        assertContentEquals(bytes(10, 1), cache.get("https://example.org/a.png?x=1"))
        assertNull(cache.get("https://example.org/missing.png"))
        assertTrue(cache.contains("https://example.org/a.png?x=1"))
    }

    @Test
    fun `survives a restart on the same directory`() {
        BoundedFileCache(dir, maxBytes = 1_000, clock = clock).put("k", bytes(20))
        val reopened = BoundedFileCache(dir, maxBytes = 1_000, clock = clock)
        assertContentEquals(bytes(20), reopened.get("k"))
        assertEquals(20, reopened.size())
    }

    @Test
    fun `evicts the least recently used entries once over the cap`() {
        val cache = BoundedFileCache(dir, maxBytes = 100, maxEntryBytes = 100, clock = clock)
        cache.put("a", bytes(40))
        cache.put("b", bytes(40))
        // Touch a: b is now the oldest.
        cache.get("a")
        cache.put("c", bytes(40))
        assertTrue(cache.size() <= 100)
        assertFalse(cache.contains("b"))
        assertTrue(cache.contains("a"))
        assertTrue(cache.contains("c"))
    }

    @Test
    fun `refuses an entry larger than the per-entry limit without touching the rest`() {
        val cache = BoundedFileCache(dir, maxBytes = 100, clock = clock)
        cache.put("small", bytes(10))
        assertFalse(cache.put("huge", bytes(26)))
        assertFalse(cache.contains("huge"))
        assertTrue(cache.contains("small"))
        assertEquals(10, cache.size())
    }

    @Test
    fun `replacing an entry keeps one copy`() {
        val cache = BoundedFileCache(dir, maxBytes = 1_000, clock = clock)
        cache.put("k", bytes(10, 1))
        cache.put("k", bytes(30, 2))
        assertEquals(1, cache.count())
        assertContentEquals(bytes(30, 2), cache.get("k"))
        assertTrue(dir.list()!!.none { it.endsWith(".tmp") })
    }

    @Test
    fun `remove and clear`() {
        val cache = BoundedFileCache(dir, maxBytes = 1_000, clock = clock)
        cache.put("a", bytes(1))
        cache.put("b", bytes(1))
        cache.remove("a")
        assertFalse(cache.contains("a"))
        cache.clear()
        assertEquals(0, cache.count())
    }

    @Test
    fun `an unreadable entry is a miss, not a crash`() {
        val cache = BoundedFileCache(dir, maxBytes = 1_000, clock = clock)
        cache.put("a", bytes(1))
        File(dir, BoundedFileCache.keyName("a") + ".blob").delete()
        assertNull(cache.get("a"))
    }
}
