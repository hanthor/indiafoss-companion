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
const prefs: SolverPreferences = {
  ratingOf: () => 1200,
  dispositionOf: () => 'normal',
  bookmarked: () => false,
};
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

describe('stay for a programme track', () => {
  it('keeps contiguous talks in the same room and reserves gaps', () => {
    const b = bundle([
      make('a', '10:00', '10:30'),
      make('b', '10:30', '11:00'),
      make('c', '11:30', '12:00'),
      make('tempting', '11:00', '11:30', 'other'),
    ]);
    const result = solveDay({ bundle: b, day, preferences: prefs, stayTrackIds: ['devroom-rust'] });
    expect(result.mustAttendConflicts).toEqual([]);
    expect(result.itinerary.items.map((i) => i.activityId)).toEqual(['a', 'b', 'c']);
  });
  it('reports a must-go in a reserved gap instead of silently leaving', () => {
    const b = bundle([
      make('a', '10:00', '10:30'),
      make('b', '11:30', '12:00'),
      make('must', '10:45', '11:15', 'other'),
    ]);
    const result = solveDay({
      bundle: b,
      day,
      preferences: { ...prefs, dispositionOf: (id) => (id === 'must' ? 'must-attend' : 'normal') },
      stayTrackIds: ['devroom-rust'],
    });
    expect(result.mustAttendConflicts.some((c) => c.a === 'must' || c.b === 'must')).toBe(true);
  });
  it('does not reserve another programme in the same physical room', () => {
    const a = make('morning', '10:00', '11:00');
    const b = { ...make('afternoon', '14:00', '15:00', 'devroom-other'), locationId: a.locationId };
    const result = solveDay({
      bundle: bundle([a, b]),
      day,
      preferences: {
        ...prefs,
        dispositionOf: (id) => (id === 'afternoon' ? 'not-interested' : 'normal'),
      },
      stayTrackIds: ['devroom-rust'],
    });
    expect(result.itinerary.items.map((i) => i.activityId)).toEqual(['morning']);
  });
  it('surfaces overlapping source talks inside a selected draft devroom', () => {
    const result = solveDay({
      bundle: bundle([make('a', '10:00', '10:30'), make('b', '10:15', '10:45')]),
      day,
      preferences: prefs,
      stayTrackIds: ['devroom-rust'],
    });
    expect(result.mustAttendConflicts).toEqual([{ a: 'a', b: 'b' }]);
  });
});
