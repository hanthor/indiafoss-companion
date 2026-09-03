import { describe, expect, it } from 'vitest';
import type { ContactRecord } from '@indiafoss/storage';
import type { EventBundle } from '@indiafoss/model';
import { EVENT_BUNDLE_SCHEMA_VERSION } from '@indiafoss/model';
import { buildRecap, recapCardLines } from './recap.js';

const contact = (
  over: Partial<ContactRecord> & { id: string; savedAt: string },
): ContactRecord => ({
  vcard: '',
  fullName: over.id,
  socials: {},
  verified: false,
  ...over,
});

const bundle: EventBundle = {
  schemaVersion: EVENT_BUNDLE_SCHEMA_VERSION,
  id: 'e',
  name: 'IndiaFOSS 2025',
  timezone: 'Asia/Kolkata',
  start: '2025-09-20T09:00:00+05:30',
  end: '2025-09-21T18:00:00+05:30',
  activities: [
    {
      id: 'talk-1',
      title: 'First Step into Open Source',
      type: 'talk',
      start: '2025-09-20T10:15:00+05:30',
      end: '2025-09-20T10:30:00+05:30',
      flexible: false,
      speakerIds: [],
      tags: [],
      source: 'test',
    },
  ],
  people: [],
  locations: [{ id: 'booths', name: 'Booth Area', kind: 'booth', routingNodeIds: [] }],
  booths: [],
  tracks: [],
  sourceMetadata: { source: 'test', normalizerVersion: '1' },
};

describe('who I met (#31)', () => {
  it('groups by day and by where the scan happened, busiest place first', () => {
    const recap = buildRecap(
      [
        contact({ id: 'asha', savedAt: '2025-09-20T10:20:00Z', metActivityId: 'talk-1' }),
        contact({ id: 'bala', savedAt: '2025-09-20T10:22:00Z', metActivityId: 'talk-1' }),
        contact({ id: 'chandra', savedAt: '2025-09-20T13:00:00Z', metLocationId: 'booths' }),
        contact({ id: 'divya', savedAt: '2025-09-21T11:00:00Z' }),
      ],
      bundle,
    );

    expect(recap.days.map((d) => d.day)).toEqual(['2025-09-20', '2025-09-21']);
    expect(recap.days[0]!.count).toBe(3);
    // The session with two people comes before the booth with one.
    expect(recap.days[0]!.places.map((p) => p.label)).toEqual([
      'First Step into Open Source',
      'Booth Area',
    ]);
    expect(recap.days[0]!.places[0]!.when).toBe('10:15–10:30');
    // Someone scanned with no session and no room still appears.
    expect(recap.days[1]!.places[0]!.label).toBe('Around the venue');
    expect(recap.total).toBe(4);
    expect(recap.busiest).toEqual({ label: 'First Step into Open Source', count: 2 });
  });

  it('counts signed cards and people met more than once', () => {
    const recap = buildRecap(
      [
        contact({ id: 'a', savedAt: '2025-09-20T10:00:00Z', signature: 'valid', metCount: 2 }),
        contact({ id: 'b', savedAt: '2025-09-20T10:01:00Z', signature: 'unsigned' }),
        contact({ id: 'c', savedAt: '2025-09-20T10:02:00Z', signature: 'invalid', metCount: 1 }),
      ],
      bundle,
    );
    expect(recap.signed).toBe(1);
    expect(recap.metAgain).toBe(1);
  });

  it('works with no event bundle and with nobody met', () => {
    const offline = buildRecap(
      [contact({ id: 'a', savedAt: '2025-09-20T10:00:00Z', metActivityId: 'talk-1' })],
      null,
    );
    expect(offline.days[0]!.places[0]!.label).toBe('Around the venue');

    const empty = buildRecap([], bundle);
    expect(empty).toMatchObject({ days: [], total: 0, signed: 0, metAgain: 0 });
    expect(recapCardLines(empty, 'IndiaFOSS 2025').headline).toBe('No one yet');
  });

  it('writes the shareable card, and leaves the names out when asked', () => {
    const contacts = Array.from({ length: 14 }, (_, i) =>
      contact({
        id: `p${i}`,
        fullName: `Person ${i}`,
        savedAt: `2025-09-20T10:${String(i).padStart(2, '0')}:00Z`,
        metActivityId: 'talk-1',
        signature: 'valid',
      }),
    );
    const recap = buildRecap(contacts, bundle);

    const withNames = recapCardLines(recap, 'IndiaFOSS 2025');
    expect(withNames.headline).toBe('I met 14 people');
    expect(withNames.stats).toContain('over one day');
    expect(withNames.stats).toContain('most at First Step into Open Source');
    expect(withNames.stats).toContain('14 signed');
    // Twelve names and a tail, so the card cannot grow without bound.
    expect(withNames.names).toHaveLength(13);
    expect(withNames.names.at(-1)).toBe('and 2 more');

    // Sharing the count without the names is one switch.
    expect(recapCardLines(recap, 'IndiaFOSS 2025', { withNames: false }).names).toEqual([]);
  });
});
