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
  /**
   * The server that owns the generated alias namespace; defaults to the
   * homeserver host.
   *
   * This names **one** designated server, and it has to be reachable over
   * whatever medium an attendee has. Matrix aliases are server-scoped and
   * `room_alias_name` is a localpart the server completes with its own name,
   * so no other server can hold or seed `#…:<this>` — on the mesh, where every
   * phone is its own server, that is the difference between a hall converging
   * on one room and every attendee sitting alone in their own copy of it.
   *
   * A mesh node id (64 hex characters) is a valid value here: that is what a
   * venue gateway is called, and pointing the namespace at one is how the
   * conference chats work with no uplink. Changing it is a bundle edit and
   * needs no code change — but it moves the whole namespace, so a run that
   * changes it mid-event strands everyone already in the old rooms.
   */
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
// Room v12 dropped the `:server` suffix: ids are now an opaque hash with no
// domain in them at all (neutrino mints exactly these, e.g.
// `!5Fo-Hb-VS5AIkPFP-KNNfWaGM…`). Requiring a colon rejected every room id the
// mesh produces, so the suffix is optional — and its absence is precisely why
// a room-id link cannot be routed without a `via` (see {@link matrixUriFor}).
const ROOM_ID_RE = /^![^:\s]+(?::[^\s]+)?$/;

export function isMatrixRoomAlias(value: string): boolean {
  return ALIAS_RE.test(value);
}

export function isMatrixUserId(value: string): boolean {
  return USER_ID_RE.test(value);
}

/**
 * A mesh server name: the node's ed25519 public key as 64 lowercase hex
 * characters. Neutrino derives its `server_name` from the node identity, so
 * these are the server names the mesh actually uses — and they contain no dot
 * and no colon, which is why code that assumes a hostname shape tends to
 * mishandle them.
 */
/** Hosts that mean "this device", so plain HTTP to them is not a downgrade. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Parse a homeserver as a URL, tolerating a bare `host` or `host:port`.
 *
 * Both failure modes here are worth naming. `127.0.0.1:8008` throws, which is
 * at least loud. `localhost:8008` does *not* — `URL` reads it as the scheme
 * `localhost:` with no host at all, so a caller checking `hostname` silently
 * compares against an empty string and concludes it is not loopback. That is
 * why this insists on http/https rather than trusting a successful parse.
 */
function parseHomeserverUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url;
  } catch {
    /* no scheme, or not a URL at all: try it as a bare host below */
  }
  try {
    return new URL(`http://${value}`);
  } catch {
    return null;
  }
}

/**
 * Whether a homeserver points at this device — `localhost`, `127.0.0.1` or
 * `[::1]`, with or without a scheme or port.
 *
 * This is what makes plain HTTP acceptable: an embedded mesh node serves its
 * client-server API over loopback, where there is no network to eavesdrop on.
 */
export function isLoopbackHomeserverHost(value: string): boolean {
  const url = parseHomeserverUrl(value);
  return url !== null && LOOPBACK_HOSTS.has(url.hostname);
}

export function isMeshServerName(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/**
 * Whether a string can serve as a Matrix server name: a mesh node id, or a
 * host with an optional port. Deliberately loose about the host — this exists
 * to catch a value that could never work (a URL, a path, whitespace, an alias
 * pasted whole), not to re-implement the grammar.
 */
export function isServerName(value: string): boolean {
  if (isMeshServerName(value)) return true;
  if (/[\s/\\?#@]/.test(value)) return false;
  const [host, port, ...rest] = value.split(':');
  if (rest.length > 0 || !host) return false;
  if (port !== undefined && !/^\d{1,5}$/.test(port)) return false;
  return /^[A-Za-z0-9.-]+$/.test(host) && !host.startsWith('.') && !host.endsWith('.');
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
export function matrixUriFor(id: string, options: { via?: readonly string[] } = {}): string | null {
  const value = id.trim();
  // The body is everything after the sigil; `?action=` tells the client what
  // the user meant, so joining a room does not land them on a preview they
  // then have to act on again.
  if (isMatrixUserId(value)) return `matrix:u/${encodeURIComponent(value.slice(1))}?action=chat`;
  if (isMatrixRoomAlias(value)) return `matrix:r/${encodeURIComponent(value.slice(1))}?action=join`;
  if (isMatrixRoomId(value)) {
    // A room id names no server, so a client that is not already in the room
    // has nobody to ask and the join is a hard failure — measured against a
    // mesh node: `POST /join/!<id>` with no hint answers 404 M_NOT_FOUND,
    // while the same call with a `server_name` answers 200. Emitting the
    // via-less link anyway would hand out something that works only for people
    // who least need it, so it is `null` instead: no link beats a dead one.
    const via = (options.via ?? []).map((s) => s.trim()).filter(Boolean);
    if (via.length === 0) return null;
    const hints = via.map((s) => `&via=${encodeURIComponent(s)}`).join('');
    return `matrix:roomid/${encodeURIComponent(value.slice(1))}?action=join${hints}`;
  }
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
    // Loopback, not just `localhost`: an embedded mesh node serves its
    // client-server API on 127.0.0.1, and there is no network between the app
    // and a server inside the same device for https to protect.
    if (url.protocol !== 'https:' && !isLoopbackHomeserverHost(config.homeserver)) {
      issues.push(`messaging.homeserver must use https: ${config.homeserver}`);
    }
  } catch {
    issues.push(`messaging.homeserver is not a valid URL: ${config.homeserver}`);
  }
  // A wrong alias server is the most expensive typo in this file: every
  // generated alias lands in a namespace nobody owns, so each attendee's client
  // finds nothing, and they end up in as many rooms as there are attendees —
  // with no error anywhere. Caught here, at bundle build, rather than in a hall.
  if (config.aliasServer !== undefined && !isServerName(config.aliasServer)) {
    issues.push(`messaging.aliasServer is not a server name: ${config.aliasServer}`);
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
