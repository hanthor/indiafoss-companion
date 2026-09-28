import { describe, expect, it } from 'vitest';
import type { LoadedVenue } from '$lib/venue.svelte';
import { floorOfRoom, locationsForRoom, roomForLocation } from './venue-rooms';

const venue = (entrances: Record<string, string[]>): LoadedVenue =>
  ({
    key: 'test',
    svg: '',
    metadata: {
      locations: Object.fromEntries(
        Object.entries(entrances).map(([locationId, ids]) => [
          locationId,
          { locationId, entrances: ids },
        ]),
      ),
    },
  }) as unknown as LoadedVenue;

describe('roomForLocation', () => {
  it('returns null when the location has no entry', () => {
    expect(roomForLocation(venue({}), 'missing')).toBeNull();
  });

  it('returns null when the location has no entrances', () => {
    expect(roomForLocation(venue({ empty: [] }), 'empty')).toBeNull();
  });

  it('resolves a ground-floor entrance directly to its room', () => {
    expect(roomForLocation(venue({ loc: ['gf-hall-2'] }), 'loc')).toBe('hall-2');
  });

  it('resolves a first-floor entrance directly to its room', () => {
    expect(roomForLocation(venue({ loc: ['ff-room-1'] }), 'loc')).toBe('room-1');
  });

  it('maps the first-floor Hall 1 entrance to the balcony, not Hall 1', () => {
    expect(roomForLocation(venue({ loc: ['ff-hall-1'] }), 'loc')).toBe('hall-1-balcony');
  });

  it('keeps the ground-floor Hall 1 entrance as Hall 1', () => {
    expect(roomForLocation(venue({ loc: ['gf-hall-1'] }), 'loc')).toBe('hall-1');
  });

  it('resolves synthetic (2025) entrance ids through ENTRANCE_ALIASES', () => {
    expect(roomForLocation(venue({ loc: ['gf-audi1'] }), 'loc')).toBe('hall-1');
    expect(roomForLocation(venue({ loc: ['gf-audi2'] }), 'loc')).toBe('hall-2');
    expect(roomForLocation(venue({ loc: ['gf-devroom1'] }), 'loc')).toBe('hall-3');
    expect(roomForLocation(venue({ loc: ['ff-devroom2'] }), 'loc')).toBe('room-1');
    expect(roomForLocation(venue({ loc: ['ff-workshops'] }), 'loc')).toBe('room-2');
    expect(roomForLocation(venue({ loc: ['ff-bof'] }), 'loc')).toBe('room-3');
    expect(roomForLocation(venue({ loc: ['ff-quiet'] }), 'loc')).toBe('silent');
    expect(roomForLocation(venue({ loc: ['ff-silent'] }), 'loc')).toBe('silent');
    expect(roomForLocation(venue({ loc: ['gf-food'] }), 'loc')).toBe('lunch');
    expect(roomForLocation(venue({ loc: ['ff-booths'] }), 'loc')).toBe('hall-1-balcony');
    expect(roomForLocation(venue({ loc: ['gf-community-booths'] }), 'loc')).toBe('hall-1-balcony');
  });

  it('returns null for an entrance that resolves to an unknown room', () => {
    expect(roomForLocation(venue({ loc: ['gf-nowhere'] }), 'loc')).toBeNull();
  });

  it('only looks at the first entrance for a location', () => {
    expect(roomForLocation(venue({ loc: ['gf-hall-2', 'gf-hall-1'] }), 'loc')).toBe('hall-2');
  });
});

describe('locationsForRoom', () => {
  it('finds every location that resolves to the given room, most specific first', () => {
    const v = venue({
      a: ['gf-hall-2'],
      b: ['gf-audi2'],
      c: ['gf-hall-1'],
    });
    expect(locationsForRoom(v, 'hall-2')).toEqual(['a', 'b']);
  });

  it('returns an empty list when nothing resolves to the room', () => {
    expect(locationsForRoom(venue({ a: ['gf-hall-1'] }), 'room-3')).toEqual([]);
  });

  it('breaks ties between equal-length ids alphabetically', () => {
    const v = venue({
      bb: ['gf-hall-1'],
      aa: ['gf-hall-1'],
    });
    expect(locationsForRoom(v, 'hall-1')).toEqual(['aa', 'bb']);
  });
});

describe('floorOfRoom', () => {
  it('finds the floor for a ground-floor room', () => {
    expect(floorOfRoom('hall-1')).toBe('ground');
  });

  it('finds the floor for a first-floor room', () => {
    expect(floorOfRoom('room-2')).toBe('first');
  });

  it('returns null for an unknown room', () => {
    expect(floorOfRoom('does-not-exist')).toBeNull();
  });
});
