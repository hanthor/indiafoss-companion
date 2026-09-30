import { describe, expect, it } from 'vitest';
import type { ConferenceDirectory, DirectoryRoom } from './conference-directory.js';
import {
  CONFERENCE_DIRECTORY_SCHEMA_VERSION,
  collectConferenceDirectoryIssues,
  directoryClaims,
  isValidConferenceDirectory,
  roomByAlias,
} from './conference-directory.js';

const VALID_DIRECTORY: ConferenceDirectory = {
  schemaVersion: CONFERENCE_DIRECTORY_SCHEMA_VERSION,
  eventId: 'indiafoss-2026',
  server: 'indiafoss.org',
  generatedAt: '2026-09-01T09:00:00Z',
  rooms: [
    {
      id: 'keynote-1',
      name: 'Keynote Hall',
      alias: '#keynote:indiafoss.org',
      roomId: '!abc123:indiafoss.org',
      route: 'classic',
      visibility: 'public',
      topic: 'Opening keynote address',
      activityIds: ['activity-1'],
      locationId: 'hall-1',
    },
    {
      id: 'workshop-2',
      name: 'Workshop Room A',
      alias: '#workshop-a:indiafoss.org',
      route: 'mesh',
      visibility: 'invite',
      topic: 'Advanced Kubernetes workshop',
    },
  ],
  supports: ['matrix-push-rules', 'presence-sharing'],
ndescribe('isValidConferenceDirectory', () => {
  it('accepts a valid minimal directory', () => {
    const minimal: ConferenceDirectory = {
      schemaVersion: CONFERENCE_DIRECTORY_SCHEMA_VERSION,
      eventId: 'event-1',
      server: 'matrix.org',
      generatedAt: '2026-01-01T00:00:00Z',
      rooms: [
        {
          id: 'room-1',
          name: 'Main Hall',
          alias: '#main:matrix.org',
          route: 'classic',
          visibility: 'public',
        },
      ],
    };
    expect(isValidConferenceDirectory(minimal)).toBe(true);
  });

  it('accepts a valid full directory with all fields', () => {
    expect(isValidConferenceDirectory(VALID_DIRECTORY)).toBe(true);
  });

  it('rejects when not an object', () => {
    expect(isValidConferenceDirectory(null)).toBe(false);
    expect(isValidConferenceDirectory('not an object')).toBe(false);
    expect(isValidConferenceDirectory(123)).toBe(false);
    expect(isValidConferenceDirectory([])).toBe(false);
  });

  it('rejects when schemaVersion is wrong', () => {
    const bad = {
      ...VALID_DIRECTORY,
      schemaVersion: 999,
    };
    expect(isValidConferenceDirectory(bad)).toBe(false);
  });

  it('rejects when schemaVersion is missing', () => {
    const bad = {
      ...VALID_DIRECTORY,
      schemaVersion: undefined,
    };
    expect(isValidConferenceDirectory(bad)).toBe(false);
  });

  it('rejects when eventId is missing', () => {
    const bad = {
      ...VALID_DIRECTORY,
      eventId: undefined,
    };
    expect(isValidConferenceDirectory(bad)).toBe(false);
  });

  it('rejects when eventId is not a string', () => {
    const bad = {
      ...VALID_DIRECTORY,
      eventId: 123,
    };
    expect(isValidConferenceDirectory(bad)).toBe(false);
  });

  it('rejects when server is missing', () => {
    const bad = {
      ...VALID_DIRECTORY,
      server: undefined,
    };
    expect(isValidConferenceDirectory(bad)).toBe(false);
  });

  it('rejects when server is not a string', () => {
    const bad = {
      ...VALID_DIRECTORY,
      server: ['multi', 'server'],
    };
    expect(isValidConferenceDirectory(bad)).toBe(false);
  });

  it('rejects when generatedAt is missing', () => {
    const bad = {
      ...VALID_DIRECTORY,
      generatedAt: undefined,
    };
    expect(isValidConferenceDirectory(bad)).toBe(false);
  });

  it('rejects when generatedAt is not an ISO-8601 timestamp', () => {
    const bad = {
      ...VALID_DIRECTORY,
      generatedAt: 'not-a-date',
    };
    expect(isValidConferenceDirectory(bad)).toBe(false);
  });

  it('rejects when rooms is missing', () => {
    const bad = {
      ...VALID_DIRECTORY,
      rooms: undefined,
    };
    expect(isValidConferenceDirectory(bad)).toBe(false);
  });

  it('rejects when rooms is not an array', () => {
    const bad = {
      ...VALID_DIRECTORY,
      rooms: { '0': VALID_DIRECTORY.rooms[0] },
    };
    expect(isValidConferenceDirectory(bad)).toBe(false);
  });

  it('rejects when rooms is an empty array', () => {
    const bad = {
      ...VALID_DIRECTORY,
      rooms: [],
    };
    expect(isValidConferenceDirectory(bad)).toBe(false);
  });
});

describe('collectConferenceDirectoryIssues', () => {
  describe('room validation', () => {
    it('rejects when a room is not an object', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [null],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues).toContain(expect.stringContaining('rooms[0] must be an object'));
    });

    it('rejects when room id is missing', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            name: 'Hall',
            alias: '#hall:indiafoss.org',
            route: 'classic',
            visibility: 'public',
          },
        ],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('id'))).toBe(true);
    });

    it('rejects when room name is missing', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'room-1',
            alias: '#hall:indiafoss.org',
            route: 'classic',
            visibility: 'public',
          },
        ],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('name'))).toBe(true);
    });

    it('rejects when alias is not a valid Matrix room alias', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'room-1',
            name: 'Hall',
            alias: 'not-a-valid-alias',
            route: 'classic',
            visibility: 'public',
          },
        ],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('alias must be a Matrix room alias'))).toBe(true);
    });

    it('rejects when route is not a valid RoomRoute', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'room-1',
            name: 'Hall',
            alias: '#hall:indiafoss.org',
            route: 'invalid-route',
            visibility: 'public',
          },
        ],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('route'))).toBe(true);
    });

    it('rejects when visibility is not a valid RoomVisibility', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'room-1',
            name: 'Hall',
            alias: '#hall:indiafoss.org',
            route: 'classic',
            visibility: 'invalid-visibility',
          },
        ],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('visibility'))).toBe(true);
    });

    it('accepts topic as optional', () => {
      const room: DirectoryRoom = {
        id: 'room-1',
        name: 'Hall',
        alias: '#hall:indiafoss.org',
        route: 'classic',
        visibility: 'public',
      };
      const dir: ConferenceDirectory = {
        ...VALID_DIRECTORY,
        rooms: [room],
      };
      expect(isValidConferenceDirectory(dir)).toBe(true);
    });

    it('rejects when roomId is present but not a valid Matrix room id', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'room-1',
            name: 'Hall',
            alias: '#hall:indiafoss.org',
            roomId: 'not-a-valid-room-id',
            route: 'classic',
            visibility: 'public',
          },
        ],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('roomId must be a Matrix room id'))).toBe(true);
    });

    it('accepts valid Matrix room ids in the ! format', () => {
      const good = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'room-1',
            name: 'Hall',
            alias: '#hall:indiafoss.org',
            roomId: '!opaque123:indiafoss.org',
            route: 'classic',
            visibility: 'public',
          },
        ],
      };
      expect(isValidConferenceDirectory(good)).toBe(true);
    });
  });

  describe('activityIds validation', () => {
    it('accepts absent activityIds', () => {
      const room: DirectoryRoom = {
        id: 'room-1',
        name: 'Hall',
        alias: '#hall:indiafoss.org',
        route: 'classic',
        visibility: 'public',
      };
      const dir: ConferenceDirectory = {
        ...VALID_DIRECTORY,
        rooms: [room],
      };
      expect(isValidConferenceDirectory(dir)).toBe(true);
    });

    it('accepts valid activityIds array', () => {
      const room: DirectoryRoom = {
        id: 'room-1',
        name: 'Hall',
        alias: '#hall:indiafoss.org',
        route: 'classic',
        visibility: 'public',
        activityIds: ['act-1', 'act-2'],
      };
      const dir: ConferenceDirectory = {
        ...VALID_DIRECTORY,
        rooms: [room],
      };
      expect(isValidConferenceDirectory(dir)).toBe(true);
    });

    it('rejects when activityIds is not an array', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'room-1',
            name: 'Hall',
            alias: '#hall:indiafoss.org',
            route: 'classic',
            visibility: 'public',
            activityIds: 'not-an-array',
          },
        ],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('activityIds'))).toBe(true);
    });

    it('rejects empty strings in activityIds', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'room-1',
            name: 'Hall',
            alias: '#hall:indiafoss.org',
            route: 'classic',
            visibility: 'public',
            activityIds: ['act-1', '', 'act-2'],
          },
        ],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('activityIds[1]'))).toBe(true);
    });

    it('rejects non-string items in activityIds', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'room-1',
            name: 'Hall',
            alias: '#hall:indiafoss.org',
            route: 'classic',
            visibility: 'public',
            activityIds: ['act-1', 123, 'act-2'],
          },
        ],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('activityIds[1]'))).toBe(true);
    });
  });

  describe('locationId validation', () => {
    it('accepts absent locationId', () => {
      const room: DirectoryRoom = {
        id: 'room-1',
        name: 'Hall',
        alias: '#hall:indiafoss.org',
        route: 'classic',
        visibility: 'public',
      };
      const dir: ConferenceDirectory = {
        ...VALID_DIRECTORY,
        rooms: [room],
      };
      expect(isValidConferenceDirectory(dir)).toBe(true);
    });

    it('accepts valid locationId', () => {
      const room: DirectoryRoom = {
        id: 'room-1',
        name: 'Hall',
        alias: '#hall:indiafoss.org',
        route: 'classic',
        visibility: 'public',
        locationId: 'hall-1',
      };
      const dir: ConferenceDirectory = {
        ...VALID_DIRECTORY,
        rooms: [room],
      };
      expect(isValidConferenceDirectory(dir)).toBe(true);
    });

    it('rejects empty string locationId', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'room-1',
            name: 'Hall',
            alias: '#hall:indiafoss.org',
            route: 'classic',
            visibility: 'public',
            locationId: '',
          },
        ],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('locationId'))).toBe(true);
    });
  });

  describe('duplicate detection', () => {
    it('rejects duplicate room ids', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'duplicate-id',
            name: 'Hall 1',
            alias: '#hall1:indiafoss.org',
            route: 'classic',
            visibility: 'public',
          },
          {
            id: 'duplicate-id',
            name: 'Hall 2',
            alias: '#hall2:indiafoss.org',
            route: 'classic',
            visibility: 'public',
          },
        ],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('duplicate-id'))).toBe(true);
    });

    it('rejects duplicate room aliases (split-room failure)', () => {
      const bad = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'room-1',
            name: 'Hall 1',
            alias: '#same-alias:indiafoss.org',
            route: 'classic',
            visibility: 'public',
          },
          {
            id: 'room-2',
            name: 'Hall 2',
            alias: '#same-alias:indiafoss.org',
            route: 'classic',
            visibility: 'public',
          },
        ],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('duplicate') && i.includes('alias'))).toBe(true);
    });

    it('accepts different aliases on different rooms', () => {
      const good = {
        ...VALID_DIRECTORY,
        rooms: [
          {
            id: 'room-1',
            name: 'Hall 1',
            alias: '#hall1:indiafoss.org',
            route: 'classic',
            visibility: 'public',
          },
          {
            id: 'room-2',
            name: 'Hall 2',
            alias: '#hall2:indiafoss.org',
            route: 'classic',
            visibility: 'public',
          },
        ],
      };
      expect(isValidConferenceDirectory(good)).toBe(true);
    });
  });

  describe('supports field validation', () => {
    it('accepts absent supports field', () => {
      const dir: ConferenceDirectory = {
        schemaVersion: CONFERENCE_DIRECTORY_SCHEMA_VERSION,
        eventId: 'event-1',
        server: 'matrix.org',
        generatedAt: '2026-01-01T00:00:00Z',
        rooms: [
          {
            id: 'room-1',
            name: 'Main',
            alias: '#main:matrix.org',
            route: 'classic',
            visibility: 'public',
          },
        ],
      };
      expect(isValidConferenceDirectory(dir)).toBe(true);
    });

    it('accepts valid supports array', () => {
      const dir: ConferenceDirectory = {
        ...VALID_DIRECTORY,
        supports: ['capability-1', 'capability-2'],
      };
      expect(isValidConferenceDirectory(dir)).toBe(true);
    });

    it('rejects when supports is not an array', () => {
      const bad = {
        ...VALID_DIRECTORY,
        supports: 'not-an-array',
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('supports'))).toBe(true);
    });

    it('rejects empty strings in supports', () => {
      const bad = {
        ...VALID_DIRECTORY,
        supports: ['valid', '', 'also-valid'],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('supports[1]'))).toBe(true);
    });

    it('rejects non-string items in supports', () => {
      const bad = {
        ...VALID_DIRECTORY,
        supports: ['valid', 123, 'also-valid'],
      };
      const issues = collectConferenceDirectoryIssues(bad);
      expect(issues.some((i) => i.includes('supports[1]'))).toBe(true);
    });
  });
});

