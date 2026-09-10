import 'fake-indexeddb/auto';
import fixture from '../../test-fixtures/fixtures/personal-data/valid/pwa-export.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import {
  CompanionDatabase,
  CompanionStorage,
  defaultPreference,
  PersonalDataImportStaleError,
  type ImportChange,
} from './index.js';

type Activity = { id: string; proposalId?: string };
let db: CompanionDatabase;
let storage: CompanionStorage;

const bundle = (
  activities: Activity[] = [
    { id: 'talk-a', proposalId: 'cfp-0' },
    { id: 'talk-b', proposalId: 'cfp-1' },
  ],
  id = 'indiafoss-2026',
): EventBundle => ({
  schemaVersion: 1,
  id,
  name: 'IndiaFOSS',
  timezone: 'Asia/Kolkata',
  start: '2026-09-19T09:00:00+05:30',
  end: '2026-09-20T18:00:00+05:30',
  activities: activities.map((activity) => ({
    ...activity,
    title: `Title of ${activity.id}`,
    type: 'talk',
    flexible: false,
    speakerIds: [],
    tags: [],
    source: 'test',
  })),
  people: [],
  locations: [],
  booths: [{ id: 'booth-1', name: 'Booth One', category: 'project', tags: [] }],
  tracks: [
    { id: 'devroom', name: 'Devroom' },
    { id: 'other', name: 'Other' },
  ],
  sourceMetadata: { source: 'test', normalizerVersion: '1' },
});

type File = typeof fixture & { unassigned?: Record<string, unknown>; [key: string]: unknown };
function file(): File {
  return structuredClone(fixture) as File;
}
function raw(value: unknown): string {
  return JSON.stringify(value);
}
async function preview(value: unknown) {
  return storage.previewPersonalDataImport(raw(value));
}
async function apply(changes: ImportChange[]) {
  return storage.applyPersonalDataImport(changes);
}
async function allSettings(): Promise<Record<string, string>> {
  return Object.fromEntries((await db.settings.toArray()).map((row) => [row.key, row.value]));
}

