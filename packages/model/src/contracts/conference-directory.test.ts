import { describe, expect, it } from 'vitest';
import type { ConferenceDirectory, DirectoryRoom } from './conference-directory.js';
import {
  directoryClaims,
  isValidConferenceDirectory,
  roomByAlias,
} from './conference-directory.js';

const mainHall: DirectoryRoom = {
  id: 'main-hall',
  name: 'Main Hall',
  alias: '#indiafoss-main:indiafoss.org',
  roomId: '!mainhall:indiafoss.org',
  route: 'classic',
  visibility: 'public',
};

const devroom: DirectoryRoom = {
  id: 'devroom-a',
  name: 'Devroom A',
  alias: '#indiafoss-devroom-a:indiafoss.org',
  route: 'mesh',
  visibility: 'knock',
};

const directory: ConferenceDirectory = {
  schemaVersion: 1,
  eventId: 'indiafoss-2026',
  generatedAt: '2026-09-20T18:00:00.000Z',
  server: 'indiafoss.org',
  rooms: [mainHall, devroom],
  supports: ['mesh.text'],
};

describe('isValidConferenceDirectory', () => {
  it('accepts a directory that passes structural checks', () => {
    expect(isValidConferenceDirectory(directory)).toBe(true);
  });

  it('rejects a directory with no rooms', () => {
    expect(isValidConferenceDirectory({ ...directory, rooms: [] })).toBe(false);
  });

  it('rejects a non-object value', () => {
    expect(isValidConferenceDirectory('not a directory')).toBe(false);
  });
});

describe('roomByAlias', () => {
  it('finds a room by its canonical alias', () => {
    expect(roomByAlias(directory, '#indiafoss-main:indiafoss.org')).toBe(mainHall);
  });

  it('returns undefined for an alias not in the directory', () => {
    expect(roomByAlias(directory, '#does-not-exist:indiafoss.org')).toBeUndefined();
  });

  it('does not match on roomId when the alias differs', () => {
    // roomId is advisory; alias is the authoritative key (see module docs).
    // A lookup by roomId string must not accidentally match via alias.
    expect(roomByAlias(directory, '!mainhall:indiafoss.org')).toBeUndefined();
  });
});

describe('directoryClaims', () => {
  it('treats a listed capability as claimed', () => {
    expect(directoryClaims(directory, 'mesh.text')).toBe(true);
  });

  it('treats an unlisted capability as unclaimed', () => {
    expect(directoryClaims(directory, 'mesh.media.voice')).toBe(false);
  });

  it('treats a missing supports array as claiming nothing', () => {
    const noSupports: ConferenceDirectory = { ...directory, supports: undefined };
    expect(directoryClaims(noSupports, 'mesh.text')).toBe(false);
  });
});
