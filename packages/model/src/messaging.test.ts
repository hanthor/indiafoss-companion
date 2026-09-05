import { describe, expect, it } from 'vitest';
import {
  collectMessagingIssues,
  conferenceChatAlias,
  homeserverName,
  isMatrixRoomAlias,
  isMatrixRoomId,
  isMatrixUserId,
  isMeshServerName,
  isServerName,
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
    expect(matrixUriFor('!abc:reilly.asia', { via: ['reilly.asia'] })).toBe(
      'matrix:roomid/abc%3Areilly.asia?action=join&via=reilly.asia',
    );
  });

  it('refuses a room id with no via, because that link cannot be joined', () => {
    // Measured against a mesh node: joining by room id with no server hint is
    // 404 M_NOT_FOUND, and 200 once a hint is supplied. A room id names no
    // server to ask — v12 ids do not even carry a domain — so without a via
    // this would be a link that fails for exactly the people it is for.
    expect(matrixUriFor('!abc:reilly.asia')).toBeNull();
    expect(matrixUriFor('!abc:reilly.asia', { via: ['  '] })).toBeNull();
  });

  it('accepts a room v12 id, which carries no server suffix at all', () => {
    // What neutrino mints. The older `!local:server` regex rejected these, so
    // every room id the mesh produces yielded no link whatsoever.
    const id = '!5Fo-Hb-VS5AIkPFP-KNNfWaGMl1hQO_pg0VxmHJ2Vm4';
    expect(matrixUriFor(id, { via: ['a1b2', 'c3d4'] })).toBe(
      `matrix:roomid/${'5Fo-Hb-VS5AIkPFP-KNNfWaGMl1hQO_pg0VxmHJ2Vm4'}?action=join&via=a1b2&via=c3d4`,
    );
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

describe('alias server names', () => {
  it('accepts a mesh node id, which is what a venue gateway is called', () => {
    // 64 hex, no dot and no colon: neutrino derives server_name from the node
    // identity, so this is the shape the mesh actually uses.
    const node = 'a'.repeat(64);
    expect(isMeshServerName(node)).toBe(true);
    expect(isServerName(node)).toBe(true);
    // Not a node id, and not a plausible host either.
    expect(isMeshServerName('A'.repeat(64))).toBe(false);
    expect(isMeshServerName('a'.repeat(63))).toBe(false);
  });

  it('accepts ordinary server names, with or without a port', () => {
    for (const good of ['reilly.asia', 'matrix.org', 'localhost', '127.0.0.1:8008']) {
      expect(isServerName(good), good).toBe(true);
    }
  });

  it('rejects what could never be a server name', () => {
    // Each of these is a real mistake: pasting the homeserver URL, a whole
    // alias, or a trailing path. All of them would generate aliases in a
    // namespace nobody owns.
    for (const bad of [
      '',
      'https://matrix.reilly.asia',
      '#room:reilly.asia',
      'reilly.asia/',
      'reilly asia',
      'reilly.asia:notaport',
      'reilly.asia:8008:9',
      '@user:reilly.asia',
    ]) {
      expect(isServerName(bad), bad).toBe(false);
    }
  });

  it('flags a bad alias server in the bundle, where it is still cheap', () => {
    const base = { homeserver: 'https://matrix.reilly.asia', rooms: [] };
    expect(collectMessagingIssues({ ...base, aliasServer: 'a'.repeat(64) })).toEqual([]);
    expect(collectMessagingIssues({ ...base, aliasServer: 'reilly.asia' })).toEqual([]);
    expect(collectMessagingIssues({ ...base, aliasServer: 'https://reilly.asia' })).toEqual([
      'messaging.aliasServer is not a server name: https://reilly.asia',
    ]);
  });
});

describe('a mesh node as the alias anchor', () => {
  // The offline venue case: the namespace is owned by a gateway node on the
  // mesh rather than by a host on the internet, so the aliases resolve in a
  // hall with no uplink. Changing to this is a bundle edit, and nothing below
  // may need a code change for it to work — which is what this pins.
  const NODE = '16900202044e255fbe89bb1c7bfff749809cad753e0ec5bb3fb727ad59dc7c50';
  const config = {
    homeserver: 'https://matrix.reilly.asia',
    rooms: [],
    aliasServer: NODE,
  };

  it('passes validation and generates aliases in the node namespace', () => {
    expect(collectMessagingIssues(config)).toEqual([]);
    expect(conferenceChatAlias(config, 'indiafoss-2026', 'session', 'act-C8AK0iov2l')).toBe(
      `#indiafoss-2026-session-act-c8ak0iov2l:${NODE}`,
    );
    expect(announcementsRoom(config, 'indiafoss-2026')?.alias).toBe(
      `#indiafoss-2026-announcements:${NODE}`,
    );
  });

  it('still produces a handoff link a client can act on offline', () => {
    // A node id has no dot and no colon in it, so anything treating a server
    // name as a hostname mangles it. The alias must survive into the `matrix:`
    // URI intact, since that URI is the whole offline handoff.
    const alias = conferenceChatAlias(config, 'indiafoss-2026', 'room', 'Hall 3');
    expect(alias).toBe(`#indiafoss-2026-room-hall-3:${NODE}`);
    expect(matrixUriFor(alias)).toBe(
      `matrix:r/${encodeURIComponent(`indiafoss-2026-room-hall-3:${NODE}`)}?action=join`,
    );
    expect(isMatrixRoomAlias(alias)).toBe(true);
  });
});
