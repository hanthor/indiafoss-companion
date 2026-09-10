import { describe, expect, it } from 'vitest';
import type { ContactRecord } from '@indiafoss/storage';
import { loadContactTrustFixtures, loadIdentityEnvelopeFixtures } from '@indiafoss/test-fixtures';
import { parseVCard } from '@indiafoss/model';
import {
  asReceivedRecord,
  chatLabel,
  confirmedInPerson,
  deriveContactTrust,
  inPersonLabel,
  NO_ROUTE_LABEL,
  profileLabel,
  signatureLabel,
  withoutInPersonConfirmation,
} from './contact-trust';

const FP = 'ab'.repeat(32);

function contact(extra: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: 'c1',
    vcard: '',
    fullName: 'Asha',
    socials: {},
    verified: false,
    savedAt: '2026-09-19T10:00:00.000Z',
    ...extra,
  };
}

describe('deriveContactTrust against the shared fixture table', () => {
  const table = loadContactTrustFixtures();
  for (const c of table.cases) {
    it(`${c.name}: ${c.describes}`, () => {
      const record = { id: c.name, vcard: '', savedAt: '2026-09-19T10:00:00Z', ...c.record };
      const trust = deriveContactTrust(record as ContactRecord);
      expect({
        signature: trust.signature,
        account: trust.account,
        binding: trust.binding,
        contradiction: trust.contradiction,
        profile: trust.profile,
        inPerson: trust.inPerson,
        chat: trust.chat,
        routes: trust.routes.map((r) => r.kind),
      }).toEqual(c.expect);
    });
  }
});

describe('chat routes against the identity envelope table (#160)', () => {
  const table = loadIdentityEnvelopeFixtures();
  for (const c of table.cases) {
    it(`${c.name}: ${c.describes}`, () => {
      const profile = parseVCard(c.vcard.join('\r\n'))!;
      const trust = deriveContactTrust(
        contact({
          matrixId: profile.matrixId,
          neutrinoServerName: profile.neutrinoServerName,
          identity: profile.identity,
        }),
      );
      expect(trust.routes.map((r) => r.kind)).toEqual(c.expect.routes);
      // A retained identity is a claim that cannot be checked: the neutral
      // state, never "no claim" and never a mismatch.
      if (Object.keys(c.expect.retained).length > 0 && c.expect.routes.length < 2) {
        expect(trust.profile).toBe('outdated');
        expect(trust.contradiction).toBe(false);
        expect(trust.account).toBe('claimed');
      }
    });
  }

  it('never mints a mesh route from a record whose mesh field is not a node id', () => {
    const t = deriveContactTrust(contact({ neutrinoServerName: 'converged:asha' }));
    expect(t.routes).toEqual([]);
  });

  it('words the unread state neutrally, without accusing the card', () => {
    expect(profileLabel('outdated')).toBe("Identity format this app can't read yet");
    expect(profileLabel('outdated')).not.toMatch(/mismatch|does not match|invalid/i);
  });
});

describe('the states are independent facts, not one badge', () => {
  it('a valid signature does not confirm the person or the accounts', () => {
    const t = deriveContactTrust(
      contact({ signature: 'valid', fingerprint: FP, matrixId: '@asha:example.org' }),
    );
    expect(t.signature).toBe('valid');
    expect(t.account).toBe('claimed');
    expect(t.inPerson).toBe('unconfirmed');
    expect(t.chat).toBe('not-verified');
  });

  it('a stored verified flag from a tampered record is the only way to reach "Verified in Chat"', () => {
    // Nothing in the app sets `verified`; imports reset it. The branch exists
    // for #188 and is asserted here so its wording is pinned, not reachable.
    expect(chatLabel('verified')).toBe('Verified in Chat');
    expect(chatLabel('not-verified')).toBe('Not verified in Chat');
    expect(deriveContactTrust(contact()).chat).toBe('not-verified');
  });

  it('no label for a profile observation contains the word verified', () => {
    for (const state of [
      'no-claim',
      'unchecked',
      'profile-matched',
      'mismatch',
      'unlinked',
      'outdated',
    ] as const) {
      expect(profileLabel(state)).not.toMatch(/verified/i);
    }
    for (const state of ['valid', 'invalid', 'unsigned', 'key-changed'] as const) {
      expect(signatureLabel(state, FP)).not.toMatch(/verified/i);
    }
    for (const state of [
      'confirmed',
      'confirmed-earlier-key',
      'unconfirmed',
      'no-badge',
    ] as const) {
      expect(inPersonLabel(state)).not.toMatch(/verified/i);
    }
  });

  it('spells the chat routes and the missing-route fallback honestly', () => {
    const both = deriveContactTrust(
      contact({ matrixId: '@asha:example.org', neutrinoServerName: FP }),
    );
    expect(both.routes.map((r) => r.label)).toEqual(['Message on mesh', 'Open in a Matrix app']);
    for (const r of both.routes) expect(r.caveat).toMatch(/cannot tell/);
    expect(deriveContactTrust(contact()).routes).toEqual([]);
    expect(NO_ROUTE_LABEL).toBe('No known chat route');
    // A malformed id yields no route rather than a dead one.
    expect(deriveContactTrust(contact({ matrixId: 'not an id' })).routes).toEqual([]);
  });
});

describe('in-person confirmation is the attendee’s statement about the card key', () => {
  it('binds to the fingerprint it was made for', () => {
    const confirmed = confirmedInPerson(
      contact({ signature: 'valid', fingerprint: FP }),
      '2026-09-19T11:00:00Z',
    );
    expect(deriveContactTrust(confirmed).inPerson).toBe('confirmed');
    const rekeyed = { ...confirmed, fingerprint: 'cd'.repeat(32) };
    expect(deriveContactTrust(rekeyed).inPerson).toBe('confirmed-earlier-key');
    expect(deriveContactTrust(withoutInPersonConfirmation(confirmed)).inPerson).toBe('unconfirmed');
  });

  it('cannot be made for a card without a badge', () => {
    const c = contact();
    expect(confirmedInPerson(c, '2026-09-19T11:00:00Z')).toBe(c);
  });

  it('does not touch the account or chat lines', () => {
    const confirmed = confirmedInPerson(
      contact({ signature: 'valid', fingerprint: FP, matrixId: '@asha:example.org' }),
      '2026-09-19T11:00:00Z',
    );
    const t = deriveContactTrust(confirmed);
    expect(t.account).toBe('claimed');
    expect(t.chat).toBe('not-verified');
    expect(confirmed.verified).toBe(false);
  });
});

describe('asReceivedRecord: nothing on the wire asserts its own trust (C-10 step 4)', () => {
  it('resets every trust field however the record arrived', () => {
    const wire = contact({
      verified: true,
      accountTrust: 'verified',
      meshLink: { state: 'profile-matched', checkedAt: 1 },
      inPersonConfirmed: { fingerprint: FP, at: '2026-09-19T11:00:00Z' },
      fingerprint: FP,
      signature: 'valid',
    });
    const received = asReceivedRecord(wire);
    expect(received.verified).toBe(false);
    expect(received.accountTrust).toBe('claimed');
    expect(received.meshLink).toBeUndefined();
    expect(received.inPersonConfirmed).toBeUndefined();
    // The signature check is this device's own observation and survives.
    expect(received.signature).toBe('valid');
    expect(received.fingerprint).toBe(FP);
    const t = deriveContactTrust(received);
    expect(t.account).toBe('claimed');
    expect(t.inPerson).toBe('unconfirmed');
    expect(t.chat).toBe('not-verified');
  });
});
