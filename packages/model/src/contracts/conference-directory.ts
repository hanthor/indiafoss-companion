/**
 * ConferenceDirectory — the published mapping from an event to its canonical
 * Matrix rooms.
 *
 * The point of this contract is convergence: every attendee, on every
 * transport, must resolve the *same* room. The failure this prevents is a
 * client that cannot reach the directory quietly creating a lookalike room
 * under a similar alias, splitting the conversation in a way nobody notices
 * until the event is over.
 *
 * Two rules follow, and both are enforced by callers rather than by shape:
 *
 * 1. **Alias resolution is authoritative.** A `roomId` recorded here is a
 *    convenience for clients that already resolved it. If the alias resolves
 *    to a different room, the alias wins and the directory is stale.
 * 2. **A client never creates a room from this directory.** If resolution
 *    fails, queue the join or explain the unavailable route. Do not fall
 *    back to creation.
 *
 * See `docs/architecture/system.md` ("Rooms, federation and the encrypted
 * seam"), #166 (preseed one alias namespace), #129 (federation compatibility).
 */
import {
  collectDuplicates,
  collectSchemaVersionIssues,
  isMatrixRoomAlias,
  isMatrixRoomId,
  isRecord,
  optionalInstant,
  optionalString,
  requireArray,
  requireLiteral,
  requireString,
} from './common.js';

export const CONFERENCE_DIRECTORY_SCHEMA_VERSION = 1;

/**
 * How a room is expected to be reached.
 *
 * - `classic` — a normal homeserver room, reachable with internet.
 * - `mesh` — served by the venue mesh; reachable on-site without internet.
 * - `federated` — expected to converge across both. This is an *intent*, not
 *   a proof: whether encrypted traffic actually crosses the seam is gated on
 *   #176 and must not be inferred from this value.
 */
export type RoomRoute = 'classic' | 'mesh' | 'federated';

/** Who is expected to be able to find and join the room. */
export type RoomVisibility = 'public' | 'invite' | 'knock';

export interface DirectoryRoom {
  /** Stable id for this directory entry, unique within the directory. */
  id: string;
  /** Human-readable room name, for display before resolution succeeds. */
  name: string;
  /** Canonical alias. Authoritative; always present. */
  alias: string;
  /** Resolved room id, when the publisher has resolved it. Advisory only. */
  roomId?: string;
  /** Intended route. See {@link RoomRoute}. */
  route: RoomRoute;
  /** Expected visibility. See {@link RoomVisibility}. */
  visibility: RoomVisibility;
  /** One-line description of what the room is for. */
  topic?: string;
  /**
   * Activity ids from the event bundle this room hosts, if it is a
   * session-specific room. Ids must exist in the bundle; this contract cannot
   * check that on its own, so the caller cross-checks.
   */
  activityIds?: string[];
  /** Location id from the event bundle, for a room tied to a hall. */
  locationId?: string;
}

export interface ConferenceDirectory {
  schemaVersion: number;
  /** Must match the `eventId` of the manifest this directory ships beside. */
  eventId: string;
  /** When this directory was published, ISO-8601. */
  generatedAt: string;
  /**
   * The homeserver whose aliases these are, e.g. `indiafoss.org`. A client
   * resolving an alias against a different server may get a different room.
   */
  server: string;
  rooms: DirectoryRoom[];
  /**
   * Capabilities the publisher has actually rehearsed on the deployed
   * versions, by name. Absence means "not demonstrated", which callers must
   * treat as unavailable rather than assuming support. See
   * {@link import('./capability-record.js').CapabilityRecord} for the
   * evidence behind these names.
   */
  supports?: string[];
}

const ROUTES: readonly RoomRoute[] = ['classic', 'mesh', 'federated'];
const VISIBILITIES: readonly RoomVisibility[] = ['public', 'invite', 'knock'];

function collectRoomIssues(value: unknown, index: number): string[] {
  const at = `rooms[${index}].`;
  if (!isRecord(value)) return [`rooms[${index}] must be an object`];

  const issues: string[] = [
    ...requireString(value, 'id', at),
    ...requireString(value, 'name', at),
    ...requireLiteral(value, 'route', ROUTES, at),
    ...requireLiteral(value, 'visibility', VISIBILITIES, at),
    ...optionalString(value, 'topic', at),
    ...optionalString(value, 'locationId', at),
  ];

  if (!isMatrixRoomAlias(value.alias)) {
    issues.push(
      `${at}alias must be a Matrix room alias (#name:server), got ${JSON.stringify(value.alias)}`,
    );
  }
  if (value.roomId !== undefined && !isMatrixRoomId(value.roomId)) {
    issues.push(
      `${at}roomId must be a Matrix room id (!opaque:server), got ${JSON.stringify(value.roomId)}`,
    );
  }

  if (value.activityIds !== undefined) {
    issues.push(...requireArray(value, 'activityIds', {}, at));
    if (Array.isArray(value.activityIds)) {
      for (const [i, id] of value.activityIds.entries()) {
        if (typeof id !== 'string' || !id.trim()) {
          issues.push(`${at}activityIds[${i}] must be a non-empty string`);
        }
      }
    }
  }

  return issues;
}

/** Structural validation for an untrusted directory. */
export function collectConferenceDirectoryIssues(value: unknown): string[] {
  if (!isRecord(value)) return ['directory must be an object'];

  const issues: string[] = [
    ...collectSchemaVersionIssues(value, CONFERENCE_DIRECTORY_SCHEMA_VERSION, 'directory'),
    ...requireString(value, 'eventId'),
    ...requireString(value, 'server'),
    ...optionalInstant(value, 'generatedAt'),
    ...requireArray(value, 'rooms', { nonEmpty: true }),
  ];
  if (value.generatedAt === undefined) issues.push('generatedAt must be a string');

  if (Array.isArray(value.rooms)) {
    const ids: string[] = [];
    const aliases: string[] = [];
    for (const [index, room] of value.rooms.entries()) {
      issues.push(...collectRoomIssues(room, index));
      if (isRecord(room)) {
        if (typeof room.id === 'string') ids.push(room.id);
        if (typeof room.alias === 'string') aliases.push(room.alias);
      }
    }
    issues.push(...collectDuplicates(ids, 'room'));
    // Two entries sharing an alias is the split-room failure this contract
    // exists to prevent, so it is fatal rather than a warning.
    issues.push(...collectDuplicates(aliases, 'room alias'));
  }

  if (value.supports !== undefined) {
    issues.push(...requireArray(value, 'supports'));
    if (Array.isArray(value.supports)) {
      for (const [i, name] of value.supports.entries()) {
        if (typeof name !== 'string' || !name.trim()) {
          issues.push(`supports[${i}] must be a non-empty string`);
        }
      }
    }
  }

  return issues;
}

/** True when the directory passes structural checks. */
export function isValidConferenceDirectory(value: unknown): value is ConferenceDirectory {
  return collectConferenceDirectoryIssues(value).length === 0;
}

/**
 * Look up a directory entry by alias.
 *
 * Callers should prefer this over indexing by `roomId`: the alias is the
 * authoritative key, and `roomId` may be stale.
 */
export function roomByAlias(
  directory: ConferenceDirectory,
  alias: string,
): DirectoryRoom | undefined {
  return directory.rooms.find((room) => room.alias === alias);
}

/**
 * Whether the directory claims a named capability.
 *
 * Unknown capability is unavailable — never invert this to "not listed as
 * unsupported, therefore supported".
 */
export function directoryClaims(directory: ConferenceDirectory, capability: string): boolean {
  return directory.supports?.includes(capability) ?? false;
}
