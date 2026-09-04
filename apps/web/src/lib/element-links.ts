import { conferenceChatAlias } from '@indiafoss/model';
import type { Booth, EventBundle, MessagingRoom } from '@indiafoss/model';

/**
 * Links into Matrix rooms — the organiser's public rooms (FOSDEM-style) and
 * per-session/booth/venue chats alike (see docs/messaging.md). All of it is
 * a `matrix.to` handoff now (ADR 0004): the companion never embeds a chat
 * UI or signs in anywhere, it only builds the deterministic link and lets
 * the OS hand it to whatever Matrix client is installed — the dedicated
 * `hanthor/indiafoss-chat-android` app for mesh identities, Element or any
 * other client for the organiser's public homeserver.
 */
export function matrixToRoom(aliasOrId: string): string {
  return `https://matrix.to/#/${encodeURIComponent(aliasOrId)}`;
}

export interface ConferenceRoomLink {
  alias: string;
  name: string;
  purpose?: string;
  href: string;
  recommended: boolean;
}

function toLink(room: MessagingRoom): ConferenceRoomLink {
  return {
    alias: room.alias,
    name: room.name,
    purpose: room.purpose,
    href: matrixToRoom(room.alias),
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
        href: matrixToRoom(space),
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
      return { alias, name: location.name, href: matrixToRoom(alias), recommended: false };
    }
  }
  const alias = conferenceChatAlias(config, bundle.id, 'session', activityId);
  return { alias, name: activityName, href: matrixToRoom(alias), recommended: false };
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
  return { alias, name: booth.name, href: matrixToRoom(alias), recommended: false };
}
