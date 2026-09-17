import type { AttendeeProfile, AttendeeShareSelection } from './contact.js';
import { attendeeProfileToVCard } from './contact.js';
import { formatPublicKey, fromBase64Url, toBase64Url } from './handshake.js';
import type { HandshakeKeyPair, HandshakePublicKey } from './handshake.js';
import { parsePublicKey } from './handshake.js';

/** vCard property carrying the device's handshake public key (`alg:base64url`). */
export const VCARD_KEY_FIELD = 'X-INDIAFOSS-KEY';
/** vCard property carrying the signature over the canonical body. */
export const VCARD_SIG_FIELD = 'X-INDIAFOSS-SIG';
/** When the card was issued (ISO 8601); inside the signed body, so a replay cannot re-date it. */
export const VCARD_ISSUED_FIELD = 'X-INDIAFOSS-ISSUED';
/** Random per-issue value that makes every rendering of the card distinct. */
export const VCARD_NONCE_FIELD = 'X-INDIAFOSS-NONCE';
/** A signed card older than this is a photograph until the sharer shows a live one. */
export const CARD_FRESH_MINUTES = 60;
/** Clock skew tolerated before an issue time in the future stops counting as fresh. */
const FUTURE_SKEW_MINUTES = 10;

export type CardFreshness = 'fresh' | 'stale' | 'unknown';

/** Nine random bytes, base64url: short enough for a QR, unique enough per rendering. */
export function newCardNonce(): string {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * Whether a scanned card was issued recently enough to have come off a live
 * screen. Only a valid signature makes the issue time worth reading: an
 * unsigned or tampered card can claim any date. `unknown` is not a warning,
 * just a card from a build (or an app) that does not date its cards.
 */
export function cardFreshnessOf(
  card: { signature: 'valid' | 'invalid' | 'unsigned'; issuedAt?: string },
  nowMs: number,
): CardFreshness {
  if (card.signature !== 'valid' || !card.issuedAt) return 'unknown';
  const issued = Date.parse(card.issuedAt);
  if (Number.isNaN(issued)) return 'unknown';
  const ageMinutes = (nowMs - issued) / 60_000;
  if (ageMinutes < -FUTURE_SKEW_MINUTES) return 'unknown';
  return ageMinutes <= CARD_FRESH_MINUTES ? 'fresh' : 'stale';
}

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
  options?: { gravatarUrl?: string | null; issuedAt?: string; nonce?: string },
): Promise<string> {
  const base = attendeeProfileToVCard(profile, selection, options);
  if (!pair) return base;

  // Issue time and nonce sit inside the signed body: a photographed code keeps
  // its original date, and a scanner can tell it from a card shown live.
  const issuedAt = options?.issuedAt ?? new Date().toISOString();
  const nonce = options?.nonce ?? newCardNonce();
  const withKey = base.replace(
    /END:VCARD\r?\n?$/,
    `${VCARD_ISSUED_FIELD}:${issuedAt}\r\n${VCARD_NONCE_FIELD}:${nonce}\r\n${VCARD_KEY_FIELD}:${formatPublicKey(pair.exported)}\r\nEND:VCARD\r\n`,
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
  /** Issue time the card carried, meaningful only with a `valid` signature. */
  issuedAt?: string;
  nonce?: string;
}

const ISSUED_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const NONCE_RE = /^[A-Za-z0-9_-]{8,32}$/;

function issueMeta(vcard: string): { issuedAt?: string; nonce?: string } {
  const issuedAt = readField(vcard, VCARD_ISSUED_FIELD);
  const nonce = readField(vcard, VCARD_NONCE_FIELD);
  return {
    ...(issuedAt && ISSUED_RE.test(issuedAt) ? { issuedAt } : {}),
    ...(nonce && NONCE_RE.test(nonce) ? { nonce } : {}),
  };
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
  const meta = issueMeta(vcard);
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
    return { signature: ok ? 'valid' : 'invalid', publicKey, ...meta };
  } catch {
    return { signature: 'invalid', publicKey, ...meta };
  }
}
