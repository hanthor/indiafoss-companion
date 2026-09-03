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
}
