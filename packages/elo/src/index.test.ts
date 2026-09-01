import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Activity } from '@indiafoss/model';
import {
  applyComparison,
  CHOICE_OUTCOMES,
  expectedScore,
  pairKey,
  scheduleStability,
  selectNextComparison,
  type ComparisonChoice,
  type RankedActivity,
} from './index.js';

function act(id: string, start: string, end: string, title = id): Activity {
  return {
    id,
    title,
    type: 'talk',
    start,
    end,
    flexible: false,
    speakerIds: [],
    tags: [],
    source: 'test',
  };
}

const D = '2026-09-19T';
const ranked = (
  a: Activity,
  rating = 1200,
  comparisons = 0,
  disposition: RankedActivity['disposition'] = 'normal',
): RankedActivity => ({
  activity: a,
  rating,
  comparisons,
  disposition,
});

describe('expectedScore', () => {
  it('is 0.5 for equal ratings', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 10);
  });

  it('favours the higher rating', () => {
    expect(expectedScore(1400, 1200)).toBeGreaterThan(0.5);
    expect(expectedScore(1200, 1400)).toBeLessThan(0.5);
  });
});

describe('applyComparison', () => {
  it('documents the full choice mapping', () => {
    expect(CHOICE_OUTCOMES['definitely-a']).toEqual({ scoreA: 1.0, k: 32 });
    expect(CHOICE_OUTCOMES['slightly-a']).toEqual({ scoreA: 1.0, k: 16 });
    expect(CHOICE_OUTCOMES.tie).toEqual({ scoreA: 0.5, k: 32 });
    expect(CHOICE_OUTCOMES['slightly-b']).toEqual({ scoreA: 0.0, k: 16 });
    expect(CHOICE_OUTCOMES['definitely-b']).toEqual({ scoreA: 0.0, k: 32 });
    expect(CHOICE_OUTCOMES.neither.k).toBe(0);
  });

  it('winner rating increases, loser decreases (definitely)', () => {
    const before = applyComparison(1200, 1200, 'definitely-a');
    expect(before.ratingA).toBeGreaterThan(1200);
    expect(before.ratingB).toBeLessThan(1200);
  });

  it('tie moves both toward each other', () => {
    const r = applyComparison(1400, 1200, 'tie');
    expect(r.ratingA).toBeLessThan(1400);
    expect(r.ratingB).toBeGreaterThan(1200);
  });

  it('neither changes nothing', () => {
    const r = applyComparison(1200, 1200, 'neither');
    expect(r).toEqual({ ratingA: 1200, ratingB: 1200, neither: true });
  });

  it('slight choices move ratings half as much', () => {
    const definite = applyComparison(1200, 1200, 'definitely-a');
    const slight = applyComparison(1200, 1200, 'slightly-a');
    expect(slight.ratingA - 1200).toBeCloseTo((definite.ratingA - 1200) / 2, 5);
  });
});

describe('pairKey', () => {
  it('is order-independent', () => {
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
  });
});

