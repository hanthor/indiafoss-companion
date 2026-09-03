package org.indiafoss.companion.core

import java.math.BigInteger
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.security.spec.ECGenParameterSpec
import java.security.AlgorithmParameters
import java.security.spec.ECParameterSpec
import java.util.Base64

/**
 * Signed contact cards, the PWA's scheme (docs/contact-sharing.md): the
 * card carries the device's public key as `X-INDIAFOSS-KEY:p256:<base64url
 * raw uncompressed point>` and `X-INDIAFOSS-SIG:<base64url raw r||s>` over
 * every other line joined with CRLF. WebCrypto signs P-256 with raw 64-byte
 * signatures; the JVM's `SHA256withECDSA` speaks DER, so both are converted
 * here. A card signed with Ed25519 (the PWA's first choice where available)
 * cannot be checked on older Android and reads as "signed, not checked".
 */
object Handshake {
    const val KEY_FIELD = "X-INDIAFOSS-KEY"
    const val SIG_FIELD = "X-INDIAFOSS-SIG"

    enum class Verdict { VALID, INVALID, UNSIGNED, UNCHECKED }

    data class Identity(val verdict: Verdict, val publicKey: String?, val fingerprint: String?)

    fun base64Url(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    fun fromBase64Url(text: String): ByteArray = Base64.getUrlDecoder().decode(text)

    /** Every line except the signature, joined with CRLF. */
    fun canonicalBody(vcard: String): String =
        vcard.split(Regex("\r\n|\n")).filter { it.isNotBlank() && !it.startsWith("$SIG_FIELD:") }.joinToString("\r\n")

    /** SHA-256 of `alg:key` as lower-case hex; drives the key badge. */
    fun fingerprint(formattedKey: String): String =
        MessageDigest.getInstance("SHA-256").digest(formattedKey.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    fun shortFingerprint(fingerprint: String): String =
        fingerprint.take(12).chunked(4).joinToString(" ")

    /** `p256:<base64url>` for a raw uncompressed P-256 point. */
    fun formatP256(rawPoint: ByteArray): String = "p256:" + base64Url(rawPoint)

    /** Sign the canonical body with a P-256 private key; returns the raw r||s, base64url. */
    fun sign(body: String, privateKey: PrivateKey): String {
        val signer = Signature.getInstance("SHA256withECDSA").apply { initSign(privateKey); update(body.toByteArray(Charsets.UTF_8)) }
        return base64Url(derToRaw(signer.sign()))
    }

    /** Add the key and signature lines to a vCard that has neither. */
    fun signCard(vcard: String, formattedKey: String, privateKey: PrivateKey): String {
        val withKey = vcard.replace(Regex("END:VCARD\r?\n?$"), "$KEY_FIELD:$formattedKey\r\nEND:VCARD\r\n")
        val sig = sign(canonicalBody(withKey), privateKey)
        return withKey.replace(Regex("END:VCARD\r?\n?$"), "$SIG_FIELD:$sig\r\nEND:VCARD\r\n")
    }

    private fun field(vcard: String, name: String): String? =
        vcard.replace(Regex("\r\n[ \t]"), "").split(Regex("\r\n|\n"))
            .firstOrNull { it.substringBefore(':').equals(name, ignoreCase = true) }?.substringAfter(':')?.trim()

    /** Who signed a scanned card, and whether the signature holds. */
    fun verify(vcard: String): Identity {
        val key = field(vcard, KEY_FIELD) ?: return Identity(Verdict.UNSIGNED, null, null)
        val sig = field(vcard, SIG_FIELD)
        val print = fingerprint(key)
        val match = Regex("^(ed25519|p256):([A-Za-z0-9_-]{20,200})$").find(key)
            ?: return Identity(Verdict.INVALID, key, print)
        if (sig == null) return Identity(Verdict.INVALID, key, print)
        if (match.groupValues[1] == "ed25519") return Identity(Verdict.UNCHECKED, key, print)
        val ok = runCatching {
            val publicKey = p256PublicKey(fromBase64Url(match.groupValues[2]))
            val verifier = Signature.getInstance("SHA256withECDSA").apply {
                initVerify(publicKey)
                update(canonicalBody(vcard).toByteArray(Charsets.UTF_8))
            }
            verifier.verify(rawToDer(fromBase64Url(sig)))
        }.getOrDefault(false)
        return Identity(if (ok) Verdict.VALID else Verdict.INVALID, key, print)
    }

    fun p256PublicKey(raw: ByteArray): PublicKey {
        require(raw.size == 65 && raw[0] == 4.toByte()) { "not an uncompressed P-256 point" }
        val x = BigInteger(1, raw.copyOfRange(1, 33))
        val y = BigInteger(1, raw.copyOfRange(33, 65))
        val params = AlgorithmParameters.getInstance("EC").apply { init(ECGenParameterSpec("secp256r1")) }
        val spec = params.getParameterSpec(ECParameterSpec::class.java)
        return KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(ECPoint(x, y), spec))
    }

    /** Raw uncompressed point for an EC public key. */
    fun rawPoint(publicKey: PublicKey): ByteArray {
        val ec = publicKey as java.security.interfaces.ECPublicKey
        fun pad(n: BigInteger) = n.toByteArray().let { b -> if (b.size > 32) b.copyOfRange(b.size - 32, b.size) else ByteArray(32 - b.size) + b }
        return byteArrayOf(4) + pad(ec.w.affineX) + pad(ec.w.affineY)
    }

    fun derToRaw(der: ByteArray): ByteArray {
        var i = 2 // SEQUENCE, length
        if ((der[1].toInt() and 0x80) != 0) i += der[1].toInt() and 0x7f
        fun int(): ByteArray {
            require(der[i] == 2.toByte()); i++
            val len = der[i].toInt() and 0xff; i++
            val v = der.copyOfRange(i, i + len); i += len
            val trimmed = v.dropWhile { it == 0.toByte() }.toByteArray()
            return ByteArray(32 - trimmed.size) + trimmed
        }
        return int() + int()
    }

    fun rawToDer(raw: ByteArray): ByteArray {
        require(raw.size == 64)
        fun int(v: ByteArray): ByteArray {
            val t = v.dropWhile { it == 0.toByte() }.toByteArray().let { if (it.isEmpty()) byteArrayOf(0) else it }
            val body = if ((t[0].toInt() and 0x80) != 0) byteArrayOf(0) + t else t
            return byteArrayOf(2, body.size.toByte()) + body
        }
        val content = int(raw.copyOfRange(0, 32)) + int(raw.copyOfRange(32, 64))
        return byteArrayOf(0x30, content.size.toByte()) + content
    }
}
