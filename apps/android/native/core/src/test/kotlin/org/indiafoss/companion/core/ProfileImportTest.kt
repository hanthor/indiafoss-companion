package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals

class ProfileImportTest {
    @Test
    fun `a GitHub user object fills name, organisation, site, avatar and links`() {
        val json = """{"login":"asha","name":"Asha Menon","company":"@fossunited","blog":"asha.example.org",
            "avatar_url":"https://avatars.githubusercontent.com/u/1?v=4","html_url":"https://github.com/asha","twitter_username":"asha_m"}"""
        val imported = ProfileImport.fromGithubJson(json)
        assertEquals("Asha Menon", imported.fullName)
        assertEquals("fossunited", imported.organization)
        assertEquals("https://asha.example.org", imported.website)
        assertEquals("https://avatars.githubusercontent.com/u/1?v=4", imported.avatarUrl)
        assertEquals(mapOf("github" to "https://github.com/asha", "x" to "https://x.com/asha_m"), imported.socials)
    }

    @Test
    fun `a FOSS United page gives the name, picture and socials, and a social site is not the website`() {
        val html = """
            <img class="header-profile-image" src="https://fossunited.org/files/asha.png">
            <h4 class="name">Asha  Menon</h4>
            <div class="header--username-location"><span>@asha</span><a href="https://github.com/asha">site</a></div></div>
            <div class="header-section--socials"><a href="https://fosstodon.org/@asha"></a><a href="https://linkedin.com/in/asha"></a></div>
        """.trimIndent()
        val imported = ProfileImport.fromFossUnitedHtml(html)
        assertEquals("Asha Menon", imported.fullName)
        assertEquals("https://fossunited.org/files/asha.png", imported.avatarUrl)
        assertEquals("", imported.website)
        assertEquals(
            mapOf("mastodon" to "https://fosstodon.org/@asha", "linkedin" to "https://linkedin.com/in/asha", "github" to "https://github.com/asha"),
            imported.socials,
        )
    }

    @Test
    fun `an import fills blanks and never overwrites what was typed`() {
        val card = ContactCard(fullName = "A. Menon", socials = mapOf("github" to "https://github.com/asha"))
        val imported = ProfileImport.Imported(fullName = "Asha Menon", organization = "FOSS United", socials = mapOf("github" to "https://github.com/other", "x" to "https://x.com/asha"))
        val merged = imported.mergeInto(card)
        assertEquals("A. Menon", merged.fullName)
        assertEquals("FOSS United", merged.organization)
        assertEquals("https://github.com/asha", merged.socials["github"])
        assertEquals("https://x.com/asha", merged.socials["x"])
        assertEquals(2, imported.changes(card))
    }
}
