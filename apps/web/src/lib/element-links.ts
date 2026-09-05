import { conferenceChatAlias, matrixUriFor } from '@indiafoss/model';
import type { Booth, EventBundle, MessagingRoom } from '@indiafoss/model';

/**
 * Links into Matrix rooms — the organiser's public rooms (FOSDEM-style) and
 * per-session/booth/venue chats alike (see docs/messaging.md). All of it is a
 * handoff now (ADR 0004): the companion never embeds a chat UI or signs in
 * anywhere, it only builds the deterministic link and lets the OS hand it to
 * whatever Matrix client is installed — the dedicated
 * `hanthor/indiafoss-chat-android` app for mesh identities, Element or any
 * other client for the organiser's public homeserver.
 *
 * Every link comes in two forms, and which is primary matters:
 *
 * * `href` is an MSC2312 `matrix:` URI. The package manager resolves it
 *   locally, so it opens the installed client **with no network at all**.
 * * `webHref` is the `matrix.to` permalink — a real web page, and the only
 *   thing that works on a desktop browser with no Matrix client installed.
 *
 * `matrix.to` used to be the primary link, which was wrong for this product:
 * it is a page that *redirects* to a client, so at a venue with no internet
 * the browser shows an offline error and the client is never reached. That was
 * measured on a handset — with the radios off a session-chat link landed on
 * Chrome's dinosaur, while the `matrix:` URI opened Element X on the room.
 * Offline is the condition this app exists for, so the offline-capable link
 * leads.
 */
export function matrixToRoom(aliasOrId: string): string {
  return `https://matrix.to/#/${encodeURIComponent(aliasOrId)}`;
}

/**
 * The link to hand a room to an installed client. Falls back to the `matrix.to`
 * permalink for anything `matrixUriFor` will not accept, so a malformed alias
 * still produces something a browser can show rather than a dead scheme.
 */
export function roomHandoffHref(aliasOrId: string): string {
  return matrixUriFor(aliasOrId) ?? matrixToRoom(aliasOrId);
}

export interface ConferenceRoomLink {
  alias: string;
  name: string;
  purpose?: string;
  /** `matrix:` URI — opens an installed client, offline included. */
  href: string;
  /** `matrix.to` permalink — the web fallback when no client is installed. */
  webHref: string;
  recommended: boolean;
}

function toLink(room: MessagingRoom): ConferenceRoomLink {
  return {
    alias: room.alias,
    name: room.name,
    purpose: room.purpose,
    href: roomHandoffHref(room.alias),
    webHref: matrixToRoom(room.alias),
    recommended: room.recommended ?? false,
  };
}

/** The organiser's Space, when the bundle names one. */
export function spaceLink(bundle: EventBundle | null): ConferenceRoomLink | null {
  const space = bundle?.messaging?.space;
  return space
    ? {
        alias: space,
        name: `${bundle!.name} · Space`,
        href: roomHandoffHref(space),
        webHref: matrixToRoom(space),
        recommended: true,
      }
    : null;
}

/** Rooms the organisers listed, recommended ones first. */
export function listedRooms(bundle: EventBundle | null): ConferenceRoomLink[] {
  const rooms = bundle?.messaging?.rooms ?? [];
  return rooms.map(toLink).sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

/**
 * The room for a session: the room the organisers tied to it, else the room
 * of its hall (one room per location is the FOSDEM model), else the
 * deterministic per-session alias every mesh node and Spindle client
 * converges on. Still requires a real organiser `messaging` block — without
 * one there's no `aliasServer` for the deterministic alias to land on, and a
 * link to a room on nobody's homeserver is worse than no link.
 */
export function sessionRoomLink(
  bundle: EventBundle | null,
  activityId: string,
  locationId: string | undefined,
  activityName: string,
): ConferenceRoomLink | null {
  const config = bundle?.messaging;
  if (!bundle || !config || config.sessionChats === false) return null;
  const listed = config.rooms.find((r) => r.activityId === activityId);
  if (listed) return toLink(listed);
  if (locationId) {
    const byLocation = config.rooms.find((r) => r.locationId === locationId);
    if (byLocation) return toLink(byLocation);
    const location = bundle.locations.find((l) => l.id === locationId);
    if (location) {
      const alias = conferenceChatAlias(config, bundle.id, 'room', locationId);
      return {
        alias,
        name: location.name,
        href: roomHandoffHref(alias),
        webHref: matrixToRoom(alias),
        recommended: false,
      };
    }
  }
  const alias = conferenceChatAlias(config, bundle.id, 'session', activityId);
  return {
    alias,
    name: activityName,
    href: roomHandoffHref(alias),
    webHref: matrixToRoom(alias),
    recommended: false,
  };
}

/**
 * The room for a booth: its own listed room, else its location's, else the
 * deterministic per-booth alias. Same `messaging`-block requirement as
 * {@link sessionRoomLink}.
 */
export function boothRoomLink(bundle: EventBundle | null, booth: Booth): ConferenceRoomLink | null {
  const config = bundle?.messaging;
  if (!bundle || !config || config.sessionChats === false) return null;
  const listed = config.rooms.find((r) => r.boothId === booth.id);
  if (listed) return toLink(listed);
  if (booth.locationId) {
    const byLocation = config.rooms.find((r) => r.locationId === booth.locationId);
    if (byLocation) return toLink(byLocation);
  }
  const alias = conferenceChatAlias(config, bundle.id, 'booth', booth.id);
  return {
    alias,
    name: booth.name,
    href: roomHandoffHref(alias),
    webHref: matrixToRoom(alias),
    recommended: false,
  };
}
