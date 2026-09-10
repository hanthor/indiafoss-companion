package org.indiafoss.companion.core

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PersonalDataFileTest {
    private fun root(): File = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
        .map { File(it, "packages/test-fixtures/fixtures") }.first { File(it, "index.json").isFile }

    @Test
    fun `shared contract fixtures agree with PWA and preserve unknown sections`() {
        val root = root()
        val index = Json.parseToJsonElement(File(root, "index.json").readText()).jsonObject["personal-data"]!!.jsonObject
        for ((validity, entries) in index) {
            for (entry in entries.jsonArray) {
                val case = entry.jsonObject
                val text = File(root, "personal-data/$validity/${case["file"]!!.jsonPrimitive.content}").readText()
                val result = PersonalDataFiles.decode(text)
                assertEquals(validity == "valid", result.ok, case.toString())
                if (result.ok) {
                    assertEquals(Json.parseToJsonElement(text), Json.parseToJsonElement(PersonalDataFiles.encode(result.data!!)))
                } else {
                    val expected = case["expectIssue"]!!.jsonPrimitive.content
                    assertTrue(result.issues.any { expected in it }, result.issues.toString())
                }
            }
        }
    }

    @Test
    fun `malformed input and oversized UTF-8 data are rejected`() {
        assertFalse(PersonalDataFiles.decode("{").ok)
        assertEquals(listOf("personal data exceeds the nesting limit"), PersonalDataFiles.decode("[".repeat(65) + "0" + "]".repeat(65)).issues)
        val quoted = """{"format":"indiafoss-personal-data","schemaVersion":1,"exportedAt":"2026-09-09T00:00:00.000Z","events":[],"futureField":"${"[".repeat(1000)}"}"""
        assertTrue(PersonalDataFiles.decode(quoted).ok)
        val text = "ನ".repeat(PersonalDataFiles.MAX_BYTES / 3 + 1)
        assertTrue(text.length < PersonalDataFiles.MAX_BYTES)
        assertEquals(listOf("personal data exceeds the 5 MiB limit"), PersonalDataFiles.decode(text).issues)
    }
}
