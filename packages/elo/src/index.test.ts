import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Activity } from '@indiafoss/model';
import {
  applyComparison,
  applyPriors,
  CHOICE_OUTCOMES,
  conflictProgress,
  expectedScore,
  learnAffinity,
  MAX_PRIOR_OFFSET,
  pairKey,
  pairKScale,
  priorOffset,
  ratingWithPrior,
  scheduleStability,
  selectNextComparison,
  SETTLED_GAP,
  type AffinityModel,
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
    const b = ranked(act('b', `${D}10:15:00+05:30`, `${D}11:15:00+05:30`), 1240, 5);
    const c = ranked(act('c', `${D}14:00:00+05:30`, `${D}15:00:00+05:30`), 1220, 5);
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

// #90: only questions that change the plan are asked.
describe('selectNextComparison asks only what matters', () => {
  it('never offers two sessions that do not overlap', () => {
    const a = ranked(act('a', `${D}10:00:00+05:30`, `${D}11:00:00+05:30`));
    const b = ranked(act('b', `${D}12:00:00+05:30`, `${D}13:00:00+05:30`));
    const c = ranked(act('c', `${D}14:00:00+05:30`, `${D}15:00:00+05:30`));
    expect(selectNextComparison({ activities: [a, b, c], alreadyCompared: new Set() })).toBeNull();
  });

  it('skips a conflict already settled by a wide rating gap', () => {
    const a = ranked(act('a', `${D}10:00:00+05:30`, `${D}11:00:00+05:30`), 1200 + SETTLED_GAP, 1);
    const b = ranked(act('b', `${D}10:15:00+05:30`, `${D}11:15:00+05:30`), 1200, 1);
    expect(selectNextComparison({ activities: [a, b], alreadyCompared: new Set() })).toBeNull();
  });

  it('offers the closest call first and labels a fresh pair as new', () => {
    const a = ranked(act('a', `${D}10:00:00+05:30`, `${D}11:00:00+05:30`), 1200, 0);
    const b = ranked(act('b', `${D}10:15:00+05:30`, `${D}11:15:00+05:30`), 1200, 0);
    const c = ranked(act('c', `${D}10:30:00+05:30`, `${D}11:30:00+05:30`), 1240, 2);
    const pick = selectNextComparison({ activities: [a, b, c], alreadyCompared: new Set() });
    expect([pick?.activityA.activity.id, pick?.activityB.activity.id].sort()).toEqual(['a', 'b']);
    expect(pick?.reason).toBe('new');
  });

  it('a first answer between two fresh sessions opens a settled gap at once', () => {
    const r = applyComparison(1200, 1200, 'definitely-a', pairKScale(0, 0));
    expect(r.ratingA - r.ratingB).toBeGreaterThanOrEqual(SETTLED_GAP);
    // Sides with history move at the ordinary K.
    expect(pairKScale(3, 3)).toBe(1);
    expect(pairKScale(0, 3)).toBe(1.5);
  });

  it('settles a whole day in at most one question per open conflict', () => {
    // Four overlapping talks: six conflicts. Each answer widens gaps, so the
    // walk must end without ever exceeding the number of pairs.
    const talks = ['a', 'b', 'c', 'd'].map((id, i) =>
      ranked(act(id, `${D}10:${String(i * 10).padStart(2, '0')}:00+05:30`, `${D}11:00:00+05:30`)),
    );
    const compared = new Set<string>();
    let asked = 0;
    for (;;) {
      const pick = selectNextComparison({ activities: talks, alreadyCompared: compared });
      if (!pick) break;
      asked++;
      const winner = talks.find((t) => t === pick.activityA)!;
      const loser = talks.find((t) => t === pick.activityB)!;
      const r = applyComparison(winner.rating, loser.rating, 'definitely-a');
      winner.rating = r.ratingA;
      loser.rating = r.ratingB;
      winner.comparisons++;
      loser.comparisons++;
      compared.add(pairKey(winner.activity.id, loser.activity.id));
      if (asked > 6) throw new Error('asked more than once per conflict');
    }
    expect(asked).toBeLessThanOrEqual(6);
    expect(scheduleStability({ activities: talks, alreadyCompared: compared })).toBe(1);
  });
});

describe('conflictProgress', () => {
  it('counts direct answers and wide gaps as settled', () => {
    const a = ranked(act('a', `${D}10:00:00+05:30`, `${D}11:00:00+05:30`), 1200);
    const b = ranked(act('b', `${D}10:15:00+05:30`, `${D}11:15:00+05:30`), 1210);
    const c = ranked(act('c', `${D}10:30:00+05:30`, `${D}11:30:00+05:30`), 1400);
    const progress = conflictProgress({
      activities: [a, b, c],
      alreadyCompared: new Set([pairKey('a', 'b')]),
    });
    // a|b answered, a|c and b|c settled by the gap.
    expect(progress).toEqual({ conflicts: 3, settled: 3, open: 0 });
  });
});

describe('affinity priors', () => {
  const aosp = (id: string, start: string, end: string): Activity => ({
    ...act(id, start, end),
    trackId: 'aosp',
    tags: ['Beginner'],
  });
  const science = (id: string, start: string, end: string): Activity => ({
    ...act(id, start, end),
    trackId: 'science',
    tags: ['Intermediate'],
  });

  it('learns a taste from picks and applies it to unranked sessions of the same track', () => {
    const pool = [
      ranked(aosp('a1', `${D}10:00:00+05:30`, `${D}10:30:00+05:30`), 1216, 1),
      ranked(science('s1', `${D}10:00:00+05:30`, `${D}10:30:00+05:30`), 1184, 1),
      ranked(aosp('a2', `${D}11:00:00+05:30`, `${D}11:30:00+05:30`)),
      ranked(science('s2', `${D}11:00:00+05:30`, `${D}11:30:00+05:30`)),
    ];
    const model = learnAffinity(pool, [{ activityA: 'a1', activityB: 's1', scoreA: 1 }]);
    expect(model.affinity.get('track:aosp')).toBeGreaterThan(0);
    expect(model.affinity.get('track:science')).toBeLessThan(0);
    expect(priorOffset(pool[2]!.activity, model)).toBeGreaterThan(0);
    expect(priorOffset(pool[3]!.activity, model)).toBeLessThan(0);
    expect(ratingWithPrior(pool[2]!, model)).toBeGreaterThan(ratingWithPrior(pool[3]!, model));
  });

  it('treats not-interested as a vote against and a tie as no vote', () => {
    const pool = [
      ranked(aosp('a1', `${D}10:00:00+05:30`, `${D}10:30:00+05:30`), 1200, 0, 'not-interested'),
      ranked(science('s1', `${D}10:00:00+05:30`, `${D}10:30:00+05:30`)),
    ];
    const model = learnAffinity(pool, [{ activityA: 'a1', activityB: 's1', scoreA: 0.5 }]);
    expect(model.affinity.get('track:aosp')).toBeLessThan(0);
    expect(model.affinity.has('track:science')).toBe(false);
  });

  it('fades the prior as a session gathers its own comparisons and caps the offset', () => {
    const model: AffinityModel = {
      affinity: new Map([
        ['track:aosp', 1],
        ['type:talk', 1],
        ['tag:beginner', 1],
      ]),
      evidence: new Map(),
    };
    const fresh = ranked(aosp('a', `${D}10:00:00+05:30`, `${D}10:30:00+05:30`), 1200, 0);
    const seasoned = ranked(aosp('b', `${D}10:00:00+05:30`, `${D}10:30:00+05:30`), 1200, 3);
    expect(ratingWithPrior(fresh, model)).toBe(1200 + MAX_PRIOR_OFFSET);
    expect(ratingWithPrior(seasoned, model)).toBe(1200);
    expect(MAX_PRIOR_OFFSET).toBeLessThan(SETTLED_GAP);
  });

  it('is a pure view: applyPriors never mutates the stored ratings', () => {
    const pool = [ranked(aosp('a', `${D}10:00:00+05:30`, `${D}10:30:00+05:30`))];
    const model: AffinityModel = {
      affinity: new Map([['track:aosp', 1]]),
      evidence: new Map(),
    };
    const applied = applyPriors(pool, model);
    expect(applied[0]!.rating).toBeGreaterThan(1200);
    expect(pool[0]!.rating).toBe(1200);
  });
});
