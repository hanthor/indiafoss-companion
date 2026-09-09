import type { EventBundle } from '@indiafoss/model';
import { applyItineraryEdits, type PlanEdits } from '@indiafoss/solver';
import { solveForDay } from './solver.svelte';

/** Resolve from current source data and explicit edits, never a cached list of planned IDs. */
export async function resolveDayPlan(bundle: EventBundle, day: string, edits: PlanEdits) {
  const result = await solveForDay(bundle, day, edits.locked);
  // Snapshot lookup for this resolve; it is never mutated or observed by the UI.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const activities = new Map(bundle.activities.filter((a) => !a.cancelled).map((a) => [a.id, a]));
  const edited = applyItineraryEdits({
    base: result.itinerary.items,
    edits,
    activities,
    travel: result.travel,
  });
  return { ...result, edited };
}

/** The Now route publishes its current projection for the global leave-by banner. */
export const nowPlanState = $state<{
  eventId: string | null;
  day: string | null;
  activityIds: string[];
}>({
  eventId: null,
  day: null,
  activityIds: [],
});
