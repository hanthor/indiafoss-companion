import type { Activity } from '@indiafoss/model';

/**
 * Elo rating engine (§15).
 *
 *   E_A = 1 / (1 + 10^((R_B - R_A)/400))
 *   R'_A = R_A + K * (S_A - E_A)
 *
 * The comparison scale maps attendee choices to (score, effective K):
 *
 *   Definitely A  → S_A = 1.0, K = 32
 *   Slightly A    → S_A = 1.0, K = 16
 *   Tie           → S_A = 0.5, K = 32
 *   Slightly B    → S_A = 0.0, K = 16
 *   Definitely B  → S_A = 0.0, K = 32
 *   Neither       → mark both low-interest (no rating change)
 */

export const INITIAL_RATING = 1200;
export const K_FACTOR = 32;
export const K_SLIGHT = 16;

export type ComparisonChoice =
  'definitely-a' | 'slightly-a' | 'tie' | 'slightly-b' | 'definitely-b' | 'neither';

export interface ComparisonOutcome {
  /** Effective result score for activity A (0..1). */
  scoreA: number;
  /** Effective K factor for this comparison. */
  k: number;
}

export const CHOICE_OUTCOMES: Record<ComparisonChoice, ComparisonOutcome> = {
  'definitely-a': { scoreA: 1.0, k: K_FACTOR },
  'slightly-a': { scoreA: 1.0, k: K_SLIGHT },
  tie: { scoreA: 0.5, k: K_FACTOR },
  'slightly-b': { scoreA: 0.0, k: K_SLIGHT },
  'definitely-b': { scoreA: 0.0, k: K_FACTOR },
  neither: { scoreA: 0.5, k: 0 },
};

/** Expected score of A against B. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export interface RatingUpdate {
  ratingA: number;
  ratingB: number;
  /** True when the choice was 'neither' (both marked low-interest). */
  neither: boolean;
}

/** Apply one comparison, returning the updated ratings. */
export function applyComparison(
  ratingA: number,
  ratingB: number,
  choice: ComparisonChoice,
): RatingUpdate {
  const { scoreA, k } = CHOICE_OUTCOMES[choice];
  if (choice === 'neither' || k === 0) {
    return { ratingA, ratingB, neither: true };
  }
  const expectedA = expectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;
  return {
    ratingA: ratingA + k * (scoreA - expectedA),
    ratingB: ratingB + k * (scoreB - expectedB),
    neither: false,
  };
}

/** Normalize a pair into a stable "a|b" key (sorted) so repeats can be avoided. */
export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

export type Disposition = 'normal' | 'must-attend' | 'not-interested' | 'watch-later';

export interface RankedActivity {
  activity: Activity;
  rating: number;
  comparisons: number;
  disposition: Disposition;
}

export interface ComparisonSelectionInput {
  /** Candidate activities (e.g. sessions of one day). */
  activities: RankedActivity[];
  /** Pairs already compared, as pairKey() strings. */
  alreadyCompared: Set<string>;
}

export interface ComparisonCandidate {
  activityA: RankedActivity;
  activityB: RankedActivity;
  /** Why this pair is being offered (for UI transparency). */
  reason: 'conflict' | 'close-ratings' | 'under-ranked' | 'new';
}

/**
 * Adaptive comparison selection (§16).
 *
 * Priority:
 *   1. directly conflicting activities (overlapping time)
 *   2. close Elo scores (gap <= threshold) among conflicts
 *   3. activities with few prior comparisons
 *   4. not-yet-compared pairs only — never repeat a pair unless re-asked
 *
 * Must-attend and normal items compete; not-interested items are excluded
 * (they are already removed from automatic planning).
 */
export function selectNextComparison(input: ComparisonSelectionInput): ComparisonCandidate | null {
  const pool = input.activities.filter(
    (a) => a.disposition !== 'not-interested' && !a.activity.cancelled,
  );
  if (pool.length < 2) return null;

  const candidates: {
    a: RankedActivity;
    b: RankedActivity;
    score: number;
    reason: ComparisonCandidate['reason'];
  }[] = [];

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      if (input.alreadyCompared.has(pairKey(a.activity.id, b.activity.id))) continue;

      const conflict = overlaps(a.activity, b.activity);
      const gap = Math.abs(a.rating - b.rating);
      const lowInfo = a.comparisons < 3 || b.comparisons < 3;

      let score = 0;
      let reason: ComparisonCandidate['reason'] = 'under-ranked';
      if (conflict) {
        score += 100;
        if (gap <= 150) {
          score += 50 - gap / 3;
          reason = 'close-ratings';
        } else {
          reason = 'conflict';
        }
      }
      if (lowInfo) score += 20;
      if (score <= 0) continue;

      candidates.push({ a, b, score, reason });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((x, y) => y.score - x.score);
  const top = candidates[0]!;
  return { activityA: top.a, activityB: top.b, reason: top.reason };
}

function overlaps(a: Activity, b: Activity): boolean {
  if (!a.start || !a.end || !b.start || !b.end) return false;
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

/**
 * Schedule stability (§16): the share of relevant conflict pairs whose
 * head-to-head winner is "settled" — i.e. one side is rated far enough ahead
 * that a single ordinary result is very unlikely to flip it.
 *
 * A pair is settled when |R_A - R_B| >= the rating swing of a single
 * definitely-won comparison (2 * K_FACTOR). The exact heuristic is
 * documented and unit-tested.
 */
export function scheduleStability(input: ComparisonSelectionInput): number {
  const pool = input.activities.filter(
    (a) => a.disposition !== 'not-interested' && !a.activity.cancelled,
  );
  let conflicts = 0;
  let settled = 0;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      if (!overlaps(a.activity, b.activity)) continue;
      conflicts++;
      if (Math.abs(a.rating - b.rating) >= 2 * K_FACTOR) settled++;
    }
  }
  if (conflicts === 0) return 1;
  return settled / conflicts;
}