describe('roomByAlias', () => {
  it('finds a room by its alias', () => {
    const room = roomByAlias(VALID_DIRECTORY, '#keynote:indiafoss.org');
    expect(room).toEqual(VALID_DIRECTORY.rooms[0]);
  });

  it('returns undefined when alias is not found', () => {
    const room = roomByAlias(VALID_DIRECTORY, '#nonexistent:indiafoss.org');
    expect(room).toBeUndefined();
  });

  it('finds the correct room when multiple rooms exist', () => {
    const room = roomByAlias(VALID_DIRECTORY, '#workshop-a:indiafoss.org');
    expect(room).toEqual(VALID_DIRECTORY.rooms[1]);
  });

  it('returns undefined on case-sensitive mismatch', () => {
    const room = roomByAlias(VALID_DIRECTORY, '#KEYNOTE:indiafoss.org');
    expect(room).toBeUndefined();
  });
});

describe('directoryClaims', () => {
  it('returns true when directory supports a capability', () => {
    expect(directoryClaims(VALID_DIRECTORY, 'matrix-push-rules')).toBe(true);
    expect(directoryClaims(VALID_DIRECTORY, 'presence-sharing')).toBe(true);
  });

  it('returns false when directory does not support a capability', () => {
    expect(directoryClaims(VALID_DIRECTORY, 'unknown-capability')).toBe(false);
  });

  it('returns false when supports field is absent', () => {
    const dir: ConferenceDirectory = {
      schemaVersion: CONFERENCE_DIRECTORY_SCHEMA_VERSION,
      eventId: 'event-1',
      server: 'matrix.org',
      generatedAt: '2026-01-01T00:00:00Z',
      rooms: [
        {
          id: 'room-1',
          name: 'Main',
          alias: '#main:matrix.org',
          route: 'classic',
          visibility: 'public',
        },
      ],
    };
    expect(directoryClaims(dir, 'any-capability')).toBe(false);
  });

  it('returns false on case-sensitive mismatch', () => {
    expect(directoryClaims(VALID_DIRECTORY, 'Matrix-Push-Rules')).toBe(false);
  });

  it('returns false for partial matches', () => {
    expect(directoryClaims(VALID_DIRECTORY, 'matrix-push')).toBe(false);
  });
});

