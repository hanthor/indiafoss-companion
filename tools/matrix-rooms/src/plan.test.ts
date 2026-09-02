import { describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import { EVENT_BUNDLE_SCHEMA_VERSION } from '@indiafoss/model';
import { aliasServer, planRooms } from './plan.js';

const bundle: EventBundle = {
  schemaVersion: EVENT_BUNDLE_SCHEMA_VERSION,
  id: 'indiafoss-2025',
  name: 'IndiaFOSS 2025',
  timezone: 'Asia/Kolkata',
  start: '2025-09-20T09:00:00+05:30',
  end: '2025-09-21T18:00:00+05:30',
  activities: [
    {
      id: 'act-1',
      title: 'Keynote',
      type: 'talk',
      flexible: false,
      speakerIds: [],
      tags: [],
      source: 'test',
      locationId: 'audi-1',
    },
  ],
  people: [],
  locations: [
    { id: 'audi-1', name: 'Audi 1', kind: 'room', routingNodeIds: [] },
    { id: 'audi-2', name: 'Audi 2', kind: 'room', routingNodeIds: [] },
  ],
  booths: [{ id: 'b-1', name: 'FOSS United', category: 'community', description: '' }],
  tracks: [],
  sourceMetadata: { source: 'test', normalizerVersion: '1' },
  messaging: {
    homeserver: 'https://matrix.reilly.asia',
    aliasServer: 'reilly.asia',
    space: '#indiafoss:reilly.asia',
    rooms: [
      { alias: '#indiafoss-2025:reilly.asia', name: 'Announcements', recommended: true },
      { alias: '#indiafoss-2025-room-audi-1:reilly.asia', name: 'Audi 1', locationId: 'audi-1' },
    ],
  },
} as unknown as EventBundle;

describe('planRooms', () => {
  it('lists the space, the listed rooms and one room per location, without duplicates', () => {
    const plan = planRooms(bundle);
    expect(plan.map((r) => [r.kind, r.alias])).toEqual([
      ['space', '#indiafoss:reilly.asia'],
      ['listed', '#indiafoss-2025:reilly.asia'],
      ['listed', '#indiafoss-2025-room-audi-1:reilly.asia'],
      ['location', '#indiafoss-2025-room-audi-2:reilly.asia'],
    ]);
    expect(plan[1]!.suggested).toBe(true);
  });

  it('adds booths and sessions only when asked', () => {
    const plan = planRooms(bundle, { booths: true, sessions: true, locations: false });
    expect(plan.map((r) => r.alias)).toEqual([
      '#indiafoss:reilly.asia',
      '#indiafoss-2025:reilly.asia',
      '#indiafoss-2025-room-audi-1:reilly.asia',
      '#indiafoss-2025-booth-b-1:reilly.asia',
      '#indiafoss-2025-session-act-1:reilly.asia',
    ]);
  });

  it('returns nothing for a bundle without a messaging block', () => {
    expect(planRooms({ ...bundle, messaging: undefined })).toEqual([]);
  });

  it('derives the alias server from the homeserver when not given', () => {
    expect(aliasServer({ homeserver: 'https://matrix.reilly.asia', rooms: [] })).toBe(
      'matrix.reilly.asia',
    );
    expect(aliasServer(bundle.messaging!)).toBe('reilly.asia');
  });
});
