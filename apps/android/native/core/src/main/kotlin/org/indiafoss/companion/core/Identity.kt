package org.indiafoss.companion.core

/**
 * The versioned identity envelope (#160) — the Kotlin twin of
 * `packages/model/src/identity.ts`, driven by the same fixture table
 * (`packages/test-fixtures/fixtures/identity-envelope/cases.json`).
 *
 * Every card and export that carries a person's messaging identity writes the
 * same fields, and each is a wire format already on other people's phones.
 * Upstream has said the mesh identifier will change shape; nothing here may
 * guess what that shape will be. Instead the one decision — "is this an
 * identity shape this build understands" — lives here, with three outcomes:
 * understood (promoted to a routable field), not understood (kept verbatim in
 * [Envelope.retained], never an address, never overwriting a known one), or
 * absent.
 *
 * Version 1 is what every unversioned card carried implicitly: a 64-hex mesh
 * node id and a classic `@user:server` Matrix id, kept in separate fields.
 */
object Identity {
    const val VERSION = 1

    /** vCard property carrying the identity version; absent on cards from before versioning. */
    const val VERSION_FIELD = "X-INDIAFOSS-IDENTITY-VERSION"

    enum class Compatibility { SUPPORTED, LEGACY, FORWARD, MALFORMED }

    private val NODE_ID = Regex("^[0-9a-fA-F]{64}$")
    private val MATRIX_USER_ID = Regex("^@[^:\\s]+:[^\\s]+$")
    private val VERSION_TEXT = Regex("^[1-9][0-9]{0,8}$")

    fun compatibility(version: String?): Compatibility {
        val text = version?.trim().orEmpty()
        if (text.isEmpty()) return Compatibility.LEGACY
        if (!VERSION_TEXT.matches(text)) return Compatibility.MALFORMED
        val n = text.toInt()
        return when {
            n == VERSION -> Compatibility.SUPPORTED
            n > VERSION -> Compatibility.FORWARD
            else -> Compatibility.MALFORMED
        }
    }

    /** The one predicate for "a mesh node id as this build knows it" (ADR 0008). */
    fun isNodeId(value: String): Boolean = NODE_ID.matches(value)

    fun isMatrixUserId(value: String): Boolean = MATRIX_USER_ID.matches(value)

    /**
     * What a reader may promote, and what it must merely keep. [retained] holds
     * `mesh`, `matrix` and — when the version was the reason — `version`.
     */
    data class Envelope(
        val version: Int,
        val understood: Boolean,
        val meshNodeId: String? = null,
        val matrixId: String? = null,
        val retained: Map<String, String> = emptyMap(),
    )

    /** The single decision every parser defers to; see the TypeScript twin for the rules. */
    fun read(version: String?, mesh: String?, matrix: String?, retained: Map<String, String> = emptyMap()): Envelope {
        val kept = LinkedHashMap(retained)
        val meshText = mesh?.trim()?.takeIf { it.isNotEmpty() }
        val matrixText = matrix?.trim()?.takeIf { it.isNotEmpty() }
        when (val compat = compatibility(version)) {
            Compatibility.FORWARD, Compatibility.MALFORMED -> {
                val declared = version!!.trim()
                kept["version"] = declared
                if (meshText != null) kept["mesh"] = meshText
                if (matrixText != null) kept["matrix"] = matrixText
                val parsed = if (compat == Compatibility.FORWARD) declared.toInt() else 0
                return Envelope(version = parsed, understood = false, retained = kept)
            }
            else -> {}
        }
        var meshNodeId: String? = null
        var matrixId: String? = null
        if (meshText != null) {
            if (isNodeId(meshText)) meshNodeId = meshText.lowercase() else kept["mesh"] = meshText
        }
        if (matrixText != null) {
            if (isMatrixUserId(matrixText)) matrixId = matrixText else kept["matrix"] = matrixText
        }
        return Envelope(version = VERSION, understood = true, meshNodeId = meshNodeId, matrixId = matrixId, retained = kept)
    }
}
