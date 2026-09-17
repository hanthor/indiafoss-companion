import { describe, expect, it } from 'vitest';
import { generateHandshakeKeyPair } from './handshake.js';
import { DEFAULT_ATTENDEE_SHARE_SELECTION } from './contact.js';
import { parseVCard } from './scan.js';
import {
  canonicalVCardBody,
  cardFreshnessOf,
  signedAttendeeVCard,
  VCARD_ISSUED_FIELD,
  VCARD_KEY_FIELD,
  VCARD_NONCE_FIELD,
  VCARD_SIG_FIELD,
  verifyVCardSignature,
} from './signed-vcard.js';

const profile = {
  fullName: 'Asha Rao',
  organization: 'FOSS United',
  matrixId: '@asha:example.org',
  socials: { github: 'https://github.com/asha' },
};
const selection = {
  ...DEFAULT_ATTENDEE_SHARE_SELECTION,
  matrixId: true,
  socials: { github: true },
};

describe('signedAttendeeVCard', () => {
  it('produces a plain vCard any camera app can read, plus key and signature', async () => {
    const pair = await generateHandshakeKeyPair();
    const vcard = await signedAttendeeVCard(profile, selection, pair);
    expect(vcard.startsWith('BEGIN:VCARD\r\nVERSION:3.0')).toBe(true);
    expect(vcard.trimEnd().endsWith('END:VCARD')).toBe(true);
    expect(vcard).toContain('FN:Asha Rao');
    expect(vcard).toContain(`${VCARD_KEY_FIELD}:`);
    expect(vcard).toContain(`${VCARD_SIG_FIELD}:`);
    // The standard fields still parse for the companion's own scanner.
    expect(parseVCard(vcard)?.fullName).toBe('Asha Rao');
    expect(parseVCard(vcard)?.matrixId).toBe('@asha:example.org');
  });

  it('verifies its own signature', async () => {
    const pair = await generateHandshakeKeyPair();
    const vcard = await signedAttendeeVCard(profile, selection, pair);
    await expect(verifyVCardSignature(vcard)).resolves.toMatchObject({ signature: 'valid' });
  });

  it('reports a card altered after signing as invalid', async () => {
    const pair = await generateHandshakeKeyPair();
    const vcard = await signedAttendeeVCard(profile, selection, pair);
    const tampered = vcard.replace('FN:Asha Rao', 'FN:Mallory');
    await expect(verifyVCardSignature(tampered)).resolves.toMatchObject({ signature: 'invalid' });
  });

  it('treats a card from any other app as unsigned, not broken', async () => {
    const plain = await signedAttendeeVCard(profile, selection, null);
    expect(plain).not.toContain(VCARD_SIG_FIELD);
    await expect(verifyVCardSignature(plain)).resolves.toEqual({
      signature: 'unsigned',
      publicKey: null,
    });
  });

  it('signs the key line too, so a swapped key does not verify', async () => {
    const pair = await generateHandshakeKeyPair();
    const other = await generateHandshakeKeyPair();
    const vcard = await signedAttendeeVCard(profile, selection, pair);
    const swapped = vcard.replace(
      new RegExp(`${VCARD_KEY_FIELD}:[^\\r\\n]+`),
      `${VCARD_KEY_FIELD}:${other.exported.alg}:${other.exported.key}`,
    );
    await expect(verifyVCardSignature(swapped)).resolves.toMatchObject({ signature: 'invalid' });
  });

  it('excludes only the signature line from the signed body', () => {
    const body = canonicalVCardBody(
      `BEGIN:VCARD\r\nFN:Asha Rao\r\n${VCARD_SIG_FIELD}:abc\r\nEND:VCARD\r\n`,
    );
    expect(body).toBe('BEGIN:VCARD\r\nFN:Asha Rao\r\nEND:VCARD');
  });

  it('dates every signed rendering and gives each a fresh nonce', async () => {
    const pair = await generateHandshakeKeyPair();
    const first = await signedAttendeeVCard(profile, selection, pair);
    const second = await signedAttendeeVCard(profile, selection, pair);
    expect(first).toContain(`${VCARD_ISSUED_FIELD}:`);
    expect(first).toContain(`${VCARD_NONCE_FIELD}:`);
    const a = await verifyVCardSignature(first);
    const b = await verifyVCardSignature(second);
    expect(a.signature).toBe('valid');
    expect(a.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(a.nonce).not.toBe(b.nonce);
    // Camera apps still read the plain fields.
    expect(parseVCard(first)?.fullName).toBe('Asha Rao');
  });

  it('keeps the issue time under the signature so a replay cannot re-date itself', async () => {
    const pair = await generateHandshakeKeyPair();
    const vcard = await signedAttendeeVCard(profile, selection, pair, {
      issuedAt: '2026-09-17T09:00:00.000Z',
    });
    const redated = vcard.replace('2026-09-17T09:00:00.000Z', new Date().toISOString());
    await expect(verifyVCardSignature(redated)).resolves.toMatchObject({ signature: 'invalid' });
  });

  it('leaves unsigned cards undated', async () => {
    const plain = await signedAttendeeVCard(profile, selection, null);
    expect(plain).not.toContain(VCARD_ISSUED_FIELD);
    expect(plain).not.toContain(VCARD_NONCE_FIELD);
  });
});

describe('cardFreshnessOf', () => {
  const now = Date.parse('2026-09-17T10:00:00Z');
  it('calls a valid card fresh within the hour and stale after it', () => {
    expect(cardFreshnessOf({ signature: 'valid', issuedAt: '2026-09-17T09:30:00Z' }, now)).toBe(
      'fresh',
    );
    expect(cardFreshnessOf({ signature: 'valid', issuedAt: '2026-09-17T08:59:00Z' }, now)).toBe(
      'stale',
    );
    expect(cardFreshnessOf({ signature: 'valid', issuedAt: '2026-09-16T10:00:00Z' }, now)).toBe(
      'stale',
    );
  });

  it('never reads a date off an unsigned or tampered card', () => {
    expect(cardFreshnessOf({ signature: 'unsigned', issuedAt: '2026-09-17T09:59:00Z' }, now)).toBe(
      'unknown',
    );
    expect(cardFreshnessOf({ signature: 'invalid', issuedAt: '2026-09-17T09:59:00Z' }, now)).toBe(
      'unknown',
    );
    expect(cardFreshnessOf({ signature: 'valid' }, now)).toBe('unknown');
    expect(cardFreshnessOf({ signature: 'valid', issuedAt: 'yesterday' }, now)).toBe('unknown');
  });

  it('tolerates a few minutes of clock skew, not a card from the future', () => {
    expect(cardFreshnessOf({ signature: 'valid', issuedAt: '2026-09-17T10:05:00Z' }, now)).toBe(
      'fresh',
    );
    expect(cardFreshnessOf({ signature: 'valid', issuedAt: '2026-09-17T11:00:00Z' }, now)).toBe(
      'unknown',
    );
  });
});
