import type { EventBundle } from '@indiafoss/model';
import { solveDay, DefaultTravelTime } from '@indiafoss/solver';
import type { SolverPreferences } from '@indiafoss/solver';
import { bookmarked, dispositionOf, hydratePreferences, ratingOf } from '$lib/prefs.svelte';

const preferences: SolverPreferences = {
  ratingOf: (id) => ratingOf(id),
  dispositionOf: (id) => dispositionOf(id),
  bookmarked: (id) => bookmarked(id),
};

/**
 * Solve a day's itinerary against the current local preferences.
 * Travel times use the default estimator until the venue engine (Phase 5)
 * supplies real routing distances.
 */
export async function solveForDay(bundle: EventBundle, day: string) {
  await hydratePreferences();
  return solveDay({ bundle, day, preferences, travel: DefaultTravelTime });
}
