import { collectSchemaVersionIssues, isRecord, requireInstant, requireString } from './common.js';
import type { PortableActivityReference } from '../portable-activity.js';

export const PERSONAL_DATA_SCHEMA_VERSION = 1;
export const PERSONAL_DATA_MAX_BYTES = 5 * 1024 * 1024;

/** A transport envelope. Each storage adapter must validate its section before applying it. */
export interface PersonalDataEvent {
  eventId: string;
  activities: PortableActivityReference[];
  /** Named personal sections (preferences, notes, plans, rooms, comparisons). */
  sections: Record<string, unknown>;
  [key: string]: unknown;
}
export interface PersonalDataFile {
  format: 'indiafoss-personal-data';
  schemaVersion: number;
  exportedAt: string;
  events: PersonalDataEvent[];
  /** Device-independent contact fields and sharing selection; never device keys or tokens. */
  contact?: Record<string, unknown>;
  [key: string]: unknown;
}

export function collectPersonalDataIssues(value: unknown): string[] {
  if (!isRecord(value)) return ['personal data must be an object'];
  const issues = collectSchemaVersionIssues(value, PERSONAL_DATA_SCHEMA_VERSION, 'personal data');
  if (value.format !== 'indiafoss-personal-data')
    issues.push('format must be indiafoss-personal-data');
  issues.push(...requireInstant(value, 'exportedAt'));
  if (typeof value.exportedAt === 'string') {
    const timestamp = new Date(value.exportedAt);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.exportedAt) ||
      Number.isNaN(timestamp.getTime()) ||
      timestamp.toISOString() !== value.exportedAt
    ) {
      issues.push('exportedAt must use canonical UTC milliseconds');
    }
  }
  if (!Array.isArray(value.events)) return [...issues, 'events must be an array'];
  const events = new Set<string>();
  for (const [index, event] of value.events.entries()) {
    const path = `events[${index}].`;
    if (!isRecord(event)) {
      issues.push(`${path}must be an object`);
      continue;
    }
    issues.push(...requireString(event, 'eventId', path));
    if (typeof event.eventId === 'string') {
      if (events.has(event.eventId)) issues.push(`${path}duplicate eventId`);
      events.add(event.eventId);
    }
    if (!isRecord(event.sections)) issues.push(`${path}sections must be an object`);
    if (!Array.isArray(event.activities)) {
      issues.push(`${path}activities must be an array`);
      continue;
    }
    const activities = new Set<string>();
    for (const [at, reference] of event.activities.entries()) {
      const refPath = `${path}activities[${at}].`;
      if (!isRecord(reference)) {
        issues.push(`${refPath}must be an object`);
        continue;
      }
      issues.push(...requireString(reference, 'activityId', refPath));
      if (reference.eventId !== event.eventId)
        issues.push(`${refPath}eventId must match its event`);
      if (reference.proposalId !== undefined)
        issues.push(...requireString(reference, 'proposalId', refPath));
      if (typeof reference.activityId === 'string') {
        if (activities.has(reference.activityId)) issues.push(`${refPath}duplicate activityId`);
        activities.add(reference.activityId);
      }
    }
  }
  if (value.contact !== undefined && !isRecord(value.contact))
    issues.push('contact must be an object');
  return issues;
}

export type PersonalDataDecodeResult =
  { ok: true; data: PersonalDataFile } | { ok: false; issues: string[] };

/** Bound nesting before parsing, without counting brackets inside JSON strings. */
function tooDeep(text: string): boolean {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const char of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '[' || char === '{') {
      if (++depth > 64) return true;
    } else if (char === ']' || char === '}') depth--;
  }
  return false;
}

/** No writes, network calls or filtering of unknown optional data. */
export function decodePersonalData(text: string): PersonalDataDecodeResult {
  if (
    text.length > PERSONAL_DATA_MAX_BYTES ||
    new TextEncoder().encode(text).byteLength > PERSONAL_DATA_MAX_BYTES
  ) {
    return { ok: false, issues: ['personal data exceeds the 5 MiB limit'] };
  }
  if (tooDeep(text)) return { ok: false, issues: ['personal data exceeds the nesting limit'] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, issues: ['personal data is not valid JSON'] };
  }
  const issues = collectPersonalDataIssues(value);
  return issues.length ? { ok: false, issues } : { ok: true, data: value as PersonalDataFile };
}

export function encodePersonalData(data: PersonalDataFile): string {
  const text = JSON.stringify(data, null, 2);
  const result = decodePersonalData(text);
  if (!result.ok) throw new Error(result.issues.join('; '));
  return text;
}
