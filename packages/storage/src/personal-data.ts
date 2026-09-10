import {
  encodePersonalData,
  PERSONAL_DATA_SCHEMA_VERSION,
  type PersonalDataEvent,
  type PersonalDataFile,
} from '@indiafoss/model/contracts';
import type { EventBundle } from '@indiafoss/model';
import type { ActivityPreference, ComparisonRecord, ItineraryRecord, NoteRecord } from './index.js';

/** Only these personal records enter the exporter; no generic database/settings dump. */
export interface PersonalDataSnapshot {
  bundles: EventBundle[];
  preferences: ActivityPreference[];
  comparisons: ComparisonRecord[];
  notes: NoteRecord[];
  itineraries: ItineraryRecord[];
  settings: { key: string; value: string }[];
}

export const SOCIAL_FIELDS = [
  'github',
  'gitlab',
  'linkedin',
  'mastodon',
  'bluesky',
  'x',
  'instagram',
  'youtube',
  'medium',
  'devto',
  'telegram',
  'whatsapp',
  'signal',
  'prav',
  'xmpp',
  'deltachat',
];
export const PROFILE_FIELDS = [
  'fullName',
  'organization',
  'email',
  'phone',
  'website',
  'matrixId',
  'neutrinoServerName',
  'ticketRef',
  'fossUnitedProfileUrl',
  'avatarUrl',
];
export const SHARE_FIELDS = [
  'name',
  'organization',
  'email',
  'phone',
  'website',
  'matrixId',
  'neutrinoServerName',
  'ticketRef',
  'fossUnitedProfileUrl',
  'photo',
];

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid personal record');
  return value as Record<string, unknown>;
}

function fields(
  value: unknown,
  names: string[],
  type: 'string' | 'boolean' | 'number',
): Record<string, unknown> {
  const source = object(value);
  return Object.fromEntries(
    names
      .filter((name) => source[name] !== undefined)
      .map((name) => {
        const field = source[name];
        if (typeof field !== type || (typeof field === 'number' && !Number.isFinite(field))) {
          throw new Error('Invalid personal record');
        }
        return [name, field];
      }),
  );
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('Invalid personal record');
  }
  return value;
}

function dictionary(value: unknown, project: (value: unknown) => unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, item]) => [key, project(item)]),
  );
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid personal record');
  return value;
}

