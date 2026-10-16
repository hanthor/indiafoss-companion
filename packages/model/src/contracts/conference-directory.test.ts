import { describe, expect, it } from 'vitest';
import type { ConferenceDirectory, DirectoryRoom } from './conference-directory.js';
import {
  CONFERENCE_DIRECTORY_SCHEMA_VERSION,
  collectConferenceDirectoryIssues,
  directoryClaims,
  isValidConferenceDirectory,
  roomByAlias,
} from './conference-directory.js';

const validRoom: DirectoryRoom = {
  id: 'audi',
  name: 'Main Auditorium',
  alias: '#audi:indiafoss.org',
  roomId: '!room1:indiafoss.org',
  route: 'classic',
  visibility: 'public',
  topic: 'Main talks',
  activityIds: ['session-1', 'session-2'],
  locationId: 'audi-location',
};

const validDirectory: ConferenceDirectory = {
  schemaVersion: CONFERENCE_DIRECTORY_SCHEMA_VERSION,
  eventId: 'indiafoss-2026',
  generatedAt: '2026-09-26T10:00:00.000Z',
  server: 'indiafoss.org',
  rooms: [validRoom],
  supports: ['e2ee', 'federation'],
};

describe('ConferenceDirectory schema validation', () => {
  it('accepts a valid minimal directory', () => {
    const minimal: ConferenceDirectory = {
      schemaVersion: CONFERENCE_DIRECTORY_SCHEMA_VERSION,
      eventId: 'event-1',
      generatedAt: '2026-09-26T10:00:00.000Z',
      server: 'example.org',
      rooms: [
        {
          id: 'main',
          name: 'Main',
          alias: '#main:example.org',
          route: 'classic',
          visibility: 'public',
        },
      ],
    };
    expect(isValidConferenceDirectory(minimal)).toBe(true);
    expect(collectConferenceDirectoryIssues(minimal)).toEqual([]);
  });

  it('accepts a full featured directory', () => {
    expect(isValidConferenceDirectory(validDirectory)).toBe(true);
    expect(collectConferenceDirectoryIssues(validDirectory)).toEqual([]);
  });

  it('rejects non-object', () => {
    expect(collectConferenceDirectoryIssues('not an object')).toContain('directory must be an object');
    expect(collectConferenceDirectoryIssues(null)).toContain('directory must be an object');
    expect(collectConferenceDirectoryIssues([])).toContain('directory must be an object');
  });

  it('rejects missing required fields', () => {
    const incomplete = { ...validDirectory, eventId: undefined };
    const issues = collectConferenceDirectoryIssues(incomplete);
    expect(issues.some((i) => i.includes('eventId'))).toBe(true);
  });

  it('rejects invalid schemaVersion', () => {
    const badVersion = { ...validDirectory, schemaVersion: 999 };
    const issues = collectConferenceDirectoryIssues(badVersion);
    expect(issues.some((i) => i.includes('schemaVersion'))).toBe(true);
  });

  it('rejects invalid generatedAt timestamp', () => {
    const badTime = { ...validDirectory, generatedAt: 'not-an-iso-date' };
    const issues = collectConferenceDirectoryIssues(badTime);
    expect(issues.some((i) => i.includes('generatedAt'))).toBe(true);
  });

  it('rejects empty rooms array', () => {
    const noRooms = { ...validDirectory, rooms: [] };
    const issues = collectConferenceDirectoryIssues(noRooms);
    expect(issues.some((i) => i.includes('rooms'))).toBe(true);
  });
});

