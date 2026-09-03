import type { Activity, EventBundle } from '@indiafoss/model';
import {
  learnAffinity,
  ratingWithPrior,
  type AffinityModel,
  type RankedActivity,
} from '@indiafoss/elo';
import { comparisonHistory, comparisonsOf, dispositionOf, ratingOf } from '$lib/prefs.svelte';
import { roomPreferences } from '$lib/roomPrefs.svelte';

/**
 * Affinity prior (#90): what the attendee keeps picking, by track, session
 * type and tag, learnt from the comparison history and the sessions ruled
 * out. Recomputed reactively from the preference stores; nothing is written.
 */
export function affinityModel(bundle: EventBundle): AffinityModel {
  const pool: RankedActivity[] = bundle.activities
    .filter((a) => !a.cancelled && a.type !== 'meal')
    .map((a) => rankedOf(a));
  return learnAffinity(pool, comparisonHistory(), roomPreferences());
}

export function rankedOf(activity: Activity): RankedActivity {
  return {
    activity,
    rating: ratingOf(activity.id),
    comparisons: comparisonsOf(activity.id),
    disposition: dispositionOf(activity.id),
  };
}

/** The stored rating with the prior blended in; what selection and planning use. */
export function effectiveRating(activity: Activity, model: AffinityModel): number {
  return ratingWithPrior(rankedOf(activity), model);
}
