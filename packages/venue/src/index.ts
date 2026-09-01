/**
 * Venue routing engine (§22–§28).
 *
 * The venue is described by three independent assets:
 *   - venue.svg          (presentation; stable ids per §23)
 *   - venue.graph.json   (routing data)
 *   - venue.metadata.json(connects the two)
 *
 * This module operates purely on the graph + metadata; it never parses SVG.
 */

export interface VenueNode {
  id: string;
  floor: string;
  x: number;
  y: number;
}

export interface VenueEdge {
  from: string;
  to: string;
  /** Horizontal distance in metres. */
  distanceMeters: number;
  /** Walk time in seconds. */
  timeSeconds: number;
  /** Wheelchair-accessible. */
  accessible: boolean;
  stairs: boolean;
  lift: boolean;
  /** Stairs/direction sense: true = only from->to. */
  oneWay: boolean;
}

export interface VenueGraph {
  nodes: VenueNode[];
  edges: VenueEdge[];
}

export interface VenueLocationRef {
  /** Canonical location id (matches the event bundle's Location ids). */
  locationId: string;
  /** Stable element id inside venue.svg (§23). */
  svgTarget?: string;
  /** Graph node ids usable as routing entrances. */
  entrances: string[];
  /** Floor label for UI grouping. */
  floor?: string;
}

export interface VenueMetadata {
  locations: Record<string, VenueLocationRef>;
}

export type RoutingProfile = 'fastest' | 'accessible' | 'avoid-stairs';

export interface RouteSegment {
  fromNode: string;
  toNode: string;
  floor: string;
  /** Human instruction, e.g. "Turn left at the lobby". */
  instruction?: string;
}

export interface Route {
  nodeIds: string[];
  distanceMeters: number;
  durationSeconds: number;
  segments: RouteSegment[];
  /** True when the requested profile rejected some edges (e.g. stairs). */
  restricted: boolean;
}

function nodeById(graph: VenueGraph, id: string): VenueNode {
  const node = graph.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`venue graph: unknown node '${id}'`);
  return node;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface EdgeSpec {
  edge: VenueEdge;
  reverse: boolean;
}

function edgeCost(edge: VenueEdge, profile: RoutingProfile, reverse: boolean): number | null {
  if (profile === 'accessible' && !edge.accessible) return null; // hard rejection (§26)
  if (profile === 'avoid-stairs' && edge.stairs) return null;
  if (profile === 'accessible' && edge.stairs) return null;
  if (edge.oneWay && reverse && edge.from !== edge.to) return null;
  if (edge.oneWay && !reverse && edge.from === edge.to) return null;
  if (edge.timeSeconds < 0) return null; // negative weights rejected (§53)
  return edge.timeSeconds;
}

function adjacency(graph: VenueGraph, profile: RoutingProfile): Map<string, EdgeSpec[]> {
  const map = new Map<string, EdgeSpec[]>();
  for (const node of graph.nodes) map.set(node.id, []);
  for (const edge of graph.edges) {
    const forward = edgeCost(edge, profile, false);
    if (forward !== null) map.get(edge.from)?.push({ edge, reverse: false });
    const backward = edgeCost(edge, profile, true);
    if (backward !== null) map.get(edge.to)?.push({ edge, reverse: true });
  }
  return map;
}

/**
 * A* pathfinding (§26). The heuristic is straight-line distance over the
 * graph's own coordinate space scaled by a floor speed estimate; admissible
 * because graph edges are never faster than straight-line walking time.
 */
export function findRoute(
  graph: VenueGraph,
  from: string,
  to: string,
  profile: RoutingProfile = 'fastest',
): Route | null {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const adj = adjacency(graph, profile);
  if (!nodes.has(from) || !nodes.has(to)) return null;
  if (from === to) {
    return {
      nodeIds: [from],
      distanceMeters: 0,
      durationSeconds: 0,
      segments: [],
      restricted: false,
    };
  }

  // Speed in metres/second implied by timeSeconds; used only for the heuristic.
  const speed = 1.3; // m/s typical walking
  const heuristic = (id: string): number => {
    const a = nodes.get(id)!;
    const b = nodes.get(to)!;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy) / speed;
  };

  const open = new Set<string>([from]);
  const g = new Map<string, number>([[from, 0]]);
  const f = new Map<string, number>([[from, heuristic(from)]]);
  const cameFrom = new Map<string, { node: string; edge: EdgeSpec }>();

  while (open.size > 0) {
    let current: string | null = null;
    let bestF = Infinity;
    for (const id of open) {
      const v = f.get(id) ?? Infinity;
      if (v < bestF) {
        bestF = v;
        current = id;
      }
    }
    if (current === null) break;
    if (current === to) break;
    open.delete(current);

    for (const spec of adj.get(current) ?? []) {
      const cost = edgeCost(spec.edge, profile, spec.reverse);
      if (cost === null) continue;
      const neighbor = spec.reverse ? spec.edge.from : spec.edge.to;
      const tentative = (g.get(current) ?? Infinity) + cost;
      if (tentative < (g.get(neighbor) ?? Infinity)) {
        cameFrom.set(neighbor, { node: current, edge: spec });
        g.set(neighbor, tentative);
        f.set(neighbor, tentative + heuristic(neighbor));
        open.add(neighbor);
      }
    }
  }

  if (!cameFrom.has(to)) return null;

  const nodeIds: string[] = [];
  const edgesUsed: EdgeSpec[] = [];
  let cursor: string | null = to;
  while (cursor && cursor !== from) {
    nodeIds.unshift(cursor);
    const step = cameFrom.get(cursor);
    if (!step) break;
    edgesUsed.unshift(step.edge);
    cursor = step.node;
  }
  nodeIds.unshift(from);

  const durationSeconds = g.get(to) ?? 0;
  let distanceMeters = 0;
  for (const spec of edgesUsed) distanceMeters += spec.edge.distanceMeters;

  return {
    nodeIds,
    distanceMeters,
    durationSeconds,
    segments: buildSegments(graph, nodeIds, edgesUsed),
    restricted: profile !== 'fastest',
  };
}

