import { describe, expect, it } from 'vitest';
import type { ContactRecord } from '@indiafoss/storage';
import {
  MESH_LINK_TTL_MS,
  accountTrustOf,
  claimsMeshLink,
  contactForMeshUser,
  meshLinkStale,
  meshServerOf,
} from './mesh-link';

const MESH = 'ab'.repeat(32);

function contact(extra: Partial<ContactRecord> = {}): ContactRecord {
  return {
    id: 'c1',
    vcard: '',
    fullName: 'Alice',
    socials: {},
    verified: false,
    savedAt: '2026-09-03T00:00:00Z',
    ...extra,
  };
}

describe('mesh link helpers', () => {
  it('maps a mesh user id to the contact that carries that node', () => {
    const contacts = [
      contact({ neutrinoServerName: MESH.toUpperCase(), matrixId: '@alice:example.org' }),
    ];
    expect(meshServerOf(`@n:${MESH}`)).toBe(MESH);
    expect(contactForMeshUser(contacts, `@n:${MESH}`)?.matrixId).toBe('@alice:example.org');
    expect(contactForMeshUser(contacts, '@n:' + 'cd'.repeat(32))).toBeUndefined();
    expect(contactForMeshUser(contacts, 'garbage')).toBeUndefined();
  });

  it('only cards with both ids claim a link', () => {
    expect(claimsMeshLink(contact({ matrixId: '@a:x', neutrinoServerName: MESH }))).toBe(true);
    expect(claimsMeshLink(contact({ matrixId: '@a:x' }))).toBe(false);
    expect(claimsMeshLink(contact({ neutrinoServerName: MESH }))).toBe(false);
  });

  it('re-checks unchecked, unreachable, and old links', () => {
    const now = 1_000_000_000_000;
    expect(meshLinkStale(contact(), now)).toBe(true);
    expect(
      meshLinkStale(contact({ meshLink: { state: 'unverifiable', checkedAt: now } }), now),
    ).toBe(true);
    expect(
      meshLinkStale(
        contact({ meshLink: { state: 'profile-matched', checkedAt: now - 1000 } }),
        now,
      ),
    ).toBe(false);
    expect(
      meshLinkStale(
        contact({ meshLink: { state: 'profile-matched', checkedAt: now - MESH_LINK_TTL_MS - 1 } }),
        now,
      ),
    ).toBe(true);
  });
});

describe('a card that predates a format change', () => {
  it('is asked again rather than left with the verdict', () => {
    // `outdated` says this build could not compare the two identities, not
    // that they disagree. A later build may recognise the new shape, so the
    // check is due again rather than settled (#160).
    const now = 1_000_000;
    expect(meshLinkStale(contact({ meshLink: { state: 'outdated', checkedAt: now } }), now)).toBe(
      true,
    );
  });
});

describe('accountTrustOf: what a profile observation is worth (C-10, #188)', () => {
  const at = 1;
  it('treats an unchecked, unreachable, unrecognised or unlinked profile as a bare claim', () => {
    expect(accountTrustOf(undefined)).toEqual({ trust: 'claimed', contradiction: false });
    for (const state of ['unverifiable', 'outdated', 'unlinked'] as const) {
      expect(accountTrustOf({ state, checkedAt: at })).toEqual({
        trust: 'claimed',
        contradiction: false,
      });
    }
  });

  it('maps a profile match to profile-matched and never to verified', () => {
    const conclusion = accountTrustOf({ state: 'profile-matched', checkedAt: at });
    expect(conclusion).toEqual({ trust: 'profile-matched', contradiction: false });
    expect(conclusion.trust).not.toBe('verified');
  });

  it('keeps a mismatch distinct: a claim, plus a contradiction flag', () => {
    expect(accountTrustOf({ state: 'mismatch', checkedAt: at })).toEqual({
      trust: 'claimed',
      contradiction: true,
    });
  });

  it('has no path to binding-valid or verified: those need #188', () => {
    const states = ['profile-matched', 'mismatch', 'unlinked', 'outdated', 'unverifiable'] as const;
    for (const state of states) {
      const { trust } = accountTrustOf({ state, checkedAt: at });
      expect(['claimed', 'profile-matched']).toContain(trust);
    }
  });
});
