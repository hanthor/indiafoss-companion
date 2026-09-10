import { describe, expect, it } from 'vitest';
import type { Activity, EventBundle } from '@indiafoss/model';
import { solveDay, type SolverPreferences } from './index.js';

const day = '2026-09-26';
const make = (id: string, start: string, end: string, track = 'devroom-rust'): Activity => ({
  id,
  title: id,
  type: 'talk',
  start: `${day}T${start}:00+05:30`,
  end: `${day}T${end}:00+05:30`,
  trackId: track,
  devroomId: track,
  locationId: track,
  flexible: false,
  speakerIds: [],
  tags: [],
  source: 'fixture',
});
const bundle = (activities: Activity[]): EventBundle => ({
  schemaVersion: 1,
  id: 'fixture',
  name: 'Fixture',
  timezone: 'Asia/Kolkata',
  start: `${day}T08:00:00+05:30`,
  end: `${day}T18:00:00+05:30`,
  activities,
  people: [],
  locations: [],
  tracks: [],
  booths: [],
  sourceMetadata: { source: 'fixture', normalizerVersion: '1' },
});
const prefs = (over: Partial<SolverPreferences> = {}): SolverPreferences => ({
  ratingOf: () => 1200,
  dispositionOf: () => 'normal',
  bookmarked: () => false,
  ...over,
});
const ids = (r: ReturnType<typeof solveDay>) =>
  r.itinerary.items.filter((i) => !i.flexible).map((i) => i.activityId);

describe('clash losses in the itinerary (#271)', () => {
  it('a talk that stood aside is left out while its winner is live, and comes back when it is not', () => {
    const b = bundle([
      make('a', '11:00', '11:30', 'x'),
      make('b', '11:00', '11:30', 'y'),
      make('c', '11:00', '11:30', 'z'),
    ]);
    const yieldsTo = (id: string) => (id === 'b' || id === 'c' ? 'a' : undefined);
    const ratingOf = (id: string) => (id === 'c' ? 1400 : 1200);
    expect(ids(solveDay({ bundle: b, day, preferences: prefs({ ratingOf, yieldsTo }) }))).toEqual([
      'a',
    ]);
    // The winner leaves the day: the losers are live again and the best of them is planned.
    const dispositionOf = (id: string) => (id === 'a' ? 'not-interested' : 'normal');
    expect(
      ids(solveDay({ bundle: b, day, preferences: prefs({ ratingOf, yieldsTo, dispositionOf }) })),
    ).toEqual(['c']);
  });

  it('a must-go loser never stands aside: the explicit conflict is still reported', () => {
    const b = bundle([make('a', '11:00', '11:30', 'x'), make('b', '11:00', '11:30', 'y')]);
    const result = solveDay({
      bundle: b,
      day,
      preferences: prefs({
        dispositionOf: (id) => (id === 'a' ? 'must-attend' : id === 'b' ? 'must-attend' : 'normal'),
        yieldsTo: (id) => (id === 'b' ? 'a' : undefined),
      }),
    });
    expect(result.mustAttendConflicts).toEqual([{ a: 'a', b: 'b' }]);
  });

  it('a later compatible talk is not suppressed by a stood-aside neighbour', () => {
    // w (11:00–13:00) stood aside for x (11:00–11:30); y (12:30–13:00) overlaps only w.
    const b = bundle([
      make('w', '11:00', '13:00', 'x'),
      make('x', '11:00', '11:30', 'y'),
      make('y', '12:30', '13:00', 'z'),
    ]);
    const result = solveDay({
      bundle: b,
      day,
      preferences: prefs({ yieldsTo: (id) => (id === 'w' ? 'x' : undefined) }),
    });
    expect(ids(result)).toEqual(['x', 'y']);
  });

  it('leaving a reserved devroom for one talk keeps the rest of the block', () => {
    const b = bundle([
      make('d1', '10:00', '10:30'),
      make('d2', '10:30', '11:00'),
      make('d3', '11:15', '11:45'),
      // Leaves time to walk over from d1 and back for d3.
      make('elsewhere', '10:45', '11:00', 'other'),
      make('tempting', '11:15', '11:45', 'other'),
    ]);
    const result = solveDay({
      bundle: b,
      day,
      preferences: prefs({
        ratingOf: (id) => (id === 'tempting' ? 1500 : 1200),
        yieldsTo: (id) => (id === 'd2' ? 'elsewhere' : undefined),
      }),
      stayTrackIds: ['devroom-rust'],
    });
    expect(result.mustAttendConflicts).toEqual([]);
    // d2 is replaced by the chosen talk; the reservation still keeps 'tempting' out of 11:00.
    expect(ids(result)).toEqual(['d1', 'elsewhere', 'd3']);
  });

  it('a must-go winner over a reserved devroom talk is not a must-go conflict with that devroom', () => {
    const b = bundle([
      make('d1', '10:00', '10:30'),
      make('d2', '10:30', '11:00'),
      make('elsewhere', '10:45', '11:00', 'other'),
    ]);
    const result = solveDay({
      bundle: b,
      day,
      preferences: prefs({
        dispositionOf: (id) => (id === 'elsewhere' ? 'must-attend' : 'normal'),
        yieldsTo: (id) => (id === 'd2' ? 'elsewhere' : undefined),
      }),
      stayTrackIds: ['devroom-rust'],
    });
    expect(result.mustAttendConflicts).toEqual([]);
    expect(ids(result)).toEqual(['d1', 'elsewhere']);
  });
});