describe('selectNextComparison', () => {
  it('prefers conflicting pairs', () => {
    const a = ranked(act('a', `${D}10:00:00+05:30`, `${D}11:00:00+05:30`), 1200, 5);
    const b = ranked(act('b', `${D}10:15:00+05:30`, `${D}11:15:00+05:30`), 1300, 5);
    const c = ranked(act('c', `${D}14:00:00+05:30`, `${D}15:00:00+05:30`), 1250, 5);
    const pick = selectNextComparison({ activities: [a, b, c], alreadyCompared: new Set() });
    expect(pick).not.toBeNull();
    expect(['conflict', 'close-ratings']).toContain(pick?.reason);
    expect([pick?.activityA.activity.id, pick?.activityB.activity.id].sort()).toEqual(['a', 'b']);
  });

  it('never repeats a compared pair', () => {
    const a = ranked(act('a', `${D}10:00:00+05:30`, `${D}11:00:00+05:30`));
    const b = ranked(act('b', `${D}10:15:00+05:30`, `${D}11:15:00+05:30`));
    const pick = selectNextComparison({
      activities: [a, b],
      alreadyCompared: new Set([pairKey('a', 'b')]),
    });
    expect(pick).toBeNull();
  });

  it('excludes not-interested activities', () => {
    const a = ranked(act('a', `${D}10:00:00+05:30`, `${D}11:00:00+05:30`), 1200, 5);
    const b = ranked(
      act('b', `${D}10:15:00+05:30`, `${D}11:15:00+05:30`),
      1200,
      5,
      'not-interested',
    );
    expect(selectNextComparison({ activities: [a, b], alreadyCompared: new Set() })).toBeNull();
  });

  it('returns null for a single candidate', () => {
    expect(
      selectNextComparison({
        activities: [ranked(act('a', `${D}10:00:00+05:30`, `${D}11:00:00+05:30`))],
        alreadyCompared: new Set(),
      }),
    ).toBeNull();
  });
});

describe('scheduleStability', () => {
  it('is 1 when no conflicts exist', () => {
    const a = ranked(act('a', `${D}10:00:00+05:30`, `${D}11:00:00+05:30`));
    const b = ranked(act('b', `${D}12:00:00+05:30`, `${D}13:00:00+05:30`));
    expect(scheduleStability({ activities: [a, b], alreadyCompared: new Set() })).toBe(1);
  });

  it('is 0 when every conflict is unsettled', () => {
    const a = ranked(act('a', `${D}10:00:00+05:30`, `${D}11:00:00+05:30`), 1200);
    const b = ranked(act('b', `${D}10:15:00+05:30`, `${D}11:15:00+05:30`), 1210);
    expect(scheduleStability({ activities: [a, b], alreadyCompared: new Set() })).toBe(0);
  });

  it('counts large-rating-gap conflicts as settled', () => {
    const a = ranked(act('a', `${D}10:00:00+05:30`, `${D}11:00:00+05:30`), 1500, 10);
    const b = ranked(act('b', `${D}10:15:00+05:30`, `${D}11:15:00+05:30`), 1100, 10);
    expect(scheduleStability({ activities: [a, b], alreadyCompared: new Set() })).toBe(1);
  });
});

// §51 property tests
describe('Elo properties', () => {
  it('winner rating increases for any equal-rating pair', () => {
    fc.assert(
      fc.property(fc.integer({ min: 800, max: 2200 }), (r) => {
        const result = applyComparison(r, r, 'definitely-a');
        return result.ratingA > r;
      }),
    );
  });

  it('loser rating decreases for any equal-rating pair', () => {
    fc.assert(
      fc.property(fc.integer({ min: 800, max: 2200 }), (r) => {
        const result = applyComparison(r, r, 'definitely-b');
        // A loses: its rating must drop; B (the winner) must rise.
        return result.ratingA < r && result.ratingB > r;
      }),
    );
  });

  it('every scored comparison is zero-sum', () => {
    const scored: ComparisonChoice[] = [
      'definitely-a',
      'slightly-a',
      'tie',
      'slightly-b',
      'definitely-b',
    ];
    fc.assert(
      fc.property(
        fc.integer({ min: 800, max: 2200 }),
        fc.integer({ min: 800, max: 2200 }),
        (a, b) => {
          for (const choice of scored) {
            const { ratingA, ratingB } = applyComparison(a, b, choice);
            const delta = ratingA - a + (ratingB - b);
            if (Math.abs(delta) > 1e-9) return false;
          }
          return true;
        },
      ),
    );
  });

  it('equal ratings produce expected score 0.5', () => {
    fc.assert(
      fc.property(fc.integer({ min: 800, max: 2200 }), (r) => {
        return Math.abs(expectedScore(r, r) - 0.5) < 1e-9;
      }),
    );
  });
});
