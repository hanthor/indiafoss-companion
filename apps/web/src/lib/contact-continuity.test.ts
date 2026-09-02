import { describe, expect, it } from 'vitest';
import type { ContactRecord } from '@indiafoss/storage';
import { reconcileContact } from './contact-continuity';

const base = (over: Partial<ContactRecord>): ContactRecord => ({
  id: over.id ?? 'id-' + Math.random().toString(36).slice(2),
  vcard: '',
  fullName: 'Asha Rao',
  socials: {},
  verified: false,
  savedAt: '2026-09-19T10:00:00.000Z',
  ...over,
});

describe('reconcileContact', () => {
  it('saves an unknown card as a new contact with a meeting count', () => {
    const r = reconcileContact(base({ fingerprint: 'aaa' }), []);
    expect(r.outcome).toBe('new');
    expect(r.contact.metCount).toBe(1);
  });

  it('updates the same fingerprint in place and keeps the first meeting context', () => {
    const saved = base({
      id: 'c1',
      fingerprint: 'aaa',
      metActivityId: 'act-1',
      metCount: 1,
      savedAt: '2026-09-19T09:00:00.000Z',
      verified: true,
    });
    const draft = base({
      fingerprint: 'aaa',
      organization: 'FOSS United',
      metActivityId: 'act-2',
      savedAt: '2026-09-20T11:00:00.000Z',
    });
    const r = reconcileContact(draft, [saved]);
    expect(r.outcome).toBe('updated');
    expect(r.contact.id).toBe('c1');
    expect(r.contact.organization).toBe('FOSS United');
    expect(r.contact.metActivityId).toBe('act-1');
    expect(r.contact.metCount).toBe(2);
    expect(r.contact.verified).toBe(true);
    expect(r.contact.lastMetAt).toBe('2026-09-20T11:00:00.000Z');
  });

  it('flags a different key for the same person instead of replacing it', () => {
    const saved = base({ id: 'c1', fingerprint: 'aaa', matrixId: '@asha:example.org' });
    const draft = base({ fingerprint: 'bbb', matrixId: '@asha:example.org' });
    const r = reconcileContact(draft, [saved]);
    expect(r.outcome).toBe('key-changed');
    expect(r.contact.id).not.toBe('c1');
    expect(r.contact.keyChanged).toBe(true);
    expect(r.contact.previousFingerprint).toBe('aaa');
    expect(r.previous?.id).toBe('c1');
  });

  it('matches by name when no identifiers are shared and adopts a key from an unsigned save', () => {
    const saved = base({ id: 'c1', metCount: 3 });
    const draft = base({ fingerprint: 'ccc', signature: 'valid' });
    const r = reconcileContact(draft, [saved]);
    expect(r.outcome).toBe('updated');
    expect(r.contact.id).toBe('c1');
    expect(r.contact.fingerprint).toBe('ccc');
    expect(r.contact.metCount).toBe(4);
  });

  it('does not merge unnamed cards by name', () => {
    const saved = base({ id: 'c1', fullName: 'Unnamed contact' });
    const r = reconcileContact(base({ fullName: 'Unnamed contact' }), [saved]);
    expect(r.outcome).toBe('new');
  });
});
