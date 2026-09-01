import { describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import { EVENT_BUNDLE_SCHEMA_VERSION } from '@indiafoss/model';
import { searchActivities, searchEvent, SEARCH_WEIGHTS } from './index.js';

function makeBundle(): EventBundle {
  return {
    schemaVersion: EVENT_BUNDLE_SCHEMA_VERSION,
    id: 't',
    name: 'Test',
    timezone: 'Asia/Kolkata',
    start: '2026-09-19T09:00:00+05:30',
    end: '2026-09-20T18:00:00+05:30',
    activities: [
      {
        id: 'a1',
        type: 'talk',
        title: 'Bootable Containers for Everyone',
        start: '2026-09-19T10:00:00+05:30',
        end: '2026-09-19T11:00:00+05:30',
        flexible: false,
        speakerIds: ['p1'],
        tags: ['bootc', 'containers'],
        locationId: 'audi-1',
        trackId: 'audi-1',
        source: 'test',
      },
      {
        id: 'a2',
        type: 'talk',
        title: 'Kernel Development Deep Dive',
        start: '2026-09-19T11:00:00+05:30',
        end: '2026-09-19T12:00:00+05:30',
        flexible: false,
        speakerIds: ['p2'],
        tags: ['kernel', 'linux'],
        locationId: 'audi-2',
        trackId: 'audi-2',
        source: 'test',
      },
      {
        id: 'a3',
        type: 'talk',
        title: 'Open Hardware BOF',
        start: '2026-09-19T11:00:00+05:30',
        end: '2026-09-19T12:30:00+05:30',
        flexible: false,
        speakerIds: ['p1'],
        tags: ['hardware'],
        locationId: 'devroom-2',
        trackId: 'devroom-2',
        source: 'test',
      },
    ],
    people: [
      { id: 'p1', name: 'Ada Lovelace', bio: 'Analytical engine pioneer', links: [] },
      { id: 'p2', name: 'Grace Hopper', bio: 'Compiler pioneer', links: [] },
    ],
    locations: [
      { id: 'audi-1', name: 'Audi 1', kind: 'room', routingNodeIds: [] },
      { id: 'audi-2', name: 'Audi 2', kind: 'room', routingNodeIds: [] },
      { id: 'devroom-2', name: 'Devroom 2', kind: 'room', routingNodeIds: [] },
    ],
    tracks: [
      { id: 'audi-1', name: 'Audi 1' },
      { id: 'audi-2', name: 'Audi 2' },
      { id: 'devroom-2', name: 'Devroom 2' },
    ],
    booths: [
      {
        id: 'b1',
        name: 'KDE Community',
        category: 'community',
        tags: ['kde', 'plasma'],
        locationId: 'devroom-2',
      },
    ],
    sourceMetadata: { source: 'test', normalizerVersion: '1' },
  };
}

describe('searchEvent', () => {
  it('ranks exact title matches first', () => {
    const hits = searchEvent(makeBundle(), 'Bootable Containers');
    expect(hits[0]?.kind).toBe('activity');
    expect(hits[0]?.id).toBe('a1');
    expect(hits[0]?.score).toBeGreaterThanOrEqual(SEARCH_WEIGHTS.title);
  });

  it('finds speakers by name', () => {
    const hits = searchEvent(makeBundle(), 'Ada');
    const person = hits.find((h) => h.kind === 'person');
    expect(person?.title).toBe('Ada Lovelace');
    // Ada speaks at two activities
    expect(person?.relatedIds?.sort()).toEqual(['a1', 'a3']);
  });

  it('finds tags and locations', () => {
    expect(searchEvent(makeBundle(), 'kernel')[0]?.id).toBe('a2');
    expect(searchEvent(makeBundle(), 'devroom')[0]?.id).toBe('a3');
  });

  it('finds booths', () => {
    const hits = searchEvent(makeBundle(), 'KDE');
    expect(hits[0]?.kind).toBe('booth');
    expect(hits[0]?.id).toBe('b1');
  });

  it('returns nothing for gibberish', () => {
    expect(searchEvent(makeBundle(), 'zzzzqqqq')).toEqual([]);
  });

  it('is deterministic', () => {
    const a = searchEvent(makeBundle(), 'containers');
    const b = searchEvent(makeBundle(), 'containers');
    expect(a).toEqual(b);
  });
});

describe('searchActivities', () => {
  it('only returns activities', () => {
    const hits = searchActivities(makeBundle(), 'Ada');
    expect(hits.every((h) => h.kind === 'activity')).toBe(true);
    // Ada's talks rank via speaker weight
    expect(hits[0]?.id).toBe('a1');
  });
});
