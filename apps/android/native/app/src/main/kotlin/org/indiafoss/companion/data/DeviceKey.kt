package org.indiafoss.companion.data

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.spec.ECGenParameterSpec
import org.indiafoss.companion.core.Handshake

/**
 * The device's handshake key: a P-256 pair in the Android Keystore, made on
 * first use, never exported. The public half goes on the card; the private
 * half signs it. A reinstall makes a new key, which is the point: a card's
 * badge is this phone's, not an account's.
 */
object DeviceKey {
    private const val ALIAS = "handshake"

    private fun store(): KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun ensure(): KeyStore {
        val ks = store()
        if (!ks.containsAlias(ALIAS)) {
            KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore").apply {
                initialize(
                    KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .build(),
                )
            }.generateKeyPair()
        }
        return ks
    }

    /** `p256:<base64url>` of this device's public key, or null when the keystore is unavailable. */
    fun publicKey(): String? = runCatching {
        Handshake.formatP256(Handshake.rawPoint(ensure().getCertificate(ALIAS).publicKey))
    }.getOrNull()

    fun privateKey(): PrivateKey? = runCatching { ensure().getKey(ALIAS, null) as PrivateKey }.getOrNull()

    /** The card with this device's key and signature, or the card itself when signing is unavailable. */
    fun sign(vcard: String): String {
        val key = publicKey() ?: return vcard
        val priv = privateKey() ?: return vcard
        return runCatching { Handshake.signCard(vcard, key, priv) }.getOrDefault(vcard)
    }
}
