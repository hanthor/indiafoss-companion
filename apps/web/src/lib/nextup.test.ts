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

const base = {
  bundle,
  now: '2026-09-19T04:00:00.000Z',
};

describe('computeNextUp', () => {
  it('prefers the earliest bookmarked session over the programme order', () => {
    const next = computeNextUp({ ...base, bookmarked: (id) => id === 'b' });
    expect(next?.activity.id).toBe('b');
    expect(next?.planned).toBe(true);
    expect(next?.startsInMinutes).toBe(60);
  });

  it('never falls back to a break or a meal, but a bookmarked one still counts', () => {
    const first = base.bundle.activities[0]!;
    const tea = {
      ...first,
      id: 'tea',
      title: 'Tea Break',
      start: new Date(Date.parse(first.start!) - 30 * 60_000).toISOString(),
      end: new Date(Date.parse(first.start!) - 15 * 60_000).toISOString(),
    };
    const withBreak = {
      ...base,
      bundle: { ...base.bundle, activities: [tea, ...base.bundle.activities] },
    };
    expect(computeNextUp({ ...withBreak, bookmarked: () => false })?.activity.id).toBe('a');
    expect(computeNextUp({ ...withBreak, bookmarked: (id) => id === 'tea' })?.activity.id).toBe(
      'tea',
    );
  });

  it('falls back to the next session in the programme', () => {
    const next = computeNextUp({ ...base, bookmarked: () => false });
    expect(next?.activity.id).toBe('a');
    expect(next?.planned).toBe(false);
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

describe('next-up from a resolved plan', () => {
  it('does not resurrect a removed bookmark or must-go entry', () => {
    const next = computeNextUp({
      ...base,
      bookmarked: () => true,
      mustAttend: (id) => id === 'a',
      plannedIds: new Set(['b']),
    });
    expect(next?.activity.id).toBe('b');
    expect(next?.planned).toBe(true);
    expect(next?.mustAttend).toBe(false);
  });
  it('does not fall back to the general programme for an empty or conflicting plan', () => {
    expect(computeNextUp({ ...base, bookmarked: () => true, plannedIds: new Set() })).toBeNull();
  });
});
