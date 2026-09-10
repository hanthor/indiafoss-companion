import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixturesDir, loadIdentityBindingVectors } from '@indiafoss/test-fixtures';
import type { IdentityBindingVector, IdentityBindingVectors } from '@indiafoss/test-fixtures';
import {
  BINDING_DOMAIN,
  BINDING_VERSION,
  bindingSigningBytesHex,
  canonicalJson,
  collectSignedBindingIssues,
  signBinding,
  verifyBinding,
  webCryptoSigner,
} from './binding.js';
import type {
  BindingSigner,
  BindingStatement,
  MatrixKeyMaterial,
  SignedBinding,
} from './binding.js';
import { formatPublicKey, parsePublicKey, toBase64Url } from './handshake.js';
import type { HandshakePublicKey } from './handshake.js';

/**
 * The binding (#188) against the shared vector table, which the Kotlin core
 * reads too. Set `REGENERATE_BINDING_VECTORS=1` to rewrite the table from
 * this file: the keys in it are reused when present, so a regeneration only
 * changes what this file changed.
 */

const MESH = '845aa456078572639c1543694de69e0a03fb883bd9c1dab1a2f6df811b75897e';
const OTHER_MESH = 'b'.repeat(64);
const MXID = '@asha:indiafoss.org';
const ISSUED = new Date('2026-09-10T09:00:00.000Z');
const EXPIRES = new Date('2026-10-10T09:00:00.000Z');
const NOW = '2026-09-11T12:00:00.000Z';
const NONCE = 'AAECAwQFBgcICQoLDA0ODw'; // bytes 0..15

const subtle = globalThis.crypto.subtle;

interface TestKey {
  alg: 'ed25519' | 'p256';
  jwk: Record<string, string>;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  /** Card form `alg:base64url`; for Matrix keys, the raw key base64url (the id is derived separately). */
  card: HandshakePublicKey;
  raw: Uint8Array;
}

async function importTestKey(
  alg: 'ed25519' | 'p256',
  jwk: Record<string, string>,
): Promise<TestKey> {
  const params = alg === 'ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', namedCurve: 'P-256' };
  const privateKey = await subtle.importKey('jwk', jwk, params, true, ['sign']);
  const pub = { ...jwk };
  delete pub.d;
  const publicKey = await subtle.importKey('jwk', pub, params, true, ['verify']);
  const raw = new Uint8Array(await subtle.exportKey('raw', publicKey));
  return { alg, jwk, publicKey, privateKey, card: { alg, key: toBase64Url(raw) }, raw };
}

async function newTestKey(alg: 'ed25519' | 'p256'): Promise<TestKey> {
  const params = alg === 'ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', namedCurve: 'P-256' };
  const pair = (await subtle.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = (await subtle.exportKey('jwk', pair.privateKey)) as Record<string, string>;
  for (const k of ['key_ops', 'ext', 'alg']) delete jwk[k];
  return importTestKey(alg, jwk);
}

/** Matrix names cross-signing keys `ed25519:<unpadded base64>` and device keys `ed25519:<DEVICEID>`. */
function matrixKeyId(key: TestKey, kind: 'master' | 'device'): string {
  if (kind === 'device') return 'ed25519:ABCDEFGH';
  return `ed25519:${btoa(String.fromCharCode(...key.raw)).replace(/=+$/, '')}`;
}

function matrixMaterial(
  key: TestKey,
  kind: 'master' | 'device',
  provenance: MatrixKeyMaterial['provenance'] = 'server',
): MatrixKeyMaterial {
  return {
    id: matrixKeyId(key, kind),
    kind,
    publicKey: btoa(String.fromCharCode(...key.raw)).replace(/=+$/, ''),
    provenance,
  };
}

interface Keys {
  card: TestKey;
  otherCard: TestKey;
  p256Card: TestKey;
  master: TestKey;
  device: TestKey;
  otherMaster: TestKey;
}

async function loadKeys(existing: IdentityBindingVectors | null): Promise<Keys> {
  const get = async (name: string, alg: 'ed25519' | 'p256') => {
    const stored = existing?.keys[name];
    return stored && stored.alg === alg ? importTestKey(alg, stored.jwk) : newTestKey(alg);
  };
  return {
    card: await get('card', 'ed25519'),
    otherCard: await get('otherCard', 'ed25519'),
    p256Card: await get('p256Card', 'p256'),
    master: await get('master', 'ed25519'),
    device: await get('device', 'ed25519'),
    otherMaster: await get('otherMaster', 'ed25519'),
  };
}

