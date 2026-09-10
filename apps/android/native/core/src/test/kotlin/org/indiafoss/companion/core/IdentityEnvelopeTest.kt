package org.indiafoss.companion.core

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * The identity envelope (#160) against the same fixture table the PWA reads,
 * so both parsers promote, retain and refuse exactly the same cards.
 */
class IdentityEnvelopeTest {
    private fun fixtures(): File = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
        .map { File(it, "packages/test-fixtures/fixtures") }.first { File(it, "index.json").isFile }

    @Test
    fun `shared identity-envelope fixtures agree with the PWA`() {
        val table = Json.parseToJsonElement(File(fixtures(), "identity-envelope/cases.json").readText()).jsonObject
        assertEquals(Identity.VERSION, table["version"]!!.jsonPrimitive.content.toInt())
        val cases = table["cases"]!!.jsonArray
        assertTrue(cases.size >= 10)
        for (entry in cases) {
            val case = entry.jsonObject
            val name = case["name"]!!.jsonPrimitive.content
            val vcard = case["vcard"]!!.jsonArray.joinToString("\r\n") { it.jsonPrimitive.content } + "\r\n"
            val expect = case["expect"]!!.jsonObject
            val card = VCard.parse(vcard) ?: error("$name: not a vCard")
            fun text(key: String): String? = expect[key]!!.let { if (it is JsonNull) null else it.jsonPrimitive.content }
            assertEquals(text("meshNodeId").orEmpty(), card.meshNodeId, "$name: mesh")
            assertEquals(text("matrixId").orEmpty(), card.matrixId, "$name: matrix")
            val retained = expect["retained"]!!.jsonObject.mapValues { it.value.jsonPrimitive.content }
            assertEquals(retained, card.retainedIdentity, "$name: retained")
            val hasIdentity = card.meshNodeId.isNotEmpty() || card.matrixId.isNotEmpty() || retained.isNotEmpty()
            if (hasIdentity) assertEquals(expect["version"]!!.jsonPrimitive.content.toInt(), card.identityVersion, "$name: version")
            // A retained field never becomes an address, and a re-encoded card reads the same way again.
            val again = VCard.parse(VCard.encode(card.copy(share = mapOf("neutrinoServerName" to true))))!!
            assertEquals(card.meshNodeId, again.meshNodeId, "$name: mesh after round-trip")
            assertEquals(card.matrixId, again.matrixId, "$name: matrix after round-trip")
            assertEquals(card.retainedIdentity, again.retainedIdentity, "$name: retained after round-trip")
        }
    }

    @Test
    fun `an unversioned card reads as v1 and a foreign version promotes nothing`() {
        val node = "845aa456078572639c1543694de69e0a03fb883bd9c1dab1a2f6df811b75897e"
        assertEquals(Identity.Compatibility.LEGACY, Identity.compatibility(null))
        assertEquals(Identity.Compatibility.SUPPORTED, Identity.compatibility("1"))
        assertEquals(Identity.Compatibility.FORWARD, Identity.compatibility("2"))
        assertEquals(Identity.Compatibility.MALFORMED, Identity.compatibility("v1"))
        assertEquals(Identity.Compatibility.MALFORMED, Identity.compatibility("0"))
        val legacy = Identity.read(null, node.uppercase(), "@asha:example.org")
        assertEquals(Identity.Envelope(1, true, node, "@asha:example.org"), legacy)
        val future = Identity.read("2", node, "@asha:example.org")
        assertFalse(future.understood)
        assertEquals(mapOf("version" to "2", "mesh" to node, "matrix" to "@asha:example.org"), future.retained)
        // Two well-formed but different node ids stay distinct: the mismatch case survives.
        assertNotEquals(Identity.read(null, node, null).meshNodeId, Identity.read(null, "b".repeat(64), null).meshNodeId)
        assertTrue(Identity.isNodeId(node) && !Identity.isNodeId(node.take(32)))
    }
}
