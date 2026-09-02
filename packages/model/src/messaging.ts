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
  /**
   * Localpart prefix for per-session / per-booth / per-venue-room chats
   * (`#<prefix>-session-<activityId>:<server>`). Defaults to the event id.
   */
  aliasPrefix?: string;
  /** Server name for generated aliases; defaults to the homeserver host. */
  aliasServer?: string;
  /** Offer auto-created chats for sessions, booths and venue rooms (default true). */
  sessionChats?: boolean;
}

export type ConferenceChatKind = 'session' | 'booth' | 'room';

/** Server name part of `homeserver` (`https://matrix.org` → `matrix.org`). */
export function homeserverName(homeserver: string): string {
  try {
    return new URL(homeserver).host;
  } catch {
    return homeserver.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

/**
 * Deterministic alias for a conference chat, so every attendee — on the
 * public homeserver or on a Neutrino mesh — lands in the same room without
 * organizers pre-creating anything. Localparts are lower-cased and limited to
 * alias-safe characters.
 */
export function conferenceChatAlias(
  config: MessagingConfig,
  eventId: string,
  kind: ConferenceChatKind,
  id: string,
): string {
  const prefix = (config.aliasPrefix ?? eventId).toLowerCase();
  const safe = (v: string) =>
    v
      .toLowerCase()
      .replace(/[^a-z0-9._=-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const server = config.aliasServer ?? homeserverName(config.homeserver);
  return `#${safe(prefix)}-${kind}-${safe(id)}:${server}`;
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
