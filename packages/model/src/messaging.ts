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
  boothId?: string;
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
  /**
   * Alias of the organiser-owned announcements room, pinned first in chat
   * (issue #113). Defaults to `#<prefix>-announcements:<server>`; `false`
   * turns the pinned entry off.
   */
  announcementsAlias?: string | false;
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

/**
 * MSC2312 `matrix:` URI for a user id, room alias or room id.
 *
 * This is the handoff link to prefer over a `matrix.to` permalink, and the
 * reason is the venue: `matrix.to` is a *web page* that redirects to a client,
 * so with no internet the browser shows an error and the client is never
 * reached — measured on a real handset, a session-chat link with the radios off
 * lands on Chrome's offline page. A `matrix:` URI is a scheme the package
 * manager resolves locally, so it opens the installed client in airplane mode,
 * which is the condition this whole project is built for.
 *
 * Returns `null` for anything that is not a Matrix id, so a caller can fall
 * back rather than emit a link that goes nowhere.
 */
export function matrixUriFor(id: string): string | null {
  const value = id.trim();
  // The body is everything after the sigil; `?action=` tells the client what
  // the user meant, so joining a room does not land them on a preview they
  // then have to act on again.
  if (isMatrixUserId(value)) return `matrix:u/${encodeURIComponent(value.slice(1))}?action=chat`;
  if (isMatrixRoomAlias(value)) return `matrix:r/${encodeURIComponent(value.slice(1))}?action=join`;
  if (isMatrixRoomId(value))
    return `matrix:roomid/${encodeURIComponent(value.slice(1))}?action=join`;
  return null;
}

/** What a messaging room may point at; ids are checked against the bundle. */
export interface MessagingReferences {
  activityIds: Set<string>;
  locationIds: Set<string>;
  boothIds: Set<string>;
  trackIds: Set<string>;
}

/**
 * Structural problems with a messaging config; empty when it is usable. With
 * `refs`, rooms that name an activity, location, booth or track the bundle
 * does not have are reported too, so a provisioning script never creates a
 * room for a typo.
 */
export function collectMessagingIssues(
  config: MessagingConfig,
  refs?: MessagingReferences,
): string[] {
  const issues: string[] = [];
  try {
    const url = new URL(config.homeserver);
    const isLoopback =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if (url.protocol !== 'https:' && !isLoopback) {
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
    if (refs) {
      const checks: [string | undefined, Set<string>, string][] = [
        [room.activityId, refs.activityIds, 'activity'],
        [room.locationId, refs.locationIds, 'location'],
        [room.boothId, refs.boothIds, 'booth'],
        [room.trackId, refs.trackIds, 'track'],
      ];
      for (const [id, known, kind] of checks) {
        if (id !== undefined && !known.has(id)) {
          issues.push(`messaging room ${room.alias} names an unknown ${kind}: ${id}`);
        }
      }
    }
  }
  return issues;
}

/** The organiser-owned announcements room to pin, or `null` when turned off. */
export function announcementsRoom(
  config: MessagingConfig,
  eventId: string,
): { alias: string; name: string; topic: string } | null {
  if (config.announcementsAlias === false) return null;
  const prefix = (config.aliasPrefix ?? eventId).toLowerCase();
  const server = config.aliasServer ?? homeserverName(config.homeserver);
  const alias = config.announcementsAlias ?? `#${prefix}-announcements:${server}`;
  return {
    alias,
    name: 'Announcements',
    topic: 'Schedule changes and room moves from the organisers. Read-only for attendees.',
  };
}
