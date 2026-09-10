import { describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import { createGraphTravelTime, type RoutingProfile } from '@indiafoss/venue';
import { journeyRoute } from './journey';
import { computeNextUp } from './nextup';
import { computeNotifications, DEFAULT_NOTIFICATION_WINDOW } from './notifications';
import type { LoadedVenue } from './venue.svelte';

const venue: LoadedVenue = {
  key: 'test',
  svg: '',
  graph: {
    nodes: [
      { id: 'a', floor: 'ground', x: 0, y: 0 },
      { id: 'b', floor: 'first', x: 0, y: 0 },
    ],
    edges: [
      {
        from: 'a',
        to: 'b',
        distanceMeters: 10,
        timeSeconds: 60,
        stairs: true,
        accessible: false,
        lift: false,
        oneWay: false,
      },
      {
        from: 'a',
        to: 'b',
        distanceMeters: 10,
        timeSeconds: 600,
        stairs: false,
        accessible: true,
        lift: true,
        oneWay: false,
      },
    ],
  },
  metadata: {
    locations: {
      from: { locationId: 'from', entrances: ['a'] },
      to: { locationId: 'to', entrances: ['b'] },
    },
  },
};
const bundle = {
  activities: [
    {
      id: 'talk',
      title: 'My talk',
      start: '2026-09-19T05:00:00Z',
      end: '2026-09-19T06:00:00Z',
      locationId: 'to',
      type: 'talk',
    },
  ],
  locations: [{ id: 'to', name: 'Upstairs' }],
} as EventBundle;
const now = '2026-09-19T04:00:00Z';

describe('shared attendee journey', () => {
  it.each<[RoutingProfile, number]>([
    ['fastest', 60],
    ['accessible', 600],
    ['avoid-stairs', 600],
  ])('map, next-up, solver and reminders use %s duration', (profile, seconds) => {
    const route = journeyRoute(venue, 'from', 'to', profile);
    expect(route?.durationSeconds).toBe(seconds);
    const next = computeNextUp({
      bundle,
      now,
      venue,
      currentLocation: 'from',
      profile,
      bookmarked: () => true,
      bufferSeconds: DEFAULT_NOTIFICATION_WINDOW.leaveBufferMinutes * 60,
    });
    expect(next?.travelSeconds).toBe(seconds);
    expect(next?.floorChange).toBe(true);
    expect(
      createGraphTravelTime(venue.graph, venue.metadata, { profile }).seconds('from', 'to'),
    ).toBe(seconds);
    const reminders = computeNotifications(
      bundle,
      now,
      (to) => journeyRoute(venue, 'from', to, profile)?.durationSeconds ?? null,
      () => 'planned',
    );
    expect(Date.parse(reminders.find((reminder) => reminder.id === 'leave-talk')!.at)).toBe(
      Date.parse(next!.leaveBy!),
    );
  });
  it('does not invent a walk or departure alert when accessible routing is unavailable', () => {
    const stairsOnly = {
      ...venue,
      graph: { ...venue.graph, edges: venue.graph.edges.slice(0, 1) },
    };
    expect(journeyRoute(stairsOnly, 'from', 'to', 'accessible')).toBeNull();
    expect(
      createGraphTravelTime(stairsOnly.graph, stairsOnly.metadata, {
        profile: 'accessible',
        defaultSeconds: Infinity,
      }).seconds('from', 'to'),
    ).toBe(Infinity);
    const next = computeNextUp({
      bundle,
      now,
      venue: stairsOnly,
      currentLocation: 'from',
      profile: 'accessible',
      bookmarked: () => true,
      bufferSeconds: 600,
    });
    expect(next?.travelSeconds).toBeNull();
    expect(next?.leaveBy).toBeNull();
    const reminders = computeNotifications(
      bundle,
      now,
      (to) => journeyRoute(stairsOnly, 'from', to, 'accessible')?.durationSeconds ?? null,
      () => 'planned',
    );
    expect(reminders.map((reminder) => reminder.id)).toEqual(['soon-talk']);
  });
  it('treats missing locations and invalid graph entrances as unknown, and same room as zero', () => {
    expect(journeyRoute(venue, null, 'to', 'accessible')).toBeNull();
    expect(journeyRoute(venue, 'missing', 'to', 'accessible')).toBeNull();
    expect(
      journeyRoute({ ...venue, graph: { nodes: [], edges: [] } }, 'from', 'to', 'accessible'),
    ).toBeNull();
    expect(journeyRoute(venue, 'from', 'from', 'accessible')?.durationSeconds).toBe(0);
  });
});
