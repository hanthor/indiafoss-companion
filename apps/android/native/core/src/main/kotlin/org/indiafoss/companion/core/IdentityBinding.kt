package org.indiafoss.companion.core

import java.security.KeyFactory
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.time.Instant
import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The mesh ↔ Matrix identity binding, v1 — the Kotlin twin of
 * `packages/model/src/binding.ts` (#188, `docs/identity-binding.md`), driven
 * by the same vector table
 * (`packages/test-fixtures/fixtures/identity-binding/vectors.json`).
 *
 * A binding is a statement signed by both the card key and a Matrix key over
 * the same bytes: `domain ‖ "\n" ‖ canonicalJson(statement)`. Verification is
 * pure — the caller supplies the keys it holds, the identities the card
 * claims, the revocations it knows and the clock. A `VALID` result means
 * both signatures check; what the Matrix key is worth is the caller's
 * [MatrixKey.provenance], and a key fetched from a homeserver earns at most
 * `binding-valid`, never a verified badge.
 *
 * Ed25519 arrives in the JDK at 15 and on Android with API 33's Conscrypt;
 * where it is missing the result is `UNVERIFIABLE`, never a guess.
 */
object IdentityBinding {
    const val DOMAIN = "in.indiafoss.binding/v1"
    const val VERSION = 1
    private const val DOMAIN_PREFIX = "in.indiafoss.binding/v"
    const val MAX_VALIDITY_MS = 180L * 24 * 60 * 60 * 1000
    const val CLOCK_SKEW_MS = 5L * 60 * 1000

    enum class State {
        VALID, MALFORMED, WRONG_DOMAIN, UNKNOWN_VERSION, INVALID_SIGNATURE, MISMATCH, REVOKED, EXPIRED, NOT_YET_VALID, UNVERIFIABLE;

        /** The spelling shared with the PWA and the fixtures. */
        val wire: String get() = name.lowercase().replace('_', '-')
    }

    enum class KeyKind(val wire: String) { MASTER("master"), SELF_SIGNING("self-signing"), DEVICE("device") }

    enum class Provenance(val wire: String) { USER_VERIFIED("user-verified"), CROSS_SIGNED("cross-signed"), SERVER("server"), CACHED("cached") }

    /** A Matrix public key the verifier holds independently of the binding; `publicKey` is the raw 32 bytes, base64 or base64url. */
    data class MatrixKey(val id: String, val kind: KeyKind, val publicKey: String, val provenance: Provenance)

    data class Statement(
        val v: Int,
        val id: String,
        val meshNodeId: String,
        val matrixUserId: String,
        val cardKeyId: String,
        val matrixKeyId: String,
        val matrixKeyKind: KeyKind,
        val issuedAt: String,
        val expiresAt: String,
        val nonce: String,
    )

    data class Result(val state: State, val reason: String? = null, val statement: Statement? = null, val provenance: Provenance? = null)

    /** The account-claim trust a result supports: `binding-valid`, `revoked`, otherwise `claimed`. */
    fun accountTrust(state: State): String = when (state) {
        State.VALID -> "binding-valid"
        State.REVOKED -> "revoked"
        else -> "claimed"
    }

    // ---- canonical encoding ----------------------------------------------------

    /** Canonical JSON, Matrix flavour: sorted keys, no whitespace, integers, `JSON.stringify` escaping. */
    fun canonicalJson(element: JsonElement): String = when (element) {
        is JsonNull -> "null"
        is JsonPrimitive -> if (element.isString) quote(element.content) else element.content
        is JsonArray -> element.joinToString(",", "[", "]") { canonicalJson(it) }
        is JsonObject -> element.entries.sortedBy { it.key }.joinToString(",", "{", "}") { (k, v) -> quote(k) + ":" + canonicalJson(v) }
    }

    private fun quote(text: String): String {
        val out = StringBuilder("\"")
        for (ch in text) {
            when {
                ch == '"' -> out.append("\\\"")
                ch == '\\' -> out.append("\\\\")
                ch == '\n' -> out.append("\\n")
                ch == '\r' -> out.append("\\r")
                ch == '\t' -> out.append("\\t")
                ch == '\b' -> out.append("\\b")
                ch == '\u000C' -> out.append("\\f")
                ch < ' ' -> out.append("\\u%04x".format(ch.code))
                else -> out.append(ch)
            }
        }
        return out.append('"').toString()
    }

    /** The exact bytes both keys sign. */
    fun signingBytes(domain: String, statement: JsonObject): ByteArray = "$domain\n${canonicalJson(statement)}".toByteArray(Charsets.UTF_8)

    fun signingBytesHex(domain: String, statement: JsonObject): String = signingBytes(domain, statement).joinToString("") { "%02x".format(it) }

    // ---- structure ---------------------------------------------------------------

    private val ID = Regex("^[A-Za-z0-9_.:-]{1,64}$")
    private val NODE_ID = Regex("^[0-9a-f]{64}$")
    private val MATRIX_USER_ID = Regex("^@[^:\\s]+:[^\\s]+$")
    private val CARD_KEY = Regex("^(ed25519|p256):([A-Za-z0-9_-]{20,200})$")
    private val MATRIX_KEY_ID = Regex("^ed25519:[A-Za-z0-9+/_-]{1,64}$")
    private val INSTANT = Regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$")
    private val NONCE = Regex("^[A-Za-z0-9_-]{22}$")
    private val SIGNATURE = Regex("^[A-Za-z0-9_-]{20,200}$")
    private val FIELDS = setOf("v", "id", "meshNodeId", "matrixUserId", "cardKeyId", "matrixKeyId", "matrixKeyKind", "issuedAt", "expiresAt", "nonce")

    private fun str(obj: JsonObject, key: String): String? = (obj[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

    /** Structural issues with a statement. Empty means well-formed, not true. */
    fun statementIssues(value: JsonElement?): List<String> {
        val obj = value as? JsonObject ?: return listOf("statement must be an object")
        val issues = mutableListOf<String>()
        fun check(key: String, re: Regex, what: String) { if (str(obj, key)?.let(re::matches) != true) issues += "$key must be $what" }
        if ((obj["v"] as? JsonPrimitive)?.takeIf { !it.isString }?.content != VERSION.toString()) issues += "v must be $VERSION"
        check("id", ID, "an id of 1–64 [A-Za-z0-9_.:-]")
        check("meshNodeId", NODE_ID, "64 lowercase hex characters")
        val mxid = str(obj, "matrixUserId")
        if (mxid == null || !MATRIX_USER_ID.matches(mxid) || mxid.startsWith("@n:")) issues += "matrixUserId must be a classic Matrix user id"
        check("cardKeyId", CARD_KEY, "a card key (alg:base64url)")
        check("matrixKeyId", MATRIX_KEY_ID, "a Matrix ed25519 key id")
        if (KeyKind.entries.none { it.wire == str(obj, "matrixKeyKind") }) issues += "matrixKeyKind must be one of master, self-signing, device"
        check("issuedAt", INSTANT, "an ISO-8601 UTC instant with milliseconds")
        check("expiresAt", INSTANT, "an ISO-8601 UTC instant with milliseconds")
        check("nonce", NONCE, "16 bytes base64url")
        val issued = str(obj, "issuedAt")?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
        val expires = str(obj, "expiresAt")?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
        if (issued != null && expires != null) {
            if (expires <= issued) issues += "expiresAt must be after issuedAt"
            else if (expires - issued > MAX_VALIDITY_MS) issues += "validity exceeds 180 days"
        }
        for (key in obj.keys) if (key !in FIELDS) issues += "unknown field $key"
        return issues
    }

    fun signedIssues(value: JsonElement?): List<String> {
        val obj = value as? JsonObject ?: return listOf("binding must be an object")
        val issues = mutableListOf<String>()
        if (str(obj, "domain") == null) issues += "domain must be a string"
        val sigs = obj["signatures"] as? JsonObject
        if (sigs == null) issues += "signatures must be an object"
        else for (half in listOf("card", "matrix")) if (str(sigs, half)?.let(SIGNATURE::matches) != true) issues += "signatures.$half must be base64url"
        issues += statementIssues(obj["statement"])
        return issues
    }

    private fun statementOf(obj: JsonObject): Statement = Statement(
        v = obj["v"]!!.jsonPrimitive.content.toInt(),
        id = str(obj, "id")!!,
        meshNodeId = str(obj, "meshNodeId")!!,
        matrixUserId = str(obj, "matrixUserId")!!,
        cardKeyId = str(obj, "cardKeyId")!!,
        matrixKeyId = str(obj, "matrixKeyId")!!,
        matrixKeyKind = KeyKind.entries.first { it.wire == str(obj, "matrixKeyKind") },
        issuedAt = str(obj, "issuedAt")!!,
        expiresAt = str(obj, "expiresAt")!!,
        nonce = str(obj, "nonce")!!,
    )

    // ---- crypto ------------------------------------------------------------------

    private val ED25519_SPKI_PREFIX = byteArrayOf(0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00)
    private val ED25519_PKCS8_PREFIX = byteArrayOf(0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20)

    private fun decodeAnyBase64(text: String): ByteArray = Base64.getUrlDecoder().decode(text.trimEnd('=').replace('+', '-').replace('/', '_'))

    /** A JDK public key for a raw 32-byte Ed25519 key. Throws where the platform has no Ed25519. */
    fun ed25519PublicKey(raw: ByteArray): PublicKey {
        require(raw.size == 32) { "Ed25519 public keys are 32 bytes" }
        return KeyFactory.getInstance("Ed25519").generatePublic(X509EncodedKeySpec(ED25519_SPKI_PREFIX + raw))
    }

    /** A JDK private key for a raw 32-byte Ed25519 seed. For tests and for a signer that holds the seed. */
    fun ed25519PrivateKey(seed: ByteArray): PrivateKey {
        require(seed.size == 32) { "Ed25519 seeds are 32 bytes" }
        return KeyFactory.getInstance("Ed25519").generatePrivate(PKCS8EncodedKeySpec(ED25519_PKCS8_PREFIX + seed))
    }

    private fun verifyEd25519(raw: ByteArray, signature: ByteArray, data: ByteArray): Boolean =
        Signature.getInstance("Ed25519").run { initVerify(ed25519PublicKey(raw)); update(data); verify(signature) }

    private fun verifyCardKey(formatted: String, signature: ByteArray, data: ByteArray): Boolean {
        val match = CARD_KEY.find(formatted) ?: throw IllegalArgumentException("not a card key")
        val raw = Handshake.fromBase64Url(match.groupValues[2])
        return if (match.groupValues[1] == "ed25519") verifyEd25519(raw, signature, data)
        else Signature.getInstance("SHA256withECDSA").run {
            initVerify(Handshake.p256PublicKey(raw)); update(data); verify(Handshake.rawToDer(signature))
        }
    }

    /** Sign the bytes of a statement with an Ed25519 seed (raw 64-byte signature). Used by tests and a future Chat-side signer. */
    fun signEd25519(seed: ByteArray, data: ByteArray): ByteArray =
        Signature.getInstance("Ed25519").run { initSign(ed25519PrivateKey(seed)); update(data); sign() }

    /**
     * Verify a binding against what the caller holds. Never throws. Check
     * order matches the PWA: shape and domain; the card signature; identities
     * and card key; revocation and time; the Matrix signature last, since it
     * is the one half that may be unverifiable offline.
     */
    fun verify(
        signed: JsonElement?,
        expectedMeshNodeId: String,
        expectedMatrixUserId: String,
        cardKey: String,
        matrixKey: MatrixKey?,
        revokedIds: Collection<String> = emptyList(),
        nowMs: Long,
    ): Result {
        val obj = signed as? JsonObject ?: return Result(State.MALFORMED, "not a signed binding object")
        val domain = str(obj, "domain") ?: return Result(State.MALFORMED, "not a signed binding object")
        if (domain != DOMAIN) {
            val version = domain.takeIf { it.startsWith(DOMAIN_PREFIX) }?.removePrefix(DOMAIN_PREFIX)?.toIntOrNull()
            if (version != null && version > VERSION) return Result(State.UNKNOWN_VERSION, "binding version $version")
            return Result(State.WRONG_DOMAIN, "domain $domain")
        }
        val issues = signedIssues(obj)
        if (issues.isNotEmpty()) return Result(State.MALFORMED, issues.joinToString("; "))
        val statementJson = obj["statement"]!!.jsonObject
        val statement = statementOf(statementJson)
        val signatures = obj["signatures"]!!.jsonObject
        val bytes = signingBytes(domain, statementJson)

        val cardOk = runCatching { verifyCardKey(cardKey, Handshake.fromBase64Url(str(signatures, "card")!!), bytes) }
            .getOrElse { return Result(State.UNVERIFIABLE, "card key could not be imported", statement) }
        if (!cardOk) return Result(State.INVALID_SIGNATURE, "card signature", statement)

        if (statement.cardKeyId != cardKey) return Result(State.MISMATCH, "cardKeyId", statement)
        if (statement.meshNodeId != expectedMeshNodeId.trim().lowercase()) return Result(State.MISMATCH, "meshNodeId", statement)
        if (statement.matrixUserId != expectedMatrixUserId.trim()) return Result(State.MISMATCH, "matrixUserId", statement)

        if (statement.id in revokedIds) return Result(State.REVOKED, statement = statement)
        if (Instant.parse(statement.issuedAt).toEpochMilli() > nowMs + CLOCK_SKEW_MS) return Result(State.NOT_YET_VALID, statement = statement)
        if (Instant.parse(statement.expiresAt).toEpochMilli() <= nowMs) return Result(State.EXPIRED, statement = statement)

        if (matrixKey == null) return Result(State.UNVERIFIABLE, "no Matrix key held", statement)
        if (matrixKey.id != statement.matrixKeyId || matrixKey.kind != statement.matrixKeyKind) {
            return Result(State.UNVERIFIABLE, "held Matrix key is not the signing key", statement)
        }
        val matrixOk = runCatching { verifyEd25519(decodeAnyBase64(matrixKey.publicKey), Handshake.fromBase64Url(str(signatures, "matrix")!!), bytes) }
            .getOrElse { return Result(State.UNVERIFIABLE, "Matrix key could not be imported", statement) }
        if (!matrixOk) return Result(State.INVALID_SIGNATURE, "matrix signature", statement)
        return Result(State.VALID, statement = statement, provenance = matrixKey.provenance)
    }

    /** Parse JSON text and verify; a convenience for callers holding the wire string. */
    fun verifyText(
        json: String,
        expectedMeshNodeId: String,
        expectedMatrixUserId: String,
        cardKey: String,
        matrixKey: MatrixKey?,
        revokedIds: Collection<String> = emptyList(),
        nowMs: Long,
    ): Result {
        val element = runCatching { Json.parseToJsonElement(json) }.getOrElse { return Result(State.MALFORMED, "not JSON") }
        return verify(element, expectedMeshNodeId, expectedMatrixUserId, cardKey, matrixKey, revokedIds, nowMs)
    }
}