/** Sign an arbitrary (possibly malformed) statement under an arbitrary domain, bypassing `signBinding`'s checks. */
async function rawSign(
  domain: string,
  statement: Record<string, unknown>,
  card: TestKey,
  matrix: TestKey,
): Promise<SignedBinding> {
  const bytes = new TextEncoder().encode(`${domain}\n${canonicalJson(statement)}`);
  const c = await webCryptoSigner(card.privateKey, card.alg)(bytes);
  const m = await webCryptoSigner(matrix.privateKey)(bytes);
  return {
    domain,
    statement: statement as unknown as BindingStatement,
    signatures: { card: toBase64Url(c), matrix: toBase64Url(m) },
  };
}

function baseStatement(
  keys: Keys,
  over: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    v: BINDING_VERSION,
    id: 'b-2026-09-10-asha',
    meshNodeId: MESH,
    matrixUserId: MXID,
    cardKeyId: formatPublicKey(keys.card.card),
    matrixKeyId: matrixKeyId(keys.master, 'master'),
    matrixKeyKind: 'master',
    issuedAt: ISSUED.toISOString(),
    expiresAt: EXPIRES.toISOString(),
    nonce: NONCE,
    ...over,
  };
}

const STATES = [
  'valid',
  'malformed',
  'wrong-domain',
  'unknown-version',
  'invalid-signature',
  'mismatch',
  'revoked',
  'expired',
  'not-yet-valid',
  'unverifiable',
];

function accountOf(state: string): string {
  return state === 'valid' ? 'binding-valid' : state === 'revoked' ? 'revoked' : 'claimed';
}

