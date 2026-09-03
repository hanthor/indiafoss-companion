import type { AttendeeProfile, AttendeeShareSelection } from './contact.js';
import { attendeeProfileToVCard } from './contact.js';
import { formatPublicKey, fromBase64Url, toBase64Url } from './handshake.js';
import type { HandshakeKeyPair, HandshakePublicKey } from './handshake.js';
import { parsePublicKey } from './handshake.js';

/** vCard property carrying the device's handshake public key (`alg:base64url`). */
export const VCARD_KEY_FIELD = 'X-INDIAFOSS-KEY';
/** vCard property carrying the signature over the canonical body. */
export const VCARD_SIG_FIELD = 'X-INDIAFOSS-SIG';

async function subtle(): Promise<SubtleCrypto> {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error('WebCrypto is unavailable');
  return c.subtle;
}

/** Copy into a plain ArrayBuffer-backed view (WebCrypto typings reject shared buffers). */
function bufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

function signParams(alg: HandshakePublicKey['alg']): AlgorithmIdentifier | EcdsaParams {
  return alg === 'ed25519'
    ? ({ name: 'Ed25519' } as AlgorithmIdentifier)
    : { name: 'ECDSA', hash: 'SHA-256' };
}

/**
 * The bytes a card signature covers: every line of the vCard except the
 * signature itself, in the order they appear, joined with CRLF. Keeping the
 * key line inside the signed body binds the card to the key that signed it.
 */
export function canonicalVCardBody(vcard: string): string {
  return vcard
    .split(/\r\n|\n/)
    .filter((line) => line.trim() && !line.startsWith(`${VCARD_SIG_FIELD}:`))
    .join('\r\n');
}

/**
 * Build the one card the app shares: a plain vCard 3.0 that any camera app can
 * save, carrying the companion's extension fields and a signature over the
 * whole body. Camera apps ignore the `X-` lines; the companion scanner reads
 * them and can show whether the card really came from that device's key.
 */
export async function signedAttendeeVCard(
  profile: AttendeeProfile,
  selection: AttendeeShareSelection,
  pair: HandshakeKeyPair | null,
  options?: { gravatarUrl?: string | null },
): Promise<string> {
  const base = attendeeProfileToVCard(profile, selection, options);
  if (!pair) return base;

  const withKey = base.replace(
    /END:VCARD\r?\n?$/,
    `${VCARD_KEY_FIELD}:${formatPublicKey(pair.exported)}\r\nEND:VCARD\r\n`,
  );
  const data = bufferSource(new TextEncoder().encode(canonicalVCardBody(withKey)));
  const raw = new Uint8Array(
    await (await subtle()).sign(signParams(pair.alg), pair.privateKey, data),
  );
  return withKey.replace(
    /END:VCARD\r?\n?$/,
    `${VCARD_SIG_FIELD}:${toBase64Url(raw)}\r\nEND:VCARD\r\n`,
  );
}

/** Read one unfolded property value out of a vCard. */
function readField(vcard: string, field: string): string | null {
  const unfolded = vcard.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  for (const line of unfolded.split(/\r\n|\n/)) {
    const at = line.indexOf(':');
    if (at === -1) continue;
    if (line.slice(0, at).toUpperCase() === field) return line.slice(at + 1).trim();
  }
  return null;
}

export type VCardSignatureState = 'valid' | 'invalid' | 'unsigned';

export interface VCardIdentity {
  signature: VCardSignatureState;
  publicKey: HandshakePublicKey | null;
}

/**
 * Check a scanned vCard's companion signature. A card with no key or no
 * signature is `unsigned` — the normal case for a card written by any other
 * app — and never an error.
 */
export async function verifyVCardSignature(vcard: string): Promise<VCardIdentity> {
  const publicKey = parsePublicKey(readField(vcard, VCARD_KEY_FIELD));
  const sig = readField(vcard, VCARD_SIG_FIELD);
  if (!publicKey || !sig) return { signature: 'unsigned', publicKey };
  try {
    const s = await subtle();
    const rawKey = bufferSource(fromBase64Url(publicKey.key));
    const key =
      publicKey.alg === 'ed25519'
        ? await s.importKey('raw', rawKey, { name: 'Ed25519' } as AlgorithmIdentifier, true, [
            'verify',
          ])
        : await s.importKey('raw', rawKey, { name: 'ECDSA', namedCurve: 'P-256' }, true, [
            'verify',
          ]);
    const ok = await s.verify(
      signParams(publicKey.alg),
      key,
      bufferSource(fromBase64Url(sig)),
      bufferSource(new TextEncoder().encode(canonicalVCardBody(vcard))),
    );
    return { signature: ok ? 'valid' : 'invalid', publicKey };
  } catch {
    return { signature: 'invalid', publicKey };
  }
}
