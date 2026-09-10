import { describe, expect, it } from 'vitest';
import type { ContactRecord } from '@indiafoss/storage';
import { loadIdentityBindingVectors } from '@indiafoss/test-fixtures';
import type { IdentityBindingVector } from '@indiafoss/test-fixtures';
import {
  bindingCheckStale,
  bindingTrustOf,
  checkContactBinding,
  noMatrixKeys,
  BINDING_CHECK_TTL_MS,
} from './binding';
import type { MatrixKeySource } from './binding';
import { asReceivedRecord, bindingLabel, deriveContactTrust } from './contact-trust';

/**
 * The binding on a saved contact (#188): the shared vectors driven through
 * the contact record, so the account line reads `binding-valid` only when
 * both signatures check against keys the app holds, and never `verified`.
 */

const table = loadIdentityBindingVectors();
const vector = (name: string): IdentityBindingVector => table.cases.find((c) => c.name === name)!;
const NOW = () => Date.parse('2026-09-11T12:00:00.000Z');

function contactWith(v: IdentityBindingVector, extra: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: 'c1',
    vcard: '',
    fullName: 'Asha',
    socials: {},
    verified: false,
    savedAt: '2026-09-10T10:00:00.000Z',
    signature: 'valid',
    publicKey: v.cardKey,
    fingerprint: 'ab'.repeat(32),
    matrixId: v.expected.matrixUserId,
    neutrinoServerName: v.expected.meshNodeId,
    binding: { signed: v.signed },
    ...extra,
  };
}

/** A key source that hands back exactly the vector's key: what a `/keys/query` cache would do. */
function keysFrom(v: IdentityBindingVector): MatrixKeySource {
  return async (userId, keyId) =>
    v.matrixKey && userId === v.expected.matrixUserId && keyId === v.matrixKey.id
      ? v.matrixKey
      : null;
}

describe('checkContactBinding', () => {
  it('reaches binding-valid with a key from a source, and records where the key came from', async () => {
    const v = vector('valid-master-key');
    const checked = await checkContactBinding(contactWith(v), keysFrom(v), undefined, NOW);
    expect(checked.binding?.check?.state).toBe('valid');
    expect(checked.binding?.check?.matrixKeyProvenance).toBe('server');
    expect(checked.binding?.check?.matrixKeyKind).toBe('master');
    const trust = deriveContactTrust(checked);
    expect(trust.binding).toBe('valid');
    expect(trust.account).toBe('binding-valid');
    expect(trust.chat).toBe('not-verified');
    expect(checked.verified).toBe(false);
  });

  it('with the source this build ships, the card half is checked and the binding stays unchecked', async () => {
    const v = vector('valid-master-key');
    const checked = await checkContactBinding(contactWith(v), noMatrixKeys, undefined, NOW);
    expect(checked.binding?.check?.state).toBe('unverifiable');
    expect(checked.binding?.check?.reason).toBe('no Matrix key held');
    const trust = deriveContactTrust(checked);
    expect(trust.binding).toBe('unchecked');
    expect(trust.account).toBe('claimed');
  });

  it('a user-verified key provenance still stops at binding-valid: verified is Chat’s to say', async () => {
    const v = vector('valid-master-key-user-verified');
    const checked = await checkContactBinding(contactWith(v), keysFrom(v), undefined, NOW);
    expect(checked.binding?.check?.matrixKeyProvenance).toBe('user-verified');
    expect(deriveContactTrust(checked).account).toBe('binding-valid');
    expect(deriveContactTrust(checked).chat).toBe('not-verified');
  });

  it('a binding for somebody else’s account on this card is invalid, not a claim about them', async () => {
    const v = vector('someone-elses-mxid');
    const checked = await checkContactBinding(contactWith(v), keysFrom(v), undefined, NOW);
    expect(checked.binding?.check?.state).toBe('mismatch');
    expect(deriveContactTrust(checked).binding).toBe('invalid');
    expect(deriveContactTrust(checked).account).toBe('claimed');
  });

  it('a revocation the app knows beats a valid signature', async () => {
    const v = vector('valid-master-key');
    const checked = await checkContactBinding(
      contactWith(v),
      keysFrom(v),
      async () => [v.expected.meshNodeId, 'b-2026-09-10-asha'],
      NOW,
    );
    expect(checked.binding?.check?.state).toBe('revoked');
    expect(deriveContactTrust(checked).account).toBe('revoked');
  });

  it('a card whose own signature did not check has nothing to bind to', async () => {
    const v = vector('valid-master-key');
    for (const extra of [
      { signature: 'invalid' as const },
      { publicKey: undefined },
      { neutrinoServerName: undefined },
      { matrixId: undefined },
    ]) {
      const checked = await checkContactBinding(contactWith(v, extra), keysFrom(v), undefined, NOW);
      expect(checked.binding?.check?.state).toBe('unverifiable');
      expect(deriveContactTrust(checked).account).toBe('claimed');
    }
  });

  it('leaves a contact without a binding alone', async () => {
    const v = vector('valid-master-key');
    const plain = contactWith(v, { binding: undefined });
    expect(await checkContactBinding(plain, keysFrom(v), undefined, NOW)).toBe(plain);
    expect(deriveContactTrust(plain).binding).toBe('none');
  });

  it('agrees with every shared vector when driven through a contact record', async () => {
    for (const c of table.cases) {
      if (typeof c.signed !== 'object' || c.signed === null) continue;
      const checked = await checkContactBinding(
        contactWith(c),
        keysFrom(c),
        async () => c.revokedIds,
        () => Date.parse(c.now),
      );
      expect(checked.binding?.check?.state, c.name).toBe(c.expect.state);
      expect(deriveContactTrust(checked).account, c.name).toBe(c.expect.account);
    }
  });
});

