import type { Activity, EventBundle } from '@indiafoss/model';
import { activeAfterYields } from '@indiafoss/elo';

/**
 * Itinerary solver (§18–§21).
 *
 * Fixed activities become nodes of a directed acyclic graph; an edge i→j is
 * allowed only when `end_i + travel(i,j) + buffer <= start_j`. The day is
 * then a weighted longest-path problem over the DAG (monotone timestamps make
 * dynamic programming exact and cheap).
 *
 * Must-attend activities are hard constraints (§19): incompatible locks are
 * reported explicitly; compatible locks split the day into independent
 * segments bounded by the fixed commitments.
 *
 * Flexible activities (§20) are placed greedily into the remaining gaps.
 */

/** All tunable constants live here (§18) — documented and unit-tested. */
export const SOLVER_CONFIG = {
  /** Bonus added to must-attend utility. Large enough to dominate any chain. */
  mustAttendBonus: 10_000,
  bookmarkBonus: 50,
  /** Fatigue penalty per hour of a session. */
  fatiguePenaltyPerHour: 10,
  /** Default inter-session buffer (§29: 5 minutes). */
  defaultBufferSeconds: 300,
  /** Default travel estimate used until the venue engine provides real times. */
  defaultTravelSeconds: 300,
  /** Discrete flexible durations offered in gaps (§20). */
  flexibleDurationsMinutes: [15, 30, 45, 60],
} as const;

export type Disposition = 'normal' | 'must-attend' | 'not-interested' | 'watch-later';

export interface SolverPreferences {
  ratingOf(activityId: string): number;
  dispositionOf(activityId: string): Disposition;
  bookmarked(activityId: string): boolean;
  /**
   * The session this one stood aside for in a clash (#271), if any. A
   * scheduling loss, not a dislike: the session is left out only while its
   * winner is a live candidate on the day, and never when it is must-go.
   */
  yieldsTo?(activityId: string): string | undefined;
}

/** Travel time between locations; the venue engine (Phase 5) supplies real values. */
export interface TravelTimeProvider {
  seconds(fromId: string | undefined, toId: string | undefined): number;
}

export const DefaultTravelTime: TravelTimeProvider = {
  seconds: () => SOLVER_CONFIG.defaultTravelSeconds,
};

export interface FlexibleGoal {
  /** Stable id prefix, e.g. `hallway`, `rest`. */
  kind: string;
  label: string;
  /** Minutes of this goal per day. */
  dailyMinutes: number;
  /** Preferred location kind (booth areas, quiet room, food area, ...). */
  preferredLocationKind?: string;
}

export const DEFAULT_FLEXIBLE_GOALS: FlexibleGoal[] = [
  { kind: 'hallway', label: 'Hallway conversations', dailyMinutes: 45 },
  {
    kind: 'rest',
    label: 'Rest / quiet room',
    dailyMinutes: 20,
    preferredLocationKind: 'quiet-room',
  },
  { kind: 'coffee', label: 'Coffee break', dailyMinutes: 15, preferredLocationKind: 'food' },
];

export interface ItineraryItem {
  activityId: string;
  start: string;
  end: string;
  /** True for solver-generated flexible slots. */
  flexible?: boolean;
  /** Human label for flexible slots. */
  label?: string;
}

export interface Itinerary {
  eventId: string;
  day: string;
  items: ItineraryItem[];
  totalUtility: number;
}

export interface MustAttendConflict {
  a: string;
  b: string;
}

export interface SolverResult {
  itinerary: Itinerary;
  /** Activities deliberately left out (feasibility, preferences). */
  excluded: string[];
  /** Watch-later activities retained for the post-event archive. */
  watchLater: string[];
  /** Incompatible hard locks (§19). When non-empty the itinerary omits them. */
  mustAttendConflicts: MustAttendConflict[];
  /** Per scheduled activity id, its ranked alternatives (§21). */
  backups: Record<string, string[]>;
}

