import type { Route, RouteSegment, VenueEdge } from '@indiafoss/venue';
import type { LoadedVenue } from '$lib/venue.svelte';
import { FLOORS, FLOOR_ORDER, type FloorId } from './venue-floors';

/**
 * One line of walking directions derived from a venue-graph route: a walk
 * along one floor, or a stairs/lift change between floors. The map lists
 * these under the From/To panel (#223) so an attendee knows how many floor
 * changes a journey takes before they set off.
 */
export interface RouteStep {
  kind: 'walk' | 'stairs' | 'lift';
  /** Floor the step happens on (the floor arrived at, for a floor change). */
  floor: string;
  /** Floor left behind; only set for a floor change. */
  fromFloor?: string;
  direction?: 'up' | 'down';
  seconds: number;
  meters: number;
  /** Plain-language instruction, e.g. "Walk to the stairs on the ground floor". */
  text: string;
}

export interface RouteSummary {
  steps: RouteStep[];
  /** Rounded up; the same figure the leave-by banner counts down from. */
  minutes: number;
  floorChanges: number;
  /** True when origin and destination are the same entrance. */
  sameSpot: boolean;
}

/** Whether a venue's walk times are paced values or the draft graph's guesses. */
export interface RouteEvidence {
  validated: boolean;
  label: string;
}

export function routeEvidence(venue: Pick<LoadedVenue, 'metadata'>): RouteEvidence {
  return venue.metadata._draft
    ? { validated: false, label: 'Estimate: draft venue graph, not yet walked on site' }
    : { validated: true, label: 'Validated venue path' };
}

/** "ground floor" for a drawn floor, else the graph's own floor name. */
export function floorLabel(floor: string): string {
  const known = (FLOOR_ORDER as string[]).includes(floor) ? FLOORS[floor as FloorId] : null;
  return `${known ? known.label.toLowerCase() : floor} floor`;
}

function edgeBetween(
  venue: Pick<LoadedVenue, 'graph'>,
  a: string,
  b: string,
  segment: RouteSegment | undefined,
): VenueEdge | null {
  const candidates = venue.graph.edges.filter(
    (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
  );
  if (candidates.length === 0) return null;
  // A pair of nodes can be joined by both stairs and a lift (the routing
  // profile chooses); the router's instruction says which one it took.
  const wants = /stairs/i.test(segment?.instruction ?? '')
    ? 'stairs'
    : /lift/i.test(segment?.instruction ?? '')
      ? 'lift'
      : 'walk';
  const matching = candidates.filter((e) =>
    wants === 'stairs' ? e.stairs : wants === 'lift' ? e.lift : !e.stairs && !e.lift,
  );
  const pool = matching.length > 0 ? matching : candidates;
  return pool.reduce((best, e) => (e.timeSeconds < best.timeSeconds ? e : best));
}

function direction(from: string, to: string, segment: RouteSegment | undefined): 'up' | 'down' {
  const a = (FLOOR_ORDER as string[]).indexOf(from);
  const b = (FLOOR_ORDER as string[]).indexOf(to);
  if (a >= 0 && b >= 0 && a !== b) return b > a ? 'up' : 'down';
  return /down/i.test(segment?.instruction ?? '') ? 'down' : 'up';
}

/**
 * Turn a graph route into per-floor walks and floor changes. Consecutive
 * flat edges on one floor collapse into a single walk whose destination is
 * whatever comes next: the stairs, the lift or the room itself.
 */
export function routeSteps(
  venue: Pick<LoadedVenue, 'graph' | 'metadata'>,
  route: Route,
  names: { to: string },
): RouteSummary {
  const floorOf = new Map(venue.graph.nodes.map((n) => [n.id, n.floor]));
  const steps: RouteStep[] = [];
  let walk: RouteStep | null = null;

  const flushWalk = (toward: string) => {
    if (!walk) return;
    walk.text = `Walk to ${toward} on the ${floorLabel(walk.floor)}`;
    steps.push(walk);
    walk = null;
  };

  for (let i = 0; i + 1 < route.nodeIds.length; i++) {
    const a = route.nodeIds[i]!;
    const b = route.nodeIds[i + 1]!;
    const segment = route.segments[i];
    const edge = edgeBetween(venue, a, b, segment);
    const seconds = edge?.timeSeconds ?? 0;
    const meters = edge?.distanceMeters ?? 0;
    const fromFloor = floorOf.get(a) ?? 'unknown';
    const toFloor = floorOf.get(b) ?? fromFloor;
    const transition = edge?.stairs ? 'stairs' : edge?.lift ? 'lift' : null;
    if (transition) {
      flushWalk(`the ${transition}`);
      const dir = direction(fromFloor, toFloor, segment);
      steps.push({
        kind: transition,
        floor: toFloor,
        fromFloor,
        direction: dir,
        seconds,
        meters,
        text: `Take the ${transition} ${dir} to the ${floorLabel(toFloor)}`,
      });
      continue;
    }
    if (walk && walk.floor !== fromFloor) flushWalk(`the ${floorLabel(fromFloor)}`);
    walk ??= { kind: 'walk', floor: fromFloor, seconds: 0, meters: 0, text: '' };
    walk.seconds += seconds;
    walk.meters += meters;
  }
  flushWalk(names.to);

  return {
    steps,
    minutes: Math.ceil(route.durationSeconds / 60),
    floorChanges: steps.filter((s) => s.kind !== 'walk').length,
    sameSpot: route.nodeIds.length <= 1,
  };
}
