import {
  resolvePortableActivity,
  type ActivityResolution,
  type EventBundle,
} from '@indiafoss/model';
import type { PersonalDataEvent } from '@indiafoss/model/contracts';
import {
  PROFILE_FIELDS,
  SHARE_FIELDS,
  SOCIAL_FIELDS,
  type PersonalDataSnapshot,
} from './personal-data.js';
import type { ValidatedPersonalData } from './personal-data-validation.js';

/**
 * Preview and apply plan for a validated personal-data file.
 *
 * The planner is pure: it only compares projected records with a storage
 * snapshot. Nothing here writes; `CompanionStorage.applyPersonalDataImport`
 * re-checks every `current` value inside its write transaction so a stale
 * preview can never overwrite an edit made after the preview was shown.
 */

export type ImportStore = 'preferences' | 'comparisons' | 'notes' | 'itineraries' | 'settings';

export interface ImportWrite {
  store: ImportStore;
  /** Primary key in `store`: activity ID, comparison ID, event ID or settings key. */
  key: string;
  /** The full record for table stores; the string value for `settings`. */
  value: unknown;
}

export interface ImportChange {
  /** `store:key`; stable across previews of the same file. */
  id: string;
  section: string;
  eventId?: string;
  label: string;
  /** `conflict` means this device already holds a different value; default is to keep it. */
  status: 'add' | 'conflict';
  /** Exact stored value at preview time (settings string or canonical record JSON). */
  current?: string;
  currentSummary?: string;
  incomingSummary: string;
  write: ImportWrite;
}

export type ImportSkipReason =
  'unknown-event' | 'missing' | 'ambiguous' | 'wrong-event' | 'unassigned' | 'duplicate';

export interface ImportSkip {
  section: string;
  eventId?: string;
  label: string;
  reason: ImportSkipReason;
  detail: string;
}

export interface PersonalDataImportPreview {
  exportedAt: string;
  changes: ImportChange[];
  /** Records shown to the attendee but never applied by this importer. */
  skipped: ImportSkip[];
  /** Records already stored with exactly the same value. */
  unchanged: number;
  /** Sections the importer does not understand; reported, never written. */
  unsupported: string[];
}

/** Thrown inside the write transaction when a previewed value changed underneath it. */
export class PersonalDataImportStaleError extends Error {
  constructor(readonly labels: string[]) {
    super(`Local data changed after the preview: ${labels.join(', ')}`);
    this.name = 'PersonalDataImportStaleError';
  }
}

/** Deterministic JSON with sorted keys so key order never counts as a difference. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** The stored value a change is compared against, exactly as `applyPersonalDataImport` re-reads it. */
export function storedValue(write: ImportWrite, stored: unknown): string | undefined {
  if (stored === undefined) return undefined;
  if (write.store === 'settings') return (stored as { value: string }).value;
  return canonical(stored);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pick(source: Record<string, unknown>, names: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(
    names.filter((name) => source[name] !== undefined).map((n) => [n, source[n]]),
  );
}

function parseSetting(value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return Symbol.for('unreadable');
  }
}

type Resolver = (
  id: string,
) => { id: string; title: string } | { status: ActivityResolution['status'] };

interface Plan {
  changes: Map<string, ImportChange>;
  skipped: ImportSkip[];
  unchanged: number;
}

function describePreference(value: unknown): string {
  const record = asRecord(value);
  const parts = [String(record.disposition)];
  if (record.bookmarked) parts.push('bookmarked');
  if (record.triage) parts.push(`quick pass ${String(record.triage)}`);
  parts.push(`rating ${String(record.rating)}`);
  return parts.join(', ');
}
function describeNote(value: unknown): string {
  const record = asRecord(value);
  const body = String(record.body).replace(/\s+/g, ' ').trim();
  return body.length > 60 ? `${body.slice(0, 57)}…` : body || '(empty note)';
}
function describePlan(value: unknown): string {
  const record = asRecord(value);
  const count = (value: unknown) =>
    Array.isArray(value) ? value.length : Object.keys(value as object).length;
  return `${count(record.locked)} locked, ${count(record.removed)} removed, ${count(record.replacements)} replaced, ${count(record.customBlocks)} custom`;
}
function describeRooms(value: unknown): string {
  const record = asRecord(value);
  const prefs = record.prefs as Record<string, string>;
  const entries = Object.entries(prefs);
  return entries.length
    ? entries.map(([id, pref]) => `${id}: ${pref}`).join(', ')
    : 'no room choices';
}
function describeProfile(value: unknown): string {
  const record = asRecord(value);
  const socials = Object.keys((record.socials as Record<string, unknown>) ?? {}).length;
  const fields = Object.keys(record).filter((key) => key !== 'socials');
  return `${fields.length} field${fields.length === 1 ? '' : 's'}, ${socials} social link${socials === 1 ? '' : 's'}`;
}
function describeSelection(value: unknown): string {
  const record = asRecord(value);
  const on = Object.entries(record)
    .filter(([key, value]) => key !== 'socials' && value === true)
    .map(([key]) => key);
  return on.length ? `shares ${on.join(', ')}` : 'shares nothing';
}

