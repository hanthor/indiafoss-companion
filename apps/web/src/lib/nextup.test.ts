import { describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import { computeNextUp } from './nextup';

const bundle = {
  id: 'test',
  start: '2026-09-19T03:30:00.000Z',
  end: '2026-09-20T12:30:00.000Z',
  timezone: 'Asia/Kolkata',
  locations: [
    { id: 'hall-1', name: 'Hall 1', kind: 'room', routingNodeIds: [] },
    { id: 'hall-2', name: 'Hall 2', kind: 'room', routingNodeIds: [] },
  ],
  activities: [
    {
      id: 'a',
      title: 'Soon in Hall 1',
      type: 'talk',
      start: '2026-09-19T04:30:00.000Z',
      end: '2026-09-19T05:00:00.000Z',
      locationId: 'hall-1',
      speakerIds: [],
      tags: [],
      flexible: false,
      source: 't',
    },
    {
      id: 'b',
      title: 'Later in Hall 2 (bookmarked)',
      type: 'talk',
      start: '2026-09-19T05:00:00.000Z',
      end: '2026-09-19T05:30:00.000Z',
      locationId: 'hall-2',
      speakerIds: [],
      tags: [],
      flexible: false,
      source: 't',
    },
  ],
  people: [],
  booths: [],
  tracks: [],
} as unknown as EventBundle;

const venue = {
  key: 'x',
  svg: '',
  graph: {
    nodes: [
      { id: 'gf-hall-1', x: 0, y: 0, floor: 'ground' },
      { id: 'gf-hall-2', x: 100, y: 0, floor: 'ground' },
    ],
    edges: [
      {
        from: 'gf-hall-1',
        to: 'gf-hall-2',
        distanceMeters: 100,
        timeSeconds: 90,
        accessible: true,
        stairs: false,
        lift: false,
        oneWay: false,
      },
    ],
  },
  metadata: {
    locations: {
      'hall-1': { floor: 'ground', entrances: ['gf-hall-1'] },
      'hall-2': { floor: 'ground', entrances: ['gf-hall-2'] },
    },
  },
} as never;

const base = {
  bundle,
  now: '2026-09-19T04:00:00.000Z',
  venue: null,
  currentLocation: null,
  profile: 'fastest' as const,
  bufferSeconds: 300,
};

describe('computeNextUp', () => {
  it('prefers the earliest bookmarked session over the programme order', () => {
    const next = computeNextUp({ ...base, bookmarked: (id) => id === 'b' });
    expect(next?.activity.id).toBe('b');
    expect(next?.planned).toBe(true);
    expect(next?.startsInMinutes).toBe(60);
    expect(next?.leaveBy).toBeNull();
  });

  it('falls back to the next session in the programme', () => {
    const next = computeNextUp({ ...base, bookmarked: () => false });
    expect(next?.activity.id).toBe('a');
    expect(next?.planned).toBe(false);
  });

  it('computes walk time and leave-by once the location and graph are known', () => {
    const next = computeNextUp({
      ...base,
      bookmarked: () => false,
      venue,
      currentLocation: 'hall-2',
    });
    expect(next?.activity.id).toBe('a');
    expect(next?.travelSeconds).toBeGreaterThan(0);
    // 30 min out, minus walk and the 5 min buffer.
    expect(next?.leaveInMinutes).toBeLessThan(25);
    expect(next?.leaveInMinutes).toBeGreaterThan(0);
  });

  it('gives a zero walk when already in the room', () => {
    const next = computeNextUp({
      ...base,
      bookmarked: () => false,
      venue,
      currentLocation: 'hall-1',
    });
    expect(next?.travelSeconds).toBe(0);
    expect(next?.leaveInMinutes).toBe(25);
  });

  it('returns nothing beyond the horizon', () => {
    expect(computeNextUp({ ...base, bookmarked: () => false, horizonMinutes: 10 })).toBeNull();
  });

  it('puts a must-attend session ahead of an earlier bookmark', () => {
    const next = computeNextUp({
      ...base,
      bookmarked: (id) => id === 'a' || id === 'b',
      mustAttend: (id) => id === 'b',
    });
    expect(next?.activity.id).toBe('b');
    expect(next?.mustAttend).toBe(true);
  });
});
