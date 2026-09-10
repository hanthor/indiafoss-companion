package org.indiafoss.companion.core

import java.io.File
import java.time.Instant
import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The identity binding (#188) against the vector table the PWA generated, so
 * both verifiers reach the same verdict on every case and agree on the exact
 * bytes a signature covers. Ed25519 is deterministic, so the Kotlin signer
 * must also reproduce the PWA's signatures from the same test seeds.
 */
class IdentityBindingTest {
    private fun fixtures(): File = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
        .map { File(it, "packages/test-fixtures/fixtures") }.first { File(it, "index.json").isFile }

    private val table = Json.parseToJsonElement(File(fixtures(), "identity-binding/vectors.json").readText()).jsonObject

    private fun text(obj: JsonObject, key: String): String? = obj[key]?.let { if (it is JsonNull) null else it.jsonPrimitive.content }

    private fun matrixKey(element: JsonObject?): IdentityBinding.MatrixKey? = element?.let {
        IdentityBinding.MatrixKey(
            id = text(it, "id")!!,
            kind = IdentityBinding.KeyKind.entries.first { k -> k.wire == text(it, "kind") },
            publicKey = text(it, "publicKey")!!,
            provenance = IdentityBinding.Provenance.entries.first { p -> p.wire == text(it, "provenance") },
        )
    }

    @Test
    fun `every shared vector reaches the PWA's verdict`() {
        assertEquals(IdentityBinding.DOMAIN, text(table, "domain"))
        assertEquals(IdentityBinding.VERSION, text(table, "version")!!.toInt())
        val cases = table["cases"]!!.jsonArray
        assertTrue(cases.size >= 15)
        val seen = mutableSetOf<IdentityBinding.State>()
        for (entry in cases) {
            val case = entry.jsonObject
            val name = text(case, "name")!!
            val expected = case["expected"]!!.jsonObject
            val expect = case["expect"]!!.jsonObject
            val result = IdentityBinding.verify(
                signed = case["signed"],
                expectedMeshNodeId = text(expected, "meshNodeId")!!,
                expectedMatrixUserId = text(expected, "matrixUserId")!!,
                cardKey = text(case, "cardKey")!!,
                matrixKey = matrixKey(case["matrixKey"] as? JsonObject),
                revokedIds = case["revokedIds"]!!.jsonArray.map { it.jsonPrimitive.content },
                nowMs = Instant.parse(text(case, "now")!!).toEpochMilli(),
            )
            assertEquals(text(expect, "state"), result.state.wire, "$name: state (${result.reason})")
            text(expect, "reason")?.let { assertEquals(it, result.reason, "$name: reason") }
            assertEquals(text(expect, "account"), IdentityBinding.accountTrust(result.state), "$name: account")
            val hex = text(case, "signingBytesHex")
            if (hex != null) {
                val signed = case["signed"]!!.jsonObject
                assertEquals(hex, IdentityBinding.signingBytesHex(text(signed, "domain")!!, signed["statement"]!!.jsonObject), "$name: signing bytes")
            }
            if (result.state == IdentityBinding.State.VALID) {
                assertEquals(text(case["matrixKey"]!!.jsonObject, "provenance"), result.provenance!!.wire, "$name: provenance")
            }
            seen += result.state
        }
        // Every branch of the verifier is exercised by the shared table.
        assertEquals(IdentityBinding.State.entries.toSet(), seen)
    }

    @Test
    fun `the Kotlin signer reproduces the PWA's Ed25519 signatures from the same seeds`() {
        val keys = table["keys"]!!.jsonObject
        val valid = table["cases"]!!.jsonArray.map { it.jsonObject }.first { text(it, "name") == "valid-master-key" }
        val signed = valid["signed"]!!.jsonObject
        val bytes = IdentityBinding.signingBytes(text(signed, "domain")!!, signed["statement"]!!.jsonObject)
        fun seed(name: String): ByteArray = Base64.getUrlDecoder().decode(text(keys[name]!!.jsonObject["jwk"]!!.jsonObject, "d")!!)
        val signatures = signed["signatures"]!!.jsonObject
        assertEquals(text(signatures, "card"), Handshake.base64Url(IdentityBinding.signEd25519(seed("card"), bytes)))
        assertEquals(text(signatures, "matrix"), Handshake.base64Url(IdentityBinding.signEd25519(seed("master"), bytes)))
    }

    @Test
    fun `canonical JSON sorts keys, drops whitespace and escapes like JSON stringify`() {
        val value = buildJsonObject {
            put("b", JsonPrimitive(1))
            put("a", JsonPrimitive("x\"y\n"))
            put("d", buildJsonObject { put("z", JsonPrimitive("é")); put("y", JsonNull) })
        }
        assertEquals("{\"a\":\"x\\\"y\\n\",\"b\":1,\"d\":{\"y\":null,\"z\":\"é\"}}", IdentityBinding.canonicalJson(value))
        val hex = IdentityBinding.signingBytesHex(IdentityBinding.DOMAIN, buildJsonObject { put("v", JsonPrimitive(1)) })
        assertEquals("in.indiafoss.binding/v1\n{\"v\":1}", String(hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray(), Charsets.UTF_8))
    }

    @Test
    fun `text that is not JSON is malformed, never an exception`() {
        val r = IdentityBinding.verifyText("{not json", "a".repeat(64), "@a:b", "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", null, nowMs = 0)
        assertEquals(IdentityBinding.State.MALFORMED, r.state)
    }
}
