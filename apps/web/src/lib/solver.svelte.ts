import { boothAvailableOn } from './booth-availability';
import type { EventBundle } from '@indiafoss/model';
import { solveDay, DefaultTravelTime, DEFAULT_FLEXIBLE_GOALS } from '@indiafoss/solver';
import type { FlexibleGoal, SolverPreferences, TravelTimeProvider } from '@indiafoss/solver';
import { CompanionStorage } from '@indiafoss/storage';
import {
  bookmarked,
  dispositionOf,
  hydrateComparisons,
  hydratePreferences,
  ratingOf,
  yieldedTo,
} from '$lib/prefs.svelte';
import { hydrateRoomPrefs, roomPreferences } from '$lib/roomPrefs.svelte';
import { triageOf } from '$lib/prefs.svelte';
import { affinityModel, effectiveRating } from '$lib/priors.svelte';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

const preferences: SolverPreferences = {
  ratingOf: (id) => ratingOf(id),
  dispositionOf: (id) => dispositionOf(id),
  bookmarked: (id) => bookmarked(id),
  // Clash losses (#271) leave the plan while their winner is live; never a dislike.
  yieldsTo: (id) => yieldedTo(id),
};

/** Planned booth visits (settings key `booth-visit-<id>` -> minutes). */
export async function plannedBoothVisits(
  bundle: EventBundle,
  day: string,
): Promise<FlexibleGoal[]> {
  const goals: FlexibleGoal[] = [];
  for (const booth of bundle.booths) {
    if (!boothAvailableOn(booth, day)) continue;
    const minutes = await getStorage().getSetting(`booth-visit-${booth.id}`);
    if (minutes) {
      goals.push({
        kind: `booth-${booth.id}`,
        label: `${booth.name} (${minutes} min)`,
        dailyMinutes: Number(minutes),
        preferredLocationKind: 'booth',
      });
    }
  }
  return goals;
}

/**
 * The venue is small: every walk is under five minutes, so the flat default
 * transfer is the whole travel model.
 */
export async function travelForEvent(): Promise<TravelTimeProvider> {
  return DefaultTravelTime;
}

/**
 * Solve a day's itinerary against the current local preferences, including
 * planned booth visits (§7) as flexible activities.
 */
export async function solveForDay(bundle: EventBundle, day: string, lockedIds: string[] = []) {
  await Promise.all([hydratePreferences(), hydrateComparisons(), hydrateRoomPrefs(bundle.id)]);
  const [boothGoals, travel] = await Promise.all([
    plannedBoothVisits(bundle, day),
    travelForEvent(),
  ]);
  // Sessions the attendee has not ranked yet borrow the taste learnt from the
  // ones they have (#90); the stored ratings are untouched.
  const model = affinityModel(bundle);
  // Lookup table for one solve; nothing observes it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const activityById = new Map(bundle.activities.map((a) => [a.id, a]));
  const ratingWithTaste = (id: string): number => {
    const activity = activityById.get(id);
    return (
      (activity ? effectiveRating(activity, model) : ratingOf(id)) +
      (triageOf(id) === 'yes' ? 120 : 0)
    );
  };
  // Locked itinerary rows are hard constraints: the solver must keep them (§18).
  // Plain lookup set for one solve; nothing observes it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const locked = new Set(lockedIds);
  const prefs: SolverPreferences = {
    ...preferences,
    ratingOf: ratingWithTaste,
    ...(locked.size
      ? { dispositionOf: (id) => (locked.has(id) ? 'must-attend' : dispositionOf(id)) }
      : {}),
  };
  const result = solveDay({
    bundle,
    day,
    stayTrackIds: Object.entries(roomPreferences())
      .filter(([, value]) => value === 'stay')
      .map(([id]) => id),
    preferences: prefs,
    travel,
    flexibleGoals: [...DEFAULT_FLEXIBLE_GOALS, ...boothGoals],
  });
  return { ...result, travel };
}