describe('DirectoryRoom validation', () => {
  it('requires non-empty id and name', () => {
    const badRoom = { ...validRoom, id: '', name: '' };
    const dir = { ...validDirectory, rooms: [badRoom] };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.some((i) => i.includes('id'))).toBe(true);
    expect(issues.some((i) => i.includes('name'))).toBe(true);
  });

  it('validates Matrix room alias format', () => {
    const badAlias = { ...validRoom, alias: 'not-a-matrix-alias' };
    const dir = { ...validDirectory, rooms: [badAlias] };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.some((i) => i.includes('alias'))).toBe(true);
  });

  it('validates optional roomId as Matrix room id when present', () => {
    const badRoomId = { ...validRoom, roomId: 'not-a-room-id' };
    const dir = { ...validDirectory, rooms: [badRoomId] };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.some((i) => i.includes('roomId'))).toBe(true);
  });

  it('accepts valid Matrix room aliases', () => {
    const roomsWithVariants = [
      { ...validRoom, alias: '#room:server.org' },
      { ...validRoom, id: 'r2', alias: '#my-room:another.org' },
      { ...validRoom, id: 'r3', alias: '#123:localhost' },
    ];
    const dir = { ...validDirectory, rooms: roomsWithVariants };
    expect(collectConferenceDirectoryIssues(dir)).toEqual([]);
  });

  it('accepts valid Matrix room ids', () => {
    const withRoomIds = {
      ...validRoom,
      roomId: '!opaque:server.org',
    };
    const dir = { ...validDirectory, rooms: [withRoomIds] };
    expect(collectConferenceDirectoryIssues(dir)).toEqual([]);
  });

  it('validates route as one of: classic, mesh, federated', () => {
    const badRoute = { ...validRoom, route: 'invalid' as any };
    const dir = { ...validDirectory, rooms: [badRoute] };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.some((i) => i.includes('route'))).toBe(true);
  });

  it('validates visibility as one of: public, invite, knock', () => {
    const badVisibility = { ...validRoom, visibility: 'private' as any };
    const dir = { ...validDirectory, rooms: [badVisibility] };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.some((i) => i.includes('visibility'))).toBe(true);
  });

  it('accepts optional topic, locationId, and activityIds', () => {
    const minimal = {
      id: 'basic',
      name: 'Basic Room',
      alias: '#basic:org',
      route: 'classic' as const,
      visibility: 'public' as const,
    };
    const dir = { ...validDirectory, rooms: [minimal] };
    expect(collectConferenceDirectoryIssues(dir)).toEqual([]);
  });

  it('validates activityIds as non-empty strings', () => {
    const badActivityIds = {
      ...validRoom,
      activityIds: ['valid', '', 'also-valid', '  '],
    };
    const dir = { ...validDirectory, rooms: [badActivityIds] };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.some((i) => i.includes('activityIds'))).toBe(true);
  });

  it('rejects non-array activityIds', () => {
    const badActivityIds = { ...validRoom, activityIds: 'not-an-array' as any };
    const dir = { ...validDirectory, rooms: [badActivityIds] };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.some((i) => i.includes('activityIds'))).toBe(true);
  });

  it('accepts non-array room in rooms (for error reporting)', () => {
    const dir = { ...validDirectory, rooms: ['not-a-room' as any] };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.some((i) => i.includes('rooms[0] must be an object'))).toBe(true);
  });
});

describe('Duplicate detection', () => {
  it('rejects duplicate room ids', () => {
    const room1 = { ...validRoom, id: 'dup' };
    const room2 = { ...validRoom, id: 'dup', alias: '#other:indiafoss.org' };
    const dir = { ...validDirectory, rooms: [room1, room2] };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.some((i) => i.includes('duplicate') && i.includes('room id'))).toBe(true);
  });

  it('rejects duplicate room aliases (prevents split-room failure)', () => {
    const room1 = { ...validRoom, id: 'room1' };
    const room2 = { ...validRoom, id: 'room2', alias: validRoom.alias };
    const dir = { ...validDirectory, rooms: [room1, room2] };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.some((i) => i.includes('duplicate') && i.includes('alias'))).toBe(true);
  });

  it('allows non-duplicate ids and aliases', () => {
    const rooms = [
      { ...validRoom, id: 'room1', alias: '#room1:indiafoss.org' },
      { ...validRoom, id: 'room2', alias: '#room2:indiafoss.org' },
      { ...validRoom, id: 'room3', alias: '#room3:indiafoss.org' },
    ];
    const dir = { ...validDirectory, rooms };
    expect(collectConferenceDirectoryIssues(dir)).toEqual([]);
  });
});

describe('Capability support list', () => {
  it('accepts optional supports array of non-empty strings', () => {
    const dir = { ...validDirectory, supports: ['e2ee', 'federation', 'custom-capability'] };
    expect(collectConferenceDirectoryIssues(dir)).toEqual([]);
  });

  it('rejects supports with empty strings', () => {
    const dir = { ...validDirectory, supports: ['valid', '', 'also-valid'] };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.some((i) => i.includes('supports'))).toBe(true);
  });

  it('rejects supports as non-array', () => {
    const dir = { ...validDirectory, supports: 'not-array' as any };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.some((i) => i.includes('supports'))).toBe(true);
  });

  it('accepts undefined supports (optional)', () => {
    const dir = { ...validDirectory, supports: undefined };
    expect(collectConferenceDirectoryIssues(dir)).toEqual([]);
  });
});

