import { findRoute, type Route, type RoutingProfile } from '@indiafoss/venue';
import type { LoadedVenue } from '$lib/venue.svelte';

export const ROUTING_LABELS: Record<RoutingProfile, string> = {
  fastest: 'Fastest',
  accessible: 'Accessible',
  'avoid-stairs': 'Avoid stairs',
};

/** The same graph and requested profile feed map, departure advice and reminders. */
export function journeyRoute(
  venue: LoadedVenue | null,
  fromLocation: string | null | undefined,
  toLocation: string | null | undefined,
  profile: RoutingProfile,
): Route | null {
  if (!venue || !fromLocation || !toLocation) return null;
  const from = venue.metadata.locations[fromLocation]?.entrances[0];
  const to = venue.metadata.locations[toLocation]?.entrances[0];
  if (
    !from ||
    !to ||
    !venue.graph.nodes.some((node) => node.id === from) ||
    !venue.graph.nodes.some((node) => node.id === to)
  )
    return null;
  return findRoute(venue.graph, from, to, profile);
}
