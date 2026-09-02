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

/** Floor-plan room for a venue location id, or null when it is not drawn. */
export function roomForLocation(venue: LoadedVenue, locationId: string): string | null {
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
