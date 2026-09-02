import type { EventBundle } from '@indiafoss/model';
import { solveDay, DefaultTravelTime, DEFAULT_FLEXIBLE_GOALS } from '@indiafoss/solver';
import type { FlexibleGoal, SolverPreferences, TravelTimeProvider } from '@indiafoss/solver';
import { createGraphTravelTime } from '@indiafoss/venue';
import { CompanionStorage } from '@indiafoss/storage';
import { bookmarked, dispositionOf, hydratePreferences, ratingOf } from '$lib/prefs.svelte';
import { hydrateRoutingProfile, routingPrefs } from '$lib/routingPrefs.svelte';
import { loadVenue, venueKeyForEvent } from '$lib/venue.svelte';

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
 * Build a schedule-aware travel provider from the event's venue graph, honouring
 * the attendee's routing profile (§29). Falls back to the flat default when the
 * venue asset cannot be loaded (e.g. offline before the first fetch).
 */
async function travelForEvent(bundle: EventBundle): Promise<TravelTimeProvider> {
  await hydrateRoutingProfile();
  try {
    const venue = await loadVenue(venueKeyForEvent(bundle.id));
    return createGraphTravelTime(venue.graph, venue.metadata, {
      profile: routingPrefs.profile,
    });
  } catch {
    return DefaultTravelTime;
  }
}

/**
 * Solve a day's itinerary against the current local preferences, including
 * planned booth visits (§7) as flexible activities. Feasibility uses real
 * venue route durations under the attendee's routing profile (§29).
 */
export async function solveForDay(bundle: EventBundle, day: string) {
  await hydratePreferences();
  const [boothGoals, travel] = await Promise.all([
    plannedBoothVisits(bundle),
    travelForEvent(bundle),
  ]);
  return solveDay({
    bundle,
    day,
    preferences,
    travel,
    flexibleGoals: [...DEFAULT_FLEXIBLE_GOALS, ...boothGoals],
  });
}
