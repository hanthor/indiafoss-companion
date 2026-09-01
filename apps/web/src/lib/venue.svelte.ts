import { base } from '$app/paths';
import type { VenueGraph, VenueMetadata } from '@indiafoss/venue';

export interface LoadedVenue {
  key: string;
  svg: string;
  graph: VenueGraph;
  metadata: VenueMetadata;
}

const cache: Record<string, LoadedVenue> = {};

/**
 * Load a venue asset set (svg + graph + metadata) from static files.
 * Precached by the service worker, so the map works offline (§33).
 *
 * The 2025 schedule (Audi 1/2, Devrooms) is mapped to the synthetic venue;
 * the real supplied floor plan is the 2026 venue asset.
 */
export async function loadVenue(key: string): Promise<LoadedVenue> {
  const cached = cache[key];
  if (cached) return cached;
  const venueBase = `${base}/venues/${key}`;
  const [svg, graph, metadata] = await Promise.all([
    fetch(`${venueBase}/venue.svg`).then((r) => r.text()),
    fetch(`${venueBase}/venue.graph.json`).then((r) => r.json()),
    fetch(`${venueBase}/venue.metadata.json`).then((r) => r.json()),
  ]);
  const venue: LoadedVenue = {
    key,
    svg,
    graph: graph as VenueGraph,
    metadata: metadata as VenueMetadata,
  };
  cache[key] = venue;
  return venue;
}

/** The venue backing the active (2025) schedule. */
export function venueKeyForEvent(eventId: string): string {
  return eventId === 'indiafoss-2026' ? 'indiafoss-2026' : 'synthetic';
}