/** Read-only projection. Unscoped legacy records are retained, never assigned by guessing. */
export function personalDataFromSnapshot(
  snapshot: PersonalDataSnapshot,
  exportedAt: string,
): PersonalDataFile {
  const events = new Map<string, PersonalDataEvent>();
  const bundles = new Map(snapshot.bundles.map((bundle) => [bundle.id, bundle]));
  const owners = new Map<string, Set<string>>();
  for (const bundle of snapshot.bundles) {
    for (const activity of bundle.activities) {
      const eventIds = owners.get(activity.id) ?? new Set<string>();
      eventIds.add(bundle.id);
      owners.set(activity.id, eventIds);
    }
  }
  function event(eventId: string): PersonalDataEvent {
    let result = events.get(eventId);
    if (!result) {
      result = { eventId, activities: [], sections: {} };
      events.set(eventId, result);
    }
    return result;
  }
  function reference(eventId: string, activityId: string): void {
    const target = event(eventId);
    if (target.activities.some((activity) => activity.activityId === activityId)) return;
    const proposalId = bundles
      .get(eventId)
      ?.activities.find((activity) => activity.id === activityId)?.proposalId;
    target.activities.push({ eventId, activityId, ...(proposalId ? { proposalId } : {}) });
  }
  function owner(ids: string[]): string | undefined {
    const candidates = ids.map((id) => owners.get(id));
    if (candidates.some((candidate) => candidate?.size !== 1)) return undefined;
    const unique = new Set(candidates.map((candidate) => [...candidate!][0]!));
    return unique.size === 1 ? [...unique][0] : undefined;
  }
  const unassigned: Record<string, unknown[]> = {};
  function append(section: string, record: unknown, ids: string[]): void {
    const eventId = owner(ids);
    const sections = eventId ? event(eventId).sections : unassigned;
    const records = (sections[section] ??= []) as unknown[];
    records.push(record);
    if (eventId) for (const id of ids) reference(eventId, id);
  }
  for (const pref of snapshot.preferences) {
    append(
      'preferences',
      {
        ...fields(pref, ['activityId', 'disposition', 'triage', 'yieldedTo'], 'string'),
        ...fields(pref, ['rating', 'comparisons'], 'number'),
        ...fields(pref, ['bookmarked'], 'boolean'),
      },
      [pref.activityId],
    );
  }
  for (const note of snapshot.notes) {
    append('notes', fields(note, ['activityId', 'body', 'updatedAt'], 'string'), [note.activityId]);
  }
  for (const comparison of snapshot.comparisons) {
    append(
      'comparisons',
      {
        ...fields(comparison, ['id', 'activityA', 'activityB', 'createdAt'], 'string'),
        ...fields(comparison, ['scoreA'], 'number'),
        ...fields(comparison, ['clash'], 'boolean'),
      },
      [comparison.activityA, comparison.activityB],
    );
  }
  for (const itinerary of snapshot.itineraries) {
    const ids = strings(itinerary.activityIds);
    event(itinerary.eventId).sections.itinerary = {
      ...fields(itinerary, ['generatedAt'], 'string'),
      activityIds: ids,
    };
    for (const id of ids) reference(itinerary.eventId, id);
  }

  const contact: Record<string, unknown> = {};
  for (const { key, value } of snapshot.settings) {
    if (key.startsWith('booth-visit-')) {
      const boothId = key.slice('booth-visit-'.length);
      const minutes = value === '' ? null : Number(value);
      if (
        !boothId ||
        (minutes !== null && (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440))
      ) {
        throw new Error('Invalid booth visit duration');
      }
      const eventIds = new Set(
        snapshot.bundles
          .filter((bundle) => bundle.booths.some((booth) => booth.id === boothId))
          .map((bundle) => bundle.id),
      );
      if (eventIds.size === 1) {
        const target = event([...eventIds][0]!);
        target.sections.boothVisits = {
          ...object(target.sections.boothVisits ?? {}),
          [boothId]: minutes,
        };
      } else {
        (unassigned.boothVisits ??= []).push({ boothId, minutes });
      }
      continue;
    }
    if (key === 'attendee-profile' || key === 'attendee-share-selection') {
      const profile = key === 'attendee-profile';
      const data = object(JSON.parse(value));
      contact[profile ? 'profile' : 'selection'] = {
        ...fields(data, profile ? PROFILE_FIELDS : SHARE_FIELDS, profile ? 'string' : 'boolean'),
        socials: fields(data.socials ?? {}, SOCIAL_FIELDS, profile ? 'string' : 'boolean'),
      };
      continue;
    }
    // Dates delimit plan keys; event IDs themselves can contain hyphens.
    const plan = /^(plan-edits|resolved-plan)-(.+)-(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (plan) {
      const kind = plan[1]!;
      const eventId = plan[2]!;
      const day = plan[3]!;
      const data: unknown = JSON.parse(value);
      const target = event(eventId);
      if (kind === 'resolved-plan') {
        const activityIds = strings(data);
        ((target.sections.resolvedPlans ??= []) as unknown[]).push({ day, activityIds });
        for (const id of activityIds) reference(eventId, id);
      } else {
        const edits = object(data);
        if (!Array.isArray(edits.customBlocks)) throw new Error('Invalid personal record');
        const customBlocks = edits.customBlocks.map((block) => ({
          ...fields(block, ['id', 'label', 'start', 'end', 'locationId'], 'string'),
          ...fields(block, ['flexible'], 'boolean'),
        }));
        const locked = strings(edits.locked);
        const removed = strings(edits.removed);
        const replacements = dictionary(edits.replacements, string);
        ((target.sections.plans ??= []) as unknown[]).push({
          day,
          locked,
          removed,
          replacements,
          customBlocks,
        });
        const customIds = new Set(customBlocks.map((block) => block.id));
        const ids = [
          ...locked,
          ...removed,
          ...Object.keys(replacements),
          ...(Object.values(replacements) as string[]),
        ];
        for (const id of ids) if (!customIds.has(id)) reference(eventId, id);
      }
      continue;
    }
    if (key.startsWith('room-prefs-decided-')) {
      if (value !== 'true' && value !== 'false') throw new Error('Invalid personal record');
      event(key.slice('room-prefs-decided-'.length)).sections.roomsDecided = value === 'true';
      continue;
    }
    const rooms = /^room-prefs-(.+)$/.exec(key);
    if (rooms && !key.startsWith('room-prefs-decided-')) {
      const eventId = rooms[1]!;
      const data = object(JSON.parse(value));
      const prefs = dictionary(data.prefs, string);
      const skipped = dictionary(data.skipped, strings);
      event(eventId).sections.rooms = { prefs, skipped };
      for (const ids of Object.values(skipped))
        for (const id of ids as string[]) reference(eventId, id);
    }
  }
  const file: PersonalDataFile = {
    format: 'indiafoss-personal-data',
    schemaVersion: PERSONAL_DATA_SCHEMA_VERSION,
    exportedAt,
    events: [...events.values()],
    ...(Object.keys(contact).length ? { contact } : {}),
    ...(Object.keys(unassigned).length ? { unassigned } : {}),
  };
  // Fail the entire export for corrupt/oversized data instead of delivering a partial file.
  encodePersonalData(file);
  return file;
}
