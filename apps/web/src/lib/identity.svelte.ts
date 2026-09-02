import { CompanionStorage } from '@indiafoss/storage';
import { generateHandshakeKeyPair, identiconSvg, keyFingerprint } from '@indiafoss/model';
import type { HandshakeAlgorithm, HandshakeKeyPair } from '@indiafoss/model';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

/** This device's handshake key: generated once, private half never leaves IndexedDB. */
export const identityState = $state<{
  pair: HandshakeKeyPair | null;
  fingerprint: string | null;
  identicon: string | null;
  ready: boolean;
}>({ pair: null, fingerprint: null, identicon: null, ready: false });

let loading: Promise<void> | null = null;

export function hydrateIdentity(): Promise<void> {
  loading ??= (async () => {
    try {
      const stored = await getStorage().getDeviceKey();
      let pair: HandshakeKeyPair;
      if (stored) {
        pair = {
          alg: stored.alg as HandshakeAlgorithm,
          publicKey: stored.publicKey,
          privateKey: stored.privateKey,
          exported: { alg: stored.alg as HandshakeAlgorithm, key: stored.exported },
        };
      } else {
        pair = await generateHandshakeKeyPair();
        await getStorage().putDeviceKey({
          id: 'handshake',
          alg: pair.alg,
          publicKey: pair.publicKey,
          privateKey: pair.privateKey,
          exported: pair.exported.key,
          // eslint-disable-next-line svelte/prefer-svelte-reactivity
          createdAt: new Date().toISOString(),
        });
      }
      identityState.pair = pair;
      identityState.fingerprint = await keyFingerprint(pair.exported);
      identityState.identicon = identiconSvg(identityState.fingerprint, 96);
    } catch {
      // No WebCrypto (very old browser): cards stay unsigned.
      identityState.pair = null;
    } finally {
      identityState.ready = true;
    }
  })();
  return loading;
}