async function buildVectors(keys: Keys): Promise<IdentityBindingVectors> {
  const cardSigner: BindingSigner = webCryptoSigner(keys.card.privateKey, 'ed25519');
  const masterSigner: BindingSigner = webCryptoSigner(keys.master.privateKey);
  const deviceSigner: BindingSigner = webCryptoSigner(keys.device.privateKey);

  const valid = await signBinding(
    {
      id: 'b-2026-09-10-asha',
      meshNodeId: MESH,
      matrixUserId: MXID,
      cardKey: keys.card.card,
      matrixKeyId: matrixKeyId(keys.master, 'master'),
      matrixKeyKind: 'master',
      issuedAt: ISSUED,
      expiresAt: EXPIRES,
      nonce: NONCE,
    },
    { card: cardSigner, matrix: masterSigner },
  );
  const byDevice = await signBinding(
    {
      id: 'b-device',
      meshNodeId: MESH,
      matrixUserId: MXID,
      cardKey: keys.card.card,
      matrixKeyId: matrixKeyId(keys.device, 'device'),
      matrixKeyKind: 'device',
      issuedAt: ISSUED,
      expiresAt: EXPIRES,
      nonce: NONCE,
    },
    { card: cardSigner, matrix: deviceSigner },
  );
  const byP256 = await signBinding(
    {
      id: 'b-p256',
      meshNodeId: MESH,
      matrixUserId: MXID,
      cardKey: keys.p256Card.card,
      matrixKeyId: matrixKeyId(keys.master, 'master'),
      matrixKeyKind: 'master',
      issuedAt: ISSUED,
      expiresAt: EXPIRES,
      nonce: NONCE,
    },
    { card: webCryptoSigner(keys.p256Card.privateKey, 'p256'), matrix: masterSigner },
  );
  const forOtherMesh = await signBinding(
    {
      id: 'b-other-mesh',
      meshNodeId: OTHER_MESH,
      matrixUserId: MXID,
      cardKey: keys.card.card,
      matrixKeyId: matrixKeyId(keys.master, 'master'),
      matrixKeyKind: 'master',
      issuedAt: ISSUED,
      expiresAt: EXPIRES,
      nonce: NONCE,
    },
    { card: cardSigner, matrix: masterSigner },
  );
  const forOtherMxid = await signBinding(
    {
      id: 'b-other-mxid',
      meshNodeId: MESH,
      matrixUserId: '@alice:matrix.org',
      cardKey: keys.card.card,
      matrixKeyId: matrixKeyId(keys.master, 'master'),
      matrixKeyKind: 'master',
      issuedAt: ISSUED,
      expiresAt: EXPIRES,
      nonce: NONCE,
    },
    { card: cardSigner, matrix: masterSigner },
  );
  const wrongDomain = await rawSign(
    'in.indiafoss.card/v1',
    baseStatement(keys),
    keys.card,
    keys.master,
  );
  const v2 = await rawSign(
    'in.indiafoss.binding/v2',
    baseStatement(keys, { v: 2 }),
    keys.card,
    keys.master,
  );
  const tampered: SignedBinding = {
    ...valid,
    statement: { ...valid.statement, meshNodeId: OTHER_MESH },
  };
  const swappedMatrixSig: SignedBinding = {
    ...valid,
    signatures: {
      card: valid.signatures.card,
      matrix: (await rawSign(BINDING_DOMAIN, baseStatement(keys), keys.card, keys.otherMaster))
        .signatures.matrix,
    },
  };
  const byOtherCard = await rawSign(
    BINDING_DOMAIN,
    baseStatement(keys),
    keys.otherCard,
    keys.master,
  );
  const claimsOtherCardKey = await rawSign(
    BINDING_DOMAIN,
    baseStatement(keys, { cardKeyId: formatPublicKey(keys.otherCard.card) }),
    keys.card,
    keys.master,
  );
  const noExpiry = await rawSign(
    BINDING_DOMAIN,
    baseStatement(keys, { expiresAt: undefined }),
    keys.card,
    keys.master,
  );
  const tooLong = await rawSign(
    BINDING_DOMAIN,
    baseStatement(keys, { expiresAt: '2027-09-10T09:00:00.000Z' }),
    keys.card,
    keys.master,
  );
  const extraField = await rawSign(
    BINDING_DOMAIN,
    baseStatement(keys, { scope: 'routing' }),
    keys.card,
    keys.master,
  );
  const meshAsMxid = await rawSign(
    BINDING_DOMAIN,
    baseStatement(keys, { matrixUserId: `@n:${MESH}` }),
    keys.card,
    keys.master,
  );

  const cardId = formatPublicKey(keys.card.card);
  const master = matrixMaterial(keys.master, 'master');
  const expected = { meshNodeId: MESH, matrixUserId: MXID };
  const hex = (s: SignedBinding) => bindingSigningBytesHex(s.domain, s.statement);

  const row = (
    name: string,
    describes: string,
    signed: unknown,
    state: string,
    over: Partial<IdentityBindingVector> = {},
  ): IdentityBindingVector => ({
    name,
    describes,
    signed,
    expected,
    cardKey: cardId,
    matrixKey: master,
    revokedIds: [],
    now: NOW,
    ...(over.signingBytesHex === undefined && isSigned(signed)
      ? { signingBytesHex: hex(signed) }
      : {}),
    expect: { state, account: accountOf(state), ...(over.expect ?? {}) },
    ...over,
  });

  const cases: IdentityBindingVector[] = [
    row(
      'valid-master-key',
      'both signatures check; the Matrix half by the master key fetched from the homeserver',
      valid,
      'valid',
    ),
    row(
      'valid-master-key-user-verified',
      "the same binding when Chat has user-verified the master key: still binding-valid here; `verified` is Chat's to say",
      valid,
      'valid',
      { matrixKey: matrixMaterial(keys.master, 'master', 'user-verified') },
    ),
    row(
      'valid-device-key',
      'a binding signed by a device key is valid at lower trust',
      byDevice,
      'valid',
      {
        matrixKey: matrixMaterial(keys.device, 'device'),
      },
    ),
    row(
      'valid-p256-card-key',
      'a card key on the ECDSA P-256 fallback signs a valid binding',
      byP256,
      'valid',
      {
        cardKey: formatPublicKey(keys.p256Card.card),
      },
    ),
    row(
      'expired',
      'past expiresAt: earns nothing, and is not re-signed by anybody but the owner',
      valid,
      'expired',
      {
        now: '2026-10-10T09:00:00.000Z',
      },
    ),
    row(
      'not-yet-valid',
      "issued more than the skew allowance in the verifier's future",
      valid,
      'not-yet-valid',
      {
        now: '2026-09-10T08:30:00.000Z',
      },
    ),
    row(
      'wrong-domain',
      'valid signatures over another domain are not a binding',
      wrongDomain,
      'wrong-domain',
      {
        signingBytesHex: hex(wrongDomain),
      },
    ),
    row(
      'unknown-version',
      'a v2 binding is kept for a newer build, not judged',
      v2,
      'unknown-version',
      {
        signingBytesHex: hex(v2),
      },
    ),
    row(
      'tampered-mesh-id',
      'the statement was changed after signing',
      tampered,
      'invalid-signature',
      {
        expect: { state: 'invalid-signature', reason: 'card signature', account: 'claimed' },
      },
    ),
    row(
      'matrix-signature-by-another-key',
      'the card half is genuine, the Matrix half was made by a key that is not the named one',
      swappedMatrixSig,
      'invalid-signature',
      { expect: { state: 'invalid-signature', reason: 'matrix signature', account: 'claimed' } },
    ),
    row(
      'signed-by-another-card-key',
      "a binding signed by somebody else's card key, presented on this card",
      byOtherCard,
      'invalid-signature',
      { expect: { state: 'invalid-signature', reason: 'card signature', account: 'claimed' } },
    ),
    row(
      'names-another-card-key',
      'signed by this card key but naming another: the statement is not about this card',
      claimsOtherCardKey,
      'mismatch',
      { expect: { state: 'mismatch', reason: 'cardKeyId', account: 'claimed' } },
    ),
    row(
      'someone-elses-mesh-id',
      'a genuine binding for another mesh identity, replayed on a card claiming this one',
      forOtherMesh,
      'mismatch',
      { expect: { state: 'mismatch', reason: 'meshNodeId', account: 'claimed' } },
    ),
    row(
      'someone-elses-mxid',
      'the sharpest attack: a card naming @alice with a binding that never mentions her',
      forOtherMxid,
      'mismatch',
      { expect: { state: 'mismatch', reason: 'matrixUserId', account: 'claimed' } },
    ),
    row(
      'revoked',
      'the signer withdrew this id; replaying it after revocation earns `revoked`',
      valid,
      'revoked',
      {
        revokedIds: ['b-2026-09-10-asha'],
      },
    ),
    row(
      'no-matrix-key-held',
      'offline, with no cached key: the card half checks, the binding stays unverifiable',
      valid,
      'unverifiable',
      {
        matrixKey: null,
      },
    ),
    row(
      'held-key-is-not-the-signing-key',
      'the verifier holds a different key id for the account: unverifiable, not invalid',
      valid,
      'unverifiable',
      { matrixKey: matrixMaterial(keys.otherMaster, 'master') },
    ),
    row('malformed-no-expiry', 'v1 requires an expiry', noExpiry, 'malformed', {
      signingBytesHex: undefined,
    }),
    row(
      'malformed-validity-too-long',
      'more than 180 days of validity is refused as malformed',
      tooLong,
      'malformed',
      {
        signingBytesHex: undefined,
      },
    ),
    row(
      'malformed-unknown-field',
      'a field v1 does not define is refused: a signature covers nothing a reader ignores',
      extraField,
      'malformed',
      {
        signingBytesHex: undefined,
      },
    ),
    row(
      'malformed-mesh-as-matrix-id',
      'binding a mesh identity to itself says nothing',
      meshAsMxid,
      'malformed',
      {
        signingBytesHex: undefined,
      },
    ),
    row(
      'not-an-object',
      'a string where a binding should be',
      'in.indiafoss.binding/v1',
      'malformed',
      {
        signingBytesHex: undefined,
      },
    ),
  ];

  const keyEntry = (k: TestKey, id: string) => ({ alg: k.alg, jwk: k.jwk, id });
  return {
    describes:
      'Signed identity bindings (#188, docs/identity-binding.md). Each case is a binding as received, the keys and identities the verifier holds independently, the clock, and the outcome every platform must reach. `signingBytesHex` is the exact canonical bytes both signatures cover. The keys are test-only.',
    domain: BINDING_DOMAIN,
    version: BINDING_VERSION,
    vocabulary: { state: STATES, account: ['binding-valid', 'revoked', 'claimed'] },
    keys: {
      card: keyEntry(keys.card, cardId),
      otherCard: keyEntry(keys.otherCard, formatPublicKey(keys.otherCard.card)),
      p256Card: keyEntry(keys.p256Card, formatPublicKey(keys.p256Card.card)),
      master: keyEntry(keys.master, matrixKeyId(keys.master, 'master')),
      device: keyEntry(keys.device, matrixKeyId(keys.device, 'device')),
      otherMaster: keyEntry(keys.otherMaster, matrixKeyId(keys.otherMaster, 'master')),
    },
    cases,
  };
}