describe('RoomRoute enum', () => {
  it('accepts classic route', () => {
    const room: DirectoryRoom = {
      id: 'room-1',
      name: 'Hall',
      alias: '#hall:indiafoss.org',
      route: 'classic',
      visibility: 'public',
    };
    const dir: ConferenceDirectory = {
      ...VALID_DIRECTORY,
      rooms: [room],
    };
    expect(isValidConferenceDirectory(dir)).toBe(true);
  });

  it('accepts mesh route', () => {
    const room: DirectoryRoom = {
      id: 'room-1',
      name: 'Hall',
      alias: '#hall:indiafoss.org',
      route: 'mesh',
      visibility: 'public',
    };
    const dir: ConferenceDirectory = {
      ...VALID_DIRECTORY,
      rooms: [room],
    };
    expect(isValidConferenceDirectory(dir)).toBe(true);
  });

  it('accepts federated route', () => {
    const room: DirectoryRoom = {
      id: 'room-1',
      name: 'Hall',
      alias: '#hall:indiafoss.org',
      route: 'federated',
      visibility: 'public',
    };
    const dir: ConferenceDirectory = {
      ...VALID_DIRECTORY,
      rooms: [room],
    };
    expect(isValidConferenceDirectory(dir)).toBe(true);
  });
});

