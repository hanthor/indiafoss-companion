import { describe, expect, it } from 'vitest';
import {
  collectMessagingIssues,
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
