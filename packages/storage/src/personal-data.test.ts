import 'fake-indexeddb/auto';
import fixture from '../../test-fixtures/fixtures/personal-data/valid/pwa-export.json';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { type EventBundle } from '@indiafoss/model';
import { decodePersonalData, encodePersonalData } from '@indiafoss/model/contracts';
import { CompanionDatabase, CompanionStorage, defaultPreference } from './index.js';

const exportedAt = '2026-09-09T01:00:00.000Z';
let db: CompanionDatabase;
let storage: CompanionStorage;
const bundle = (id = 'indiafoss-2026', activityIds = ['talk-a', 'talk-b']): EventBundle => ({
  schemaVersion: 1,
  id,
  name: 'IndiaFOSS',
  timezone: 'Asia/Kolkata',
  start: '2026-09-19T09:00:00+05:30',
  end: '2026-09-20T18:00:00+05:30',
  activities: activityIds.map((activityId, index) => ({
    id: activityId,
    title: activityId,
    type: 'talk',
    proposalId: `cfp-${index}`,
    flexible: false,
    speakerIds: [],
    tags: [],
    source: 'test',
  })),
  people: [],
  locations: [],
  booths: [],
  tracks: [],
  sourceMetadata: { source: 'test', normalizerVersion: '1' },
});