describe('the binding line', () => {
  it('folds verifier states to what an attendee needs to tell apart', () => {
    const at = 1;
    const of = (state: string) =>
      bindingTrustOf({ signed: {}, check: { state: state as never, checkedAt: at } });
    expect(bindingTrustOf(undefined)).toBe('none');
    expect(bindingTrustOf({ signed: {} })).toBe('unchecked');
    expect(of('valid')).toBe('valid');
    expect(of('expired')).toBe('expired');
    expect(of('not-yet-valid')).toBe('expired');
    expect(of('revoked')).toBe('revoked');
    for (const s of ['invalid-signature', 'mismatch', 'wrong-domain', 'malformed']) {
      expect(of(s)).toBe('invalid');
    }
    expect(of('unknown-version')).toBe('unreadable');
    expect(of('unverifiable')).toBe('unchecked');
  });

  it('never says "verified" for any state', () => {
    for (const s of [
      'none',
      'valid',
      'expired',
      'revoked',
      'invalid',
      'unreadable',
      'unchecked',
    ] as const) {
      expect(bindingLabel(s)).not.toMatch(/verified/i);
    }
    expect(bindingLabel('valid')).toContain('not confirmed in Chat');
  });

  it('is re-asked when unchecked, unverifiable, unreadable or old', () => {
    const now = 1_000_000_000_000;
    const v = vector('valid-master-key');
    expect(bindingCheckStale(contactWith(v, { binding: undefined }), now)).toBe(false);
    expect(bindingCheckStale(contactWith(v), now)).toBe(true);
    const with_ = (state: string, checkedAt = now) =>
      contactWith(v, {
        binding: { signed: v.signed, check: { state: state as never, checkedAt } },
      });
    expect(bindingCheckStale(with_('unverifiable'), now)).toBe(true);
    expect(bindingCheckStale(with_('unknown-version'), now)).toBe(true);
    expect(bindingCheckStale(with_('valid'), now)).toBe(false);
    expect(bindingCheckStale(with_('valid', now - BINDING_CHECK_TTL_MS - 1), now)).toBe(true);
  });
});

describe('a binding verdict never arrives from the wire', () => {
  it('asReceivedRecord keeps the signed statement and drops the check', async () => {
    const v = vector('valid-master-key');
    const smuggled = contactWith(v, {
      accountTrust: 'verified',
      binding: {
        signed: v.signed,
        check: { state: 'valid', checkedAt: 1, matrixKeyProvenance: 'user-verified' },
      },
    });
    const received = asReceivedRecord(smuggled);
    expect(received.binding).toEqual({ signed: v.signed });
    expect(received.accountTrust).toBe('claimed');
    expect(deriveContactTrust(received).account).toBe('claimed');
    expect(deriveContactTrust(received).binding).toBe('unchecked');
  });
});
