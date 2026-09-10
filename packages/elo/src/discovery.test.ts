import { describe, expect, it } from 'vitest';
import type { Activity } from '@indiafoss/model';
import { discoveryDeck, learnAffinity, type RankedActivity } from './index.js';

function talk(
  id: string,
  track: string,
  interest?: 'yes' | 'no',
  disposition: RankedActivity['disposition'] = 'normal',
): RankedActivity {
  const activity: Activity = {
    id,
    title: id,
    type: 'talk',
    trackId: track,
    tags: [track],
    flexible: false,
    speakerIds: [],
    source: 'fixture',
  };
  return { activity, rating: 1200, comparisons: 0, disposition, ...(interest ? { interest } : {}) };
}

describe('local talk discovery', () => {
  it('learns a positive answer without any pairwise comparisons', () => {
    const pool = [
      talk('liked', 'rust', 'yes'),
      talk('unrelated', 'design'),
      talk('similar', 'rust'),
    ];
    const deck = discoveryDeck(pool, learnAffinity(pool, []));
    expect(deck[0]?.activity.id).toBe('similar');
    expect(deck[0]?.because).toContain('track:rust');
    expect(deck.map((r) => r.activity.id)).not.toContain('liked');
  });
  it('gives a must-go stronger affinity, without fabricating comparisons', () => {
    const yes = [talk('a', 'rust', 'yes')];
    const must = [talk('a', 'rust', 'yes', 'must-attend')];
    expect(learnAffinity(must, []).affinity.get('track:rust')).toBeGreaterThan(
      learnAffinity(yes, []).affinity.get('track:rust')!,
    );
    expect(must[0]?.comparisons).toBe(0);
  });
  it('excludes dislikes and cancellations, and undo removes their influence', () => {
    const pool = [
      talk('no', 'rust', 'no', 'not-interested'),
      talk('other', 'design'),
      talk('rust', 'rust'),
    ];
    const before = learnAffinity(pool, []);
    expect(before.affinity.get('track:rust')).toBeLessThan(0);
    expect(discoveryDeck(pool, before).map((r) => r.activity.id)).not.toContain('no');
    pool[0] = talk('no', 'rust');
    expect(learnAffinity(pool, []).affinity.get('track:rust')).toBeUndefined();
    pool[0]!.activity.cancelled = true;
    expect(discoveryDeck(pool, learnAffinity(pool, [])).map((r) => r.activity.id)).not.toContain(
      'no',
    );
  });
  it('samples different tracks during cold start and periodically explores', () => {
    const pool = [
      talk('a', 'rust'),
      talk('b', 'rust'),
      talk('c', 'design'),
      talk('d', 'systems'),
      talk('e', 'rust'),
    ];
    const cold = discoveryDeck(pool, learnAffinity(pool, []));
    expect(new Set(cold.slice(0, 3).map((r) => r.activity.trackId)).size).toBe(3);
    pool.push(talk('liked', 'rust', 'yes'));
    const warm = discoveryDeck(pool, learnAffinity(pool, []));
    expect(warm[2]?.activity.trackId).not.toBe('rust');
    expect(discoveryDeck(pool, learnAffinity(pool, []))).toEqual(warm);
  });
});

it('explores after three saved choices even when only the first card is consumed', () => {
  const pool = [
    talk('liked-1', 'rust', 'yes'),
    talk('liked-2', 'rust', 'yes'),
    talk('liked-3', 'rust', 'yes'),
    talk('a-similar', 'rust'),
    talk('z-different', 'design'),
  ];
  expect(discoveryDeck(pool, learnAffinity(pool, []))[0]?.activity.id).toBe('z-different');
  pool[2] = talk('liked-3', 'rust');
  expect(discoveryDeck(pool, learnAffinity(pool, []))[0]?.activity.trackId).toBe('rust');
});

it('a dislike demotes similar talks even without a positive explanation', () => {
  const pool = [
    talk('disliked', 'rust', 'no', 'not-interested'),
    talk('a-similar', 'rust'),
    talk('z-different', 'design'),
  ];
  expect(discoveryDeck(pool, learnAffinity(pool, []))[0]?.activity.id).toBe('z-different');
});
