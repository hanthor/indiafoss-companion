/**
 * The mesh ↔ Matrix identity binding, v1 (#188, `docs/identity-binding.md`).
 *
 * A binding is a short signed statement — "the holder of this card key and
 * the holder of this Matrix key say that mesh node X and Matrix account Y are
 * the same person" — signed by **both** keys over the **same** bytes. This
 * module is the whole cryptographic surface: the canonical encoding, the
 * domain-separated signing bytes, {@link signBinding} and
 * {@link verifyBinding}. It is pure: no network, no storage, no clock of its
 * own. The caller supplies the public keys it independently holds, the
 * identities the card claims, the revocation list it knows, and the time.
 *
 * What a valid binding proves, and does not:
 *
 * - a valid **card** signature: the presenter controls the card key on the
 *   card, and put this statement there deliberately;
 * - a valid **Matrix** signature: whoever controls the named Matrix key
 *   agreed. Whether that key really belongs to `matrixUserId` is a separate
 *   question the verifier answers from the key's *provenance* — a key fetched
 *   from a homeserver by `/keys/query` is the homeserver's word, and a valid
 *   signature by it earns `binding-valid`, never `verified`. Only Chat's own
 *   user verification of the master key (emoji/QR) can lift it further, and
 *   nothing in this repository does that.
 *
 * The Kotlin twin is `apps/android/native/core/.../IdentityBinding.kt`, and
 * `packages/test-fixtures/fixtures/identity-binding/vectors.json` is the
 * shared table both must agree on, byte for byte.
 */
import { formatPublicKey, fromBase64Url, parsePublicKey, toBase64Url } from './handshake.js';
import type { HandshakePublicKey } from './handshake.js';
import { isCanonicalNodeId } from './identity.js';

/**
 * Domain separation string. It is the first thing in the signed bytes, so a
 * signature over a binding can never be read as a signature over a contact
 * card (`canonicalVCardBody`, no prefix) or over anything Matrix itself signs
 * (Signing JSON, no prefix). The version rides in the string: a verifier that
 * meets `in.indiafoss.binding/v2` knows it is a binding it cannot read, which
 * is a different answer from "not a binding at all".
 */
export const BINDING_DOMAIN = 'in.indiafoss.binding/v1';
export const BINDING_VERSION = 1;
const DOMAIN_PREFIX = 'in.indiafoss.binding/v';

/** Longest validity a v1 binding may claim; longer is malformed, not merely long. */
export const MAX_BINDING_VALIDITY_MS = 180 * 24 * 60 * 60 * 1000;
/** How far a verifier's clock may disagree with the signer's before `issuedAt` is "the future". */
export const BINDING_CLOCK_SKEW_MS = 5 * 60 * 1000;
/** Nonce: 16 random bytes, base64url without padding — 22 characters. */
const NONCE_RE = /^[A-Za-z0-9_-]{22}$/;
/** ISO-8601 instants must be written exactly as `Date#toISOString` writes them. */
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** Matrix key ids, per the spec: `ed25519:<device id>` or `ed25519:<unpadded base64 key>`. */
const MATRIX_KEY_ID_RE = /^ed25519:[A-Za-z0-9+/_-]{1,64}$/;
const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * Which Matrix key signed. The master key is preferred: it is the key the
 * other person's Chat compares during emoji/QR verification, so a binding by
 * it is the one that could later become `verified`. The self-signing key is
 * accepted as equivalent (it is signed by the master key). A device key is
 * allowed at lower trust: it vanishes when the device is deleted, and a
 * server can mint one.
 */
export type MatrixKeyKind = 'master' | 'self-signing' | 'device';

const MATRIX_KEY_KINDS: readonly MatrixKeyKind[] = ['master', 'self-signing', 'device'];

