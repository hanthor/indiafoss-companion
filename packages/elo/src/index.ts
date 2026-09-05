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

/**
 * Provisional ratings (#90): a session nobody has answered about yet moves
 * twice as far on its first result, one and a half times on its second, so
 * one clear pick opens a settled gap (2 * K_FACTOR) at once instead of after
 * two. Applied to the pair's K as the mean of both sides' scales.
 */
export function provisionalScale(comparisons: number): number {
  return comparisons <= 0 ? 2 : comparisons === 1 ? 1.5 : 1;
}

export function pairKScale(comparisonsA: number, comparisonsB: number): number {
  return (provisionalScale(comparisonsA) + provisionalScale(comparisonsB)) / 2;
}

/** Apply one comparison, returning the updated ratings; `kScale` stretches K (see `pairKScale`). */
export function applyComparison(
  ratingA: number,
  ratingB: number,
  choice: ComparisonChoice,
  kScale = 1,
): RatingUpdate {
  const { scoreA, k: baseK } = CHOICE_OUTCOMES[choice];
  const k = baseK * kScale;
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
 * A conflict pair whose ratings differ by at least this much is treated as
 * settled: one ordinary result (a swing of up to 2 * K_FACTOR) cannot flip it,
 * so asking is a wasted tap. Shared by selection, stability and progress.
 */
export const SETTLED_GAP = 2 * K_FACTOR;

/**
 * Adaptive comparison selection (§16, tightened for #90).
 *
 * Only pairs whose answer changes the plan are offered: two sessions that
 * overlap in time and whose ratings are still close enough that either could
 * win. Everything else is skipped on purpose —
 *
 *   - non-overlapping pairs never need a winner (you can attend both), and
 *     asking about them was what made a day feel endless;
 *   - a conflict already decided by a wide rating gap (`SETTLED_GAP`) is not
 *     re-asked, so a strong pick settles its other clashes transitively;
 *   - pairs already answered are never repeated unless re-asked.
 *
 * Priority within the remaining pairs: the closest calls first (they carry the
 * most information), then pairs where either side has few prior comparisons.
 * Must-attend and normal items compete; not-interested items are excluded.
 */
export function selectNextComparison(input: ComparisonSelectionInput): ComparisonCandidate | null {
  const pool = input.activities.filter(
    (a) => a.disposition !== 'not-interested' && !a.activity.cancelled,
  );
  if (pool.length < 2) return null;

  let best: {
    a: RankedActivity;
    b: RankedActivity;
    score: number;
    reason: ComparisonCandidate['reason'];
  } | null = null;

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      if (!overlaps(a.activity, b.activity)) continue;
      if (input.alreadyCompared.has(pairKey(a.activity.id, b.activity.id))) continue;
      const gap = Math.abs(a.rating - b.rating);
      if (gap >= SETTLED_GAP) continue;

      const lowInfo = a.comparisons < 3 || b.comparisons < 3;
      const fresh = a.comparisons === 0 && b.comparisons === 0;
      // Closest calls first; a pair the attendee has said nothing about yet
      // is worth slightly more than one where a side is already placed.
      const score = 100 + (SETTLED_GAP - gap) + (lowInfo ? 20 : 0) + (fresh ? 5 : 0);
      const reason: ComparisonCandidate['reason'] = fresh
        ? 'new'
        : gap <= SETTLED_GAP / 2
          ? 'close-ratings'
          : 'conflict';
      if (!best || score > best.score) best = { a, b, score, reason };
    }
  }

  return best ? { activityA: best.a, activityB: best.b, reason: best.reason } : null;
}

/**
 * How much of the day is decided: the overlapping pairs that still need an
 * answer, and the ones already settled by a direct pick or a wide rating gap.
 * Drives the progress readout so the attendee can see the end coming.
 */
export interface ConflictProgress {
  /** Overlapping pairs among the live pool. */
  conflicts: number;
  /** Conflicts decided by a direct comparison or a wide rating gap. */
  settled: number;
  /** Conflicts still open: `conflicts - settled`. */
  open: number;
}

export function conflictProgress(input: ComparisonSelectionInput): ConflictProgress {
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
      if (
        input.alreadyCompared.has(pairKey(a.activity.id, b.activity.id)) ||
        Math.abs(a.rating - b.rating) >= SETTLED_GAP
      ) {
        settled++;
      }
    }
  }
  return { conflicts, settled, open: conflicts - settled };
}

