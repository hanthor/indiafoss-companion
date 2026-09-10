import { describe, expect, it } from 'vitest';
import { loadIdentityEnvelopeFixtures } from '@indiafoss/test-fixtures';
import { attendeeProfileToVCard, DEFAULT_ATTENDEE_SHARE_SELECTION } from './contact.js';
import { contactBookToJson, contactBookToVCards, parseContactBook } from './contact-book.js';
import type { ContactBookEntry } from './contact-book.js';
import { decodeFriendPayload, encodeFriendPayload } from './friend.js';
import {
  classifyMeshIdentity,
  IDENTITY_VERSION,
  identityCompatibility,
  isCanonicalNodeId,
  isNeutrinoServerName,
  mergeIdentity,
  readIdentity,
  withIdentityEnvelope,
} from './identity.js';
import { isMeshServerName, isServerName } from './messaging.js';
import { isHex64 } from './contracts/common.js';
import { parseScannedPayload, parseVCard } from './scan.js';

const NODE = '845aa456078572639c1543694de69e0a03fb883bd9c1dab1a2f6df811b75897e';
const OTHER = 'b'.repeat(64);

describe('the identity envelope against the shared fixture table (#160)', () => {
  const table = loadIdentityEnvelopeFixtures();
  expect(table.version).toBe(IDENTITY_VERSION);

  for (const c of table.cases) {
    it(`vCard · ${c.name}: ${c.describes}`, () => {
      const profile = parseVCard(c.vcard.join('\r\n') + '\r\n');
      expect(profile).not.toBeNull();
      expect(profile!.neutrinoServerName ?? null).toBe(c.expect.meshNodeId);
      expect(profile!.matrixId ?? null).toBe(c.expect.matrixId);
      expect(profile!.identity?.retained ?? {}).toEqual(c.expect.retained);
      if (c.expect.meshNodeId || c.expect.matrixId || Object.keys(c.expect.retained).length) {
        expect(profile!.identity?.version).toBe(c.expect.version);
      }
      // The scanner classifies it as a contact either way: an identity this
      // build cannot read is still somebody the attendee met.
      expect(parseScannedPayload(c.vcard.join('\r\n')).kind).toBe('contact');
    });

    if (c.friend) {
      it(`friend link · ${c.name}: ${c.describes}`, () => {
        const friend = decodeFriendPayload(c.friend!);
        expect(friend).not.toBeNull();
        expect(friend!.neutrinoServerName ?? null).toBe(c.expect.meshNodeId);
        expect(friend!.matrixId ?? null).toBe(c.expect.matrixId);
        expect(friend!.identity?.retained ?? {}).toEqual(c.expect.retained);
        // Re-encoding a card carries every identity field back out as it
        // arrived, under the version it declared, and decodes to the same thing.
        const again = decodeFriendPayload(encodeFriendPayload(friend!));
        expect(again).toEqual(friend);
      });
    }
  }
});

describe('readIdentity is the one decision', () => {
  it('reads an unversioned card as v1 and an explicit 1 the same way', () => {
    expect(identityCompatibility(undefined)).toBe('legacy');
    expect(identityCompatibility('')).toBe('legacy');
    expect(identityCompatibility('1')).toBe('supported');
    expect(identityCompatibility(1)).toBe('supported');
    expect(identityCompatibility('2')).toBe('forward');
    expect(identityCompatibility(7)).toBe('forward');
    expect(identityCompatibility('0')).toBe('malformed');
    expect(identityCompatibility('v1')).toBe('malformed');
    expect(identityCompatibility('1.5')).toBe('malformed');
    expect(readIdentity({ mesh: NODE.toUpperCase() })).toEqual({
      version: 1,
      understood: true,
      meshNodeId: NODE,
    });
    expect(readIdentity({ version: '1', mesh: NODE })).toEqual(readIdentity({ mesh: NODE }));
  });

  it('keeps previously retained fields across readers', () => {
    const first = readIdentity({ version: '3', mesh: 'x', matrix: '@a:b' });
    const second = readIdentity({ version: '1', mesh: NODE, retained: first.retained });
    expect(second.meshNodeId).toBe(NODE);
    expect(second.retained).toEqual({ version: '3', mesh: 'x', matrix: '@a:b' });
  });

  it('is the predicate every other copy delegates to', () => {
    for (const value of [NODE, NODE.toUpperCase(), OTHER]) {
      expect(isNeutrinoServerName(value)).toBe(true);
    }
    expect(isNeutrinoServerName(NODE.slice(1))).toBe(false);
    expect(isNeutrinoServerName(`${NODE}0`)).toBe(false);
    expect(isNeutrinoServerName('node.example')).toBe(false);
    // The lowercase form is what deployment config and contracts require.
    expect(isCanonicalNodeId(NODE)).toBe(true);
    expect(isCanonicalNodeId(NODE.toUpperCase())).toBe(false);
    expect(isMeshServerName(NODE)).toBe(true);
    expect(isMeshServerName(NODE.toUpperCase())).toBe(false);
    expect(isServerName(NODE)).toBe(true);
    expect(isHex64(NODE)).toBe(true);
    expect(isHex64(NODE.toUpperCase())).toBe(false);
    expect(classifyMeshIdentity(' ' + NODE.toUpperCase() + ' ')).toEqual({
      kind: 'node-id',
      nodeId: NODE,
    });
    expect(classifyMeshIdentity('something-new')).toEqual({
      kind: 'unknown',
      raw: 'something-new',
    });
    expect(classifyMeshIdentity('')).toBeNull();
  });

  it('keeps two well-formed but different node ids distinct', () => {
    const a = classifyMeshIdentity(NODE);
    const b = classifyMeshIdentity(OTHER);
    expect(a?.kind).toBe('node-id');
    expect(b?.kind).toBe('node-id');
    expect(a).not.toEqual(b);
  });
});