describe('RoomVisibility enum', () => {
  it('accepts public visibility', () => {
    const room: DirectoryRoom = {
      id: 'room-1',
      name: 'Hall',
      alias: '#hall:indiafoss.org',
      route: 'classic',
      visibility: 'public',
    };
    const dir: ConferenceDirectory = {
      ...VALID_DIRECTORY,
      rooms: [room],
    };
    expect(isValidConferenceDirectory(dir)).toBe(true);
  });

  it('accepts invite visibility', () => {
    const room: DirectoryRoom = {
      id: 'room-1',
      name: 'Hall',
      alias: '#hall:indiafoss.org',
      route: 'classic',
      visibility: 'invite',
    };
    const dir: ConferenceDirectory = {
      ...VALID_DIRECTORY,
      rooms: [room],
    };
    expect(isValidConferenceDirectory(dir)).toBe(true);
  });

  it('accepts knock visibility', () => {
    const room: DirectoryRoom = {
      id: 'room-1',
      name: 'Hall',
      alias: '#hall:indiafoss.org',
      route: 'classic',
      visibility: 'knock',
    };
    const dir: ConferenceDirectory = {
      ...VALID_DIRECTORY,
      rooms: [room],
    };
    expect(isValidConferenceDirectory(dir)).toBe(true);
  });
});