/** Compare a projected incoming value with what the snapshot holds, then queue or skip it. */
function consider(
  plan: Plan,
  change: Omit<ImportChange, 'id' | 'status' | 'current' | 'currentSummary'>,
  stored: unknown,
  describe: (value: unknown) => string,
): void {
  const id = `${change.write.store}:${change.write.key}`;
  if (plan.changes.has(id)) {
    plan.skipped.push({
      section: change.section,
      eventId: change.eventId,
      label: change.label,
      reason: 'duplicate',
      detail: 'the file carries this record twice',
    });
    return;
  }
  const current = storedValue(change.write, stored);
  if (current === undefined) {
    plan.changes.set(id, { ...change, id, status: 'add' });
    return;
  }
  const settings = change.write.store === 'settings';
  const incoming = settings ? parseSetting(change.write.value as string) : change.write.value;
  const existing = settings ? parseSetting(current) : stored;
  const same =
    (settings && current === change.write.value) ||
    (typeof existing !== 'symbol' && canonical(existing) === canonical(incoming));
  if (same) {
    plan.unchanged += 1;
    return;
  }
  const summary = typeof existing === 'symbol' ? describe(current) : describe(existing);
  plan.changes.set(id, { ...change, id, status: 'conflict', current, currentSummary: summary });
}

function skipAll(
  plan: Plan,
  event: PersonalDataEvent,
  reason: ImportSkipReason,
  detail: string,
): void {
  const sections = event.sections;
  const push = (section: string, label: string) =>
    plan.skipped.push({ section, eventId: event.eventId, label, reason, detail });
  for (const section of ['preferences', 'notes'] as const)
    for (const record of (sections[section] as Record<string, unknown>[] | undefined) ?? [])
      push(section, String(record.activityId));
  for (const record of (sections.comparisons as Record<string, unknown>[] | undefined) ?? [])
    push('comparisons', `${String(record.activityA)} vs ${String(record.activityB)}`);
  if (sections.itinerary) push('itinerary', 'saved itinerary');
  for (const record of (sections.plans as Record<string, unknown>[] | undefined) ?? [])
    push('plans', `plan for ${String(record.day)}`);
  for (const record of (sections.resolvedPlans as Record<string, unknown>[] | undefined) ?? [])
    push('resolvedPlans', `resolved plan for ${String(record.day)}`);
  if (sections.rooms) push('rooms', 'devroom choices');
  if (sections.roomsDecided !== undefined) push('roomsDecided', 'devroom step');
  for (const boothId of Object.keys((sections.boothVisits as Record<string, unknown>) ?? {}))
    push('boothVisits', boothId);
}

function resolverFor(event: PersonalDataEvent, bundle: EventBundle): Resolver {
  const resolutions = new Map(
    event.activities.map((reference) => [
      reference.activityId,
      resolvePortableActivity(reference, bundle.id, bundle.activities),
    ]),
  );
  const titles = new Map(bundle.activities.map((activity) => [activity.id, activity.title]));
  return (id) => {
    const resolution = resolutions.get(id) ?? { status: 'missing' as const };
    if (resolution.status !== 'matched') return resolution;
    return {
      id: resolution.activityId,
      title: titles.get(resolution.activityId) ?? resolution.activityId,
    };
  };
}

