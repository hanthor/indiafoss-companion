import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Activity, EventBundle } from '@indiafoss/model';
import { EVENT_BUNDLE_SCHEMA_VERSION } from '@indiafoss/model';
import {
  activityUtility,
  canFollow,
  DEFAULT_FLEXIBLE_GOALS,
  longestPathInDag,
  SOLVER_CONFIG,
  solveDay,
  type SolverPreferences,
  type TravelTimeProvider,
} from './index.js';

const DAY = '2026-09-19';
const iso = (t: string) => `${DAY}T${t}:00+05:30`;

function act(id: string, start: string, end: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    title: id,
    type: 'talk',
    start: iso(start),
    end: iso(end),
    flexible: false,
    speakerIds: [],
    tags: [],
    source: 'test',
    ...overrides,
  };
}

function bundle(activities: Activity[]): EventBundle {
  return {
    schemaVersion: EVENT_BUNDLE_SCHEMA_VERSION,
    id: 'test',
    name: 'Test',
    timezone: 'Asia/Kolkata',
    start: iso('09:00'),
    end: iso('18:00'),
    activities,
    people: [],
    locations: [],
    booths: [],
    tracks: [],
    sourceMetadata: { source: 'test', normalizerVersion: '1' },
  };
}

const prefs = (
  ratings: Record<string, number> = {},
  dispositions: Record<
    string,
    SolverPreferences['dispositionOf'] extends (a: string) => infer R ? R : never
  > = {},
  bookmarks: string[] = [],
): SolverPreferences => ({
  ratingOf: (id) => ratings[id] ?? 1200,
  dispositionOf: (id) => dispositions[id] ?? 'normal',
  bookmarked: (id) => bookmarks.includes(id),
});

const travel: TravelTimeProvider = { seconds: () => 300 };

describe('activityUtility', () => {
  it('applies must-attend and bookmark bonuses, minus fatigue', () => {
    const a = act('a', '10:00', '11:00');
    const base = activityUtility(a, prefs());
    expect(activityUtility(a, prefs({}, { a: 'must-attend' }))).toBe(
      base + SOLVER_CONFIG.mustAttendBonus,
    );
    expect(activityUtility(a, prefs({}, {}, ['a']))).toBe(base + SOLVER_CONFIG.bookmarkBonus);
    // 60 min session -> 10 fatigue
    expect(activityUtility(a, prefs())).toBe(1200 - SOLVER_CONFIG.fatiguePenaltyPerHour);
  });
});

describe('canFollow', () => {
  it('requires travel + buffer between sessions', () => {
    const a = act('a', '10:00', '10:30');
    const b = act('b', '10:35', '11:00'); // 5 min gap = travel only, no buffer
    const c = act('c', '10:40', '11:10'); // 10 min gap = travel + 5 min buffer
    expect(canFollow(a, c, travel, 300)).toBe(true);
    expect(canFollow(a, b, travel, 300)).toBe(false);
  });
});

describe('longestPathInDag', () => {
  it('picks the higher-utility feasible chain', () => {
    // a(10:00-11:00, 1300), b(10:15-11:15, 1250), c(11:30-12:30, 1200)
    // a->c and b->c both feasible; a is worth more -> a, c
    const a = act('a', '10:00', '11:00');
    const b = act('b', '10:15', '11:15');
    const c = act('c', '11:30', '12:30');
    const result = longestPathInDag([a, b, c], prefs({ a: 1300, b: 1250, c: 1200 }), travel, 300);
    expect(result.order.map((x) => x.id)).toEqual(['a', 'c']);
  });
});

