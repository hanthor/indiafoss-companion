import { describe, expect, it } from 'vitest';
import {
  collectMessagingIssues,
  conferenceChatAlias,
  homeserverName,
  isMatrixRoomAlias,
  isMatrixRoomId,
  isMatrixUserId,
  matrixUriFor,
  announcementsRoom,
} from './messaging.js';

describe('matrix identifier checks', () => {
  it('recognises aliases, user ids and room ids', () => {
    expect(isMatrixRoomAlias('#indiafoss:matrix.org')).toBe(true);
    expect(isMatrixRoomAlias('indiafoss:matrix.org')).toBe(false);
    expect(isMatrixUserId('@alice:example.org')).toBe(true);
    expect(isMatrixUserId('@alice')).toBe(false);
    expect(isMatrixRoomId('!abc123:example.org')).toBe(true);
    expect(isMatrixRoomId('#abc123:example.org')).toBe(false);
  });
});

describe('collectMessagingIssues', () => {
  it('accepts a well-formed config', () => {
    expect(
      collectMessagingIssues({
        homeserver: 'https://matrix.org',
        space: '#indiafoss-space:matrix.org',
        rooms: [{ alias: '#indiafoss:matrix.org', name: 'IndiaFOSS', recommended: true }],
      }),
    ).toEqual([]);
  });

  it('flags insecure homeservers, malformed aliases, duplicates and empty names', () => {
    const issues = collectMessagingIssues({
      homeserver: 'http://matrix.example',
      space: 'not-a-space',
      rooms: [
        { alias: 'indiafoss', name: 'Bad alias' },
        { alias: '#dup:matrix.org', name: 'One' },
        { alias: '#dup:matrix.org', name: '  ' },
      ],
    });
    expect(issues).toHaveLength(5);
    expect(issues.join('\n')).toMatch(/https/);
    expect(issues.join('\n')).toMatch(/duplicate/);
    expect(issues.join('\n')).toMatch(/empty name/);
  });

  it('accepts http loopback homeservers (localhost, 127.0.0.1, [::1])', () => {
    expect(collectMessagingIssues({ homeserver: 'http://localhost:8008', rooms: [] })).toEqual([]);
    expect(collectMessagingIssues({ homeserver: 'http://127.0.0.1:8008', rooms: [] })).toEqual([]);
    expect(collectMessagingIssues({ homeserver: 'http://[::1]:8008', rooms: [] })).toEqual([]);
  });

  it('rejects an unparsable homeserver url', () => {
    expect(collectMessagingIssues({ homeserver: 'matrix org', rooms: [] })).toEqual([
      'messaging.homeserver is not a valid URL: matrix org',
    ]);
  });
});

describe('conferenceChatAlias', () => {
  const config = { homeserver: 'https://matrix.org', rooms: [] };
  it('derives stable, alias-safe room aliases per session, booth and venue room', () => {
    expect(conferenceChatAlias(config, 'indiafoss-2026', 'session', 'act-C8AK0iov2l')).toBe(
      '#indiafoss-2026-session-act-c8ak0iov2l:matrix.org',
    );
    expect(conferenceChatAlias(config, 'indiafoss-2026', 'booth', 'KDE India!')).toBe(
      '#indiafoss-2026-booth-kde-india:matrix.org',
    );
    expect(
      conferenceChatAlias(
        { ...config, aliasPrefix: 'IF26', aliasServer: 'fossunited.org' },
        'x',
        'room',
        'audi-1',
      ),
    ).toBe('#if26-room-audi-1:fossunited.org');
    expect(isMatrixRoomAlias(conferenceChatAlias(config, 'e', 'session', 'a'))).toBe(true);
  });
  it('reads the server name from a homeserver url', () => {
    expect(homeserverName('https://matrix.org/')).toBe('matrix.org');
    expect(homeserverName('http://127.0.0.1:3000')).toBe('127.0.0.1:3000');
    expect(homeserverName('matrix.example')).toBe('matrix.example');
  });

  it('reports rooms that name an activity, location, booth or track the bundle lacks', () => {
    const refs = {
      activityIds: new Set(['a1']),
      locationIds: new Set(['audi-1']),
      boothIds: new Set(['b1']),
      trackIds: new Set(['t1']),
    };
    const ok = collectMessagingIssues(
      {
        homeserver: 'https://matrix.reilly.asia',
        rooms: [
          { alias: '#x-room-audi-1:reilly.asia', name: 'Audi 1', locationId: 'audi-1' },
          { alias: '#x-booth-b1:reilly.asia', name: 'Booth', boothId: 'b1', activityId: 'a1' },
        ],
      },
      refs,
    );
    expect(ok).toEqual([]);
    const bad = collectMessagingIssues(
      {
        homeserver: 'https://matrix.reilly.asia',
        rooms: [{ alias: '#x-room-audi-9:reilly.asia', name: 'Audi 9', locationId: 'audi-9' }],
      },
      refs,
    );
    expect(bad).toEqual([
      'messaging room #x-room-audi-9:reilly.asia names an unknown location: audi-9',
    ]);
  });
});

describe('announcementsRoom (#113)', () => {
  it('derives the pinned room from the prefix and server, and can be turned off', () => {
    const base = { homeserver: 'https://matrix.example.org', rooms: [] };
    expect(announcementsRoom(base, 'IndiaFOSS-2026')).toMatchObject({
      alias: '#indiafoss-2026-announcements:matrix.example.org',
      name: 'Announcements',
    });
    expect(
      announcementsRoom({ ...base, aliasPrefix: 'if26', aliasServer: 'reilly.asia' }, 'x')?.alias,
    ).toBe('#if26-announcements:reilly.asia');
    expect(
      announcementsRoom({ ...base, announcementsAlias: '#news:reilly.asia' }, 'x')?.alias,
    ).toBe('#news:reilly.asia');
    expect(announcementsRoom({ ...base, announcementsAlias: false }, 'x')).toBeNull();
  });
});

describe('matrixUriFor', () => {
  it('builds MSC2312 URIs for each id shape, with the action a client should take', () => {
    expect(matrixUriFor('@ada:matrix.org')).toBe('matrix:u/ada%3Amatrix.org?action=chat');
    expect(matrixUriFor('#indiafoss:reilly.asia')).toBe(
      'matrix:r/indiafoss%3Areilly.asia?action=join',
    );
    expect(matrixUriFor('!abc:reilly.asia')).toBe('matrix:roomid/abc%3Areilly.asia?action=join');
  });

  it('returns null for anything that is not a Matrix id, so callers can fall back', () => {
    // A dead `matrix:` link is worse than a web permalink: it silently does
    // nothing. Callers rely on null to choose matrix.to instead.
    for (const bad of [
      '',
      'ada:matrix.org',
      'https://matrix.to/#/@a:b',
      'not-an-id',
      '@no-server',
    ]) {
      expect(matrixUriFor(bad), bad).toBeNull();
    }
  });

  it('tolerates surrounding whitespace from a pasted id', () => {
    expect(matrixUriFor('  @ada:matrix.org  ')).toBe('matrix:u/ada%3Amatrix.org?action=chat');
  });
});
