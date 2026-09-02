import { describe, expect, it } from 'vitest';
import { attendeeProfileToVCard, DEFAULT_ATTENDEE_SHARE_SELECTION } from './contact.js';
import {
  decodeFriendPayload,
  encodeFriendPayload,
  encodeSignedFriendPayload,
  neutrinoMatrixId,
  verifyFriendPayload,
} from './friend.js';
import { generateHandshakeKeyPair } from './handshake.js';
import { parseScannedPayload, parseVCard } from './scan.js';
const classifyScannedPayload = parseScannedPayload;

const SERVER_NAME = 'a'.repeat(64);

describe('friend payload', () => {
  it('round-trips every selected field and lowercases the Neutrino identity', () => {
    const encoded = encodeFriendPayload({
      version: 1,
      eventId: 'indiafoss-2026',
      ticketRef: 'ticket::T123',
      fossUnitedProfileUrl: 'https://fossunited.org/u/james_reilly',
      matrixId: '@james:matrix.org',
      neutrinoServerName: SERVER_NAME.toUpperCase(),
      fullName: 'James, Reilly',
      organization: 'FOSS & Co',
      website: 'https://example.org',
      socials: { github: 'https://github.com/hanthor' },
    });
    expect(encoded.startsWith('indiafoss://friend?v=1&')).toBe(true);
    expect(decodeFriendPayload(encoded)).toEqual({
      version: 1,
      eventId: 'indiafoss-2026',
      ticketRef: 'ticket::T123',
      fossUnitedProfileUrl: 'https://fossunited.org/u/james_reilly',
      matrixId: '@james:matrix.org',
      neutrinoServerName: SERVER_NAME,
      fullName: 'James, Reilly',
      organization: 'FOSS & Co',
      website: 'https://example.org',
      socials: { github: 'https://github.com/hanthor' },
    });
  });

  it('drops malformed identities and unsafe urls instead of trusting them', () => {
    const decoded = decodeFriendPayload(
      'indiafoss://friend?v=1&matrix_id=alice&neutrino_server_name=zz&ticket_ref=T1&url=javascript:alert(1)&social_github=ftp://x',
    );
    expect(decoded).toEqual({ version: 1, socials: {} });
  });

  it('signs cards and detects tampering', async () => {
    const pair = await generateHandshakeKeyPair();
    const card = await encodeSignedFriendPayload(
      { version: 1, fullName: 'Ada', matrixId: '@ada:x.org', socials: {} },
      pair,
    );
    const ok = await verifyFriendPayload(card);
    expect(ok.signature).toBe('valid');
    expect(ok.payload.fullName).toBe('Ada');
    expect(ok.publicKey?.alg).toBe(pair.alg);
    const tampered = card.replace('fn=Ada', 'fn=Eve');
    expect((await verifyFriendPayload(tampered)).signature).toBe('invalid');
    const unsigned = encodeFriendPayload({ version: 1, fullName: 'Ada', socials: {} });
    expect((await verifyFriendPayload(unsigned)).signature).toBe('unsigned');
  });

  it('rejects unknown versions', () => {
    expect(decodeFriendPayload('indiafoss://friend?v=2&fn=x')).toBeNull();
  });

  it('derives the default Neutrino Matrix id', () => {
    expect(neutrinoMatrixId(SERVER_NAME.toUpperCase())).toBe(`@n:${SERVER_NAME}`);
  });
});

describe('classifyScannedPayload', () => {
  it('recognises vCards, friend payloads, matrix ids, links, locations and tickets', () => {
    const vcard = attendeeProfileToVCard(
      { fullName: 'Ada', socials: {}, matrixId: '@ada:x.org' },
      { ...DEFAULT_ATTENDEE_SHARE_SELECTION, matrixId: true },
    );
    expect(classifyScannedPayload(vcard)).toMatchObject({
      kind: 'contact',
      profile: { fullName: 'Ada', matrixId: '@ada:x.org' },
    });
    expect(classifyScannedPayload('indiafoss://friend?v=1&fn=Ada')).toMatchObject({
      kind: 'friend',
    });
    expect(classifyScannedPayload('@ada:x.org')).toEqual({
      kind: 'matrix-user',
      userId: '@ada:x.org',
    });
    expect(classifyScannedPayload('https://matrix.to/#/%23room%3Ax.org')).toEqual({
      kind: 'matrix-room',
      idOrAlias: '#room:x.org',
    });
    expect(classifyScannedPayload('matrix:u/ada:x.org?action=chat')).toEqual({
      kind: 'matrix-user',
      userId: '@ada:x.org',
    });
    expect(classifyScannedPayload('indiafoss://chat?dm=%40ada%3Ax.org')).toEqual({
      kind: 'matrix-user',
      userId: '@ada:x.org',
    });
    expect(classifyScannedPayload('indiafoss://location/audi-1')).toEqual({
      kind: 'location',
      locationId: 'audi-1',
    });
    expect(classifyScannedPayload('ABC123XY')).toEqual({
      kind: 'ticket',
      ticketRef: 'ticket::ABC123XY',
    });
  });

  it('rejects empty, oversized and unknown payloads', () => {
    expect(classifyScannedPayload('   ').kind).toBe('error');
    expect(classifyScannedPayload('x'.repeat(9000)).kind).toBe('error');
    expect(classifyScannedPayload('https://example.org/some/page').kind).toBe('error');
    expect(classifyScannedPayload('indiafoss://location/%E0%A4').kind).toBe('error');
  });
});

describe('parseVCard (scan.ts)', () => {
  it('unfolds lines, unescapes, honours escaped ; in N and reads Neutrino/ticket fields', () => {
    const text = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Doe\\;Jr;John;;;',
      'ORG:Navy;Research',
      'URL;TYPE=website:https://example.org/',
      ' long-folded-path',
      'IMPP:matrix:@grace:example.org',
      'X-NEUTRINO-SERVER-NAME:' + 'A'.repeat(64),
      'X-INDIAFOSS-TICKET-REF:ticket::T1',
      'X-SOCIALPROFILE;TYPE=github:https://github.com/grace',
      'END:VCARD',
    ].join('\r\n');
    expect(parseVCard(text)).toEqual({
      fullName: 'John Doe;Jr',
      organization: 'Navy;Research',
      website: 'https://example.org/long-folded-path',
      matrixId: '@grace:example.org',
      neutrinoServerName: 'a'.repeat(64),
      ticketRef: 'ticket::T1',
      socials: { github: 'https://github.com/grace' },
    });
    expect(parseVCard('hello')).toBeNull();
  });
});
