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

    await storage.deleteComparison('c1');
    expect(await storage.listComparisons()).toHaveLength(0);

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

describe('Matrix cache', () => {
  it('stores rooms newest-first and events per room in time order', async () => {
    await storage.putMatrixRooms([
      {
        roomId: '!a:x',
        name: 'A',
        isDirect: false,
        memberIds: [],
        memberNames: {},
        encrypted: false,
        membership: 'join',
        lastActivityTs: 10,
        unread: 0,
      },
      {
        roomId: '!b:x',
        name: 'B',
        isDirect: true,
        memberIds: ['@bob:x'],
        memberNames: { '@bob:x': 'Bob' },
        encrypted: false,
        membership: 'join',
        lastActivityTs: 20,
        unread: 2,
      },
    ]);
    expect((await storage.listMatrixRooms()).map((r) => r.roomId)).toEqual(['!b:x', '!a:x']);

    await storage.putMatrixEvents([
      {
        eventId: '$2',
        roomId: '!a:x',
        sender: '@me:x',
        ts: 2,
        type: 'm.room.message',
        body: 'two',
      },
      {
        eventId: '$1',
        roomId: '!a:x',
        sender: '@me:x',
        ts: 1,
        type: 'm.room.message',
        body: 'one',
      },
      { eventId: '$9', roomId: '!b:x', sender: '@me:x', ts: 9, type: 'm.room.message', body: 'b' },
    ]);
    expect((await storage.listMatrixEvents('!a:x')).map((e) => e.body)).toEqual(['one', 'two']);
    expect((await storage.listMatrixEvents('!a:x', 1)).map((e) => e.body)).toEqual(['two']);

    await storage.deleteMatrixRoom('!a:x');
    expect(await storage.listMatrixEvents('!a:x')).toEqual([]);
    expect((await storage.listMatrixRooms()).map((r) => r.roomId)).toEqual(['!b:x']);
  });

  it('queues outbox items and clears everything on sign-out', async () => {
    await storage.putMatrixOutbox({
      txnId: 't1',
      roomId: '!b:x',
      body: 'hello',
      createdAt: '2026-09-19T10:00:00Z',
      attempts: 0,
    });
    await storage.setSetting('matrix-session', '{"x":1}');
    await storage.setSetting('current-location', 'hall-1');
    expect(await storage.listMatrixOutbox()).toHaveLength(1);

    await storage.deleteMatrixOutbox('t1');
    expect(await storage.listMatrixOutbox()).toHaveLength(0);

    await storage.clearMatrix();
    expect(await storage.getSetting('matrix-session')).toBeUndefined();
    expect(await storage.getSetting('current-location')).toBe('hall-1');
  });
});

describe('contacts', () => {
  it('stores scanned contacts newest-first and deletes them', async () => {
    const base = { socials: {}, verified: false, vcard: '' };
    await storage.saveContact({
      ...base,
      id: 'c1',
      fullName: 'One',
      savedAt: '2026-09-01T10:00:00Z',
    });
    await storage.saveContact({
      ...base,
      id: 'c2',
      fullName: 'Two',
      savedAt: '2026-09-01T11:00:00Z',
    });
    expect((await storage.listContacts()).map((c) => c.fullName)).toEqual(['Two', 'One']);
    await storage.deleteContact('c2');
    expect((await storage.listContacts()).map((c) => c.id)).toEqual(['c1']);
  });
});
