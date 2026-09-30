import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLOORS, FLOOR_ORDER } from './venue-floors';
import { NOT_DRAWN, roomForLocation } from './venue-rooms';
import type { LoadedVenue } from './venue.svelte';

/**
 * The join between the two venue assets, checked against the committed ones.
 *
 * `venue.metadata.json` is authored against the routing graph and
 * `venue-floors.ts` is traced from the organiser's artwork; neither names the
 * other's ids. `roomForLocation` bridges them by stripping the floor prefix
 * off an entrance node id, so a venue revision that renames an entrance moves
 * a room off the plan silently — an activity there is then absent from the
 * FloorPlan with no error. The metadata is still `"_draft": true` and its own
 * notes ask for entrances to be verified with the venue team, so that rename
 * is expected rather than hypothetical.
 *
 * Unit coverage of these functions belongs in `venue-rooms.test.ts` against a
 * synthetic fixture; this file exists to fail when the real assets drift apart.
 */
function loadVenue(): LoadedVenue {
  const url = new URL(
    '../../../../events/indiafoss-2026/venue/venue.metadata.json',
    import.meta.url,
  );
  const metadata = JSON.parse(readFileSync(url, 'utf8'));
  // Only `metadata.locations` is consulted by the functions under test.
  return { metadata } as LoadedVenue;
}

describe('venue room mapping against the committed 2026 assets', () => {
  const venue = loadVenue();
  const locationIds = Object.keys(venue.metadata.locations);

  it('resolves every location to a drawn room or an explicit omission', () => {
    const unresolved = locationIds.filter(
      (id) => roomForLocation(venue, id) === null && !NOT_DRAWN.has(id),
    );
    expect(unresolved).toEqual([]);
  });

  it('names only real locations as deliberately not drawn', () => {
    // A stale NOT_DRAWN entry would mask a location that has since been drawn.
    expect([...NOT_DRAWN.keys()].filter((id) => !locationIds.includes(id))).toEqual([]);
  });

  it('resolves each drawn room to a room the artwork actually has', () => {
    const rooms = new Set(FLOOR_ORDER.flatMap((f) => FLOORS[f].rooms.map((r) => r.id)));
    for (const id of locationIds) {
      const room = roomForLocation(venue, id);
      if (room !== null) expect(rooms).toContain(room);
    }
  });
});