function isSigned(value: unknown): value is SignedBinding {
  return typeof value === 'object' && value !== null && 'statement' in value;
}

function loadOrNull(): IdentityBindingVectors | null {
  try {
    return loadIdentityBindingVectors();
  } catch {
    return null;
  }
}

describe('identity binding vectors', () => {
  if (process.env.REGENERATE_BINDING_VECTORS) {
    it('regenerates the shared vector table', async () => {
      const keys = await loadKeys(loadOrNull());
      const table = await buildVectors(keys);
      const path = fixturesDir('identity-binding', 'vectors.json');
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(table, null, 2) + '\n');
      expect(table.cases.length).toBeGreaterThan(15);
    });
    return;
  }

  const table = loadIdentityBindingVectors();

  it('is the table this build would generate', async () => {
    // Ed25519 is deterministic, so every Ed25519 signature must reproduce
    // exactly. P-256 is not, so that case is compared by verdict below.
    const keys = await loadKeys(table);
    const fresh = await buildVectors(keys);
    for (const [i, c] of fresh.cases.entries()) {
      const stored = table.cases[i]!;
      expect(stored.name).toBe(c.name);
      if (c.name.includes('p256')) continue;
      expect(stored).toEqual(c);
    }
    expect(table.cases.length).toBe(fresh.cases.length);
  });

  for (const c of table.cases) {
    it(`${c.name}: ${c.describes}`, async () => {
      const cardKey = parsePublicKey(c.cardKey)!;
      const result = await verifyBinding({
        signed: c.signed,
        expected: c.expected,
        cardKey,
        matrixKey: c.matrixKey,
        revokedIds: c.revokedIds,
        now: new Date(c.now),
      });
      expect(result.state).toBe(c.expect.state);
      if (c.expect.reason) expect(result.reason).toBe(c.expect.reason);
      if (c.signingBytesHex && isSigned(c.signed)) {
        expect(bindingSigningBytesHex(c.signed.domain, c.signed.statement)).toBe(c.signingBytesHex);
      }
      if (result.state === 'valid')
        expect(result.matrixKeyProvenance).toBe(c.matrixKey?.provenance);
    });
  }

  it('lists every state the verifier can return', () => {
    expect(new Set(table.vocabulary.state)).toEqual(new Set(STATES));
    for (const c of table.cases) expect(STATES).toContain(c.expect.state);
    // Every state appears at least once, so the Kotlin side exercises each branch.
    for (const s of STATES) expect(table.cases.some((c) => c.expect.state === s)).toBe(true);
  });
});

