package org.indiafoss.companion.core

import java.security.KeyPairGenerator
import java.security.spec.ECGenParameterSpec
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HandshakeTest {
    private val pair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
    private val card = VCard.encode(ContactCard(fullName = "Asha Menon", organization = "FOSS United"))

    @Test
    fun `a signed card verifies, a tampered one does not, a plain one is unsigned`() {
        val key = Handshake.formatP256(Handshake.rawPoint(pair.public))
        val signed = Handshake.signCard(card, key, pair.private)
        assertTrue("${Handshake.KEY_FIELD}:p256:" in signed && "${Handshake.SIG_FIELD}:" in signed)
        val identity = Handshake.verify(signed)
        assertEquals(Handshake.Verdict.VALID, identity.verdict)
        assertEquals(Handshake.fingerprint(key), identity.fingerprint)
        assertEquals(Handshake.Verdict.INVALID, Handshake.verify(signed.replace("Asha", "Bobby")).verdict)
        assertEquals(Handshake.Verdict.UNSIGNED, Handshake.verify(card).verdict)
        assertEquals(Handshake.Verdict.UNCHECKED, Handshake.verify(signed.replace("p256:", "ed25519:")).verdict)
    }

    @Test
    fun `raw and DER signatures convert both ways and the point round-trips`() {
        val raw = ByteArray(64) { (it * 7 + 1).toByte() }
        assertTrue(Handshake.derToRaw(Handshake.rawToDer(raw)).contentEquals(raw))
        val point = Handshake.rawPoint(pair.public)
        assertEquals(65, point.size)
        assertTrue(Handshake.rawPoint(Handshake.p256PublicKey(point)).contentEquals(point))
        assertEquals("7f3a 91c2 0d4e", Handshake.shortFingerprint("7f3a91c20d4e00"))
    }

    @Test
    fun `a signed card is dated and a re-dated one fails its signature`() {
        val key = Handshake.formatP256(Handshake.rawPoint(pair.public))
        val signed = Handshake.signCard(card, key, pair.private, issuedAt = "2026-09-17T09:00:00Z", nonce = "AbC-_12345xy")
        assertTrue("${Handshake.ISSUED_FIELD}:2026-09-17T09:00:00Z" in signed && "${Handshake.NONCE_FIELD}:AbC-_12345xy" in signed)
        val identity = Handshake.verify(signed)
        assertEquals(Handshake.Verdict.VALID, identity.verdict)
        assertEquals("2026-09-17T09:00:00Z", identity.issuedAt)
        assertEquals("AbC-_12345xy", identity.nonce)
        assertEquals(Handshake.Verdict.INVALID, Handshake.verify(signed.replace("2026-09-17T09:00:00Z", "2026-09-17T10:00:00Z")).verdict)
        val another = Handshake.signCard(card, key, pair.private)
        assertTrue(Handshake.verify(another).nonce != identity.nonce)
    }

    @Test
    fun `freshness is read only off a valid signature, within the hour`() {
        val now = java.time.Instant.parse("2026-09-17T10:00:00Z").toEpochMilli()
        fun id(verdict: Handshake.Verdict, issued: String?) = Handshake.Identity(verdict, null, null, issued)
        assertEquals(Handshake.Freshness.FRESH, Handshake.freshness(id(Handshake.Verdict.VALID, "2026-09-17T09:30:00Z"), now))
        assertEquals(Handshake.Freshness.STALE, Handshake.freshness(id(Handshake.Verdict.VALID, "2026-09-17T08:59:00Z"), now))
        assertEquals(Handshake.Freshness.UNKNOWN, Handshake.freshness(id(Handshake.Verdict.UNSIGNED, "2026-09-17T09:59:00Z"), now))
        assertEquals(Handshake.Freshness.UNKNOWN, Handshake.freshness(id(Handshake.Verdict.INVALID, "2026-09-17T09:59:00Z"), now))
        assertEquals(Handshake.Freshness.UNKNOWN, Handshake.freshness(id(Handshake.Verdict.VALID, null), now))
        assertEquals(Handshake.Freshness.FRESH, Handshake.freshness(id(Handshake.Verdict.VALID, "2026-09-17T10:05:00Z"), now))
        assertEquals(Handshake.Freshness.UNKNOWN, Handshake.freshness(id(Handshake.Verdict.VALID, "2026-09-17T11:00:00Z"), now))
    }
}