beforeEach(async () => {
  db = new CompanionDatabase('personal-import-test');
  storage = new CompanionStorage(db);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe('personal data import preview', () => {
  it('follows a schedule move through CFP identity and rewrites every reference to the new occurrence', async () => {
    await storage.saveEventBundle(
      bundle([
        { id: 'talk-a-moved', proposalId: 'cfp-0' },
        { id: 'talk-b', proposalId: 'cfp-1' },
      ]),
    );
    const result = await preview(file());
    expect(result.skipped).toEqual([]);
    expect(result.unsupported).toEqual([]);
    expect(result.unchanged).toBe(0);
    expect(result.changes.every((change) => change.status === 'add')).toBe(true);
    const byId = Object.fromEntries(result.changes.map((change) => [change.id, change]));
    expect(byId['preferences:talk-a-moved']).toMatchObject({
      section: 'preferences',
      eventId: 'indiafoss-2026',
      label: 'Title of talk-a-moved',
      incomingSummary: 'must-attend, bookmarked, quick pass yes, rating 1200',
      write: {
        store: 'preferences',
        key: 'talk-a-moved',
        value: { ...fixture.events[0]!.sections.preferences[0], activityId: 'talk-a-moved' },
      },
    });
    expect(byId['comparisons:comparison-1']!.write.value).toMatchObject({
      activityA: 'talk-a-moved',
      activityB: 'talk-b',
      scoreA: 1,
    });
    expect(byId['itineraries:indiafoss-2026']!.write.value).toEqual({
      eventId: 'indiafoss-2026',
      generatedAt: fixture.exportedAt,
      activityIds: ['talk-a-moved'],
    });
    expect(
      JSON.parse(byId['settings:plan-edits-indiafoss-2026-2026-09-19']!.write.value as string),
    ).toEqual({
      locked: ['talk-a-moved', 'custom-lunch'],
      removed: ['talk-b'],
      replacements: { 'talk-b': 'talk-a-moved' },
      customBlocks: fixture.events[0]!.sections.plans[0]!.customBlocks,
    });
    expect(byId['settings:resolved-plan-indiafoss-2026-2026-09-19']!.write.value).toBe(
      '["talk-a-moved"]',
    );
    expect(JSON.parse(byId['settings:room-prefs-indiafoss-2026']!.write.value as string)).toEqual({
      prefs: { devroom: 'stay' },
      skipped: { other: ['talk-b'] },
    });
    expect(byId['settings:room-prefs-decided-indiafoss-2026']!.write.value).toBe('true');
    expect(byId['settings:attendee-share-selection']!.incomingSummary).toBe('shares name');

    await apply(result.changes);
    expect(await storage.getPreference('talk-a-moved')).toMatchObject({
      disposition: 'must-attend',
    });
    expect(await storage.getPreference('talk-a')).toBeUndefined();
    expect(await storage.getNote('talk-b')).toBe('ಕನ್ನಡ\nFollow up after the talk');
    // The restored plan is exactly what the plan editor reads back, on the new occurrence.
    expect(
      JSON.parse((await storage.getSetting('plan-edits-indiafoss-2026-2026-09-19'))!),
    ).toMatchObject({ locked: ['talk-a-moved', 'custom-lunch'] });
    // A second preview of the same file finds nothing left to import.
    const again = await preview(file());
    expect(again.changes).toEqual([]);
    expect(again.unchanged).toBe(result.changes.length);
    // The re-export carries the moved occurrence with its CFP identity.
    const exported = await storage.exportPersonalData(fixture.exportedAt);
    expect(exported.events[0]!.activities).toContainEqual({
      eventId: 'indiafoss-2026',
      activityId: 'talk-a-moved',
      proposalId: 'cfp-0',
    });
    expect(exported.contact).toEqual(fixture.contact);
  });

  it('reports a repeated CFP entry as ambiguous instead of guessing, and still imports the rest', async () => {
    await storage.saveEventBundle(
      bundle([
        { id: 'talk-a-morning', proposalId: 'cfp-0' },
        { id: 'talk-a-evening', proposalId: 'cfp-0' },
        { id: 'talk-b', proposalId: 'cfp-1' },
      ]),
    );
    const result = await preview(file());
    const ambiguous = result.skipped.filter((skip) => skip.reason === 'ambiguous');
    expect(ambiguous.map((skip) => `${skip.section}: ${skip.label}`)).toEqual([
      'preferences: talk-a',
      'comparisons: talk-a vs talk-b',
      'itinerary: saved itinerary',
      'plans: plan for 2026-09-19',
      'resolvedPlans: resolved plan for 2026-09-19',
    ]);
    expect(ambiguous[0]!.detail).toBe('talk-a (repeated CFP entry)');
    expect(result.changes.map((change) => change.id)).toEqual([
      'notes:talk-b',
      'settings:room-prefs-indiafoss-2026',
      'settings:room-prefs-decided-indiafoss-2026',
      'settings:attendee-profile',
      'settings:attendee-share-selection',
    ]);
    await apply(result.changes);
    expect(await db.preferences.count()).toBe(0);
    expect(await storage.getNote('talk-b')).toBeDefined();
  });

  it('keeps an exact occurrence match when the CFP entry is repeated', async () => {
    await storage.saveEventBundle(
      bundle([
        { id: 'talk-a', proposalId: 'cfp-0' },
        { id: 'talk-a-repeat', proposalId: 'cfp-0' },
        { id: 'talk-b', proposalId: 'cfp-1' },
      ]),
    );
    const result = await preview(file());
    expect(result.skipped).toEqual([]);
    expect(result.changes.map((change) => change.id)).toContain('preferences:talk-a');
  });

  it('shows records for a programme that is not on this device, and unassigned records, without applying them', async () => {
    await storage.saveEventBundle(bundle(undefined, 'indiafoss-2025'));
    const input = {
      ...file(),
      unassigned: { notes: [{ activityId: 'gone', body: 'x', updatedAt: fixture.exportedAt }] },
    };
    const result = await preview(input);
    expect(result.changes.map((change) => change.section)).toEqual([
      'contact.profile',
      'contact.selection',
    ]);
    expect(result.skipped.filter((skip) => skip.reason === 'unknown-event')).toHaveLength(8);
    expect(result.skipped.at(-1)).toMatchObject({
      section: 'notes',
      label: 'gone',
      reason: 'unassigned',
    });
  });

  it('rejects a corrupt section before anything is compared or written', async () => {
    await storage.saveEventBundle(bundle());
    const input = file();
    (input.events[0]!.sections.preferences[0] as Record<string, unknown>).disposition = 'favourite';
    await expect(preview(input)).rejects.toThrow('events[0].sections.preferences[0].disposition');
    const nan = file();
    (nan.events[0]!.sections.preferences[0] as Record<string, unknown>).rating = 'NaN';
    await expect(preview(nan)).rejects.toThrow('.rating');
    await expect(preview('{"format":"indiafoss-personal-data"}')).rejects.toThrow();
    expect(await db.preferences.count()).toBe(0);
    expect(await db.settings.count()).toBe(0);
  });

  it('defaults to preserving existing choices, including explicit negative ones', async () => {
    await storage.saveEventBundle(bundle());
    await storage.setPreference({ ...defaultPreference('talk-a'), disposition: 'not-interested' });
    await storage.setSetting(
      'attendee-share-selection',
      JSON.stringify({ name: true, email: false, socials: {} }),
    );
    const result = await preview(file());
    const conflict = result.changes.find((change) => change.id === 'preferences:talk-a')!;
    expect(conflict).toMatchObject({
      status: 'conflict',
      currentSummary: 'not-interested, rating 1200',
      incomingSummary: 'must-attend, bookmarked, quick pass yes, rating 1200',
    });
    expect(
      result.changes.find((change) => change.id === 'settings:attendee-share-selection'),
    ).toMatchObject({
      status: 'conflict',
      currentSummary: 'shares name',
    });
    await apply(result.changes.filter((change) => change.status === 'add'));
    expect((await storage.getPreference('talk-a'))!.disposition).toBe('not-interested');
    expect(JSON.parse((await storage.getSetting('attendee-share-selection'))!)).toEqual({
      name: true,
      email: false,
      socials: {},
    });
    expect(await storage.getNote('talk-b')).toBeDefined();
  });

  it('carries booth visits by stable ID, keeps cancellations explicit and shows removed booths', async () => {
    await storage.saveEventBundle(bundle());
    await storage.setSetting('booth-visit-booth-1', '');
    const input = file();
    (input.events[0]!.sections as Record<string, unknown>).boothVisits = {
      'booth-1': 45,
      gone: null,
    };
    input.unassigned = { boothVisits: [{ boothId: 'legacy', minutes: 15 }] };
    const result = await preview(input);
    expect(
      result.changes.find((change) => change.id === 'settings:booth-visit-booth-1'),
    ).toMatchObject({
      status: 'conflict',
      label: 'Booth One',
      currentSummary: 'visit cancelled',
      incomingSummary: '45 min visit',
    });
    expect(result.skipped).toEqual([
      {
        section: 'boothVisits',
        eventId: 'indiafoss-2026',
        label: 'gone',
        reason: 'missing',
        detail: 'gone (booth not in this programme)',
      },
      {
        section: 'boothVisits',
        label: 'legacy',
        reason: 'unassigned',
        detail: 'no event recorded; keep the file to retry after a programme update',
      },
    ]);
    await apply(result.changes);
    expect(await storage.getSetting('booth-visit-booth-1')).toBe('45');
    expect(await storage.getSetting('booth-visit-gone')).toBeUndefined();
    const unchanged = await preview(input);
    expect(unchanged.changes).toEqual([]);
  });

  it('reports private and unknown sections as unsupported and never writes them', async () => {
    await storage.saveEventBundle(bundle());
    await storage.setSetting('matrix-session', 'LOCAL_SECRET');
    const input = file();
    (input.events[0]!.sections as Record<string, unknown>).settings = {
      'matrix-session': 'REMOTE',
    };
    (input.contact as Record<string, unknown>).matrixAccessToken = 'TOKEN';
    (input.contact.profile as Record<string, unknown>).matrixAccessToken = 'TOKEN';
    input.deviceKeys = { handshake: 'PRIVATE_KEY' };
    const result = await preview(input);
    expect(result.unsupported).toEqual([
      'events[0].sections.settings',
      'contact.matrixAccessToken',
      'deviceKeys',
    ]);
    await apply(result.changes);
    const settings = await allSettings();
    expect(settings['matrix-session']).toBe('LOCAL_SECRET');
    expect(JSON.stringify(settings)).not.toContain('TOKEN');
    expect(JSON.stringify(settings)).not.toContain('PRIVATE_KEY');
    expect(JSON.parse(settings['attendee-profile']!)).toEqual(fixture.contact.profile);
    expect(await db['device-keys'].count()).toBe(0);
  });
});

describe('personal data import transaction', () => {
  it('rolls back every write when one fails', async () => {
    await storage.saveEventBundle(bundle());
    await storage.setSetting(
      'attendee-profile',
      JSON.stringify({ fullName: 'Before', socials: {} }),
    );
    const result = await preview(file());
    db.notes.hook('creating', () => {
      throw new Error('disk full');
    });
    await expect(apply(result.changes)).rejects.toThrow('disk full');
    expect(await db.preferences.count()).toBe(0);
    expect(await db.comparisons.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
    expect(await allSettings()).toEqual({
      'attendee-profile': JSON.stringify({ fullName: 'Before', socials: {} }),
    });
  });

  it('refuses a stale preview when local data changed after it, applying nothing', async () => {
    await storage.saveEventBundle(bundle());
    const result = await preview(file());
    await storage.saveNote('talk-b', 'Written after the preview');
    await expect(apply(result.changes)).rejects.toThrow(PersonalDataImportStaleError);
    await expect(apply(result.changes)).rejects.toThrow('Title of talk-b');
    expect(await storage.getNote('talk-b')).toBe('Written after the preview');
    expect(await db.preferences.count()).toBe(0);
    expect(await allSettings()).toEqual({});
    // A fresh preview sees the newer note as a conflict and the rest applies.
    const fresh = await preview(file());
    expect(fresh.changes.find((change) => change.id === 'notes:talk-b')!.status).toBe('conflict');
    await apply(fresh.changes.filter((change) => change.status === 'add'));
    expect(await storage.getNote('talk-b')).toBe('Written after the preview');
    expect(await storage.getPreference('talk-a')).toMatchObject({ bookmarked: true });
  });

  it('also treats a value deleted after the preview as stale', async () => {
    await storage.saveEventBundle(bundle());
    await storage.setPreference({ ...defaultPreference('talk-a'), bookmarked: true });
    const result = await preview(file());
    await db.preferences.delete('talk-a');
    await expect(apply(result.changes)).rejects.toThrow(PersonalDataImportStaleError);
    expect(await db.notes.count()).toBe(0);
  });
});