beforeEach(async () => {
  db = new CompanionDatabase('personal-export-test');
  storage = new CompanionStorage(db);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

it('exports the shared native-readable fixture from persisted records, without credentials or extra fields', async () => {
  await storage.saveEventBundle(bundle());
  await storage.setPreference({
    ...defaultPreference('talk-a'),
    disposition: 'must-attend',
    bookmarked: true,
    triage: 'yes',
  });
  await db.notes.put({
    activityId: 'talk-b',
    body: 'ಕನ್ನಡ\nFollow up after the talk',
    updatedAt: exportedAt,
  });
  await storage.saveComparison({
    id: 'comparison-1',
    activityA: 'talk-a',
    activityB: 'talk-b',
    scoreA: 1,
    createdAt: exportedAt,
  });
  await storage.saveItinerary({
    eventId: 'indiafoss-2026',
    generatedAt: exportedAt,
    activityIds: ['talk-a'],
  });
  await storage.setSetting(
    'plan-edits-indiafoss-2026-2026-09-19',
    JSON.stringify({
      locked: ['talk-a', 'custom-lunch'],
      removed: ['talk-b'],
      replacements: { 'talk-b': 'talk-a' },
      customBlocks: [
        {
          id: 'custom-lunch',
          label: 'Lunch with friends',
          start: '2026-09-19T12:00:00+05:30',
          end: '2026-09-19T12:30:00+05:30',
          flexible: true,
          accessToken: 'SECRET_BLOCK',
        },
      ],
      accessToken: 'SECRET_PLAN',
    }),
  );
  await storage.setSetting('resolved-plan-indiafoss-2026-2026-09-19', JSON.stringify(['talk-a']));
  await storage.setSetting(
    'room-prefs-indiafoss-2026',
    JSON.stringify({
      prefs: { devroom: 'stay' },
      skipped: { other: ['talk-b'] },
      token: 'SECRET_ROOMS',
    }),
  );
  await storage.setSetting('room-prefs-decided-indiafoss-2026', 'true');
  await storage.setSetting(
    'attendee-profile',
    JSON.stringify({
      fullName: 'Asha',
      email: 'asha@example.org',
      matrixId: '@asha:example.org',
      socials: { github: 'https://github.com/asha', secret: 'SECRET_SOCIAL' },
      accessToken: 'SECRET_PROFILE',
    }),
  );
  await storage.setSetting(
    'attendee-share-selection',
    JSON.stringify({
      name: true,
      email: false,
      socials: { github: true },
      accessToken: 'SECRET_SELECTION',
    }),
  );
  await storage.setSetting('matrix-session', 'SECRET_TOKEN');
  await storage.setSetting('device-private-key', 'SECRET_KEY_SETTING');
  // Deliberately store canaries in every excluded table, including extra record properties.
  for (const name of [
    'matrix-rooms',
    'matrix-events',
    'matrix-outbox',
    'device-keys',
    'contacts',
    'passport',
    'event-assets',
    'sync-state',
  ]) {
    const table = db.table(name);
    await table.put({
      [table.schema.primKey.keyPath as string]: 'excluded',
      value: 'SECRET_EXCLUDED',
    });
  }
  await db.preferences.update('talk-a', { accessToken: 'SECRET_PREFERENCE' } as never);
  const result = await storage.exportPersonalData(exportedAt);
  expect(result).toEqual(fixture);
  expect(encodePersonalData(result)).not.toContain('SECRET_');
  expect(decodePersonalData(encodePersonalData(result))).toEqual({ ok: true, data: result });
  expect(await storage.getSetting('matrix-session')).toBe('SECRET_TOKEN');
});

it('retains removed, ambiguous and cross-event legacy records without guessing their event', async () => {
  await storage.saveEventBundle(bundle('event-a', ['shared', 'only-a']));
  await storage.saveEventBundle(bundle('event-b', ['shared', 'only-b']));
  await storage.setPreference({
    ...defaultPreference('removed'),
    disposition: 'not-interested',
    triage: 'no',
  });
  await storage.setPreference(defaultPreference('shared'));
  await storage.saveNote('removed', 'Do not lose this note');
  await storage.saveComparison({
    id: 'cross-event',
    activityA: 'only-a',
    activityB: 'only-b',
    scoreA: 0.5,
    createdAt: exportedAt,
  });
  const file = await storage.exportPersonalData(exportedAt);
  expect(file.events).toEqual([]);
  expect(file.unassigned).toMatchObject({
    preferences: [
      expect.objectContaining({
        activityId: 'removed',
        disposition: 'not-interested',
        triage: 'no',
      }),
      expect.objectContaining({ activityId: 'shared' }),
    ],
    notes: [expect.objectContaining({ activityId: 'removed', body: 'Do not lose this note' })],
    comparisons: [expect.objectContaining({ id: 'cross-event' })],
  });
});

it('keeps event-scoped edits after their schedule is removed and references both replacement sides', async () => {
  await storage.setSetting(
    'plan-edits-old-event-2025-09-20',
    JSON.stringify({
      locked: [],
      removed: ['gone'],
      replacements: { original: 'replacement' },
      customBlocks: [],
    }),
  );
  const file = await storage.exportPersonalData(exportedAt);
  expect(file.events[0]?.eventId).toBe('old-event');
  expect(file.events[0]?.activities).toEqual(
    ['gone', 'original', 'replacement'].map((activityId) => ({ eventId: 'old-event', activityId })),
  );
});

it('rejects corrupt or oversized exports without changing storage, then permits retry', async () => {
  await storage.setPreference(defaultPreference('talk-a'));
  await storage.setSetting('attendee-profile', '{bad json');
  await expect(storage.exportPersonalData(exportedAt)).rejects.toThrow();
  expect(await storage.getPreference('talk-a')).toEqual(defaultPreference('talk-a'));
  await storage.setSetting('attendee-profile', JSON.stringify({ fullName: 'Asha', socials: {} }));
  await storage.saveNote('talk-a', 'ಕ'.repeat(2 * 1024 * 1024));
  await expect(storage.exportPersonalData(exportedAt)).rejects.toThrow('5 MiB');
  await storage.saveNote('talk-a', 'Repaired note');
  await expect(storage.exportPersonalData(exportedAt)).resolves.toMatchObject({
    contact: { profile: { fullName: 'Asha' } },
  });
});

it('exports booth plans and explicit cancellations with event scope, retaining ambiguous or removed booths', async () => {
  const a = bundle('event-a');
  const b = bundle('event-b');
  a.booths = ['planned', 'cancelled', 'shared'].map((id) => ({
    id,
    name: id,
    category: 'project',
    tags: [],
  }));
  b.booths = [{ id: 'shared', name: 'Shared ID', category: 'project', tags: [] }];
  await storage.saveEventBundle(a);
  await storage.saveEventBundle(b);
  await storage.setSetting('booth-visit-planned', '30');
  await storage.setSetting('booth-visit-cancelled', '');
  await storage.setSetting('booth-visit-shared', '15');
  await storage.setSetting('booth-visit-removed', '');
  const file = await storage.exportPersonalData(exportedAt);
  expect(file.events).toEqual([
    {
      eventId: 'event-a',
      activities: [],
      sections: { boothVisits: { planned: 30, cancelled: null } },
    },
  ]);
  expect(file.unassigned).toEqual({
    boothVisits: [
      { boothId: 'removed', minutes: null },
      { boothId: 'shared', minutes: 15 },
    ],
  });
});

it.each(['0', '-1', 'Infinity', 'NaN', '15.5', '1441'])(
  'rejects invalid persisted booth duration %s without changing it',
  async (value) => {
    await storage.setSetting('booth-visit-invalid', value);
    await expect(storage.exportPersonalData(exportedAt)).rejects.toThrow(
      'Invalid booth visit duration',
    );
    expect(await storage.getSetting('booth-visit-invalid')).toBe(value);
  },
);
