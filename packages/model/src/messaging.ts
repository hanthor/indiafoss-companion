/**
 * Optional Matrix messaging configuration shipped inside an event bundle.
 *
 * Messaging is strictly optional: the schedule, map, ranking and contact
 * sharing never depend on it. Organizers publish the homeserver and the
 * conference rooms; attendees decide whether to sign in at all.
 */
export interface MessagingRoom {
  /** Canonical alias, e.g. `#indiafoss-2026:fossunited.org`. */
  alias: string;
  /** Human-readable label shown before the room is joined. */
  name: string;
  /** Short purpose line (announcements, hallway track, devroom chat...). */
  purpose?: string;
  /** Link the room to a track, devroom activity or location when relevant. */
  trackId?: string;
  activityId?: string;
  locationId?: string;
  /** Rooms the app should suggest joining right after sign-in. */
  recommended?: boolean;
}

export interface MessagingConfig {
  /** Base URL of the homeserver the event rooms live on, e.g. `https://matrix.org`. */
  homeserver: string;
  /** Optional Matrix space that groups every conference room. */
  space?: string;
  rooms: MessagingRoom[];
}

const ALIAS_RE = /^#[^:\s]+:[^\s]+$/;
const USER_ID_RE = /^@[^:\s]+:[^\s]+$/;
const ROOM_ID_RE = /^![^:\s]+:[^\s]+$/;

export function isMatrixRoomAlias(value: string): boolean {
  return ALIAS_RE.test(value);
}

export function isMatrixUserId(value: string): boolean {
  return USER_ID_RE.test(value);
}

export function isMatrixRoomId(value: string): boolean {
  return ROOM_ID_RE.test(value);
}

/** Structural problems with a messaging config; empty when it is usable. */
export function collectMessagingIssues(config: MessagingConfig): string[] {
  const issues: string[] = [];
  try {
    const url = new URL(config.homeserver);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      issues.push(`messaging.homeserver must use https: ${config.homeserver}`);
    }
  } catch {
    issues.push(`messaging.homeserver is not a valid URL: ${config.homeserver}`);
  }
  if (
    config.space !== undefined &&
    !isMatrixRoomAlias(config.space) &&
    !isMatrixRoomId(config.space)
  ) {
    issues.push(`messaging.space is not a room alias or id: ${config.space}`);
  }
  const seen = new Set<string>();
  for (const room of config.rooms) {
    if (!isMatrixRoomAlias(room.alias)) {
      issues.push(`messaging room alias is malformed: ${room.alias}`);
    }
    if (seen.has(room.alias)) issues.push(`duplicate messaging room alias: ${room.alias}`);
    seen.add(room.alias);
    if (!room.name.trim()) issues.push(`messaging room ${room.alias} has an empty name`);
  }
  return issues;
}
