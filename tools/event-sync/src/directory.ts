import { conferenceChatAlias, homeserverName } from '@indiafoss/model';
import type { EventBundle } from '@indiafoss/model';
import type { ConferenceDirectory, DirectoryRoom } from '@indiafoss/model/contracts';

/**
 * The published conference directory (C-06, #166): the resolved, validated,
 * attendee-facing answer to "which rooms exist and how do I reach them".
 *
 * `events/<id>/messaging.json` stays the one file a human edits; this derives
 * the directory from it and the bundle, listing the same rooms `planRooms`
 * creates and `element-links.ts` links to, so the three cannot disagree.
 *
 * Two rules the shape cannot enforce travel with it: the alias is
 * authoritative, and no client ever creates a room from this list.
 */
export function buildConferenceDirectory(
  bundle: EventBundle,
  generatedAt: string,
): ConferenceDirectory | null {
  const config = bundle.messaging;
  if (!config) return null;

  const activityIds = new Set(bundle.activities.map((a) => a.id));
  const locationIds = new Set(bundle.locations.map((l) => l.id));
  const rooms: DirectoryRoom[] = [];
  const seen = new Set<string>();
  const add = (room: DirectoryRoom) => {
    if (seen.has(room.alias)) return;
    seen.add(room.alias);
    rooms.push(room);
  };

  for (const room of config.rooms) {
    if (room.activityId !== undefined && !activityIds.has(room.activityId)) {
      throw new Error(`messaging room ${room.alias} names an unknown activity: ${room.activityId}`);
    }
    if (room.locationId !== undefined && !locationIds.has(room.locationId)) {
      throw new Error(`messaging room ${room.alias} names an unknown location: ${room.locationId}`);
    }
    add({
      id: room.locationId ?? room.boothId ?? slugOf(room.alias),
      name: room.name,
      alias: room.alias,
      route: room.route ?? 'classic',
      visibility: room.visibility ?? 'public',
      ...(room.purpose ? { topic: room.purpose } : {}),
      ...(room.activityId ? { activityIds: [room.activityId] } : {}),
      ...(room.locationId ? { locationId: room.locationId } : {}),
    });
  }
  // One room per venue location, the FOSDEM model, unless the organiser turned
  // generated chats off. Same default as `planRooms`.
  if (config.sessionChats !== false) {
    for (const location of bundle.locations) {
      add({
        id: location.id,
        name: location.name,
        alias: conferenceChatAlias(config, bundle.id, 'room', location.id),
        route: 'classic',
        visibility: 'public',
        topic: `${bundle.name} — everything happening in ${location.name}`,
        locationId: location.id,
      });
    }
  }

  return {
    schemaVersion: 1,
    eventId: bundle.id,
    generatedAt,
    server: config.aliasServer ?? homeserverName(config.homeserver),
    rooms,
  };
}

/** The alias localpart, as a directory entry id for rooms tied to nothing in the bundle. */
function slugOf(alias: string): string {
  return alias.slice(1).split(':')[0]!.toLowerCase();
}
