import { conferenceChatAlias } from '@indiafoss/model';
import type { Booth, EventBundle, MessagingRoom } from '@indiafoss/model';

/**
 * Links into the organiser's public Matrix rooms (FOSDEM-style, see
 * docs/messaging.md). They open in Element or whatever Matrix client the
 * attendee already has; the companion never signs in to that server. Only
 * bundles that publish a `messaging` block get links — the built-in
 * matrix.org fallback is for the mesh alias scheme, not for real rooms.
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
 * of its hall (one room per location is the FOSDEM model), else nothing.
 */
export function sessionRoomLink(
  bundle: EventBundle | null,
  activityId: string,
  locationId: string | undefined,
): ConferenceRoomLink | null {
  const config = bundle?.messaging;
  if (!bundle || !config) return null;
  const listed = config.rooms.find((r) => r.activityId === activityId);
  if (listed) return toLink(listed);
  if (!locationId) return null;
  const byLocation = config.rooms.find((r) => r.locationId === locationId);
  if (byLocation) return toLink(byLocation);
  const location = bundle.locations.find((l) => l.id === locationId);
  if (!location) return null;
  const alias = conferenceChatAlias(config, bundle.id, 'room', locationId);
  return { alias, name: location.name, href: matrixToRoom(alias), recommended: false };
}

/** The room for a booth: its own listed room, else its location's, else the space. */
export function boothRoomLink(bundle: EventBundle | null, booth: Booth): ConferenceRoomLink | null {
  const config = bundle?.messaging;
  if (!bundle || !config) return null;
  const listed = config.rooms.find((r) => r.boothId === booth.id);
  if (listed) return toLink(listed);
  if (booth.locationId) {
    const byLocation = config.rooms.find((r) => r.locationId === booth.locationId);
    if (byLocation) return toLink(byLocation);
  }
  return spaceLink(bundle);
}
