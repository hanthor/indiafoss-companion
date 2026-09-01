import type { EventBundle } from '@indiafoss/model';
import { solveDay, DefaultTravelTime, DEFAULT_FLEXIBLE_GOALS } from '@indiafoss/solver';
import type { FlexibleGoal, SolverPreferences } from '@indiafoss/solver';
import { CompanionStorage } from '@indiafoss/storage';
import { bookmarked, dispositionOf, hydratePreferences, ratingOf } from '$lib/prefs.svelte';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

const preferences: SolverPreferences = {
  ratingOf: (id) => ratingOf(id),
  dispositionOf: (id) => dispositionOf(id),
  bookmarked: (id) => bookmarked(id),
};

/** Planned booth visits (settings key `booth-visit-<id>` -> minutes). */
export async function plannedBoothVisits(bundle: EventBundle): Promise<FlexibleGoal[]> {
  const goals: FlexibleGoal[] = [];
  for (const booth of bundle.booths) {
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
 * Solve a day's itinerary against the current local preferences, including
 * planned booth visits (§7) as flexible activities.
 */
export async function solveForDay(bundle: EventBundle, day: string) {
  await hydratePreferences();
  const boothGoals = await plannedBoothVisits(bundle);
  return solveDay({
    bundle,
    day,
    preferences,
    travel: DefaultTravelTime,
    flexibleGoals: [...DEFAULT_FLEXIBLE_GOALS, ...boothGoals],
  });
}
