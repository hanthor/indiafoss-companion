package org.indiafoss.companion.core

import kotlinx.serialization.Serializable

/**
 * The attendee's contact card and the vCard 3.0 the QR carries — the same
 * payload the PWA shows and scans (docs/contact-sharing.md), so a card from
 * either app reads in the other and in any camera app. Companion extras ride
 * along as `X-` properties that other apps ignore.
 */
@Serializable
data class ContactCard(
    val fullName: String = "",
    val organization: String = "",
    val email: String = "",
    val phone: String = "",
    val website: String = "",
    val fossUnitedUsername: String = "",
    val matrixId: String = "",
    val avatarUrl: String = "",
    /** The ticket QR's reference (`ticket::…`): a correlation key for organisers, never an identity. */
    val ticketRef: String = "",
    /** Network → URL or handle: github, linkedin, mastodon, x, telegram, … */
    val socials: Map<String, String> = emptyMap(),
    /** Which fields the card encodes; email and phone are off unless switched on. */
    val share: Map<String, Boolean> = emptyMap(),
) {
    fun shares(field: String): Boolean = share[field] ?: (field != "email" && field != "phone" && field != "ticketRef")
}

object VCard {
    private fun esc(v: String) = v.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;")
        .replace(Regex("\r\n|\r|\n"), "\\\\n")

    fun encode(card: ContactCard): String {
        val lines = arrayListOf("BEGIN:VCARD", "VERSION:3.0")
        fun push(field: String, value: String) { if (value.isNotBlank()) lines += "$field:${esc(value.trim())}" }
        if (card.shares("name") && card.fullName.isNotBlank()) {
            push("FN", card.fullName)
            val parts = card.fullName.trim().split(Regex("\\s+"))
            val family = parts.last()
            val given = parts.dropLast(1).joinToString(" ")
            lines += "N:${esc(family)};${esc(given)};;;"
        }
        if (card.shares("organization")) push("ORG", card.organization)
        if (card.shares("email")) push("EMAIL;TYPE=INTERNET", card.email)
        if (card.shares("phone")) push("TEL;TYPE=CELL", card.phone)
        if (card.shares("website")) push("URL;TYPE=website", card.website)
        if (card.shares("fossunited") && card.fossUnitedUsername.isNotBlank()) {
            val url = "https://fossunited.org/u/${card.fossUnitedUsername.trim()}"
            push("URL;TYPE=profile", url)
            push("X-FOSSUNITED-PROFILE", url)
        }
        if (card.shares("matrixId") && card.matrixId.isNotBlank()) {
            push("X-INDIAFOSS-MATRIX", card.matrixId)
            push("IMPP", "matrix:${card.matrixId.trim()}")
        }
        if (card.shares("ticketRef") && card.ticketRef.isNotBlank()) push("X-INDIAFOSS-TICKET", card.ticketRef)
        if (card.shares("photo")) {
            val photo = card.avatarUrl.ifBlank { githubAvatar(card.socials["github"]) ?: "" }
            if (photo.startsWith("https://") && (card.avatarUrl.isNotBlank() || card.shares("github"))) {
                push("PHOTO;VALUE=URI", photo)
            }
        }
        for ((network, value) in card.socials) {
            if (value.isBlank() || !card.shares(network)) continue
            // The card carries the canonical form: a profile URL for a handle (#105), a JID for Prav (#106).
            val canonical = when (network) {
                "prav" -> pravJid(value) ?: value.trim()
                else -> socialUrl(network, value) ?: value.trim()
            }
            lines += "X-SOCIALPROFILE;TYPE=$network:${esc(canonical)}"
            if (network == "prav" || network == "xmpp") push("IMPP", "xmpp:" + canonical.removePrefix("xmpp:"))
        }
        lines += "END:VCARD"
        return lines.joinToString("\r\n") + "\r\n"
    }

    private val PROFILE_HOSTS: Map<String, Pair<List<String>, (String) -> String>> = mapOf(
        "github" to (listOf("github.com") to { h: String -> "https://github.com/$h" }),
        "gitlab" to (listOf("gitlab.com") to { h: String -> "https://gitlab.com/$h" }),
        "linkedin" to (listOf("linkedin.com") to { h: String -> "https://linkedin.com/in/$h" }),
        "bluesky" to (listOf("bsky.app") to { h: String -> "https://bsky.app/profile/$h" }),
        "x" to (listOf("x.com", "twitter.com") to { h: String -> "https://x.com/$h" }),
        "instagram" to (listOf("instagram.com") to { h: String -> "https://instagram.com/$h" }),
        "youtube" to (listOf("youtube.com") to { h: String -> "https://youtube.com/@$h" }),
        "medium" to (listOf("medium.com") to { h: String -> "https://medium.com/@$h" }),
        "devto" to (listOf("dev.to") to { h: String -> "https://dev.to/$h" }),
    )