describe('records and exports', () => {
  const entry = (over: Partial<ContactBookEntry>): ContactBookEntry => ({
    id: 'c1',
    vcard: '',
    fullName: 'Asha',
    socials: {},
    verified: false,
    savedAt: '2026-09-19T10:00:00.000Z',
    ...over,
  });

  it('reads a stored record from before versioning as v1 and demotes an unread shape', () => {
    const legacy = withIdentityEnvelope(entry({ neutrinoServerName: NODE, matrixId: '@a:b' }));
    expect(legacy.identity).toEqual({ version: 1 });
    expect(legacy.neutrinoServerName).toBe(NODE);
    const odd = withIdentityEnvelope(entry({ neutrinoServerName: 'new-shape', matrixId: '@a:b' }));
    expect(odd.neutrinoServerName).toBeUndefined();
    expect(odd.matrixId).toBe('@a:b');
    expect(odd.identity).toEqual({ version: 1, retained: { mesh: 'new-shape' } });
    // Idempotent: reading twice is reading once.
    expect(withIdentityEnvelope(odd)).toEqual(odd);
  });

  it('never lets an unread identity overwrite a known one, and never loses it either', () => {
    const saved = entry({ neutrinoServerName: NODE, matrixId: '@asha:example.org' });
    const future = entry({
      identity: { version: 2, retained: { version: '2', mesh: 'converged:asha', matrix: '@x:y' } },
    });
    const merged = mergeIdentity(saved, { ...saved, ...future });
    expect(merged.neutrinoServerName).toBe(NODE);
    expect(merged.matrixId).toBe('@asha:example.org');
    expect(merged.identity).toEqual({
      version: 1,
      retained: { version: '2', mesh: 'converged:asha', matrix: '@x:y' },
    });
    // A card this build does read replaces the saved identity as before.
    const rescan = entry({ neutrinoServerName: OTHER, matrixId: '@asha:example.org' });
    expect(mergeIdentity(saved, { ...saved, ...rescan }).neutrinoServerName).toBe(OTHER);
    // A readable card that simply omits the mesh field clears it, as it did
    // before: the owner switched sharing off, and nothing was set aside.
    const withoutMesh = {
      ...saved,
      ...entry({ matrixId: '@asha:example.org' }),
      neutrinoServerName: undefined,
    };
    expect(mergeIdentity(saved, withoutMesh).neutrinoServerName).toBeUndefined();
  });

  it('round-trips a JSON export byte-stably, including a future-version entry', () => {
    const contacts = [
      withIdentityEnvelope(entry({ id: 'a', neutrinoServerName: NODE, matrixId: '@a:b' })),
      withIdentityEnvelope(
        entry({
          id: 'b',
          fullName: 'Future',
          identity: { version: 2, retained: { version: '2', mesh: 'converged:b' } },
        }),
      ),
    ];
    const json = contactBookToJson(contacts, '2026-09-20T18:00:00.000Z');
    const imported = parseContactBook(json, '2026-09-21T00:00:00.000Z', () => 'new')!;
    expect(imported.entries).toEqual(contacts);
    expect(contactBookToJson(imported.entries, '2026-09-20T18:00:00.000Z')).toBe(json);
  });

  it('demotes an unread identity in an imported JSON file rather than routing on it', () => {
    const json = contactBookToJson(
      [
        entry({ id: 'a', neutrinoServerName: 'converged:asha', matrixId: '@a:b' }),
        entry({ id: 'b', neutrinoServerName: NODE, identity: { version: 2 } }),
      ],
      '2026-09-20T18:00:00.000Z',
    );
    const imported = parseContactBook(json, '2026-09-21T00:00:00.000Z', () => 'new')!;
    expect(imported.entries[0]!.neutrinoServerName).toBeUndefined();
    expect(imported.entries[0]!.matrixId).toBe('@a:b');
    expect(imported.entries[0]!.identity).toEqual({
      version: 1,
      retained: { mesh: 'converged:asha' },
    });
    expect(imported.entries[1]!.neutrinoServerName).toBeUndefined();
    expect(imported.entries[1]!.identity).toEqual({
      version: 2,
      retained: { version: '2', mesh: NODE },
    });
  });

  it('exports a saved vCard byte-for-byte whatever its identity version', () => {
    const table = loadIdentityEnvelopeFixtures();
    for (const c of table.cases) {
      const vcard = c.vcard.join('\r\n') + '\r\n';
      const profile = parseVCard(vcard)!;
      const record = entry({ vcard, identity: profile.identity });
      expect(contactBookToVCards([record])).toBe(vcard);
    }
  });

  it('writes the identity version beside the identity fields, and re-emits an unread one as it came', () => {
    const card = attendeeProfileToVCard(
      { fullName: 'Asha', matrixId: '@asha:example.org', neutrinoServerName: NODE, socials: {} },
      DEFAULT_ATTENDEE_SHARE_SELECTION,
    );
    expect(card).toContain(`X-INDIAFOSS-MESH:${NODE}\r\nX-INDIAFOSS-IDENTITY-VERSION:1\r\n`);
    const none = attendeeProfileToVCard({ fullName: 'Asha', socials: {} });
    expect(none).not.toContain('X-INDIAFOSS-IDENTITY-VERSION');

    const future = attendeeProfileToVCard(
      {
        fullName: 'Asha',
        socials: {},
        identity: { version: 2, retained: { version: '2', mesh: 'converged:asha' } },
      },
      DEFAULT_ATTENDEE_SHARE_SELECTION,
    );
    expect(future).toContain(
      'X-INDIAFOSS-MESH:converged:asha\r\nX-INDIAFOSS-IDENTITY-VERSION:2\r\n',
    );
    const back = parseVCard(future)!;
    expect(back.neutrinoServerName).toBeUndefined();
    expect(back.identity).toEqual({
      version: 2,
      retained: { version: '2', mesh: 'converged:asha' },
    });

    // A v1 mesh value of an unread shape travels back out under v1 beside a
    // readable Matrix id, and reads the same way again.
    const mixed = attendeeProfileToVCard(
      {
        fullName: 'Asha',
        matrixId: '@asha:example.org',
        socials: {},
        identity: { version: 1, retained: { mesh: 'node.something-new.example' } },
      },
      DEFAULT_ATTENDEE_SHARE_SELECTION,
    );
    expect(mixed).toContain(
      'X-INDIAFOSS-MATRIX:@asha:example.org\r\nIMPP:matrix:@asha:example.org\r\nX-INDIAFOSS-MESH:node.something-new.example\r\nX-INDIAFOSS-IDENTITY-VERSION:1\r\n',
    );
    expect(parseVCard(mixed)!.identity).toEqual({
      version: 1,
      retained: { mesh: 'node.something-new.example' },
    });

    // A readable v1 identity beside a foreign-version copy: the vCard carries
    // the readable one; the foreign copy is the JSON export's to keep.
    const both = attendeeProfileToVCard(
      {
        fullName: 'Asha',
        neutrinoServerName: NODE,
        socials: {},
        identity: { version: 1, retained: { version: '2', mesh: 'converged:asha' } },
      },
      DEFAULT_ATTENDEE_SHARE_SELECTION,
    );
    expect(both).toContain(`X-INDIAFOSS-MESH:${NODE}\r\nX-INDIAFOSS-IDENTITY-VERSION:1\r\n`);
    expect(both).not.toContain('converged:asha');
  });
});