export interface SolveDayInput {
  bundle: EventBundle;
  day: string;
  preferences: SolverPreferences;
  travel?: TravelTimeProvider;
  bufferSeconds?: number;
  flexibleGoals?: FlexibleGoal[];
  /** Reserve the full published block for these programme tracks. */
  stayTrackIds?: readonly string[];
}

function parse(iso: string): number {
  return Date.parse(iso);
}

function durationMinutes(activity: Activity): number {
  if (!activity.start || !activity.end) return 0;
  return (parse(activity.end) - parse(activity.start)) / 60_000;
}

/** Utility function (§18): U_i = rating + mustAttendBonus + bookmarkBonus − fatigue. */
export function activityUtility(a: Activity, prefs: SolverPreferences): number {
  const rating = prefs.ratingOf(a.id);
  const must = prefs.dispositionOf(a.id) === 'must-attend' ? SOLVER_CONFIG.mustAttendBonus : 0;
  const bookmark = prefs.bookmarked(a.id) ? SOLVER_CONFIG.bookmarkBonus : 0;
  const fatigue = (durationMinutes(a) / 60) * SOLVER_CONFIG.fatiguePenaltyPerHour;
  return rating + must + bookmark - fatigue;
}

/** Edge feasibility: end_i + travel + buffer <= start_j. */
export function canFollow(
  prev: Activity,
  next: Activity,
  travel: TravelTimeProvider,
  bufferSeconds: number,
): boolean {
  if (!prev.end || !next.start) return false;
  return (
    parse(prev.end) + transitionSeconds(prev, next, travel, bufferSeconds) * 1000 <=
    parse(next.start)
  );
}

/** Shared travel/settling requirement for generation and edited-plan validation. */
export function transitionSeconds(
  prev: Pick<Activity, 'devroomId' | 'locationId'>,
  next: Pick<Activity, 'devroomId' | 'locationId'>,
  travel: TravelTimeProvider,
  bufferSeconds: number,
): number {
  const sameDevroom = Boolean(
    prev.devroomId &&
    prev.devroomId === next.devroomId &&
    prev.locationId &&
    prev.locationId === next.locationId,
  );
  return sameDevroom ? 0 : travel.seconds(prev.locationId, next.locationId) + bufferSeconds;
}

/**
 * Weighted longest path over the DAG, exact for monotone timestamps.
 * Returns the ordered activity ids and total utility.
 */
export function longestPathInDag(
  candidates: Activity[],
  prefs: SolverPreferences,
  travel: TravelTimeProvider,
  bufferSeconds: number,
): { order: Activity[]; utility: number } {
  // Topological order: strictly increasing start times (canFollow implies
  // prev.start < next.start, so the sorted order is already topological).
  const sorted = [...candidates].sort((a, b) => parse(a.start!) - parse(b.start!));
  const n = sorted.length;
  // Index-based DP arrays — never key by activity id, because duplicate ids
  // in a bundle would conflate distinct nodes and create cycles on backtrack.
  const utility = new Array<number>(n).fill(0);
  const prevIdx = new Array<number>(n).fill(-1);

  for (let i = 0; i < n; i++) {
    let best = activityUtility(sorted[i]!, prefs);
    let bestPrev = -1;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (!canFollow(sorted[j]!, sorted[i]!, travel, bufferSeconds)) continue;
      const candidate = utility[j]! + activityUtility(sorted[i]!, prefs);
      if (candidate > best) {
        best = candidate;
        bestPrev = j;
      }
    }
    utility[i] = best;
    prevIdx[i] = bestPrev;
  }

  let bestEnd = -1;
  let bestUtility = -Infinity;
  for (let i = 0; i < n; i++) {
    if (utility[i]! > bestUtility) {
      bestUtility = utility[i]!;
      bestEnd = i;
    }
  }
  if (bestEnd < 0) return { order: [], utility: 0 };

  // Backtracking by index is strictly decreasing (canFollow forces j < i), so
  // this always terminates.
  const order: Activity[] = [];
  let cursor = bestEnd;
  while (cursor >= 0) {
    order.unshift(sorted[cursor]!);
    cursor = prevIdx[cursor]!;
  }
  return { order, utility: bestUtility };
}

