import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import { EVENT_BUNDLE_SCHEMA_VERSION } from '@indiafoss/model';
import { CompanionDatabase, CompanionStorage, defaultPreference, INITIAL_RATING } from './index.js';

let storage: CompanionStorage;
let db: CompanionDatabase;

beforeEach(async () => {
  db = new CompanionDatabase('test-companion');
  storage = new CompanionStorage(db);
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

function bundle(id = 'e1'): EventBundle {
  return {
    schemaVersion: EVENT_BUNDLE_SCHEMA_VERSION,
    id,
    name: 'Event ' + id,
    timezone: 'Asia/Kolkata',
    start: '2026-09-19T09:00:00+05:30',
    end: '2026-09-20T18:00:00+05:30',
    activities: [],
    people: [],
    locations: [],
    booths: [],
    tracks: [],
    sourceMetadata: { source: 'test', normalizerVersion: '1' },
  };
}

describe('CompanionStorage', () => {
  it('round-trips an event bundle', async () => {
    await storage.saveEventBundle(bundle());
    expect(await storage.loadEventBundle('e1')).toEqual(bundle());
    expect(await storage.listEvents()).toEqual(['e1']);
  });

  it('overwrites and deletes events', async () => {
    await storage.saveEventBundle(bundle());
    await storage.saveEventBundle({ ...bundle(), name: 'Renamed' });
    expect((await storage.loadEventBundle('e1'))?.name).toBe('Renamed');
    await storage.deleteEventBundle('e1');
    expect(await storage.loadEventBundle('e1')).toBeUndefined();
  });

  it('defaults preferences to rating 1200, normal disposition', () => {
    const p = defaultPreference('act-1');
    expect(p.rating).toBe(INITIAL_RATING);
    expect(p.comparisons).toBe(0);
    expect(p.disposition).toBe('normal');
    expect(p.bookmarked).toBe(false);
  });

  it('persists bookmarks and dispositions', async () => {
    const bookmarked = await storage.setBookmark('act-1', true);
    expect(bookmarked.bookmarked).toBe(true);
    const must = await storage.setDisposition('act-1', 'must-attend');
    expect(must.disposition).toBe('must-attend');
    const loaded = await storage.getPreference('act-1');
    expect(loaded).toMatchObject({
      activityId: 'act-1',
      bookmarked: true,
      disposition: 'must-attend',
    });
  });

  it('preserves unrelated preference fields when toggling', async () => {
    await storage.setPreference({ ...defaultPreference('act-1'), rating: 1330 });
    const updated = await storage.setBookmark('act-1', true);
    expect(updated.rating).toBe(1330);
  });

  it('stores comparisons, itineraries, notes and settings', async () => {
    await storage.saveComparison({
      id: 'c1',
      activityA: 'a',
      activityB: 'b',
      scoreA: 1,
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(await storage.listComparisons()).toHaveLength(1);

    await storage.saveItinerary({
      eventId: 'e1',
      generatedAt: '2026-01-01T00:00:00Z',
      activityIds: ['a', 'b'],
    });
    expect((await storage.loadItinerary('e1'))?.activityIds).toEqual(['a', 'b']);

    await storage.saveNote('act-1', 'check slides');
    expect(await storage.getNote('act-1')).toBe('check slides');

    await storage.setSetting('buffer-minutes', '5');
    expect(await storage.getSetting('buffer-minutes')).toBe('5');
  });

  it('opens an existing database without destroying data (migration path)', async () => {
    await storage.saveEventBundle(bundle());
    const reopenedDb = new CompanionDatabase('test-companion');
    await reopenedDb.open();
    const reopened = new CompanionStorage(reopenedDb);
    expect(await reopened.loadEventBundle('e1')).toBeDefined();
  });
});