    /**
     * A social link takes a handle or a URL (#105): `alice`, `@alice` and
     * `https://github.com/alice` are the same profile. Null when the value is
     * neither; messengers are not profiles and pass through unchanged.
     */
    fun socialUrl(network: String, value: String?): String? {
        val v = value?.trim().orEmpty()
        if (v.isEmpty()) return null
        if (network == "mastodon") {
            Regex("^@?([^@\\s/]+)@([^@\\s/]+\\.[^@\\s/]+)$").find(v)?.let { return "https://${it.groupValues[2]}/@${it.groupValues[1]}" }
            return if (v.startsWith("http://") || v.startsWith("https://")) v else null
        }
        val (hosts, path) = PROFILE_HOSTS[network] ?: return if (v.startsWith("http://") || v.startsWith("https://")) v else null
        if (v.startsWith("http://") || v.startsWith("https://")) return v
        Regex("^(?:www\\.)?([a-z0-9.-]+)/(.+)$", RegexOption.IGNORE_CASE).find(v)?.let { m ->
            if (m.groupValues[1].lowercase() in hosts) return "https://${m.groupValues[1]}/${m.groupValues[2]}"
        }
        val handle = Regex("^@?([A-Za-z0-9_.-]{1,64})$").find(v)?.groupValues?.get(1) ?: return null
        return path(handle)
    }

    /** Prav (#106): a phone number, a username or a JID, as the JID on prav.app. */
    fun pravJid(value: String?): String? {
        val v = value?.trim()?.removePrefix("xmpp:").orEmpty()
        if (v.isEmpty()) return null
        if (Regex("^[^@\\s/]+@[^@\\s/]+$").matches(v)) return v
        val digits = v.replace(Regex("[\\s().-]"), "")
        if (Regex("^\\+?[0-9]{6,15}$").matches(digits)) return (if (digits.startsWith("+")) digits else "+$digits") + "@prav.app"
        val handle = Regex("^@?([A-Za-z0-9_.-]{2,64})$").find(v)?.groupValues?.get(1) ?: return null
        return "$handle@prav.app"
    }

    fun githubAvatar(github: String?): String? {
        val user = github?.trim()?.let {
            Regex("^(?:https?://)?(?:www\\.)?github\\.com/([A-Za-z0-9-]{1,39})/?$").find(it)?.groupValues?.get(1)
                ?: Regex("^@?([A-Za-z0-9-]{1,39})$").find(it)?.groupValues?.get(1)
        } ?: return null
        return "https://github.com/$user.png?size=160"
    }

    private fun unesc(v: String) = v.replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")

    /** A scanned card, or null when the text is not a vCard. */
    fun parse(text: String): ContactCard? {
        val unfolded = text.replace(Regex("\r\n[ \t]"), "").replace(Regex("\n[ \t]"), "")
        val lines = unfolded.split(Regex("\r\n|\n"))
        if (lines.none { it.trim().equals("BEGIN:VCARD", ignoreCase = true) }) return null
        var card = ContactCard()
        val socials = LinkedHashMap<String, String>()
        for (line in lines) {
            val at = line.indexOf(':')
            if (at <= 0) continue
            val head = line.substring(0, at)
            val value = unesc(line.substring(at + 1).trim())
            val name = head.substringBefore(';').uppercase()
            val params = head.substringAfter(';', "").uppercase()
            when (name) {
                "FN" -> card = card.copy(fullName = value)
                "ORG" -> card = card.copy(organization = value.substringBefore(';'))
                "EMAIL" -> if (card.email.isEmpty()) card = card.copy(email = value)
                "TEL" -> if (card.phone.isEmpty()) card = card.copy(phone = value)
                "URL" -> if (params.contains("TYPE=PROFILE") && value.contains("fossunited.org/u/")) {
                    card = card.copy(fossUnitedUsername = value.substringAfter("/u/").trimEnd('/'))
                } else if (card.website.isEmpty()) card = card.copy(website = value)
                "X-FOSSUNITED-PROFILE" -> card = card.copy(fossUnitedUsername = value.substringAfter("/u/").trimEnd('/'))
                "X-INDIAFOSS-MATRIX", "X-MATRIX-ID" -> card = card.copy(matrixId = value)
                "X-INDIAFOSS-TICKET" -> card = card.copy(ticketRef = value)
                "PHOTO" -> if (value.startsWith("https://")) card = card.copy(avatarUrl = value)
                "X-SOCIALPROFILE" -> {
                    val type = Regex("TYPE=([A-Z0-9_-]+)").find(params)?.groupValues?.get(1)?.lowercase()
                    if (type != null) socials[type] = value
                }
            }
        }
        return card.copy(socials = socials)
    }
}
