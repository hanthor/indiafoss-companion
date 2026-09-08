package org.indiafoss.companion.core

import java.io.File
import java.nio.file.Files
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AtomicFileTest {
    private val dir: File = Files.createTempDirectory("atomic-file-test").toFile()

    @AfterTest
    fun cleanUp() {
        dir.deleteRecursively()
    }

    @Test
    fun `writes a new file`() {
        val target = File(dir, "bundle.json")
        writeFileAtomically(target, """{"id":"e"}""")
        assertEquals("""{"id":"e"}""", target.readText())
    }

    @Test
    fun `replaces existing contents`() {
        val target = File(dir, "bundle.json")
        target.writeText("old")
        writeFileAtomically(target, "new")
        assertEquals("new", target.readText())
    }

    @Test
    fun `leaves no temp file behind on success`() {
        val target = File(dir, "bundle.json")
        writeFileAtomically(target, "content")
        assertFalse(File(dir, "bundle.json.tmp").exists(), "temp file should be gone")
        assertEquals(listOf("bundle.json"), dir.list()!!.sorted())
    }

    @Test
    fun `a failed write leaves the previous contents byte-identical`() {
        // The #190 failure: an interrupted write used to truncate the real
        // file. Simulate the interruption by making the temp path
        // unwritable — a directory of that name cannot be written as a file.
        val target = File(dir, "bundle.json")
        target.writeText("the good schedule")
        File(dir, "bundle.json.tmp").mkdir()

        assertFailsWith<Exception> { writeFileAtomically(target, "half a sched") }

        assertEquals("the good schedule", target.readText())
    }

    @Test
    fun `creates the parent directory when it does not exist`() {
        val target = File(File(dir, "nested"), "bundle.json")
        writeFileAtomically(target, "content")
        assertTrue(target.exists())
        assertEquals("content", target.readText())
    }
}
