import type { Activity, EventBundle } from '@indiafoss/model';
import { computeNowState, leaveByInstant, parseInstant } from '@indiafoss/schedule';
import { findRoute } from '@indiafoss/venue';
import type { RoutingProfile } from '@indiafoss/venue';
import type { LoadedVenue } from '$lib/venue.svelte';

export interface NextUp {
  activity: Activity;
  /** Whether it came from the attendee's bookmarks rather than the programme order. */
  planned: boolean;
  startsInMinutes: number;
  /** Set when the venue graph and a current location give a walk. */
  travelSeconds: number | null;
  leaveBy: string | null;
  /** Minutes until leave-by; negative once it has passed. */
  leaveInMinutes: number | null;
  floorChange: boolean;
  restricted: boolean;
}

export interface NextUpInput {
  bundle: EventBundle;
  now: string;
  /** The attendee's bookmarked session ids; the earliest upcoming one wins. */
  bookmarked: (activityId: string) => boolean;
  venue: LoadedVenue | null;
  currentLocation: string | null;
  profile: RoutingProfile;
  bufferSeconds: number;
  /** Ignore sessions further out than this. */
  horizonMinutes?: number;
}

/**
 * The one session the leave-by banner is about: the earliest upcoming
 * bookmarked session, or failing that the programme's next session, within
 * the horizon. Walk time and leave-by need a known location and the venue
 * graph; without them the banner still names the session.
 */
export function computeNextUp(input: NextUpInput): NextUp | null {
  const { bundle, now } = input;
  const nowMs = parseInstant(now);
  const horizon = (input.horizonMinutes ?? 180) * 60_000;
  const upcoming = bundle.activities
    .filter((a) => !a.cancelled && a.start && a.end && parseInstant(a.start) >= nowMs)
    .filter((a) => parseInstant(a.start!) - nowMs <= horizon)
    .sort((a, b) => parseInstant(a.start!) - parseInstant(b.start!));
  const planned = upcoming.find((a) => input.bookmarked(a.id));
  const activity = planned ?? computeNowState(bundle, now).next ?? null;
  if (!activity?.start || parseInstant(activity.start) - nowMs > horizon) return null;

  const startsInMinutes = Math.ceil((parseInstant(activity.start) - nowMs) / 60_000);
  let travelSeconds: number | null = null;
  let leaveBy: string | null = null;
  let leaveInMinutes: number | null = null;
  let floorChange = false;
  let restricted = false;

  if (input.venue && input.currentLocation && activity.locationId) {
    const from = input.venue.metadata.locations[input.currentLocation]?.entrances[0];
    const to = input.venue.metadata.locations[activity.locationId]?.entrances[0];
    if (from && to) {
      if (from === to) {
        travelSeconds = 0;
      } else {
        const route = findRoute(input.venue.graph, from, to, input.profile);
        if (route) {
          travelSeconds = route.durationSeconds;
          floorChange = new Set(route.segments.map((s) => s.floor)).size > 1;
          restricted = route.restricted;
        }
      }
      if (travelSeconds !== null) {
        leaveBy = leaveByInstant(activity.start, travelSeconds, input.bufferSeconds);
        leaveInMinutes = Math.ceil((parseInstant(leaveBy) - nowMs) / 60_000);
      }
    }
  }

  return {
    activity,
    planned: !!planned,
    startsInMinutes,
    travelSeconds,
    leaveBy,
    leaveInMinutes,
    floorChange,
    restricted,
  };
}
