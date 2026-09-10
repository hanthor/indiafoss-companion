import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findRoute, type VenueGraph, type VenueMetadata } from '@indiafoss/venue';
import { journeyRoute } from './journey';
import { floorLabel, routeEvidence, routeSteps } from './route-steps';
import type { LoadedVenue } from './venue.svelte';

const venueDir = new URL('../../../../events/indiafoss-2026/venue/', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, venueDir), 'utf8'));

/** The committed 2026 draft: Hall 1 downstairs, Room 2 upstairs via stairs or lift. */
const venue2026: LoadedVenue = {
  key: 'indiafoss-2026',
  svg: '',
  graph: read('venue.graph.json') as VenueGraph,
  metadata: read('venue.metadata.json') as VenueMetadata,
};

describe('routeSteps on the 2026 venue graph', () => {
  it('lists a ground walk, the stairs up and a first-floor walk for the fastest profile', () => {
    const route = journeyRoute(venue2026, 'hall-1', 'room-2', 'fastest')!;
    const summary = routeSteps(venue2026, route, { to: 'Room 2' });
    expect(summary.steps.map((s) => s.kind)).toEqual(['walk', 'stairs', 'walk']);
    expect(summary.steps.map((s) => s.text)).toEqual([
      'Walk to the stairs on the ground floor',
      'Take the stairs up to the first floor',
      'Walk to Room 2 on the first floor',
    ]);
    expect(summary.floorChanges).toBe(1);
    expect(summary.sameSpot).toBe(false);
    // Every second of the route is accounted for by exactly one step.
    expect(summary.steps.reduce((n, s) => n + s.seconds, 0)).toBe(route.durationSeconds);
    expect(summary.minutes).toBe(Math.ceil(route.durationSeconds / 60));
  });

  it('honours the accessible profile by taking the lift instead of the stairs', () => {
    const route = journeyRoute(venue2026, 'hall-1', 'room-2', 'accessible')!;
    const summary = routeSteps(venue2026, route, { to: 'Room 2' });
    expect(summary.steps.map((s) => s.kind)).toEqual(['walk', 'lift', 'walk']);
    expect(summary.steps[0]!.text).toBe('Walk to the lift on the ground floor');
    expect(summary.steps[1]!.text).toBe('Take the lift up to the first floor');
    expect(summary.steps[1]!.direction).toBe('up');
  });

  it('says down when the journey starts upstairs', () => {
    const route = journeyRoute(venue2026, 'silent-room', 'hall-2', 'avoid-stairs')!;
    const summary = routeSteps(venue2026, route, { to: 'Hall 2' });
    const change = summary.steps.find((s) => s.kind !== 'walk')!;
    expect(change.kind).toBe('lift');
    expect(change.direction).toBe('down');
    expect(change.fromFloor).toBe('first');
    expect(change.floor).toBe('ground');
    expect(summary.steps.at(-1)!.text).toBe('Walk to Hall 2 on the ground floor');
  });

  it('collapses a same-floor journey into one walk with no floor change', () => {
    const route = journeyRoute(venue2026, 'hall-1', 'hall-3', 'fastest')!;
    expect(route.nodeIds.length).toBeGreaterThan(2);
    const summary = routeSteps(venue2026, route, { to: 'Hall 3' });
    expect(summary.steps).toHaveLength(1);
    expect(summary.steps[0]).toMatchObject({
      kind: 'walk',
      floor: 'ground',
      seconds: route.durationSeconds,
      meters: route.distanceMeters,
      text: 'Walk to Hall 3 on the ground floor',
    });
    expect(summary.floorChanges).toBe(0);
  });

  it('reports an empty journey when origin and destination share an entrance', () => {
    const route = journeyRoute(venue2026, 'hall-1', 'hall-1', 'fastest')!;
    const summary = routeSteps(venue2026, route, { to: 'Hall 1' });
    expect(summary.steps).toEqual([]);
    expect(summary.sameSpot).toBe(true);
    expect(summary.minutes).toBe(0);
  });

  it('labels the committed draft graph as an estimate, not a validated path', () => {
    expect(venue2026.metadata._draft).toBe(true);
    expect(routeEvidence(venue2026)).toEqual({
      validated: false,
      label: 'Estimate: draft venue graph, not yet walked on site',
    });
    expect(routeEvidence({ metadata: { locations: {} } })).toEqual({
      validated: true,
      label: 'Validated venue path',
    });
    expect(routeEvidence({ metadata: { locations: {}, _draft: false } }).validated).toBe(true);
  });
});

describe('routeSteps on graphs the drawing does not know', () => {
  const graph: VenueGraph = {
    nodes: [
      { id: 'a', floor: 'basement', x: 0, y: 0 },
      { id: 'b', floor: 'basement', x: 10, y: 0 },
      { id: 'c', floor: 'mezzanine', x: 10, y: 0 },
      { id: 'd', floor: 'mezzanine', x: 20, y: 0 },
    ],
    edges: [
      {
        from: 'a',
        to: 'b',
        distanceMeters: 10,
        timeSeconds: 8,
        accessible: true,
        stairs: false,
        lift: false,
        oneWay: false,
      },
      {
        from: 'c',
        to: 'b',
        distanceMeters: 0,
        timeSeconds: 10,
        accessible: false,
        stairs: true,
        lift: false,
        oneWay: false,
      },
      {
        from: 'b',
        to: 'c',
        distanceMeters: 0,
        timeSeconds: 20,
        accessible: true,
        stairs: false,
        lift: true,
        oneWay: false,
      },
      {
        from: 'c',
        to: 'd',
        distanceMeters: 10,
        timeSeconds: 8,
        accessible: true,
        stairs: false,
        lift: false,
        oneWay: false,
      },
    ],
  };
  const venue = { graph, metadata: { locations: {} } };

  it('falls back to the router instruction for direction on unranked floors', () => {
    // The stairs edge is authored top-down, so walking it b→c is "reverse":
    // the router says "down" although the attendee is climbing. Without a
    // floor order to rank against, the instruction is all there is to go on.
    const stairs = findRoute(graph, 'a', 'd', 'fastest')!;
    const summary = routeSteps(venue, stairs, { to: 'the roof' });
    expect(summary.steps.map((s) => s.kind)).toEqual(['walk', 'stairs', 'walk']);
    expect(summary.steps[1]!.direction).toBe('down');
    expect(summary.steps[1]!.text).toBe('Take the stairs down to the mezzanine floor');
    expect(summary.steps[0]!.text).toBe('Walk to the stairs on the basement floor');
    const lift = findRoute(graph, 'a', 'd', 'accessible')!;
    expect(routeSteps(venue, lift, { to: 'the roof' }).steps[1]!.text).toBe(
      'Take the lift up to the mezzanine floor',
    );
  });

  it('names known floors by their plan label and unknown ones as given', () => {
    expect(floorLabel('ground')).toBe('ground floor');
    expect(floorLabel('first')).toBe('first floor');
    expect(floorLabel('mezzanine')).toBe('mezzanine floor');
  });
});