describe('roomByAlias', () => {
  it('finds a room by its alias', () => {
    const rooms = [
      { ...validRoom, id: 'room1', alias: '#main:indiafoss.org' },
      { ...validRoom, id: 'room2', alias: '#breakout:indiafoss.org' },
    ];
    const dir = { ...validDirectory, rooms };

    expect(roomByAlias(dir, '#main:indiafoss.org')).toEqual(rooms[0]);
    expect(roomByAlias(dir, '#breakout:indiafoss.org')).toEqual(rooms[1]);
  });

  it('returns undefined for unknown alias', () => {
    const dir = { ...validDirectory, rooms: [validRoom] };
    expect(roomByAlias(dir, '#unknown:indiafoss.org')).toBeUndefined();
  });

  it('is case-sensitive for alias lookup', () => {
    const dir = { ...validDirectory, rooms: [validRoom] };
    expect(roomByAlias(dir, '#AUDI:indiafoss.org')).toBeUndefined();
  });

  it('returns first match if duplicates exist (should not happen)', () => {
    const room1 = { ...validRoom, id: 'room1' };
    const room2 = { ...validRoom, id: 'room2' };
    const dir = { ...validDirectory, rooms: [room1, room2] };

    expect(roomByAlias(dir, validRoom.alias)).toEqual(room1);
  });
});

describe('directoryClaims', () => {
  it('returns true for claimed capabilities', () => {
    const dir = { ...validDirectory, supports: ['e2ee', 'federation', 'custom'] };
    expect(directoryClaims(dir, 'e2ee')).toBe(true);
    expect(directoryClaims(dir, 'federation')).toBe(true);
    expect(directoryClaims(dir, 'custom')).toBe(true);
  });

  it('returns false for unclaimed capabilities', () => {
    const dir = { ...validDirectory, supports: ['e2ee'] };
    expect(directoryClaims(dir, 'federation')).toBe(false);
    expect(directoryClaims(dir, 'unknown')).toBe(false);
  });

  it('returns false when supports is undefined', () => {
    const dir = { ...validDirectory, supports: undefined };
    expect(directoryClaims(dir, 'e2ee')).toBe(false);
    expect(directoryClaims(dir, 'anything')).toBe(false);
  });

  it('is case-sensitive for capability names', () => {
    const dir = { ...validDirectory, supports: ['E2EE'] };
    expect(directoryClaims(dir, 'e2ee')).toBe(false);
    expect(directoryClaims(dir, 'E2EE')).toBe(true);
  });
});

describe('Edge cases and integration', () => {
  it('handles a directory with multiple rooms and complex metadata', () => {
    const dir: ConferenceDirectory = {
      schemaVersion: 1,
      eventId: 'complex-event',
      generatedAt: '2026-09-26T10:00:00.000Z',
      server: 'matrix.org',
      rooms: [
        {
          id: 'plenary',
          name: 'Plenary Hall',
          alias: '#plenary:matrix.org',
          roomId: '!plenary:matrix.org',
          route: 'federated',
          visibility: 'public',
          topic: 'Opening and closing remarks',
          locationId: 'main-hall',
        },
        {
          id: 'track-a',
          name: 'Track A',
          alias: '#track-a:matrix.org',
          route: 'classic',
          visibility: 'public',
          activityIds: ['talk-1', 'talk-2', 'talk-3'],
        },
        {
          id: 'vip',
          name: 'VIP Lounge',
          alias: '#vip:matrix.org',
          route: 'mesh',
          visibility: 'invite',
          topic: 'Networking for speakers',
        },
      ],
      supports: ['e2ee', 'federation', 'mesh-sync'],
    };

    expect(isValidConferenceDirectory(dir)).toBe(true);
    expect(roomByAlias(dir, '#track-a:matrix.org')?.id).toBe('track-a');
    expect(directoryClaims(dir, 'mesh-sync')).toBe(true);
    expect(directoryClaims(dir, 'unknown')).toBe(false);
  });

  it('rejects directory with non-object room', () => {
    const dir = { ...validDirectory, rooms: [null] as any };
    const issues = collectConferenceDirectoryIssues(dir);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.includes('must be an object'))).toBe(true);
  });
});
