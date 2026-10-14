import { describe, expect, it } from 'vitest';
import type { ConferenceDirectory, DirectoryRoom } from './conference-directory.js';
import {
  directoryClaims,
  isValidConferenceDirectory,
  roomByAlias,
} from './conference-directory.js';

const validDirectory: ConferenceDirectory = {
  schemaVersion: 1,
  eventId: 'indiafoss-2026',
  generatedAt: '2026-09-24T12:00:00.000Z',
  server: 'indiafoss.org',
  rooms: [
    {
      id: 'general',
      name: 'General Discussion',
      alias: '#general:indiafoss.org',
      roomId: '!abc123:indiafoss.org',
      route: 'classic',
      visibility: 'public',
      topic: 'General conference discussion',
    },
    {
      id: 'speaker-lounge',
      name: 'Speaker Lounge',
      alias: '#speaker-lounge:indiafoss.org',
      roomId: '!def456:indiafoss.org',
      route: 'mesh',
      visibility: 'invite',
    },
  ],
  supports: ['mesh.text', 'mesh.media.voice'],
};

describe('isValidConferenceDirectory', () => {
  it('accepts a structurally valid directory', () => {
    expect(isValidConferenceDirectory(validDirectory)).toBe(true);
  });

  it('rejects a non-object value', () => {
    expect(isValidConferenceDirectory('not a directory')).toBe(false);
    expect(isValidConferenceDirectory(null)).toBe(false);
    expect(isValidConferenceDirectory(undefined)).toBe(false);
  });

  it('rejects a directory with an empty rooms array', () => {
    const invalidDir: Partial<ConferenceDirectory> = {
      ...validDirectory,
      rooms: [],
    };
    expect(isValidConferenceDirectory(invalidDir)).toBe(false);
  });

  it('rejects a directory missing required fields', () => {
    const incompleteDir: Partial<ConferenceDirectory> = {
      schemaVersion: 1,
      eventId: 'indiafoss-2026',
      // missing generatedAt, server, rooms
    };
    expect(isValidConferenceDirectory(incompleteDir)).toBe(false);
  });
});

describe('roomByAlias', () => {
  it('finds a room by its canonical alias', () => {
    const room = roomByAlias(validDirectory, '#general:indiafoss.org');
    expect(room).toBeDefined();
    expect(room?.id).toBe('general');
    expect(room?.name).toBe('General Discussion');
  });

  it('returns undefined for an alias not present in the directory', () => {
    const room = roomByAlias(validDirectory, '#nonexistent:indiafoss.org');
    expect(room).toBeUndefined();
  });

  it('does not accidentally match on roomId instead of alias', () => {
    // This test verifies the critical invariant: alias is the authoritative
    // lookup key, not roomId. Searching by roomId must return undefined to
    // prove the distinction is enforced.
    const room = roomByAlias(validDirectory, '!abc123:indiafoss.org');
    expect(room).toBeUndefined();
  });

  it('finds a room with no roomId advisory when only alias matches', () => {
    const directoryWithoutAdvisory: ConferenceDirectory = {
      ...validDirectory,
      rooms: [
        {
          id: 'mesh-only',
          name: 'Mesh Room',
          alias: '#mesh-only:indiafoss.org',
          // no roomId advisory
          route: 'mesh',
          visibility: 'public',
        },
      ],
    };
    const room = roomByAlias(directoryWithoutAdvisory, '#mesh-only:indiafoss.org');
    expect(room).toBeDefined();
    expect(room?.id).toBe('mesh-only');
  });
});

describe('directoryClaims', () => {
  it('treats a listed capability as claimed', () => {
    expect(directoryClaims(validDirectory, 'mesh.text')).toBe(true);
    expect(directoryClaims(validDirectory, 'mesh.media.voice')).toBe(true);
  });

  it('treats an unlisted capability as unclaimed (not available)', () => {
    expect(directoryClaims(validDirectory, 'seam.encrypted.async')).toBe(false);
    expect(directoryClaims(validDirectory, 'mesh.media.video')).toBe(false);
  });

  it('treats a directory with no supports array as claiming nothing', () => {
    const directoryWithoutSupports: ConferenceDirectory = {
      ...validDirectory,
      supports: undefined,
    };
    expect(directoryClaims(directoryWithoutSupports, 'mesh.text')).toBe(false);
    expect(directoryClaims(directoryWithoutSupports, 'any.capability')).toBe(false);
  });

  it('treats an empty supports array as claiming nothing', () => {
    const directoryWithEmptySupports: ConferenceDirectory = {
      ...validDirectory,
      supports: [],
    };
    expect(directoryClaims(directoryWithEmptySupports, 'mesh.text')).toBe(false);
  });
});