describe('solveDay', () => {
  it('produces a feasible itinerary with no overlaps and travel respected', () => {
    const activities = [
      act('a', '10:00', '11:00'),
      act('b', '10:15', '11:15'),
      act('c', '11:30', '12:30'),
      act('d', '14:00', '15:00'),
      act('e', '14:30', '15:30'),
    ];
    const result = solveDay({ bundle: bundle(activities), day: DAY, preferences: prefs(), travel });
    expect(result.mustAttendConflicts).toEqual([]);
    const items = result.itinerary.items;

    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1]!;
      const next = items[i]!;
      // no overlap
      expect(Date.parse(prev.end)).toBeLessThanOrEqual(Date.parse(next.start));
      // travel + buffer respected for fixed activities
      if (!prev.flexible && !next.flexible) {
        expect(Date.parse(next.start) - Date.parse(prev.end)).toBeGreaterThanOrEqual(600_000);
      }
    }
  });

  it('always includes compatible must-attend activities', () => {
    const must = act('lock', '10:00', '11:00');
    const other = act('other', '11:30', '12:30', { type: 'talk' });
    const result = solveDay({
      bundle: bundle([must, other]),
      day: DAY,
      preferences: prefs({}, { lock: 'must-attend' }),
      travel,
    });
    expect(result.mustAttendConflicts).toEqual([]);
    expect(result.itinerary.items.map((i) => i.activityId)).toContain('lock');
  });

  it('reports conflicts for incompatible must-attend locks', () => {
    const a = act('lock-a', '10:00', '11:00');
    const b = act('lock-b', '10:15', '11:15'); // overlaps; no feasible order
    const result = solveDay({
      bundle: bundle([a, b]),
      day: DAY,
      preferences: prefs({}, { 'lock-a': 'must-attend', 'lock-b': 'must-attend' }),
      travel,
    });
    expect(result.mustAttendConflicts).toHaveLength(1);
    expect(result.itinerary.items).toEqual([]);
  });

  it('excludes not-interested and watch-later activities', () => {
    const a = act('a', '10:00', '11:00');
    const ni = act('ni', '10:15', '11:15');
    const wl = act('wl', '11:30', '12:30');
    const result = solveDay({
      bundle: bundle([a, ni, wl]),
      day: DAY,
      preferences: prefs({}, { ni: 'not-interested', wl: 'watch-later' }),
      travel,
    });
    expect(result.itinerary.items.some((i) => i.activityId === 'ni')).toBe(false);
    expect(result.itinerary.items.some((i) => i.activityId === 'wl')).toBe(false);
    expect(result.watchLater).toContain('wl');
  });

  it('places flexible activities in gaps', () => {
    const a = act('a', '10:00', '11:00');
    const b = act('b', '12:30', '13:30'); // 90 min gap
    const result = solveDay({
      bundle: bundle([a, b]),
      day: DAY,
      preferences: prefs(),
      travel,
      flexibleGoals: DEFAULT_FLEXIBLE_GOALS,
    });
    const flex = result.itinerary.items.filter((i) => i.flexible);
    expect(flex.length).toBeGreaterThan(0);
    // flexible slot must sit inside the gap
    for (const f of flex) {
      expect(Date.parse(f.start)).toBeGreaterThanOrEqual(Date.parse(iso('11:00')) + 300_000);
      expect(Date.parse(f.end)).toBeLessThanOrEqual(Date.parse(iso('12:30')) - 300_000);
    }
  });

  it('provides ranked backups for chosen sessions', () => {
    const a = act('a', '10:00', '11:00', { title: 'Top talk' });
    const alt = act('alt', '10:15', '11:00', { title: 'Alt talk' });
    const result = solveDay({
      bundle: bundle([a, alt]),
      day: DAY,
      preferences: prefs({ a: 1300, alt: 1100 }),
      travel,
    });
    expect(result.backups[a.id]).toContain('alt');
  });
});

describe('solver properties (§51)', () => {
  const dayPlan = fc
    .array(
      fc.record({
        id: fc.integer({ min: 1, max: 20 }),
        start: fc.integer({ min: 540, max: 900 }), // 9:00–15:00 minutes
        dur: fc.integer({ min: 20, max: 60 }),
      }),
      { minLength: 2, maxLength: 10 },
    )
    .map((records) =>
      records
        .map((r) => act(`s${r.id}`, fmt(r.start), fmt(r.start + r.dur)))
        .filter((a) => a.start && a.end && Date.parse(a.start) < Date.parse(a.end)),
    );

  function fmt(min: number): string {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }

  it('a generated itinerary never contains temporal overlap', () => {
    fc.assert(
      fc.property(dayPlan, (activities) => {
        const result = solveDay({
          bundle: bundle(activities),
          day: DAY,
          preferences: prefs(),
          travel,
        });
        const items = result.itinerary.items;
        for (let i = 1; i < items.length; i++) {
          if (Date.parse(items[i - 1]!.end) > Date.parse(items[i]!.start)) return false;
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it('a generated itinerary never violates required travel time', () => {
    fc.assert(
      fc.property(dayPlan, (activities) => {
        const result = solveDay({
          bundle: bundle(activities),
          day: DAY,
          preferences: prefs(),
          travel,
        });
        const items = result.itinerary.items;
        for (let i = 1; i < items.length; i++) {
          const prev = items[i - 1]!;
          const next = items[i]!;
          if (prev.flexible || next.flexible) continue;
          const gapMs = Date.parse(next.start) - Date.parse(prev.end);
          if (
            gapMs <
            (SOLVER_CONFIG.defaultTravelSeconds + SOLVER_CONFIG.defaultBufferSeconds) * 1000 - 1
          ) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });
});