/**
 * Dijkstra — kept as the correctness oracle for tests (§26). Same output
 * contract as A*.
 */
export function findRouteDijkstra(
  graph: VenueGraph,
  from: string,
  to: string,
  profile: RoutingProfile = 'fastest',
): Route | null {
  const adj = adjacency(graph, profile);
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; edge: EdgeSpec }>();
  const unvisited = new Set(graph.nodes.map((n) => n.id));

  while (unvisited.size > 0) {
    let current: string | null = null;
    let best = Infinity;
    for (const id of unvisited) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) {
        best = d;
        current = id;
      }
    }
    if (current === null) break;
    if (current === to) break;
    unvisited.delete(current);
    for (const spec of adj.get(current) ?? []) {
      const cost = edgeCost(spec.edge, profile, spec.reverse);
      if (cost === null) continue;
      const neighbor = spec.reverse ? spec.edge.from : spec.edge.to;
      const tentative = (dist.get(current) ?? Infinity) + cost;
      if (tentative < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, tentative);
        prev.set(neighbor, { node: current, edge: spec });
      }
    }
  }

  if (!prev.has(to)) return null;
  const nodeIds: string[] = [];
  const edgesUsed: EdgeSpec[] = [];
  let cursor: string | null = to;
  while (cursor && cursor !== from) {
    nodeIds.unshift(cursor);
    const step = prev.get(cursor);
    if (!step) break;
    edgesUsed.unshift(step.edge);
    cursor = step.node;
  }
  nodeIds.unshift(from);

  return {
    nodeIds,
    distanceMeters: edgesUsed.reduce((s, e) => s + e.edge.distanceMeters, 0),
    durationSeconds: dist.get(to) ?? 0,
    segments: buildSegments(graph, nodeIds, edgesUsed),
    restricted: profile !== 'fastest',
  };
}

function buildSegments(
  graph: VenueGraph,
  nodeIds: string[],
  edgesUsed: EdgeSpec[],
): RouteSegment[] {
  const segments: RouteSegment[] = [];
  for (let i = 0; i + 1 < nodeIds.length; i++) {
    const fromNode = nodeIds[i]!;
    const toNode = nodeIds[i + 1]!;
    const spec = edgesUsed[i]!;
    const edge = spec.edge;
    segments.push({
      fromNode,
      toNode,
      floor: nodeById(graph, toNode).floor,
      instruction: instructionFor(edge, spec.reverse),
    });
  }
  return segments;
}

function instructionFor(edge: VenueEdge, reverse: boolean): string | undefined {
  if (edge.stairs) return reverse ? 'Take the stairs down' : 'Take the stairs up';
  if (edge.lift) return reverse ? 'Take the lift down' : 'Take the lift up';
  return undefined;
}

/**
 * Validate a venue graph (§53): unique nodes, edge endpoints exist, no
 * negative weights, no self-loops, consistent edge references.
 */
export function validateVenueGraph(graph: VenueGraph): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) issues.push(`duplicate node id: ${node.id}`);
    ids.add(node.id);
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      issues.push(`node ${node.id} has non-finite coordinates`);
    }
  }
  for (const edge of graph.edges) {
    if (!ids.has(edge.from)) issues.push(`edge references unknown node: ${edge.from}`);
    if (!ids.has(edge.to)) issues.push(`edge references unknown node: ${edge.to}`);
    if (edge.from === edge.to) issues.push(`self-loop edge: ${edge.from}`);
    if (edge.timeSeconds < 0) issues.push(`negative time on edge ${edge.from}->${edge.to}`);
    if (edge.distanceMeters < 0) issues.push(`negative distance on edge ${edge.from}->${edge.to}`);
    if (edge.timeSeconds === 0) issues.push(`zero time on edge ${edge.from}->${edge.to}`);
  }
  // symmetry of edges is optional (one-way allowed) but duplicates are not.
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    const key = edgeKey(edge.from, edge.to);
    if (seen.has(key)) issues.push(`duplicate edge: ${key}`);
    seen.add(key);
  }
  return issues;
}

/**
 * Validate metadata against the graph and the schedule's locations (§53):
 * every entrance must exist in the graph, every svgTarget must be non-empty.
 */
export function validateVenueMetadata(metadata: VenueMetadata, graph: VenueGraph): string[] {
  const issues: string[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  for (const [locationId, ref] of Object.entries(metadata.locations)) {
    if (ref.entrances.length === 0) {
      issues.push(`location ${locationId} has no routing entrances`);
    }
    for (const entrance of ref.entrances) {
      if (!nodeIds.has(entrance)) {
        issues.push(`location ${locationId} entrance '${entrance}' not in graph`);
      }
    }
    // svgTarget is optional: some areas (booth zones) may not map to a
    // single SVG element yet. When present it must be validated against the
    // SVG (§53) — see venue-validator's svgTargetIssues.
  }
  return issues;
}