describe('canonical encoding', () => {
  it('sorts keys, drops whitespace and undefined, and escapes like JSON.stringify', () => {
    expect(canonicalJson({ b: 1, a: 'x"y\n', c: undefined, d: { z: [1, 'é'], y: null } })).toBe(
      '{"a":"x\\"y\\n","b":1,"d":{"y":null,"z":[1,"é"]}}',
    );
    expect(() => canonicalJson({ a: 1.5 })).toThrow();
  });

  it('puts the domain first, separated by one line feed', () => {
    const statement = { v: 1 } as unknown as BindingStatement;
    const hex = bindingSigningBytesHex(BINDING_DOMAIN, statement);
    const text = Buffer.from(hex, 'hex').toString('utf8');
    expect(text).toBe('in.indiafoss.binding/v1\n{"v":1}');
  });
});

describe('signBinding', () => {
  it('refuses to sign a statement that would not verify', async () => {
    const keys = await loadKeys(loadOrNull());
    await expect(
      signBinding(
        {
          id: 'x',
          meshNodeId: MESH.slice(0, 8),
          matrixUserId: MXID,
          cardKey: keys.card.card,
          matrixKeyId: matrixKeyId(keys.master, 'master'),
          matrixKeyKind: 'master',
          issuedAt: ISSUED,
          expiresAt: EXPIRES,
        },
        {
          card: webCryptoSigner(keys.card.privateKey),
          matrix: webCryptoSigner(keys.master.privateKey),
        },
      ),
    ).rejects.toThrow(/meshNodeId/);
  });

  it('draws a fresh nonce each time, so two bindings never share bytes', async () => {
    const keys = await loadKeys(loadOrNull());
    const draft = {
      id: 'x',
      meshNodeId: MESH,
      matrixUserId: MXID,
      cardKey: keys.card.card,
      matrixKeyId: matrixKeyId(keys.master, 'master'),
      matrixKeyKind: 'master' as const,
      issuedAt: ISSUED,
      expiresAt: EXPIRES,
    };
    const signers = {
      card: webCryptoSigner(keys.card.privateKey),
      matrix: webCryptoSigner(keys.master.privateKey),
    };
    const a = await signBinding(draft, signers);
    const b = await signBinding(draft, signers);
    expect(a.statement.nonce).not.toBe(b.statement.nonce);
    expect(collectSignedBindingIssues(a)).toEqual([]);
  });
});
