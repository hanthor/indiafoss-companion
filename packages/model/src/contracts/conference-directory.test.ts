import { describe, expect, it } from 'vitest';
import type { ConferenceDirectory, DirectoryRoom } from './conference-directory.js';
import {
  collectConferenceDirectoryIssues,
  isValidConferenceDirectory,
  roomByAlias,
  directoryClaims,
} from './conference-directory.js';

const validRoom: DirectoryRoom = {
  id: 'schedule',
  name: 'Schedule',
  alias: '#schedule:indiafoss.org',
  roomId: '!opaqueId:indiafoss.org',
  route: 'classic',
  visibility: 'public',
  topic: 'Event schedule and talk descriptions',
};

const validDirectory: ConferenceDirectory = {
  schemaVersion: 1,
  eventId: 'indiafoss-2026',
  server: 'indiafoss.org',
  generatedAt: '2026-09-26T10:00:00.000Z',
  rooms: [validRoom],
  supports: ['mesh.text', 'classic.audio'],
};

describe('isValidConferenceDirectory', () => {
  it('accepts a structurally valid directory', () => {
    expect(isValidConferenceDirectory(validDirectory)).toBe(true);
  });

  it('rejects a directory with an empty rooms array', () => {
    const invalid = { ...validDirectory, rooms: [] };
    expect(isValidConferenceDirectory(invalid)).toBe(false);
    const issues = collectConferenceDirectoryIssues(invalid);
    expect(issues.some((issue) => issue.includes('rooms'))).toBe(true);
  });

  it('rejects a non-object value', () => {
    expect(isValidConferenceDirectory('not an object')).toBe(false);
    expect(isValidConferenceDirectory(null)).toBe(false);
    expect(isValidConferenceDirectory([])).toBe(false);
  });

  it('rejects a directory with missing required fields', () => {
    const invalid = { ...validDirectory, eventId: undefined };
    expect(isValidConferenceDirectory(invalid)).toBe(false);
    const issues = collectConferenceDirectoryIssues(invalid);
    expect(issues.some((issue) => issue.includes('eventId'))).toBe(true);
  });

  it('accepts a directory with no supports array', () => {
    const noSupports = { ...validDirectory, supports: undefined };
    expect(isValidConferenceDirectory(noSupports)).toBe(true);
  });

  it('rejects duplicate room aliases (split-room prevention)', () => {
    const duplicate: ConferenceDirectory = {
      ...validDirectory,
      rooms: [
        validRoom,
        { ...validRoom, id: 'schedule-2', alias: '#schedule:indiafoss.org' }, // Same alias
      ],
    };
    expect(isValidConferenceDirectory(duplicate)).toBe(false);
    const issues = collectConferenceDirectoryIssues(duplicate);
    expect(issues.some((issue) => issue.includes('room alias'))).toBe(true);
  });
});

describe('roomByAlias', () => {
  it('finds a room by its alias', () => {
    const room = roomByAlias(validDirectory, '#schedule:indiafoss.org');
    expect(room).toEqual(validRoom);
  });

  it('returns undefined for an alias not in the directory', () => {
    const room = roomByAlias(validDirectory, '#nonexistent:indiafoss.org');
    expect(room).toBeUndefined();
  });

  it('does not match on roomId (proving alias is the lookup key)', () => {
    // This is the critical invariant: alias resolution is authoritative, not roomId.
    const directory: ConferenceDirectory = {
      ...validDirectory,
      rooms: [
        {
          id: 'main',
          name: 'Main Hall',
          alias: '#main:indiafoss.org',
          roomId: '!oldId:indiafoss.org', // An old or stale roomId
          route: 'classic',
          visibility: 'public',
        },
      ],
    };
    // Searching by the old roomId should not match.
    const result = roomByAlias(directory, '!oldId:indiafoss.org');
    expect(result).toBeUndefined();

    // Searching by the correct alias should match.
    const correctResult = roomByAlias(directory, '#main:indiafoss.org');
    expect(correctResult?.id).toBe('main');
  });

  it('distinguishes between rooms with similar aliases', () => {
    const dir: ConferenceDirectory = {
      ...validDirectory,
      rooms: [
        {
          id: 'talks',
          name: 'Talks',
          alias: '#talks:indiafoss.org',
          route: 'classic',
          visibility: 'public',
        },
        {
          id: 'talk-breaks',
          name: 'Talk Breaks',
          alias: '#talk-breaks:indiafoss.org',
          route: 'classic',
          visibility: 'public',
        },
      ],
    };

    expect(roomByAlias(dir, '#talks:indiafoss.org')?.id).toBe('talks');
    expect(roomByAlias(dir, '#talk-breaks:indiafoss.org')?.id).toBe('talk-breaks');
  });
});

describe('directoryClaims', () => {
  it('treats a listed capability as claimed', () => {
    expect(directoryClaims(validDirectory, 'mesh.text')).toBe(true);
    expect(directoryClaims(validDirectory, 'classic.audio')).toBe(true);
  });

  it('treats an unlisted capability as unclaimed', () => {
    expect(directoryClaims(validDirectory, 'seam.encrypted')).toBe(false);
    expect(directoryClaims(validDirectory, 'mesh.media.video')).toBe(false);
  });

  it('treats a directory with no supports array as claiming nothing', () => {
    const noSupports: ConferenceDirectory = {
      ...validDirectory,
      supports: undefined,
    };
    expect(directoryClaims(noSupports, 'mesh.text')).toBe(false);
    expect(directoryClaims(noSupports, 'any.capability')).toBe(false);
  });

  it('treats an empty supports array as claiming nothing', () => {
    const emptySupports: ConferenceDirectory = {
      ...validDirectory,
      supports: [],
    };
    expect(directoryClaims(emptySupports, 'mesh.text')).toBe(false);
    expect(directoryClaims(emptySupports, 'any.capability')).toBe(false);
  });

  it('treats an unlisted capability as unavailable, not "unknown"', () => {
    // This enforces the contract's rule: absence means "not demonstrated",
    // which callers must treat as unavailable rather than assuming support.
    // This test ensures the implementation returns false for missing, not null/undefined.
    const result = directoryClaims(validDirectory, 'undemonstrated.capability');
    expect(result).toBe(false);
    expect(result).not.toBeUndefined();
  });
});
