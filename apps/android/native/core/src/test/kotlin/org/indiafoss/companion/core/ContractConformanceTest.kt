package org.indiafoss.companion.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import java.io.File
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Runs the golden fixtures in `packages/test-fixtures/fixtures/` against the
 * Kotlin validators, so the Android app rejects exactly what the web app
 * rejects (ADR 0009, task C-08). Invalid cases assert on a substring of the
 * issue text, the same rule the TypeScript runner applies.
 */
class ContractConformanceTest {
    private val validators: Map<String, (JsonElement?) -> List<String>> = mapOf(
        "event-manifest" to ::collectEventManifestIssues,
        "contact-card" to ::collectContactCardIssues,
    )

    /** Contracts the index carries that this app does not read yet. Named so a gap is visible, not silent. */
    private val notPorted = setOf(
        "conference-directory",
        "identity-binding",
        "app-handoff",
        "capability-record",
        "personal-data",
    )

    private val root: File = repoRoot()
    private val fixtures = File(root, "packages/test-fixtures/fixtures")
    private val index: JsonObject = Json.parseToJsonElement(File(fixtures, "index.json").readText()).jsonObject

    @Test
    fun `the index covers every ported contract in both directions, and names the rest`() {
        for (contract in validators.keys) {
            val entry = index[contract]?.jsonObject ?: fail("$contract is missing from index.json")
            assertTrue(entry["valid"]!!.jsonArray.isNotEmpty(), "$contract has no valid fixtures")
            assertTrue(entry["invalid"]!!.jsonArray.isNotEmpty(), "$contract has no invalid fixtures")
        }
        val unaccounted = index.keys - validators.keys - notPorted
        assertTrue(unaccounted.isEmpty(), "contracts neither ported nor listed as not ported: $unaccounted")
        assertTrue((notPorted - index.keys).isEmpty(), "listed as not ported but absent from the index: ${notPorted - index.keys}")
    }

    /** One test per fixture case, named like the TypeScript runner's, so a failure reads the same on both platforms. */
    @TestFactory
    fun `every fixture case reaches the same verdict as the web app`(): List<DynamicTest> {
        val tests = mutableListOf<DynamicTest>()
        for ((contract, validate) in validators) {
            val entry = index[contract]!!.jsonObject
            for (case in entry["valid"]!!.jsonArray) {
                val file = case.jsonObject["file"]!!.jsonPrimitive.content
                val describes = case.jsonObject["describes"]!!.jsonPrimitive.content
                tests += DynamicTest.dynamicTest("$contract/$file is accepted — $describes") {
                    val issues = validate(load(contract, "valid", file))
                    assertTrue(issues.isEmpty(), "$contract/valid/$file ($describes): expected no issues, got $issues")
                }
            }
            for (case in entry["invalid"]!!.jsonArray) {
                val file = case.jsonObject["file"]!!.jsonPrimitive.content
                val describes = case.jsonObject["describes"]!!.jsonPrimitive.content
                val expect = case.jsonObject["expectIssue"]!!.jsonPrimitive.content
                tests += DynamicTest.dynamicTest("$contract/$file is rejected — $describes") {
                    val issues = validate(load(contract, "invalid", file))
                    assertTrue(issues.isNotEmpty(), "$contract/invalid/$file ($describes): accepted, expected an issue containing \"$expect\"")
                    assertTrue(
                        issues.any { it.contains(expect) },
                        "$contract/invalid/$file ($describes): expected an issue containing \"$expect\", got $issues",
                    )
                }
            }
        }
        assertTrue(tests.isNotEmpty(), "no fixture cases ran")
        return tests
    }

    private fun load(contract: String, validity: String, file: String): JsonElement =
        Json.parseToJsonElement(File(fixtures, "$contract/$validity/$file").readText())

    private fun repoRoot(): File {
        System.getProperty("repoRoot")?.let { return File(it) }
        var dir: File? = File(".").absoluteFile
        repeat(10) {
            val candidate = dir ?: return@repeat
            if (File(candidate, "pnpm-workspace.yaml").exists()) return candidate
            dir = candidate.parentFile
        }
        error("could not find the repository root from ${File(".").absolutePath}")
    }
}
