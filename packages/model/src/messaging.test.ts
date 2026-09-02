import { describe, expect, it } from 'vitest';
import {
  collectMessagingIssues,
  conferenceChatAlias,
  homeserverName,
  isMatrixRoomAlias,
  isMatrixRoomId,
  isMatrixUserId,
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
});
