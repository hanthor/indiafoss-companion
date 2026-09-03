package org.indiafoss.companion.core

/**
 * What a public profile can contribute to the attendee's card (#110): the
 * GitHub REST API's user object, or the FOSS United profile page. Pure
 * parsing; the app fetches. Blank fields on the card are filled, filled
 * ones are left alone (`mergeInto`), so an import never overwrites what
 * the attendee typed.
 */
object ProfileImport {
    data class Imported(
        val fullName: String = "",
        val organization: String = "",
        val website: String = "",
        val avatarUrl: String = "",
        val socials: Map<String, String> = emptyMap(),
    ) {
        val isEmpty: Boolean get() = fullName.isBlank() && organization.isBlank() && website.isBlank() && socials.isEmpty()

        fun mergeInto(card: ContactCard): ContactCard = card.copy(
            fullName = card.fullName.ifBlank { fullName },
            organization = card.organization.ifBlank { organization },
            website = card.website.ifBlank { website },
            avatarUrl = card.avatarUrl.ifBlank { avatarUrl },
            socials = socials.filterKeys { card.socials[it].isNullOrBlank() } + card.socials.filterValues { it.isNotBlank() },
        )

        /** The fields an import would change, for the "filled N fields" message. */
        fun changes(card: ContactCard): Int = listOf(
            card.fullName.isBlank() && fullName.isNotBlank(),
            card.organization.isBlank() && organization.isNotBlank(),
            card.website.isBlank() && website.isNotBlank(),
            card.avatarUrl.isBlank() && avatarUrl.isNotBlank(),
        ).count { it } + socials.keys.count { card.socials[it].isNullOrBlank() }
    }

    /** `https://api.github.com/users/<login>` (name, company, blog, avatar_url, html_url, twitter_username). */
    fun fromGithubJson(json: String): Imported {
        fun field(name: String): String? =
            Regex("\"$name\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").find(json)?.groupValues?.get(1)
                ?.replace("\\/", "/")?.replace("\\\"", "\"")?.trim()?.takeIf { it.isNotEmpty() }
        val socials = LinkedHashMap<String, String>()
        field("html_url")?.takeIf { it.startsWith("https://") }?.let { socials["github"] = it }
        field("twitter_username")?.let { socials["x"] = "https://x.com/${it.removePrefix("@")}" }
        val blog = field("blog")?.let { if (it.startsWith("http://") || it.startsWith("https://")) it else "https://$it" }
        return Imported(
            fullName = field("name").orEmpty(),
            // "@fossunited" is how people write their org on GitHub.
            organization = field("company").orEmpty().removePrefix("@"),
            website = blog.orEmpty(),
            avatarUrl = field("avatar_url")?.takeIf { it.startsWith("https://") }.orEmpty(),
            socials = socials,
        )
    }

    /** The public profile page at `https://fossunited.org/u/<username>`, the same anchors the PWA reads. */
    fun fromFossUnitedHtml(html: String): Imported {
        fun text(fragment: String) = fragment.replace(Regex("<[^>]+>"), " ").replace(Regex("\\s+"), " ")
            .replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").trim()
        val name = Regex("<h4[^>]*>([\\s\\S]*?)</h4>", RegexOption.IGNORE_CASE).find(html)?.groupValues?.get(1)?.let(::text).orEmpty()
        val avatar = Regex("<img[^>]*class=\"[^\"]*header-profile-image[^\"]*\"[^>]*>", RegexOption.IGNORE_CASE).find(html)?.value
            ?.let { Regex("src=\"([^\"]+)\"").find(it)?.groupValues?.get(1) }.orEmpty()
        val header = Regex("class=\"header--username-location\"[\\s\\S]*?</div>\\s*</div>", RegexOption.IGNORE_CASE).find(html)?.value
        var website = header?.let { Regex("<a[^>]*href=\"(https?://[^\"]+)\"", RegexOption.IGNORE_CASE).find(it)?.groupValues?.get(1) }.orEmpty()
        val socials = LinkedHashMap<String, String>()
        val socialBlock = Regex("class=\"header-section--socials\"[\\s\\S]*?</div>", RegexOption.IGNORE_CASE).find(html)?.value
        socialBlock?.let { block ->
            for (anchor in Regex("<a\\b[^>]*>", RegexOption.IGNORE_CASE).findAll(block)) {
                val href = Regex("href=\"([^\"]+)\"").find(anchor.value)?.groupValues?.get(1) ?: continue
                val network = networkFor(href) ?: continue
                socials.putIfAbsent(network, href)
            }
        }
        // A personal site that is really a social link belongs in socials, not website.
        networkFor(website)?.let { socials.putIfAbsent(it, website); website = "" }
        return Imported(fullName = name, website = website, avatarUrl = avatar, socials = socials)
    }

    fun networkFor(url: String): String? {
        val host = Regex("^https?://(?:www\\.)?([^/]+)", RegexOption.IGNORE_CASE).find(url)?.groupValues?.get(1)?.lowercase() ?: return null
        return when {
            host == "github.com" -> "github"
            host == "gitlab.com" -> "gitlab"
            host.endsWith("linkedin.com") -> "linkedin"
            host == "bsky.app" || host == "bsky.social" -> "bluesky"
            host == "x.com" || host == "twitter.com" -> "x"
            host == "instagram.com" -> "instagram"
            host == "youtube.com" || host == "youtu.be" -> "youtube"
            host == "medium.com" -> "medium"
            host == "dev.to" -> "devto"
            Regex("^https?://[^/]+/@[^/]+/?$").matches(url) -> "mastodon"
            else -> null
        }
    }
}
