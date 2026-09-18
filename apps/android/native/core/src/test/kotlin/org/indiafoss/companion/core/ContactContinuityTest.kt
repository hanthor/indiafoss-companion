package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ContactContinuityTest {
    private fun met(name: String, fp: String? = null, id: String = "c-$name", at: Long = 1_000, label: String? = null) = MetContact(
        id = id, card = ContactCard(fullName = name), vcard = "", savedAt = at,
        signature = if (fp != null) "valid" else "unsigned", fingerprint = fp, metLabel = label,
    )

    @Test
    fun `a new person is prepended`() {
        val r = ContactContinuity.reconcile(listOf(met("Asha", "aa")), met("Riya", "bb", at = 2_000))
        assertEquals(ContactContinuity.Outcome.NEW, r.outcome)
        assertEquals(listOf("Riya", "Asha"), r.contacts.map { it.card.fullName })
        assertEquals(1, r.contacts.first().metCount)
    }

    @Test
    fun `the same key updates in place, counting the meeting and keeping the first save`() {
        val r = ContactContinuity.reconcile(listOf(met("Asha", "aa")), met("Asha Rao", "aa", id = "new", at = 2_000))
        assertEquals(ContactContinuity.Outcome.UPDATED, r.outcome)
        val only = r.contacts.single()
        assertEquals("c-Asha", only.id)
        assertEquals("Asha Rao", only.card.fullName)
        assertEquals(1_000, only.savedAt)
        assertEquals(2_000, only.lastMetAt)
        assertEquals(2, only.metCount)
    }

    @Test
    fun `where you met is the first scan's, filled in only when the first scan had none`() {
        val kept = ContactContinuity.reconcile(listOf(met("Asha", "aa", label = "Lunch, day 1")), met("Asha", "aa", id = "new", at = 2_000, label = "Keynote"))
        assertEquals("Lunch, day 1", kept.contacts.single().metLabel)
        val filled = ContactContinuity.reconcile(listOf(met("Asha", "aa")), met("Asha", "aa", id = "new", at = 2_000, label = "Keynote"))
        assertEquals("Keynote", filled.contacts.single().metLabel)
    }

    @Test
    fun `the same name with a different key is kept apart and flagged`() {
        val r = ContactContinuity.reconcile(listOf(met("Asha", "aa")), met("Asha", "bb", id = "new", at = 2_000))
        assertEquals(ContactContinuity.Outcome.KEY_CHANGED, r.outcome)
        assertEquals(2, r.contacts.size)
        assertTrue(r.contacts.first().keyChanged)
        assertEquals("aa", r.contacts.last().fingerprint)
    }

    @Test
    fun `an unsigned re-scan of a signed contact updates it without losing the key`() {
        val r = ContactContinuity.reconcile(listOf(met("Asha", "aa")), met("Asha", null, id = "new", at = 2_000))
        assertEquals(ContactContinuity.Outcome.UPDATED, r.outcome)
        assertEquals("aa", r.contacts.single().fingerprint)
        assertEquals("valid", r.contacts.single().signature)
    }

    @Test
    fun `a mesh id matches regardless of the display name`() {
        val node = "a".repeat(64)
        val a = met("Mesh aaaaaaaaaaaa").copy(card = ContactCard(fullName = "Mesh aaaaaaaaaaaa", meshNodeId = node))
        val b = met("Asha", id = "new", at = 2_000).copy(card = ContactCard(fullName = "Asha", meshNodeId = node))
        val r = ContactContinuity.reconcile(listOf(a), b)
        assertEquals(ContactContinuity.Outcome.UPDATED, r.outcome)
        assertEquals("Asha", r.contacts.single().card.fullName)
    }
}
