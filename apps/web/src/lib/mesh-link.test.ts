import { describe, expect, it } from 'vitest';
import type { ContactRecord } from '@indiafoss/storage';
import {
  MESH_LINK_TTL_MS,
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
      meshLinkStale(contact({ meshLink: { state: 'verified', checkedAt: now - 1000 } }), now),
    ).toBe(false);
    expect(
      meshLinkStale(
        contact({ meshLink: { state: 'verified', checkedAt: now - MESH_LINK_TTL_MS - 1 } }),
        now,
      ),
    ).toBe(true);
  });
});
