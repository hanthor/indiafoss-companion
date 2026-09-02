/**
 * Handshake contact sharing (§42 extension).
 *
 * Every device generates a signing key pair once. Friend cards carry the
 * public key (`pk`) and a signature (`sig`) over the card's own fields, so a
 * scanned card is tamper-evident and two people who scan each other can see
 * that the same key appears both times. A pixel identicon derived from the
 * key fingerprint gives that check a face: if the little 5×5 badge on my
 * screen matches the one on yours, we scanned the same key.
 *
 * This is deliberately *not* identity verification: it proves the card was
 * produced by the holder of a key, not who that holder is. Matrix
 * cross-signing remains the authenticity mechanism for messaging.
 */

export type HandshakeAlgorithm = 'ed25519' | 'p256';

export interface HandshakePublicKey {
  alg: HandshakeAlgorithm;
  /** base64url raw public key (32 bytes Ed25519, 65 bytes uncompressed P-256). */
  key: string;
}

export interface HandshakeKeyPair {
  alg: HandshakeAlgorithm;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  /** Serialisable public half for cards. */
  exported: HandshakePublicKey;
}

const subtle = (): SubtleCrypto => {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!s) throw new Error('WebCrypto is unavailable in this environment.');
  return s;
};

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Generate a non-extractable signing key pair. Ed25519 where supported
 * (Chrome 137+, Safari 17+, Firefox 130+, Node 20+), ECDSA P-256 elsewhere.
 */
export async function generateHandshakeKeyPair(): Promise<HandshakeKeyPair> {
  const s = subtle();
  try {
    const pair = (await s.generateKey({ name: 'Ed25519' }, false, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const raw = new Uint8Array(await s.exportKey('raw', pair.publicKey));
    return { alg: 'ed25519', ...pair, exported: { alg: 'ed25519', key: toBase64Url(raw) } };
  } catch {
    const pair = await s.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ]);
    const raw = new Uint8Array(await s.exportKey('raw', pair.publicKey));
    return { alg: 'p256', ...pair, exported: { alg: 'p256', key: toBase64Url(raw) } };
  }
}

function signParams(alg: HandshakeAlgorithm): AlgorithmIdentifier | EcdsaParams {
  return alg === 'ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', hash: 'SHA-256' };
}

/** Copy into a plain ArrayBuffer-backed view (WebCrypto typings reject shared buffers). */
function bufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

async function importPublicKey(pk: HandshakePublicKey): Promise<CryptoKey> {
  const raw = bufferSource(fromBase64Url(pk.key));
  return pk.alg === 'ed25519'
    ? subtle().importKey('raw', raw, { name: 'Ed25519' } as AlgorithmIdentifier, true, ['verify'])
    : subtle().importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
}

/** Canonical byte string signed for a friend card: sorted `key=value` pairs, `sig` excluded. */
export function canonicalCardString(params: URLSearchParams): string {
  const entries = [...params.entries()]
    .filter(([k]) => k !== 'sig')
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join('&');
}

export async function signCard(params: URLSearchParams, pair: HandshakeKeyPair): Promise<string> {
  const data = new TextEncoder().encode(canonicalCardString(params));
  const sig = new Uint8Array(await subtle().sign(signParams(pair.alg), pair.privateKey, data));
  return toBase64Url(sig);
}

/** `true` when `sig` is a valid signature by `pk` over the card's other fields. */
export async function verifyCard(
  params: URLSearchParams,
  pk: HandshakePublicKey,
  sig: string,
): Promise<boolean> {
  try {
    const key = await importPublicKey(pk);
    const data = new TextEncoder().encode(canonicalCardString(params));
    return await subtle().verify(signParams(pk.alg), key, bufferSource(fromBase64Url(sig)), data);
  } catch {
    return false;
  }
}

export function parsePublicKey(value: string | null | undefined): HandshakePublicKey | null {
  if (!value) return null;
  const match = value.match(/^(ed25519|p256):([A-Za-z0-9_-]{20,200})$/);
  return match ? { alg: match[1] as HandshakeAlgorithm, key: match[2]! } : null;
}

export function formatPublicKey(pk: HandshakePublicKey): string {
  return `${pk.alg}:${pk.key}`;
}

/** SHA-256 fingerprint of a public key as lower-case hex. */
export async function keyFingerprint(pk: HandshakePublicKey): Promise<string> {
  const digest = await subtle().digest('SHA-256', new TextEncoder().encode(formatPublicKey(pk)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Human-friendly short form: `7f3a 91c2 0d4e`. */
export function shortFingerprint(fingerprint: string): string {
  return fingerprint
    .slice(0, 12)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/**
 * Deterministic 5×5 mirrored pixel identicon as an SVG string. Colours come
 * from the fingerprint so the same key always renders the same badge.
 */
export function identiconSvg(fingerprint: string, size = 96): string {
  const bytes = fingerprint.match(/.{2}/g)?.map((h) => parseInt(h, 16)) ?? [];
  const palette = ['#08b74f', '#ecac4b', '#df5447', '#04c7bd', '#5f84ff', '#cf2797'];
  const fg = palette[(bytes[0] ?? 0) % palette.length]!;
  const bg = '#18222a';
  const cell = size / 5;
  const rects: string[] = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      const bit = ((bytes[1 + y] ?? 0) >> x) & 1;
      if (!bit) continue;
      const draw = (cx: number) =>
        rects.push(
          `<rect x="${cx * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${fg}"/>`,
        );
      draw(x);
      if (x !== 2) draw(4 - x);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="Key badge ${shortFingerprint(fingerprint)}"><rect width="${size}" height="${size}" fill="${bg}"/>${rects.join('')}</svg>`;
}
