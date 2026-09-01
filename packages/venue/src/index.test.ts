import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { VenueGraph } from './index.js';
import {
  findRoute,
  findRouteDijkstra,
  validateVenueGraph,
  validateVenueMetadata,
} from './index.js';

/** Two-floor test venue: ground rooms connected by stairs/lift to first floor. */
function makeGraph(): VenueGraph {
  return {
    nodes: [
      { id: 'gf-entrance', floor: 'ground', x: 0, y: 0 },
      { id: 'gf-audi', floor: 'ground', x: 40, y: 0 },
      { id: 'gf-devroom', floor: 'ground', x: 40, y: 30 },
      { id: 'gf-lift', floor: 'ground', x: 20, y: 15 },
      { id: 'gf-stairs', floor: 'ground', x: 20, y: 5 },
      { id: 'ff-lift', floor: 'first', x: 20, y: 15 },
      { id: 'ff-stairs', floor: 'first', x: 20, y: 5 },
      { id: 'ff-room', floor: 'first', x: 60, y: 5 },
    ],
    edges: [
      {
        from: 'gf-entrance',
        to: 'gf-audi',
        distanceMeters: 40,
        timeSeconds: 31,
        accessible: true,
        stairs: false,
        lift: false,
        oneWay: false,
      },
      {
        from: 'gf-audi',
        to: 'gf-devroom',
        distanceMeters: 30,
        timeSeconds: 23,
        accessible: true,
        stairs: false,
        lift: false,
        oneWay: false,
      },
      {
        from: 'gf-entrance',
        to: 'gf-lift',
        distanceMeters: 25,
        timeSeconds: 19,
        accessible: true,
        stairs: false,
        lift: false,
        oneWay: false,
      },
      {
        from: 'gf-entrance',
        to: 'gf-stairs',
        distanceMeters: 20,
        timeSeconds: 15,
        accessible: true,
        stairs: false,
        lift: false,
        oneWay: false,
      },
      {
        from: 'gf-lift',
        to: 'ff-lift',
        distanceMeters: 0,
        timeSeconds: 12,
        accessible: true,
        stairs: false,
        lift: true,
        oneWay: false,
      },
      {
        from: 'gf-stairs',
        to: 'ff-stairs',
        distanceMeters: 0,
        timeSeconds: 10,
        accessible: false,
        stairs: true,
        lift: false,
        oneWay: false,
      },
      {
        from: 'ff-lift',
        to: 'ff-room',
        distanceMeters: 40,
        timeSeconds: 31,
        accessible: true,
        stairs: false,
        lift: false,
        oneWay: false,
      },
      {
        from: 'ff-stairs',
        to: 'ff-room',
        distanceMeters: 40,
        timeSeconds: 31,
        accessible: true,
        stairs: false,
        lift: false,
        oneWay: false,
      },
    ],
  };
}

const metadata = {
  locations: {
    audi: { locationId: 'audi', svgTarget: 'audi-1', entrances: ['gf-audi'], floor: 'ground' },
    room: { locationId: 'room', svgTarget: 'room-1', entrances: ['ff-room'], floor: 'first' },
    bad: { locationId: 'bad', svgTarget: 'x', entrances: ['nope'] },
  },
};

describe('findRoute (fastest)', () => {
  it('routes within a floor', () => {
    const route = findRoute(makeGraph(), 'gf-entrance', 'gf-devroom');
    expect(route).not.toBeNull();
    expect(route?.nodeIds[0]).toBe('gf-entrance');
    expect(route?.nodeIds.at(-1)).toBe('gf-devroom');
    expect(route?.segments.every((s) => s.floor === 'ground')).toBe(true);
  });

  it('finds the fastest (non-accessible) multi-floor route via stairs', () => {
    const route = findRoute(makeGraph(), 'gf-entrance', 'ff-room');
    // stairs (10s) beat lift (12s)
    expect(route?.nodeIds).toContain('gf-stairs');
    expect(route?.nodeIds).toContain('ff-stairs');
    expect(route?.segments.some((s) => s.instruction === 'Take the stairs up')).toBe(true);
  });
});