function checkMustAttendConflicts(
  mustAttends: Activity[],
  travel: TravelTimeProvider,
  bufferSeconds: number,
): MustAttendConflict[] {
  const conflicts: MustAttendConflict[] = [];
  for (let i = 0; i < mustAttends.length; i++) {
    for (let j = i + 1; j < mustAttends.length; j++) {
      const a = mustAttends[i]!;
      const b = mustAttends[j]!;
      const aThenB = canFollow(a, b, travel, bufferSeconds);
      const bThenA = canFollow(b, a, travel, bufferSeconds);
      if (!aThenB && !bThenA) conflicts.push({ a: a.id, b: b.id });
    }
  }
  return conflicts;
}

function toIso(day: string, minutesFromMidnight: number): string {
  // Travel times are seconds, so a gap boundary lands on a fraction of a minute
  // (540.5). Left unrounded that formatted as "09:0.5:00+05:30", which the
  // schedule rendered as "09:0.". Minutes in an instant are whole numbers.
  const total = Math.round(minutesFromMidnight);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${day}T${hh}:${mm}:00+05:30`;
}

function minutesOfDay(iso: string): number {
  return (parse(iso) - parse(iso.slice(0, 10) + 'T00:00:00+05:30')) / 60_000;
}

/**
 * Solve a day's itinerary. Steps:
 *   1. filter candidates (not cancelled, not not-interested/watch-later, timed)
 *   2. detect must-attend conflicts (hard constraint check)
 *   3. split the day into segments bounded by compatible must-attends
 *   4. run the DAG longest path within each segment
 *   5. place flexible activities in remaining gaps
 */
export function solveDay(input: SolveDayInput): SolverResult {
  const {
    bundle,
    day,
    preferences: originalPreferences,
    travel = DefaultTravelTime,
    bufferSeconds = SOLVER_CONFIG.defaultBufferSeconds,
    flexibleGoals = DEFAULT_FLEXIBLE_GOALS,
  } = input;

  const stays = new Set(input.stayTrackIds ?? []);
  const ranges = [...stays].flatMap((trackId) => {
    const sessions = bundle.activities.filter(
      (a) =>
        a.trackId === trackId &&
        !a.cancelled &&
        a.type !== 'meal' &&
        a.start?.startsWith(day) &&
        a.end?.startsWith(day),
    );
    if (!sessions.length) return [];
    return [
      {
        trackId,
        representative: sessions[0]!.id,
        start: Math.min(...sessions.map((a) => parse(a.start!))),
        end: Math.max(...sessions.map((a) => parse(a.end!))),
      },
    ];
  });
  const byId = new Map(bundle.activities.map((a) => [a.id, a]));
  const timedOnDay = (a: Activity): boolean =>
    !a.cancelled &&
    a.type !== 'meal' &&
    a.start?.startsWith(day) === true &&
    a.end?.startsWith(day) === true;
  // Clash losses (#271): a session that stood aside is out while its winner
  // is live on the day. `leftFor` maps each winner to the devroom tracks the
  // attendee left for it, so a reserved block can be left for one talk
  // without dropping the reservation.
  const yieldsTo = originalPreferences.yieldsTo;
  const eligible = bundle.activities.filter(
    (a) => timedOnDay(a) && originalPreferences.dispositionOf(a.id) !== 'not-interested',
  );
  const stoodAside = new Set<string>();
  const leftFor = new Map<string, Set<string>>();
  if (yieldsTo) {
    const live = activeAfterYields(
      eligible,
      (a) => a.id,
      (a) => yieldsTo(a.id),
      (a) => originalPreferences.dispositionOf(a.id) === 'must-attend',
    );
    for (const a of eligible) {
      if (live.has(a.id)) continue;
      stoodAside.add(a.id);
      const winner = yieldsTo(a.id);
      if (winner && a.trackId && stays.has(a.trackId)) {
        const tracks = leftFor.get(winner) ?? new Set<string>();
        tracks.add(a.trackId);
        leftFor.set(winner, tracks);
      }
    }
  }
  const preferences: SolverPreferences = {
    ...originalPreferences,
    dispositionOf: (id) => {
      const own = originalPreferences.dispositionOf(id);
      const a = byId.get(id);
      if (!a || own === 'not-interested' || own === 'must-attend') return own;
      if (stoodAside.has(id)) return 'not-interested';
      if (stays.has(a.trackId ?? '') && a.type !== 'meal') return 'must-attend';
      if (
        a.start &&
        a.end &&
        ranges.some(
          (r) =>
            parse(a.start!) < r.end && parse(a.end!) > r.start && !leftFor.get(id)?.has(r.trackId),
        )
      )
        return 'not-interested';
      return own;
    },
  };

  const candidates = bundle.activities.filter(
    (a) => timedOnDay(a) && preferences.dispositionOf(a.id) !== 'not-interested',
  );

  const watchLater = candidates
    .filter((a) => preferences.dispositionOf(a.id) === 'watch-later')
    .map((a) => a.id);

  const pool = candidates.filter((a) => preferences.dispositionOf(a.id) !== 'watch-later');

  const mustAttends = pool
    .filter((a) => preferences.dispositionOf(a.id) === 'must-attend')
    .sort((a, b) => parse(a.start!) - parse(b.start!));

  const mustAttendConflicts = checkMustAttendConflicts(mustAttends, travel, bufferSeconds);
  // A must-go in a gap still conflicts with the whole-block commitment.
  for (const range of ranges) {
    for (const a of mustAttends) {
      if (
        a.trackId === range.trackId ||
        parse(a.start!) >= range.end ||
        parse(a.end!) <= range.start ||
        // The attendee chose this talk over the devroom's own: not a silent conflict.
        leftFor.get(a.id)?.has(range.trackId)
      )
        continue;
      if (
        !mustAttendConflicts.some(
          (c) =>
            (c.a === range.representative && c.b === a.id) ||
            (c.b === range.representative && c.a === a.id),
        )
      ) {
        mustAttendConflicts.push({ a: range.representative, b: a.id });
      }
    }
  }
  if (mustAttendConflicts.length > 0) {
    return {
      itinerary: { eventId: bundle.id, day, items: [], totalUtility: 0 },
      excluded: pool.map((a) => a.id),
      watchLater,
      mustAttendConflicts,
      backups: {},
    };
  }

  const dayEnd = 24 * 60;
  const segments: { fromMin: number; toMin: number; before?: Activity; after?: Activity }[] = [];
  let prevEnd = 0;
  let previousCommitment: Activity | undefined;
  for (const m of mustAttends) {
    segments.push({
      fromMin: prevEnd,
      toMin: minutesOfDay(m.start!),
      before: previousCommitment,
      after: m,
    });
    prevEnd = minutesOfDay(m.end!);
    previousCommitment = m;
  }
  segments.push({ fromMin: prevEnd, toMin: dayEnd, before: previousCommitment });

  const chosen: Activity[] = [...mustAttends];
  let totalUtility = mustAttends.reduce((sum, m) => sum + activityUtility(m, preferences), 0);
  const seen = new Set(mustAttends.map((m) => m.id));

  for (const segment of segments) {
    const inside = pool.filter((a) => {
      if (seen.has(a.id)) return false;
      if (minutesOfDay(a.start!) < segment.fromMin) return false;
      if (minutesOfDay(a.end!) > segment.toMin) return false;
      if (segment.before && !canFollow(segment.before, a, travel, bufferSeconds)) return false;
      if (segment.after && !canFollow(a, segment.after, travel, bufferSeconds)) return false;
      return true;
    });
    const { order } = longestPathInDag(inside, preferences, travel, bufferSeconds);
    for (const a of order) {
      chosen.push(a);
      seen.add(a.id);
      totalUtility += activityUtility(a, preferences);
    }
  }

  // Flexible placement (§20): in each gap between consecutive chosen items,
  // place at most one flexible activity from the goal budget (largest goal
  // that fits, up to 60 min in 15-min steps).
  const items: ItineraryItem[] = [];
  let lunchPlaced = false;
  const lunchWindows = bundle.activities.filter(
    (a) =>
      a.type === 'meal' &&
      !a.cancelled &&
      /lunch/i.test(a.title) &&
      a.start?.startsWith(day) &&
      a.end?.startsWith(day),
  );
  const flexBudget = new Map(flexibleGoals.map((g) => [g.kind, g.dailyMinutes]));
  const chosenSorted = [...chosen].sort((a, b) => parse(a.start!) - parse(b.start!));

  for (let i = 0; i < chosenSorted.length; i++) {
    const current = chosenSorted[i]!;
    items.push({ activityId: current.id, start: current.start!, end: current.end! });
    if (i === chosenSorted.length - 1) break;

    const next = chosenSorted[i + 1]!;
    const gapStartMin =
      minutesOfDay(current.end!) + travel.seconds(current.locationId, next.locationId) / 60;
    const gapEndMin = minutesOfDay(next.start!) - bufferSeconds / 60;
    const gapMinutes = gapEndMin - gapStartMin;
    // Per-room lunch rows describe availability, not competing sessions. Use
    // one 30-minute reservation within a real gap; never displace a chosen talk.
    if (!lunchPlaced) {
      const slots = lunchWindows
        .map((meal) => ({
          start: Math.max(gapStartMin, minutesOfDay(meal.start!)),
          end: Math.min(gapEndMin, minutesOfDay(meal.end!)),
        }))
        .filter((slot) => slot.end - slot.start >= 30)
        .sort((a, b) => a.start - b.start);
      const slot = slots[0];
      if (slot) {
        items.push({
          activityId: `flex-lunch-${day}`,
          start: toIso(day, slot.start),
          end: toIso(day, slot.start + 30),
          flexible: true,
          label: 'Lunch · food area',
        });
        lunchPlaced = true;
        continue;
      }
    }
    if (
      gapMinutes < 15 ||
      ranges.some((r) => parse(current.end!) < r.end && parse(next.start!) > r.start)
    )
      continue;

    for (const goal of flexibleGoals) {
      const remaining = flexBudget.get(goal.kind) ?? 0;
      const used = Math.min(remaining, Math.floor(gapMinutes / 15) * 15, 60);
      if (used < 15) continue;
      items.push({
        activityId: `flex-${goal.kind}-${items.length}`,
        start: toIso(day, gapStartMin),
        end: toIso(day, gapStartMin + used),
        flexible: true,
        label: goal.label,
      });
      flexBudget.set(goal.kind, remaining - used);
      break;
    }
  }

  const excluded = pool.filter((a) => !seen.has(a.id)).map((a) => a.id);

  // Backups (§21): for each chosen activity, ranked alternatives that overlap
  // its time window but were not chosen.
  const backups: Record<string, string[]> = {};
  const overlapsWindow = (x: Activity, y: Activity): boolean => {
    if (!x.start || !x.end || !y.start || !y.end) return false;
    return parse(x.start) < parse(y.end) && parse(y.start) < parse(x.end);
  };
  for (const a of chosenSorted) {
    const alternatives = pool
      .filter((c) => c.id !== a.id && !seen.has(c.id) && overlapsWindow(a, c))
      .sort((x, y) => preferences.ratingOf(y.id) - preferences.ratingOf(x.id))
      .slice(0, 3)
      .map((c) => c.id);
    if (alternatives.length > 0) backups[a.id] = alternatives;
  }

  return {
    itinerary: { eventId: bundle.id, day, items, totalUtility },
    excluded,
    watchLater,
    mustAttendConflicts,
    backups,
  };
}

export { applyItineraryEdits, EMPTY_PLAN_EDITS, toggleInList } from './edit.js';
export type {
  ApplyEditsInput,
  ConflictKind,
  CustomBlock,
  EditedItem,
  EditedPlan,
  PlanConflict,
  PlanEdits,
} from './edit.js';