export function overlaps(a: Activity, b: Activity): boolean {
  if (!a.start || !a.end || !b.start || !b.end) return false;
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

/**
 * A slot (#108): one session and everything running against it, so the
 * attendee decides "which one at 11:00?" rather than ranking the day. Slots
 * are anchored on the earliest live session that still has an open pair, in
 * time order; a slot's members are the sessions in an open pair with the
 * anchor or with one another inside the anchor's window. Anchoring keeps a
 * slot the size of one time band even when a long workshop overlaps half
 * the morning: the chain is never followed further than the anchor.
 */
export interface ConflictSlot {
  /** Stable key: the anchor's id. */
  key: string;
  /** Members in start order; the anchor is among them. */
  members: RankedActivity[];
  /** The anchor's start and end, ISO. */
  start: string;
  end: string;
  /** Pairs within the slot that still need an answer. */
  open: number;
}

/** A pair needs an answer when it overlaps, is unanswered and not settled by a wide gap. */
export function pairOpen(
  a: RankedActivity,
  b: RankedActivity,
  alreadyCompared: Set<string>,
): boolean {
  return (
    overlaps(a.activity, b.activity) &&
    !alreadyCompared.has(pairKey(a.activity.id, b.activity.id)) &&
    Math.abs(a.rating - b.rating) < SETTLED_GAP
  );
}

export function conflictSlots(input: ComparisonSelectionInput): ConflictSlot[] {
  const pool = input.activities
    .filter((a) => a.disposition !== 'not-interested' && !a.activity.cancelled)
    .filter((a) => a.activity.start && a.activity.end)
    .sort(
      (x, y) =>
        x.activity.start!.localeCompare(y.activity.start!) ||
        x.activity.id.localeCompare(y.activity.id),
    );
  const slots: ConflictSlot[] = [];
  for (const anchor of pool) {
    const around = pool.filter((o) => o === anchor || overlaps(anchor.activity, o.activity));
    const members = around.filter((m) =>
      around.some((o) => o !== m && pairOpen(m, o, input.alreadyCompared)),
    );
    if (members.length < 2 || !members.includes(anchor)) continue;
    slots.push({
      key: anchor.activity.id,
      members,
      start: anchor.activity.start!,
      end: anchor.activity.end!,
      open: conflictProgress({ activities: members, alreadyCompared: input.alreadyCompared }).open,
    });
  }
  return slots;
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
  const { conflicts, settled } = conflictProgress(input);
  if (conflicts === 0) return 1;
  return settled / conflicts;
}

// ---------------------------------------------------------------------------
// Affinity priors (#90): learn from what the attendee keeps picking.
// ---------------------------------------------------------------------------

/** One answered comparison, as stored on the device. */
export interface ComparisonHistoryEntry {
  activityA: string;
  activityB: string;
  /** Result score for A: 1 (A won), 0.5 (tie), 0 (B won). */
  scoreA: number;
}

/** The facets of a session that a taste can attach to. */
export type AffinityKey = string;

/** Track, type and tags of a session, as `kind:value` keys. */
export function affinityKeysOf(activity: Activity): AffinityKey[] {
  const keys: AffinityKey[] = [`type:${activity.type}`];
  if (activity.trackId) keys.push(`track:${activity.trackId}`);
  for (const tag of activity.tags) keys.push(`tag:${tag.trim().toLowerCase()}`);
  return keys;
}

export interface AffinityModel {
  /** Per key: net wins over losses, shrunk towards zero; in [-1, 1]. */
  affinity: Map<AffinityKey, number>;
  /** Per key: how many answered comparisons touched it. */
  evidence: Map<AffinityKey, number>;
}

/** Comparisons a key needs before its affinity is trusted at full strength. */
const AFFINITY_SHRINKAGE = 3;

/**
 * Learn a taste per track, session type and tag from the comparison history
 * and the sessions the attendee ruled out. A pick for A over B is one vote for
 * everything A is and one vote against everything B is (a tie votes for
 * neither); "not interested" is a vote against. Votes are shrunk towards zero
 * so one pick cannot demote a whole track.
 */
/** What the attendee said about a room (track) before ranking: skip it, or love it. */
export type RoomPreference = 'skip' | 'love';

/** Votes a loved room is given up front: enough to lift its talks by ~40 points, well under a settled gap. */
export const LOVED_ROOM_VOTES = 6;

export function learnAffinity(
  activities: Iterable<RankedActivity>,
  history: Iterable<ComparisonHistoryEntry>,
  rooms: Record<string, RoomPreference | undefined> = {},
): AffinityModel {
  const byId = new Map<string, RankedActivity>();
  for (const r of activities) byId.set(r.activity.id, r);
  const votes = new Map<AffinityKey, number>();
  const evidence = new Map<AffinityKey, number>();
  const vote = (id: string, weight: number): void => {
    const r = byId.get(id);
    if (!r) return;
    for (const key of affinityKeysOf(r.activity)) {
      votes.set(key, (votes.get(key) ?? 0) + weight);
      evidence.set(key, (evidence.get(key) ?? 0) + 1);
    }
  };
  for (const entry of history) {
    const swing = (entry.scoreA - 0.5) * 2; // +1 A won, -1 B won, 0 tie
    if (swing === 0) continue;
    vote(entry.activityA, swing);
    vote(entry.activityB, -swing);
  }
  for (const r of byId.values()) {
    if (r.disposition === 'not-interested') vote(r.activity.id, -1);
  }
  // A loved room starts with a head of votes; a skipped one is already out of
  // the pool, and gets the same weight against for anything that slips in.
  for (const [trackId, pref] of Object.entries(rooms)) {
    if (!pref) continue;
    const key = `track:${trackId}`;
    const weight = pref === 'love' ? LOVED_ROOM_VOTES : -LOVED_ROOM_VOTES;
    votes.set(key, (votes.get(key) ?? 0) + weight);
    evidence.set(key, (evidence.get(key) ?? 0) + LOVED_ROOM_VOTES);
  }
  const affinity = new Map<AffinityKey, number>();
  for (const [key, total] of votes) {
    const n = evidence.get(key) ?? 0;
    affinity.set(key, total / (n + AFFINITY_SHRINKAGE));
  }
  return { affinity, evidence };
}

/** Largest rating offset a prior may add; below one settled gap on purpose. */
export const MAX_PRIOR_OFFSET = 60;

/**
 * Rating offset for a session from the learnt taste: the mean affinity over
 * its keys, scaled to at most `MAX_PRIOR_OFFSET`. Zero when nothing is known.
 */
export function priorOffset(activity: Activity, model: AffinityModel): number {
  const keys = affinityKeysOf(activity).filter((k) => model.affinity.has(k));
  if (keys.length === 0) return 0;
  let sum = 0;
  for (const key of keys) sum += model.affinity.get(key) ?? 0;
  const mean = sum / keys.length;
  return Math.max(-MAX_PRIOR_OFFSET, Math.min(MAX_PRIOR_OFFSET, mean * MAX_PRIOR_OFFSET));
}

/**
 * Blend the prior into a session's rating. Direct evidence wins: the prior
 * fades as the session collects comparisons of its own, and is gone after
 * three. Applied for selection and planning, never written back to storage,
 * so the attendee's own picks stay the only thing persisted.
 */
export function ratingWithPrior(rated: RankedActivity, model: AffinityModel): number {
  const weight = Math.max(0, 1 - rated.comparisons / 3);
  if (weight === 0) return rated.rating;
  return rated.rating + priorOffset(rated.activity, model) * weight;
}

/** The pool with priors applied, ready for `selectNextComparison`. */
export function applyPriors(pool: RankedActivity[], model: AffinityModel): RankedActivity[] {
  return pool.map((r) => ({ ...r, rating: ratingWithPrior(r, model) }));
}

/** A session the learnt taste predicts, with the reasons it was picked. */
export interface Recommendation {
  activity: Activity;
  /** The prior, in rating points; always positive here. */
  score: number;
  /** The facets that pulled it up, strongest first — `track:…`, `tag:…`, `type:…`. */
  because: AffinityKey[];
}

export interface RecommendationOptions {
  /** How many to return. */
  limit?: number;
  /**
   * Comparisons a facet needs before it may justify a recommendation.
   * Deliberately higher than the shrinkage the prior itself uses: nudging a
   * rating on thin evidence is cheap and invisible, but telling someone "you
   * liked Rust" on the strength of one swipe is a claim about them.
   */
  minEvidence?: number;
}

/**
 * Sessions the attendee has not judged, ordered by what their answers so far
 * predict — the recommender for #162.
 *
 * There is no new model here, and deliberately so. The taste already learnt
 * for ranking (`affinityModel`) is a content-based recommender: it scores
 * every session by the tracks, tags and formats the attendee's own
 * comparisons pulled up or down. Surfacing it costs a sort, runs offline on a
 * phone, needs no server, and can say *why* — which matters more than accuracy
 * here, because an attendee has one shot at each slot and no way to check a
 * recommendation except by walking to the room.
 *
 * Skipped: anything already decided (must-attend, not-interested) and anything
 * with enough comparisons of its own that the prior no longer applies. A
 * recommendation for a session someone has already ranked is not a
 * recommendation, it is a reminder of their own opinion.
 */
export function recommendations(
  pool: RankedActivity[],
  model: AffinityModel,
  options: RecommendationOptions = {},
): Recommendation[] {
  const limit = options.limit ?? 5;
  const minEvidence = options.minEvidence ?? 2;
  const out: Recommendation[] = [];
  for (const rated of pool) {
    if (rated.disposition === 'must-attend' || rated.disposition === 'not-interested') continue;
    if (rated.activity.cancelled) continue;
    // The prior has already faded out by three comparisons, so beyond that
    // there is nothing left to recommend on.
    if (rated.comparisons >= 3) continue;
    const because = affinityKeysOf(rated.activity)
      .filter((key) => (model.affinity.get(key) ?? 0) > 0)
      .filter((key) => (model.evidence.get(key) ?? 0) >= minEvidence)
      .sort((a, b) => (model.affinity.get(b) ?? 0) - (model.affinity.get(a) ?? 0));
    if (because.length === 0) continue;
    const score = priorOffset(rated.activity, model);
    if (score <= 0) continue;
    out.push({ activity: rated.activity, score, because });
  }
  return out
    .sort((a, b) => b.score - a.score || a.activity.id.localeCompare(b.activity.id))
    .slice(0, limit);
}