describe('routing profiles (§26)', () => {
  const graph = makeGraph();

  it('accessible profile rejects stairs and uses the lift', () => {
    const route = findRoute(graph, 'gf-entrance', 'ff-room', 'accessible');
    expect(route).not.toBeNull();
    expect(route?.nodeIds).toContain('gf-lift');
    expect(route?.nodeIds).not.toContain('gf-stairs');
  });

  it('avoid-stairs profile rejects stairs but allows lift', () => {
    const route = findRoute(graph, 'gf-entrance', 'ff-room', 'avoid-stairs');
    expect(route?.nodeIds).toContain('gf-lift');
    expect(route?.nodeIds).not.toContain('gf-stairs');
  });

  it('accessible profile returns null when no accessible path exists', () => {
    const keep = new Set([
      'gf-entrance',
      'gf-audi',
      'gf-devroom',
      'gf-stairs',
      'ff-stairs',
      'ff-room',
    ]);
    const onlyStairs: VenueGraph = {
      nodes: graph.nodes.filter((n) => keep.has(n.id)),
      edges: graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to) && !e.lift),
    };
    expect(findRoute(onlyStairs, 'gf-entrance', 'ff-room', 'accessible')).toBeNull();
    // fastest still works
    expect(findRoute(onlyStairs, 'gf-entrance', 'ff-room', 'fastest')).not.toBeNull();
  });

  it('rejects negative edge weights (validation)', () => {
    const bad = structuredClone(makeGraph());
    bad.edges[0]!.timeSeconds = -5;
    const issues = validateVenueGraph(bad);
    expect(issues.some((i) => i.includes('negative time'))).toBe(true);
  });
});

describe('A* vs Dijkstra oracle (§26, §51)', () => {
  it('produces identical costs on random non-negative graphs', () => {
    const nodeIds = ['a', 'b', 'c', 'd', 'e'];
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            from: fc.constantFrom(...nodeIds),
            to: fc.constantFrom(...nodeIds),
            dist: fc.integer({ min: 1, max: 60 }),
          }),
          { maxLength: 16 },
        ),
        (edges) => {
          // Coordinates are chosen so every edge's walk time is consistent
          // with its Euclidean length (heuristic must stay admissible).
          const positions: Record<string, { x: number; y: number }> = {
            a: { x: 0, y: 0 },
            b: { x: 100, y: 0 },
            c: { x: 50, y: 86 },
            d: { x: 20, y: 40 },
            e: { x: 80, y: 40 },
          };
          const graph: VenueGraph = {
            nodes: nodeIds.map((id) => ({ id, floor: 'g', ...positions[id]! })),
            edges: edges.map((e) => {
              // walk time >= straight-line time at 1.3 m/s
              const euclid = Math.hypot(
                positions[e.from]!.x - positions[e.to]!.x,
                positions[e.from]!.y - positions[e.to]!.y,
              );
              return {
                from: e.from,
                to: e.to,
                distanceMeters: e.dist,
                timeSeconds: Math.max(1, Math.ceil(e.dist / 1.3), Math.ceil(euclid / 1.3)),
                accessible: true,
                stairs: false,
                lift: false,
                oneWay: false,
              };
            }),
          };
          const a = findRoute(graph, 'a', 'e');
          const d = findRouteDijkstra(graph, 'a', 'e');
          expect(a?.durationSeconds).toBe(d?.durationSeconds);
          expect(a?.nodeIds).toEqual(d?.nodeIds);
          return true;
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('validation (§53)', () => {
  it('catches duplicate nodes, unknown endpoints, self-loops', () => {
    const graph = makeGraph();
    graph.nodes.push({ id: 'gf-audi', floor: 'ground', x: 1, y: 1 });
    graph.edges.push({
      from: 'gf-audi',
      to: 'nowhere',
      distanceMeters: 1,
      timeSeconds: 1,
      accessible: true,
      stairs: false,
      lift: false,
      oneWay: false,
    });
    graph.edges.push({
      from: 'gf-audi',
      to: 'gf-audi',
      distanceMeters: 1,
      timeSeconds: 1,
      accessible: true,
      stairs: false,
      lift: false,
      oneWay: false,
    });
    const issues = validateVenueGraph(graph);
    expect(issues.some((i) => i.includes('duplicate node'))).toBe(true);
    expect(issues.some((i) => i.includes('unknown node'))).toBe(true);
    expect(issues.some((i) => i.includes('self-loop'))).toBe(true);
  });

  it('validates metadata entrances and svgTargets', () => {
    const issues = validateVenueMetadata(metadata, makeGraph());
    expect(issues.some((i) => i.includes('bad'))).toBe(true);
    expect(issues.some((i) => i.includes('nope'))).toBe(true);
  });
});
