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

/** Layout-owned projection: every route observes the same current venue day. */
export const livePlanState = $state<{
  bundle: EventBundle | null;
  day: string | null;
  status: 'loading' | 'ready' | 'error';
  result: Awaited<ReturnType<typeof resolveDayPlan>> | null;
  activityIds: string[];
}>({
  bundle: null,
  day: null,
  status: 'loading',
  result: null,
  activityIds: [],
});

/** Invalidates persisted flexible goals after a booth visit is saved. */
export const planInputs = $state({ revision: 0 });
