import { decodePersonalData, type PersonalDataFile } from '@indiafoss/model/contracts';
import { PROFILE_FIELDS, SHARE_FIELDS, SOCIAL_FIELDS } from './personal-data.js';

/** Validation is separate from transport decoding and never writes to storage. */
export interface ValidatedPersonalData {
  file: PersonalDataFile;
  /** Unknown sections remain in the transport, but must never become live settings. */
  unsupported: string[];
}

function invalid(path: string): never {
  throw new Error(`Invalid personal data: ${path}`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim())) invalid(path);
  return value;
}
function boolean(value: unknown, path: string): void {
  if (typeof value !== 'boolean') invalid(path);
}
function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(path);
  return value;
}
function choice(value: unknown, choices: readonly unknown[], path: string): void {
  if (!choices.includes(value)) invalid(path);
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path);
  return value;
}
function timestamp(value: unknown, path: string): string {
  const result = text(value, path);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    invalid(path);
  day(result.slice(0, 10), path);
  return result;
}
function day(value: unknown, path: string): string {
  const result = text(value, path);
  const parsed = Date.parse(result);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== result
  )
    invalid(path);
  return result;
}
function unique(values: string[], path: string): void {
  if (new Set(values).size !== values.length) invalid(path);
}

/** null preserves an explicit cancellation, rather than silently dropping that choice. */
function boothDuration(value: unknown, path: string): void {
  if (value === null) return;
  const minutes = number(value, path);
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440) invalid(path);
}

type ReferenceCheck = (value: unknown, path: string) => string;
function records(
  value: unknown,
  path: string,
  check: (record: Record<string, unknown>, path: string) => string,
): void {
  const keys = array(value, path).map((item, index) => {
    const location = `${path}[${index}]`;
    return check(object(item, location), location);
  });
  unique(keys, path);
}
function personalRecords(
  sections: Record<string, unknown>,
  path: string,
  reference: ReferenceCheck,
): void {
  if (sections.preferences !== undefined)
    records(sections.preferences, `${path}.preferences`, (record, at) => {
      const id = reference(record.activityId, `${at}.activityId`);
      number(record.rating, `${at}.rating`);
      const comparisons = number(record.comparisons, `${at}.comparisons`);
      if (!Number.isSafeInteger(comparisons) || comparisons < 0) invalid(`${at}.comparisons`);
      choice(
        record.disposition,
        ['normal', 'must-attend', 'not-interested', 'watch-later'],
        `${at}.disposition`,
      );
      boolean(record.bookmarked, `${at}.bookmarked`);
      if (record.triage !== undefined) choice(record.triage, ['yes', 'no'], `${at}.triage`);
      return id;
    });
  if (sections.notes !== undefined)
    records(sections.notes, `${path}.notes`, (record, at) => {
      const id = reference(record.activityId, `${at}.activityId`);
      text(record.body, `${at}.body`, true);
      timestamp(record.updatedAt, `${at}.updatedAt`);
      return id;
    });
  if (sections.comparisons !== undefined)
    records(sections.comparisons, `${path}.comparisons`, (record, at) => {
      const a = reference(record.activityA, `${at}.activityA`);
      const b = reference(record.activityB, `${at}.activityB`);
      if (a === b) invalid(at);
      choice(record.scoreA, [0, 0.5, 1], `${at}.scoreA`);
      timestamp(record.createdAt, `${at}.createdAt`);
      return text(record.id, `${at}.id`);
    });
}

const SECTIONS = [
  'preferences',
  'notes',
  'comparisons',
  'itinerary',
  'resolvedPlans',
  'plans',
  'rooms',
  'roomsDecided',
  'boothVisits',
];

/**
 * Validate every known section, including unresolved events and unassigned records.
 * The result remains an untrusted transport: adapters must project explicit fields,
 * resolve CFP references, preview conflicts and commit atomically before use.
 */