/** Resolve every ID a record needs; one failure keeps the whole record out, with each failure named. */
function resolveAll(
  resolve: Resolver,
  ids: string[],
): { ids: Map<string, string>; failures: { id: string; status: ActivityResolution['status'] }[] } {
  const resolved = new Map<string, string>();
  const failures: { id: string; status: ActivityResolution['status'] }[] = [];
  for (const id of ids) {
    const result = resolve(id);
    if ('id' in result) resolved.set(id, result.id);
    else failures.push({ id, status: result.status });
  }
  return { ids: resolved, failures };
}

function skipReason(failures: { status: ActivityResolution['status'] }[]): ImportSkipReason {
  if (failures.some((failure) => failure.status === 'ambiguous')) return 'ambiguous';
  if (failures.some((failure) => failure.status === 'wrong-event')) return 'wrong-event';
  return 'missing';
}
function detail(failures: { id: string; status: ActivityResolution['status'] }[]): string {
  return failures
    .map(
      ({ id, status }) =>
        `${id} (${status === 'ambiguous' ? 'repeated CFP entry' : status === 'wrong-event' ? 'other event' : 'not in this programme'})`,
    )
    .join(', ');
}

function importEvent(plan: Plan, event: PersonalDataEvent, snapshot: PersonalDataSnapshot): void {
  const bundle = snapshot.bundles.find((candidate) => candidate.id === event.eventId);
  if (!bundle) {
    skipAll(plan, event, 'unknown-event', 'this programme is not on this device');
    return;
  }
  const eventId = event.eventId;
  const resolve = resolverFor(event, bundle);
  const sections = event.sections;
  const settings = new Map(snapshot.settings.map((setting) => [setting.key, setting]));
  const skip = (
    section: string,
    label: string,
    failures: { id: string; status: ActivityResolution['status'] }[],
  ) =>
    plan.skipped.push({
      section,
      eventId,
      label,
      reason: skipReason(failures),
      detail: detail(failures),
    });

  for (const record of (sections.preferences as Record<string, unknown>[] | undefined) ?? []) {
    const activityId = String(record.activityId);
    const { ids, failures } = resolveAll(resolve, [activityId]);
    if (failures.length) {
      skip('preferences', activityId, failures);
      continue;
    }
    const local = ids.get(activityId)!;
    const value = {
      ...pick(record, ['rating', 'comparisons', 'disposition', 'bookmarked', 'triage']),
      activityId: local,
    };
    consider(
      plan,
      {
        section: 'preferences',
        eventId,
        label: (resolve(activityId) as { title: string }).title,
        incomingSummary: describePreference(value),
        write: { store: 'preferences', key: local, value },
      },
      snapshot.preferences.find((preference) => preference.activityId === local),
      describePreference,
    );
  }
  for (const record of (sections.notes as Record<string, unknown>[] | undefined) ?? []) {
    const activityId = String(record.activityId);
    const { ids, failures } = resolveAll(resolve, [activityId]);
    if (failures.length) {
      skip('notes', activityId, failures);
      continue;
    }
    const local = ids.get(activityId)!;
    const value = { ...pick(record, ['body', 'updatedAt']), activityId: local };
    consider(
      plan,
      {
        section: 'notes',
        eventId,
        label: (resolve(activityId) as { title: string }).title,
        incomingSummary: describeNote(value),
        write: { store: 'notes', key: local, value },
      },
      snapshot.notes.find((note) => note.activityId === local),
      describeNote,
    );
  }
  for (const record of (sections.comparisons as Record<string, unknown>[] | undefined) ?? []) {
    const a = String(record.activityA);
    const b = String(record.activityB);
    const { ids, failures } = resolveAll(resolve, [a, b]);
    if (failures.length) {
      skip('comparisons', `${a} vs ${b}`, failures);
      continue;
    }
    const value = {
      ...pick(record, ['id', 'scoreA', 'createdAt']),
      activityA: ids.get(a)!,
      activityB: ids.get(b)!,
    };
    const describe = (value: unknown) => {
      const comparison = asRecord(value);
      return `${String(comparison.activityA)} vs ${String(comparison.activityB)}: ${String(comparison.scoreA)}`;
    };
    consider(
      plan,
      {
        section: 'comparisons',
        eventId,
        label: `${(resolve(a) as { title: string }).title} vs ${(resolve(b) as { title: string }).title}`,
        incomingSummary: describe(value),
        write: { store: 'comparisons', key: String(record.id), value },
      },
      snapshot.comparisons.find((comparison) => comparison.id === record.id),
      describe,
    );
  }
  if (sections.itinerary) {
    const record = sections.itinerary as Record<string, unknown>;
    const activityIds = record.activityIds as string[];
    const { ids, failures } = resolveAll(resolve, activityIds);
    if (failures.length) skip('itinerary', 'saved itinerary', failures);
    else {
      const value = {
        eventId,
        generatedAt: record.generatedAt,
        activityIds: activityIds.map((id) => ids.get(id)!),
      };
      const describe = (value: unknown) =>
        `${((asRecord(value).activityIds as string[] | undefined) ?? []).length} sessions`;
      consider(
        plan,
        {
          section: 'itinerary',
          eventId,
          label: 'saved itinerary',
          incomingSummary: describe(value),
          write: { store: 'itineraries', key: eventId, value },
        },
        snapshot.itineraries.find((itinerary) => itinerary.eventId === eventId),
        describe,
      );
    }
  }
  for (const record of (sections.plans as Record<string, unknown>[] | undefined) ?? []) {
    const day = String(record.day);
    const customBlocks = (record.customBlocks as Record<string, unknown>[]).map((block) =>
      pick(block, ['id', 'label', 'start', 'end', 'locationId', 'flexible']),
    );
    const custom = new Set(customBlocks.map((block) => String(block.id)));
    const replacements = record.replacements as Record<string, string>;
    const references = [
      ...(record.locked as string[]),
      ...(record.removed as string[]),
      ...Object.keys(replacements),
      ...Object.values(replacements),
    ].filter((id) => !custom.has(id));
    const { ids, failures } = resolveAll(resolve, [...new Set(references)]);
    if (failures.length) {
      skip('plans', `plan for ${day}`, failures);
      continue;
    }
    const map = (id: string) => ids.get(id) ?? id;
    const value = {
      locked: (record.locked as string[]).map(map),
      removed: (record.removed as string[]).map(map),
      replacements: Object.fromEntries(
        Object.entries(replacements).map(([from, to]) => [map(from), map(to)]),
      ),
      customBlocks,
    };
    consider(
      plan,
      {
        section: 'plans',
        eventId,
        label: `plan edits for ${day}`,
        incomingSummary: describePlan(value),
        write: {
          store: 'settings',
          key: `plan-edits-${eventId}-${day}`,
          value: JSON.stringify(value),
        },
      },
      settings.get(`plan-edits-${eventId}-${day}`),
      describePlan,
    );
  }
  for (const record of (sections.resolvedPlans as Record<string, unknown>[] | undefined) ?? []) {
    const day = String(record.day);
    const activityIds = record.activityIds as string[];
    const { ids, failures } = resolveAll(resolve, activityIds);
    if (failures.length) {
      skip('resolvedPlans', `resolved plan for ${day}`, failures);
      continue;
    }
    const value = activityIds.map((id) => ids.get(id)!);
    consider(
      plan,
      {
        section: 'resolvedPlans',
        eventId,
        label: `saved plan for ${day}`,
        incomingSummary: `${value.length} sessions`,
        write: {
          store: 'settings',
          key: `resolved-plan-${eventId}-${day}`,
          value: JSON.stringify(value),
        },
      },
      settings.get(`resolved-plan-${eventId}-${day}`),
      (stored) => (Array.isArray(stored) ? `${stored.length} sessions` : 'unreadable plan'),
    );
  }
  if (sections.rooms) {
    const rooms = sections.rooms as {
      prefs: Record<string, string>;
      skipped: Record<string, string[]>;
    };
    const tracks = new Set(bundle.tracks.map((track) => track.id));
    const unknownTracks = [...Object.keys(rooms.prefs), ...Object.keys(rooms.skipped)].filter(
      (id) => !tracks.has(id),
    );
    const { ids, failures } = resolveAll(resolve, [
      ...new Set(Object.values(rooms.skipped).flat()),
    ]);
    if (unknownTracks.length || failures.length) {
      plan.skipped.push({
        section: 'rooms',
        eventId,
        label: 'devroom choices',
        reason: failures.length ? skipReason(failures) : 'missing',
        detail: [
          ...unknownTracks.map((id) => `${id} (room not in this programme)`),
          ...(failures.length ? [detail(failures)] : []),
        ].join(', '),
      });
    } else {
      const value = {
        prefs: rooms.prefs,
        skipped: Object.fromEntries(
          Object.entries(rooms.skipped).map(([track, list]) => [
            track,
            list.map((id) => ids.get(id)!),
          ]),
        ),
      };
      consider(
        plan,
        {
          section: 'rooms',
          eventId,
          label: 'devroom choices',
          incomingSummary: describeRooms(value),
          write: { store: 'settings', key: `room-prefs-${eventId}`, value: JSON.stringify(value) },
        },
        settings.get(`room-prefs-${eventId}`),
        describeRooms,
      );
    }
  }
  if (sections.roomsDecided !== undefined) {
    const value = sections.roomsDecided ? 'true' : 'false';
    consider(
      plan,
      {
        section: 'roomsDecided',
        eventId,
        label: 'devroom step',
        incomingSummary: sections.roomsDecided ? 'decided' : 'not decided',
        write: { store: 'settings', key: `room-prefs-decided-${eventId}`, value },
      },
      settings.get(`room-prefs-decided-${eventId}`),
      (stored) => (stored === true ? 'decided' : 'not decided'),
    );
  }
  for (const [boothId, minutes] of Object.entries(
    (sections.boothVisits as Record<string, number | null> | undefined) ?? {},
  )) {
    const booth = bundle.booths.find((candidate) => candidate.id === boothId);
    if (!booth) {
      plan.skipped.push({
        section: 'boothVisits',
        eventId,
        label: boothId,
        reason: 'missing',
        detail: `${boothId} (booth not in this programme)`,
      });
      continue;
    }
    consider(
      plan,
      {
        section: 'boothVisits',
        eventId,
        label: booth.name,
        incomingSummary: minutes === null ? 'visit cancelled' : `${minutes} min visit`,
        write: {
          store: 'settings',
          key: `booth-visit-${boothId}`,
          value: minutes === null ? '' : String(minutes),
        },
      },
      settings.get(`booth-visit-${boothId}`),
      (stored) => (stored === '' ? 'visit cancelled' : `${String(stored)} min visit`),
    );
  }
}

