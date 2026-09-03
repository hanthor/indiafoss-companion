package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SearchAndVCardTest {
    private val bundle = EventBundle(
        id = "e", name = "E", timezone = "Asia/Kolkata",
        start = "2025-09-20T09:00:00+05:30", end = "2025-09-20T18:00:00+05:30",
        activities = listOf(
            Activity(id = "k", title = "Linux kernel internals", speakerIds = listOf("p1"), tags = listOf("Kernel")),
            Activity(id = "w", title = "Web accessibility", description = "kernel of the idea"),
        ),
        people = listOf(Person(id = "p1", name = "Asha Menon")),
        booths = listOf(Booth(id = "b1", name = "Kernel hackers", category = "Community")),
    )

    @Test
    fun `title beats description and people and booths are found`() {
        val hits = Search.search(bundle, "kernel")
        assertEquals(listOf("k", "b1", "w"), hits.map { it.id })
        assertEquals(Search.Kind.PERSON, Search.search(bundle, "asha").first().kind)
        assertTrue(Search.search(bundle, "   ").isEmpty())
    }

    @Test
    fun `a card round-trips through vCard 3 with extras and escaping`() {
        val card = ContactCard(
            fullName = "Asha Menon", organization = "FOSS United, Bengaluru", email = "asha@example.org",
            fossUnitedUsername = "asha", matrixId = "@asha:matrix.org",
            socials = mapOf("github" to "https://github.com/asha", "telegram" to "@asha"),
            share = mapOf("telegram" to false),
        )
        val text = VCard.encode(card)
        assertTrue(text.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Asha Menon\r\nN:Menon;Asha;;;"))
        assertTrue("ORG:FOSS United\\, Bengaluru" in text)
        assertTrue("EMAIL" !in text, "email is private by default")
        assertTrue("PHOTO;VALUE=URI:https://github.com/asha.png?size=160" in text)
        assertTrue("TYPE=telegram" !in text, "switched off")
        val back = VCard.parse(text)!!
        assertEquals("Asha Menon", back.fullName)
        assertEquals("FOSS United, Bengaluru", back.organization)
        assertEquals("asha", back.fossUnitedUsername)
        assertEquals("@asha:matrix.org", back.matrixId)
        assertEquals("https://github.com/asha", back.socials["github"])
        assertEquals("https://github.com/asha.png?size=160", back.avatarUrl)
        assertNull(VCard.parse("hello"))
    }
}