export function validatePersonalData(raw: string): ValidatedPersonalData {
  const decoded = decodePersonalData(raw);
  if (!decoded.ok) throw new Error(decoded.issues.join('; '));
  const file = decoded.data;
  const unsupported: string[] = [];
  for (const [index, event] of file.events.entries()) {
    const path = `events[${index}].sections`;
    const sections = event.sections;
    const references = new Set(event.activities.map((ref) => ref.activityId));
    const reference: ReferenceCheck = (value, at) => {
      const id = text(value, at);
      if (!references.has(id)) invalid(`${at} (undeclared activity)`);
      return id;
    };
    const ids = (value: unknown, at: string, check = reference): string[] => {
      const result = array(value, at).map((item) => check(item, at));
      unique(result, at);
      return result;
    };
    personalRecords(sections, path, reference);
    if (sections.itinerary !== undefined) {
      const record = object(sections.itinerary, `${path}.itinerary`);
      timestamp(record.generatedAt, `${path}.itinerary.generatedAt`);
      ids(record.activityIds, `${path}.itinerary.activityIds`);
    }
    if (sections.resolvedPlans !== undefined)
      records(sections.resolvedPlans, `${path}.resolvedPlans`, (record, at) => {
        ids(record.activityIds, `${at}.activityIds`);
        return day(record.day, `${at}.day`);
      });
    if (sections.plans !== undefined)
      records(sections.plans, `${path}.plans`, (record, at) => {
        const custom = new Set<string>();
        records(record.customBlocks, `${at}.customBlocks`, (block, location) => {
          const id = text(block.id, `${location}.id`);
          if (references.has(id)) invalid(`${location}.id (activity collision)`);
          custom.add(id);
          text(block.label, `${location}.label`);
          const start = timestamp(block.start, `${location}.start`);
          const end = timestamp(block.end, `${location}.end`);
          if (Date.parse(end) <= Date.parse(start)) invalid(`${location}.end`);
          if (block.flexible !== undefined) boolean(block.flexible, `${location}.flexible`);
          if (block.locationId !== undefined) text(block.locationId, `${location}.locationId`);
          return id;
        });
        const planRef: ReferenceCheck = (value, location) => {
          const id = text(value, location);
          return custom.has(id) ? id : reference(id, location);
        };
        ids(record.locked, `${at}.locked`, planRef);
        ids(record.removed, `${at}.removed`, planRef);
        for (const [original, replacement] of Object.entries(
          object(record.replacements, `${at}.replacements`),
        )) {
          planRef(original, `${at}.replacements`);
          planRef(replacement, `${at}.replacements`);
        }
        return day(record.day, `${at}.day`);
      });
    if (sections.rooms !== undefined) {
      const rooms = object(sections.rooms, `${path}.rooms`);
      for (const [id, value] of Object.entries(object(rooms.prefs, `${path}.rooms.prefs`))) {
        text(id, `${path}.rooms.prefs`);
        choice(value, ['skip', 'love', 'stay'], `${path}.rooms.prefs`);
      }
      for (const [id, value] of Object.entries(object(rooms.skipped, `${path}.rooms.skipped`))) {
        text(id, `${path}.rooms.skipped`);
        ids(value, `${path}.rooms.skipped`);
      }
    }
    if (sections.roomsDecided !== undefined) boolean(sections.roomsDecided, `${path}.roomsDecided`);
    if (sections.boothVisits !== undefined)
      for (const [id, value] of Object.entries(
        object(sections.boothVisits, `${path}.boothVisits`),
      )) {
        text(id, `${path}.boothVisits`);
        boothDuration(value, `${path}.boothVisits`);
      }
    unsupported.push(
      ...Object.keys(sections)
        .filter((key) => !SECTIONS.includes(key))
        .map((key) => `${path}.${key}`),
    );
  }
  if (file.unassigned !== undefined) {
    const sections = object(file.unassigned, 'unassigned');
    personalRecords(sections, 'unassigned', text);
    if (sections.boothVisits !== undefined)
      records(sections.boothVisits, 'unassigned.boothVisits', (record, at) => {
        boothDuration(record.minutes, `${at}.minutes`);
        return text(record.boothId, `${at}.boothId`);
      });
    unsupported.push(
      ...Object.keys(sections)
        .filter((key) => !['preferences', 'notes', 'comparisons', 'boothVisits'].includes(key))
        .map((key) => `unassigned.${key}`),
    );
  }
  if (file.contact !== undefined) {
    for (const [key, fields, type] of [
      ['profile', PROFILE_FIELDS, 'string'],
      ['selection', SHARE_FIELDS, 'boolean'],
    ] as const) {
      if (file.contact[key] === undefined) continue;
      const record = object(file.contact[key], `contact.${key}`);
      for (const field of fields)
        if (record[field] !== undefined) {
          if (type === 'string') text(record[field], `contact.${key}.${field}`, true);
          else boolean(record[field], `contact.${key}.${field}`);
        }
      if (record.socials !== undefined) {
        const socials = object(record.socials, `contact.${key}.socials`);
        for (const field of SOCIAL_FIELDS)
          if (socials[field] !== undefined) {
            if (type === 'string') text(socials[field], `contact.${key}.socials.${field}`, true);
            else boolean(socials[field], `contact.${key}.socials.${field}`);
          }
      }
    }
    unsupported.push(
      ...Object.keys(file.contact)
        .filter((key) => !['profile', 'selection'].includes(key))
        .map((key) => `contact.${key}`),
    );
  }
  unsupported.push(
    ...Object.keys(file).filter(
      (key) =>
        !['format', 'schemaVersion', 'exportedAt', 'events', 'contact', 'unassigned'].includes(key),
    ),
  );
  return { file, unsupported };
}