function importContact(
  plan: Plan,
  contact: Record<string, unknown>,
  snapshot: PersonalDataSnapshot,
): void {
  const settings = new Map(snapshot.settings.map((setting) => [setting.key, setting]));
  for (const [section, key, fields, describe, label] of [
    ['contact.profile', 'attendee-profile', PROFILE_FIELDS, describeProfile, 'contact card'],
    [
      'contact.selection',
      'attendee-share-selection',
      SHARE_FIELDS,
      describeSelection,
      'contact sharing selection',
    ],
  ] as const) {
    const source = contact[section.slice('contact.'.length)] as Record<string, unknown> | undefined;
    if (!source) continue;
    const value = {
      ...pick(source, fields),
      socials: pick((source.socials as Record<string, unknown>) ?? {}, SOCIAL_FIELDS),
    };
    consider(
      plan,
      {
        section,
        label,
        incomingSummary: describe(value),
        write: { store: 'settings', key, value: JSON.stringify(value) },
      },
      settings.get(key),
      describe,
    );
  }
}

/**
 * Build the preview. Every write in `changes` is fully projected here, so the
 * transaction only has to re-check `current` and put the value.
 */
export function planPersonalDataImport(
  validated: ValidatedPersonalData,
  snapshot: PersonalDataSnapshot,
): PersonalDataImportPreview {
  const plan: Plan = { changes: new Map(), skipped: [], unchanged: 0 };
  const { file } = validated;
  for (const event of file.events) importEvent(plan, event, snapshot);
  if (file.contact) importContact(plan, file.contact, snapshot);
  const unassigned = (file.unassigned ?? {}) as Record<string, Record<string, unknown>[]>;
  for (const [section, records] of Object.entries(unassigned)) {
    if (!Array.isArray(records)) continue;
    for (const record of records) {
      plan.skipped.push({
        section,
        label:
          section === 'comparisons'
            ? `${String(record.activityA)} vs ${String(record.activityB)}`
            : String(record.activityId ?? record.boothId),
        reason: 'unassigned',
        detail: 'no event recorded; keep the file to retry after a programme update',
      });
    }
  }
  return {
    exportedAt: file.exportedAt,
    changes: [...plan.changes.values()],
    skipped: plan.skipped,
    unchanged: plan.unchanged,
    unsupported: validated.unsupported,
  };
}
