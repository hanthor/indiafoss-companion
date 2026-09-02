import { describe, expect, it } from 'vitest';
import {
  canonicalCardString,
  formatPublicKey,
  generateHandshakeKeyPair,
  identiconSvg,
  keyFingerprint,
  parsePublicKey,
  shortFingerprint,
  signCard,
  verifyCard,
} from './handshake.js';

describe('handshake keys and signatures', () => {
  it('signs a card and verifies it with the embedded public key', async () => {
    const pair = await generateHandshakeKeyPair();
    expect(['ed25519', 'p256']).toContain(pair.alg);
    const params = new URLSearchParams({
      v: '1',
      fn: 'Ada',
      matrix_id: '@ada:x.org',
      pk: formatPublicKey(pair.exported),
    });
    const sig = await signCard(params, pair);
    params.set('sig', sig);
    expect(await verifyCard(params, pair.exported, sig)).toBe(true);
    expect(parsePublicKey(params.get('pk'))).toEqual(pair.exported);
  });

  it('rejects tampered cards and foreign keys', async () => {
    const pair = await generateHandshakeKeyPair();
    const other = await generateHandshakeKeyPair();
    const params = new URLSearchParams({ v: '1', fn: 'Ada', pk: formatPublicKey(pair.exported) });
    const sig = await signCard(params, pair);
    params.set('fn', 'Mallory');
    expect(await verifyCard(params, pair.exported, sig)).toBe(false);
    params.set('fn', 'Ada');
    expect(await verifyCard(params, other.exported, sig)).toBe(false);
    expect(await verifyCard(params, pair.exported, 'not-base64!')).toBe(false);
    expect(parsePublicKey('rsa:abc')).toBeNull();
  });

  it('canonicalises independently of parameter order and excludes sig', () => {
    const a = new URLSearchParams('b=2&a=1&sig=zzz');
    const b = new URLSearchParams('a=1&b=2');
    expect(canonicalCardString(a)).toBe('a=1&b=2');
    expect(canonicalCardString(a)).toBe(canonicalCardString(b));
  });

  it('renders a deterministic mirrored identicon from the fingerprint', async () => {
    const pair = await generateHandshakeKeyPair();
    const fp = await keyFingerprint(pair.exported);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(shortFingerprint(fp)).toMatch(/^[0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4}$/);
    const svg = identiconSvg(fp, 50);
    expect(svg).toBe(identiconSvg(fp, 50));
    expect(svg).toContain('<svg');
    expect(svg).toContain('aria-label="Key badge');
    // Mirrored: every rect at column 0 has a twin at column 4.
    const xs = [...svg.matchAll(/<rect x="(\d+)"/g)].map((m) => Number(m[1]));
    const left = xs.filter((x) => x === 0).length;
    const right = xs.filter((x) => x === 40).length;
    expect(left).toBe(right);
    expect(identiconSvg('00'.repeat(32))).not.toBe(identiconSvg('ff'.repeat(32)));
  });
});
