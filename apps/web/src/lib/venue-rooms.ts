import type { LoadedVenue } from '$lib/venue.svelte';
import { FLOORS, FLOOR_ORDER, type FloorId } from '$lib/venue-floors';

/**
 * Which NIMHANS room a venue location's entrance node stands in. The 2026
 * metadata names entrances after the rooms (`gf-hall-1` → `hall-1`); the
 * synthetic venue that carries the 2025 schedule uses its own names, and
 * these are the physical rooms it stands in for on the plan.
 */
const ENTRANCE_ALIASES: Record<string, string> = {
  audi1: 'hall-1',
  audi2: 'hall-2',
  devroom1: 'hall-3',
  devroom2: 'room-1',
  workshops: 'room-2',
  bof: 'room-3',
  quiet: 'silent',
  silent: 'silent',
  food: 'lunch',
  booths: 'hall-1-balcony',
  'community-booths': 'hall-1-balcony',
};

const KNOWN_ROOMS = new Set(FLOOR_ORDER.flatMap((f) => FLOORS[f].rooms.map((r) => r.id)));

/**
 * Venue locations that deliberately have no room on the floor plan, and why.
 *
 * These are not rooms in the organiser's artwork, so there is nothing for them
 * to resolve to: `FloorMark` (the amenity icons, badges and baked labels drawn
 * over the rooms) carries geometry only and no id, so a location whose
 * `svgTarget` is an `amenity-*` mark cannot be named by a room id. Aliasing one
 * onto a nearby room would draw it inside a hall it is not in.
 *
 * Listing them explicitly separates "not drawn, by design" from "an entrance
 * node or location id drifted and no longer matches the plan" — both of which
 * otherwise leave [[roomForLocation]] returning the same bare `null`.
 */
export const NOT_DRAWN: ReadonlyMap<string, string> = new Map([
  // svgTarget is the amenity-fossu-desk mark, not a room path.
  ['fossu-help-desk', 'amenity mark, not a room'],
  // A routing origin (its only entrance is the bare `entrance` graph node)
  // with no svgTarget at all.
  ['registration', 'routing origin, no room geometry'],
]);

/**
 * Floor-plan room for a venue location id, or null when it is not drawn.
 *
 * A `null` here means one of two different things, and [[NOT_DRAWN]] is what
 * tells them apart: a location listed there has no room by design, while any
 * other `null` means the location's entrance node no longer maps onto the plan
 * — drift worth catching rather than a deliberate omission.
 */
export function roomForLocation(venue: LoadedVenue, locationId: string): string | null {
  if (NOT_DRAWN.has(locationId)) return null;
  const ref = venue.metadata.locations[locationId];
  const entrance = ref?.entrances[0];
  if (!entrance) return null;
  const floor = entrance.startsWith('ff-') ? 'first' : 'ground';
  const stem = entrance.replace(/^(gf|ff)-/, '');
  // The first-floor entrance of Hall 1 is the balcony.
  if (stem === 'hall-1' && floor === 'first') return 'hall-1-balcony';
  const room = ENTRANCE_ALIASES[stem] ?? stem;
  return KNOWN_ROOMS.has(room) ? room : null;
}

/** Venue location ids drawn as `roomId`, most specific first. */
export function locationsForRoom(venue: LoadedVenue, roomId: string): string[] {
  return Object.keys(venue.metadata.locations)
    .filter((id) => roomForLocation(venue, id) === roomId)
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
}

export function floorOfRoom(roomId: string): FloorId | null {
  for (const id of FLOOR_ORDER) {
    if (FLOORS[id].rooms.some((r) => r.id === roomId)) return id;
  }
  return null;
}
