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
    /** Network → URL or handle: github, linkedin, mastodon, x, telegram, … */
    val socials: Map<String, String> = emptyMap(),
    /** Which fields the card encodes; email and phone are off unless switched on. */
    val share: Map<String, Boolean> = emptyMap(),
) {
    fun shares(field: String): Boolean = share[field] ?: (field != "email" && field != "phone")
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
        if (card.shares("photo")) {
            val photo = card.avatarUrl.ifBlank { githubAvatar(card.socials["github"]) ?: "" }
            if (photo.startsWith("https://") && (card.avatarUrl.isNotBlank() || card.shares("github"))) {
                push("PHOTO;VALUE=URI", photo)
            }
        }
        for ((network, value) in card.socials) {
            if (value.isBlank() || !card.shares(network)) continue
            lines += "X-SOCIALPROFILE;TYPE=$network:${esc(value.trim())}"
        }
        lines += "END:VCARD"
        return lines.joinToString("\r\n") + "\r\n"
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
