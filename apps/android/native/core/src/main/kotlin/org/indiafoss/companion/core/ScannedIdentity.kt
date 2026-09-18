package org.indiafoss.companion.core

/**
 * Contact codes that are an address rather than a card: IndiaFOSS Chat's
 * mesh code (`matrix:u/n:<node id>`), a `matrix.to` link, a bare Matrix id,
 * the app-aware `indiafoss://friend?v=1…` card and the `indiafoss://chat?dm=…`
 * handoff. The result is a minimal [ContactCard] to save, never an identity:
 * the address is what was scanned, and nothing about the person is proven.
 */
object ScannedIdentity {
    fun parse(raw: String): ContactCard? {
        val text = raw.trim()
        if (text.isEmpty() || text.contains('\n')) return null
        val lower = text.lowercase()
        val userId: String? = when {
            Identity.isMatrixUserId(text) -> text
            lower.startsWith("matrix:u/") -> "@" + text.substring("matrix:u/".length).substringBefore('?').substringBefore('#')
            lower.startsWith("https://matrix.to/#/") -> percentDecode(text.substring("https://matrix.to/#/".length).substringBefore('?'))
            lower.startsWith("indiafoss://friend") -> friendTarget(text)
            lower.startsWith("indiafoss://chat") -> query(text)["dm"]
            else -> null
        }
        if (userId == null || !Identity.isMatrixUserId(userId)) return null
        val server = userId.substringAfter(':')
        return if (Identity.isNodeId(server)) {
            ContactCard(fullName = "Mesh " + server.lowercase().take(12), meshNodeId = server.lowercase())
        } else {
            ContactCard(fullName = userId, matrixId = userId)
        }
    }

    private fun friendTarget(link: String): String? {
        val params = query(link)
        if (params["v"] != "1") return null
        params["matrix_id"]?.takeIf { Identity.isMatrixUserId(it) }?.let { return it }
        return params["neutrino_server_name"]?.takeIf { Identity.isNodeId(it) }?.let { "@n:" + it.lowercase() }
    }

    private fun query(link: String): Map<String, String> =
        link.substringAfter('?', "").split('&').filter { it.isNotEmpty() }.associate { pair ->
            pair.substringBefore('=') to percentDecode(pair.substringAfter('=', ""))
        }

    // Without exceptions: a stray '%' stays as it is and the id check rejects it.
    private fun percentDecode(value: String): String {
        val out = StringBuilder(value.length)
        var i = 0
        while (i < value.length) {
            val c = value[i]
            val code = if (c == '%' && i + 2 < value.length) value.substring(i + 1, i + 3).toIntOrNull(16) else null
            when {
                code != null -> { out.append(code.toChar()); i += 3 }
                c == '+' -> { out.append(' '); i++ }
                else -> { out.append(c); i++ }
            }
        }
        return out.toString()
    }
}