/** The statement both keys sign. Every field is required; there are no optional fields in v1. */
export interface BindingStatement {
  /** Statement version, equal to the version in the domain. */
  v: number;
  /** Opaque, stable id the signer can later revoke. */
  id: string;
  /** Mesh node id: the node's ed25519 key, 64 lowercase hex (ADR 0008). */
  meshNodeId: string;
  /** Classic Matrix account, `@localpart:server`. Never a mesh `@n:` id. */
  matrixUserId: string;
  /** The card key, as printed on the card: `alg:base64url` (`formatPublicKey`). */
  cardKeyId: string;
  /** The Matrix key id, as `/keys/query` names it. The key bytes are *not* here. */
  matrixKeyId: string;
  matrixKeyKind: MatrixKeyKind;
  /** ISO-8601 UTC with milliseconds. */
  issuedAt: string;
  /** Required. A binding with no expiry is malformed. */
  expiresAt: string;
  /** 16 random bytes, base64url: makes every statement's bytes unique. */
  nonce: string;
}

/** The wire form: the statement, the domain it was signed under, both signatures. */
export interface SignedBinding {
  domain: string;
  statement: BindingStatement;
  /** Base64url, unpadded, raw signatures (64 bytes for Ed25519 and P-256 r||s). */
  signatures: { card: string; matrix: string };
}

/**
 * Where the verifier got the Matrix public key. Recorded beside the result,
 * because a signature is only as good as the verifier's reason to believe
 * the key belongs to the account.
 */
export type MatrixKeyProvenance =
  /** Chat compared this master key with the person, in person (emoji/QR). */
  | 'user-verified'
  /** Signed by a master key that was itself user-verified. */
  | 'cross-signed'
  /** Fetched from the account's homeserver: the homeserver's word. */
  | 'server'
  /** Read from this device's own cache of an earlier fetch. */
  | 'cached';

/** A Matrix public key the verifier holds independently of the binding. */
export interface MatrixKeyMaterial {
  id: string;
  kind: MatrixKeyKind;
  /** Raw 32-byte Ed25519 public key, base64 (padded or not) or base64url. */
  publicKey: string;
  provenance: MatrixKeyProvenance;
}

export type BindingState =
  /** Both signatures check, the statement names the expected identities and card key, and it is in date. */
  | 'valid'
  /** Not a JSON object of the expected shape. */
  | 'malformed'
  /** The domain is not an `in.indiafoss.binding/v*` string at all: not a binding. */
  | 'wrong-domain'
  /** A binding from a newer version of this protocol. Keep it; do not judge it. */
  | 'unknown-version'
  /** A signature does not verify: tampered, or signed by another key. */
  | 'invalid-signature'
  /** The statement names a different mesh id, Matrix id or card key than the card. */
  | 'mismatch'
  /** The signer withdrew it. */
  | 'revoked'
  | 'expired'
  /** `issuedAt` is in the future beyond clock skew. */
  | 'not-yet-valid'
  /** The card half checks, but no Matrix key for `matrixKeyId` is held, or the platform cannot verify it. */
  | 'unverifiable';

export interface BindingResult {
  state: BindingState;
  /** Which half failed, or what was missing. Short, for logs and tests; not UI copy. */
  reason?: string;
  /** Present whenever the statement parsed, so a UI can say what was claimed. */
  statement?: BindingStatement;
  /** Set on `valid`: the provenance of the Matrix key the signature was checked against. */
  matrixKeyProvenance?: MatrixKeyProvenance;
}

export interface BindingVerifyInput {
  /** The wire value, untrusted. */
  signed: unknown;
  /** What the card the binding arrived on says. A binding for other identities is a `mismatch`. */
  expected: { meshNodeId: string; matrixUserId: string };
  /** The card key the verifier already holds from the card's own signature. */
  cardKey: HandshakePublicKey;
  /** The Matrix key the verifier holds for `statement.matrixKeyId`, or `null` when it has none. */
  matrixKey: MatrixKeyMaterial | null;
  /** Binding ids the verifier has seen revoked. */
  revokedIds?: readonly string[];
  now: Date;
}

// ---- canonical encoding -----------------------------------------------------

/**
 * Canonical JSON, the Matrix flavour: keys sorted by code point, no
 * whitespace, integers only, strings escaped as `JSON.stringify` escapes them
 * (`"`, `\`, control characters; everything else raw UTF-8). The statement
 * only ever holds strings and one small integer, so no float or nesting rule
 * is needed — but the encoder handles nested objects and arrays anyway so a
 * later version does not have to change it.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('canonical JSON: integers only');
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
  }
  throw new Error(`canonical JSON: unsupported value ${typeof value}`);
}

/**
 * The exact bytes both keys sign: the domain, one line feed, the canonical
 * statement. Neither signature is inside these bytes, so each can be checked
 * on its own — the card half offline, the Matrix half once a key is held —
 * and the order the two signers sign in does not matter.
 */
export function bindingSigningBytes(domain: string, statement: BindingStatement): Uint8Array {
  return new TextEncoder().encode(`${domain}\n${canonicalJson(statement)}`);
}

// ---- structure ---------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural issues with a statement. Empty means well-formed, not true. */
export function collectBindingStatementIssues(value: unknown): string[] {
  if (!isRecord(value)) return ['statement must be an object'];
  const issues: string[] = [];
  const str = (field: string, re: RegExp, what: string) => {
    const v = value[field];
    if (typeof v !== 'string' || !re.test(v)) issues.push(`${field} must be ${what}`);
  };
  if (value.v !== BINDING_VERSION) issues.push(`v must be ${BINDING_VERSION}`);
  str('id', ID_RE, 'an id of 1–64 [A-Za-z0-9_.:-]');
  if (typeof value.meshNodeId !== 'string' || !isCanonicalNodeId(value.meshNodeId)) {
    issues.push('meshNodeId must be 64 lowercase hex characters');
  }
  if (
    typeof value.matrixUserId !== 'string' ||
    !/^@[^:\s]+:[^\s]+$/.test(value.matrixUserId) ||
    value.matrixUserId.startsWith('@n:')
  ) {
    issues.push('matrixUserId must be a classic Matrix user id');
  }
  if (typeof value.cardKeyId !== 'string' || !parsePublicKey(value.cardKeyId)) {
    issues.push('cardKeyId must be a card key (alg:base64url)');
  }
  str('matrixKeyId', MATRIX_KEY_ID_RE, 'a Matrix ed25519 key id');
  if (!MATRIX_KEY_KINDS.includes(value.matrixKeyKind as MatrixKeyKind)) {
    issues.push(`matrixKeyKind must be one of ${MATRIX_KEY_KINDS.join(', ')}`);
  }
  str('issuedAt', INSTANT_RE, 'an ISO-8601 UTC instant with milliseconds');
  str('expiresAt', INSTANT_RE, 'an ISO-8601 UTC instant with milliseconds');
  str('nonce', NONCE_RE, '16 bytes base64url');
  if (typeof value.issuedAt === 'string' && typeof value.expiresAt === 'string') {
    const issued = Date.parse(value.issuedAt);
    const expires = Date.parse(value.expiresAt);
    if (Number.isNaN(issued) || Number.isNaN(expires)) issues.push('instants must parse');
    else if (expires <= issued) issues.push('expiresAt must be after issuedAt');
    else if (expires - issued > MAX_BINDING_VALIDITY_MS) issues.push('validity exceeds 180 days');
  }
  const known = new Set([
    'v',
    'id',
    'meshNodeId',
    'matrixUserId',
    'cardKeyId',
    'matrixKeyId',
    'matrixKeyKind',
    'issuedAt',
    'expiresAt',
    'nonce',
  ]);
  for (const key of Object.keys(value)) {
    // v1 has no optional fields. An unknown field would be signed bytes the
    // signer's own reader does not understand, so it is refused rather than
    // tolerated — the usual "preserve unknown fields" rule is for storage,
    // and this is a signature.
    if (!known.has(key)) issues.push(`unknown field ${key}`);
  }
  return issues;
}

/** Structural issues with a whole signed binding: the envelope, then the statement. */
export function collectSignedBindingIssues(value: unknown): string[] {
  if (!isRecord(value)) return ['binding must be an object'];
  const issues: string[] = [];
  if (typeof value.domain !== 'string') issues.push('domain must be a string');
  if (!isRecord(value.signatures)) issues.push('signatures must be an object');
  else {
    for (const half of ['card', 'matrix'] as const) {
      const sig = value.signatures[half];
      if (typeof sig !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(sig)) {
        issues.push(`signatures.${half} must be base64url`);
      }
    }
  }
  issues.push(...collectBindingStatementIssues(value.statement));
  return issues;
}

// ---- crypto ------------------------------------------------------------------

const subtle = (): SubtleCrypto => {
  const s = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!s) throw new Error('WebCrypto is unavailable in this environment.');
  return s;
};

function bufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

function signParams(alg: HandshakePublicKey['alg']): AlgorithmIdentifier | EcdsaParams {
  return alg === 'ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', hash: 'SHA-256' };
}

async function importCardKey(pk: HandshakePublicKey): Promise<CryptoKey> {
  const raw = bufferSource(fromBase64Url(pk.key));
  return pk.alg === 'ed25519'
    ? subtle().importKey('raw', raw, { name: 'Ed25519' } as AlgorithmIdentifier, true, ['verify'])
    : subtle().importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
}

/** Matrix keys are base64 in the spec; accept base64url too so a cache can store either. */
function decodeMatrixKey(text: string): Uint8Array {
  return fromBase64Url(text.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'));
}

async function importMatrixKey(material: MatrixKeyMaterial): Promise<CryptoKey> {
  const raw = decodeMatrixKey(material.publicKey);
  if (raw.length !== 32) throw new Error('Matrix key must be 32 bytes');
  return subtle().importKey(
    'raw',
    bufferSource(raw),
    { name: 'Ed25519' } as AlgorithmIdentifier,
    true,
    ['verify'],
  );
}

async function verifyRaw(
  key: CryptoKey,
  params: AlgorithmIdentifier | EcdsaParams,
  signature: string,
  data: Uint8Array,
): Promise<boolean> {
  try {
    return await subtle().verify(
      params,
      key,
      bufferSource(fromBase64Url(signature)),
      bufferSource(data),
    );
  } catch {
    return false;
  }
}

/** A signer for one half of the binding: given the signing bytes, return a raw signature. */
export type BindingSigner = (bytes: Uint8Array) => Promise<Uint8Array>;

/** Sign with a WebCrypto private key — the card key pair from `handshake.ts`, or any Ed25519 key. */
export function webCryptoSigner(
  privateKey: CryptoKey,
  alg: HandshakePublicKey['alg'] = 'ed25519',
): BindingSigner {
  return async (bytes) =>
    new Uint8Array(await subtle().sign(signParams(alg), privateKey, bufferSource(bytes)));
}

export interface BindingDraft {
  id: string;
  meshNodeId: string;
  matrixUserId: string;
  cardKey: HandshakePublicKey;
  matrixKeyId: string;
  matrixKeyKind: MatrixKeyKind;
  issuedAt: Date;
  expiresAt: Date;
  /** Omit to draw 16 random bytes. */
  nonce?: string;
}

/**
 * Produce a signed binding. Both signers sign the same bytes; the card half
 * is the phone's card key, the Matrix half is whatever holds the Matrix key
 * (Chat, via the SDK's `sign`). Nothing here publishes or transports the
 * result — see `docs/identity-binding.md`, "Publication (proposal)".
 */
export async function signBinding(
  draft: BindingDraft,
  signers: { card: BindingSigner; matrix: BindingSigner },
): Promise<SignedBinding> {
  const nonce =
    draft.nonce ??
    toBase64Url((globalThis as { crypto: Crypto }).crypto.getRandomValues(new Uint8Array(16)));
  const statement: BindingStatement = {
    v: BINDING_VERSION,
    id: draft.id,
    meshNodeId: draft.meshNodeId.toLowerCase(),
    matrixUserId: draft.matrixUserId,
    cardKeyId: formatPublicKey(draft.cardKey),
    matrixKeyId: draft.matrixKeyId,
    matrixKeyKind: draft.matrixKeyKind,
    issuedAt: draft.issuedAt.toISOString(),
    expiresAt: draft.expiresAt.toISOString(),
    nonce,
  };
  const issues = collectBindingStatementIssues(statement);
  if (issues.length > 0) throw new Error(`cannot sign: ${issues.join('; ')}`);
  const bytes = bindingSigningBytes(BINDING_DOMAIN, statement);
  const [card, matrix] = await Promise.all([signers.card(bytes), signers.matrix(bytes)]);
  return {
    domain: BINDING_DOMAIN,
    statement,
    signatures: { card: toBase64Url(card), matrix: toBase64Url(matrix) },
  };
}

/**
 * Verify a binding against keys the caller holds. Never throws; every
 * failure is a state. The checks run in this order so that the most
 * important fact about a bad binding is the one reported:
 *
 * 1. shape and domain — is this a v1 binding at all;
 * 2. the card signature — was it tampered with, or signed by another card key;
 * 3. identities and card key — is it *this* card's binding;
 * 4. revocation, then time;
 * 5. the Matrix signature — last, because it is the one half that may be
 *    unverifiable offline, and everything before it can be decided without a
 *    Matrix key.
 *
 * `valid` needs both signatures. There is no weaker "card half only" success.
 */
export async function verifyBinding(input: BindingVerifyInput): Promise<BindingResult> {
  const { signed } = input;
  if (!isRecord(signed) || typeof signed.domain !== 'string') {
    return { state: 'malformed', reason: 'not a signed binding object' };
  }
  if (signed.domain !== BINDING_DOMAIN) {
    if (
      signed.domain.startsWith(DOMAIN_PREFIX) &&
      /^\d+$/.test(signed.domain.slice(DOMAIN_PREFIX.length))
    ) {
      const version = Number(signed.domain.slice(DOMAIN_PREFIX.length));
      if (version > BINDING_VERSION) {
        return { state: 'unknown-version', reason: `binding version ${version}` };
      }
    }
    return { state: 'wrong-domain', reason: `domain ${signed.domain}` };
  }
  const issues = collectSignedBindingIssues(signed);
  if (issues.length > 0) return { state: 'malformed', reason: issues.join('; ') };
  const statement = signed.statement as BindingStatement;
  const signatures = signed.signatures as { card: string; matrix: string };
  const bytes = bindingSigningBytes(signed.domain, statement);

  // 2. The card half. The key is the one the verifier holds from the card's
  //    own signature — never the id printed in the statement.
  let cardOk: boolean;
  try {
    cardOk = await verifyRaw(
      await importCardKey(input.cardKey),
      signParams(input.cardKey.alg),
      signatures.card,
      bytes,
    );
  } catch {
    return { state: 'unverifiable', statement, reason: 'card key could not be imported' };
  }
  if (!cardOk) return { state: 'invalid-signature', statement, reason: 'card signature' };

  // 3. Is this binding about this card?
  if (statement.cardKeyId !== formatPublicKey(input.cardKey)) {
    return { state: 'mismatch', statement, reason: 'cardKeyId' };
  }
  if (statement.meshNodeId !== input.expected.meshNodeId.trim().toLowerCase()) {
    return { state: 'mismatch', statement, reason: 'meshNodeId' };
  }
  if (statement.matrixUserId !== input.expected.matrixUserId.trim()) {
    return { state: 'mismatch', statement, reason: 'matrixUserId' };
  }

  // 4. Withdrawn, or out of date.
  if (input.revokedIds?.includes(statement.id)) return { state: 'revoked', statement };
  const now = input.now.getTime();
  if (Date.parse(statement.issuedAt) > now + BINDING_CLOCK_SKEW_MS) {
    return { state: 'not-yet-valid', statement };
  }
  if (Date.parse(statement.expiresAt) <= now) return { state: 'expired', statement };

  // 5. The Matrix half, against a key the verifier holds independently.
  const key = input.matrixKey;
  if (!key) return { state: 'unverifiable', statement, reason: 'no Matrix key held' };
  if (key.id !== statement.matrixKeyId || key.kind !== statement.matrixKeyKind) {
    return { state: 'unverifiable', statement, reason: 'held Matrix key is not the signing key' };
  }
  let matrixOk: boolean;
  try {
    matrixOk = await verifyRaw(
      await importMatrixKey(key),
      { name: 'Ed25519' } as AlgorithmIdentifier,
      signatures.matrix,
      bytes,
    );
  } catch {
    return { state: 'unverifiable', statement, reason: 'Matrix key could not be imported' };
  }
  if (!matrixOk) return { state: 'invalid-signature', statement, reason: 'matrix signature' };
  return { state: 'valid', statement, matrixKeyProvenance: key.provenance };
}

/** Lower-case hex of the signing bytes, for fixtures and cross-platform comparison. */
export function bindingSigningBytesHex(domain: string, statement: BindingStatement): string {
  return [...bindingSigningBytes(domain, statement)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
