import type { EventBundle } from '@indiafoss/model';

/**
 * Honest refresh state for the programme (#191).
 *
 * The Settings card used to show one number: when this device last reached the
 * server. A successful check therefore read as "your schedule is current", even
 * when the newest published revision was itself an old, still-provisional
 * import. Three different clocks matter and they are kept apart here:
 *
 *  - `sourceMetadata.sourceUpdatedAt` — when the upstream programme last
 *    changed, i.e. when the data in this bundle was imported from FOSS United.
 *  - `lastCheckedAt` — when *this device* last successfully reached the
 *    manifest. It says nothing about how old the data is.
 *  - `sourceMetadata.scheduleStatus` — whether the organisers call this
 *    programme a draft. Absent in older bundles, and absence is not a claim
 *    that anything has been confirmed.
 *
 * Nothing here invents a sync mechanism or a timestamp: every field comes from
 * the bundle that is already published.
 */

/** How old the imported programme data is, in plain buckets. */
export type ScheduleAge = 'unknown' | 'current' | 'ageing' | 'stale';

/** Under two days old counts as current. */
export const CURRENT_MAX_MS = 2 * 24 * 60 * 60_000;
/** Over a week old is called stale outright. */
export const STALE_MIN_MS = 7 * 24 * 60 * 60_000;
/** A device that has not reached the server in a day is told so. */
export const CHECK_OVERDUE_MS = 24 * 60 * 60_000;

export interface ScheduleFreshnessInput {
  /** The bundle actually being rendered, or null before one is loaded. */
  bundle: Pick<EventBundle, 'start' | 'sourceMetadata'> | null;
  /** Epoch ms of this device's last successful manifest check, if any. */
  lastCheckedAt: number | null;
  /** Wall-clock now. Deliberately not the day simulator: staleness is a real-world fact. */
  now: number;
}

export interface ScheduleFreshness {
  /** True only when the bundle says so. Absence is reported as unknown, never as confirmed. */
  provisional: boolean;
  /** One line about publication status, or null when the bundle does not say. */
  statusLine: string | null;
  /** Normalised ISO instant of the upstream import, or null when unusable. */
  importedAtIso: string | null;
  /** One line naming when the programme data was imported. */
  importedLine: string;
  age: ScheduleAge;
  /** Whether this device is overdue for a check; not a statement about the data. */
  checkOverdue: boolean;
  /** One line about this device's own last check. */
  checkedLine: string;
}

/** The bundle's own UTC offset, taken from its start instant (e.g. `+05:30`). */
export function bundleOffset(start: string | undefined): string | null {
  const match = /(Z|[+-]\d{2}:\d{2})$/.exec(start ?? '');
  if (!match) return null;
  return match[1] === 'Z' ? '+00:00' : match[1]!;
}

/**
 * Upstream sends a naive `YYYY-MM-DD HH:MM:SS[.ffffff]` timestamp with no zone.
 * `Date.parse` treats that inconsistently across browsers, so it is anchored to
 * the event's own offset rather than to whatever zone the phone is in. Already
 * zoned values are passed through untouched.
 */
export function parseSourceTimestamp(
  raw: string | undefined,
  offset: string | null,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const zoned = /(Z|[+-]\d{2}:\d{2})$/.test(trimmed)
    ? trimmed.replace(' ', 'T')
    : offset
      ? `${trimmed.replace(' ', 'T')}${offset}`
      : null;
  if (!zoned) return null;
  const parsed = Date.parse(zoned);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function ageOf(importedAtIso: string | null, now: number): ScheduleAge {
  if (!importedAtIso) return 'unknown';
  const elapsed = now - Date.parse(importedAtIso);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'current';
  if (elapsed < CURRENT_MAX_MS) return 'current';
  return elapsed < STALE_MIN_MS ? 'ageing' : 'stale';
}

/** "3 days", "5 hours", "just now" — coarse on purpose, so it never looks precise. */
export function describeElapsed(elapsedMs: number): string {
  if (elapsedMs < 60 * 60_000) return 'less than an hour ago';
  const hours = Math.floor(elapsedMs / (60 * 60_000));
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function describeScheduleFreshness(input: ScheduleFreshnessInput): ScheduleFreshness {
  const { bundle, lastCheckedAt, now } = input;
  const metadata = bundle?.sourceMetadata;
  const importedAtIso = parseSourceTimestamp(
    metadata?.sourceUpdatedAt,
    bundleOffset(bundle?.start),
  );
  const age = ageOf(importedAtIso, now);

  const provisional = metadata?.scheduleStatus === 'draft';
  const statusLine = !metadata?.scheduleStatus
    ? null
    : provisional
      ? 'Provisional: the organisers have not marked this programme final. Times and rooms may still change.'
      : 'The organisers have marked this programme final.';

  const importedLine = !importedAtIso
    ? 'This schedule does not record when it was imported.'
    : `Programme data imported from the organisers ${describeElapsed(now - Date.parse(importedAtIso))}.`;

  const overdue = lastCheckedAt === null || now - lastCheckedAt >= CHECK_OVERDUE_MS;
  const checkedLine =
    lastCheckedAt === null
      ? 'This device has not checked for a newer programme yet, so a newer one may exist.'
      : `This device last reached the organisers ${describeElapsed(now - lastCheckedAt)}. That is when it looked, not how old the programme is.`;

  return {
    provisional,
    statusLine,
    importedAtIso,
    importedLine,
    age,
    checkOverdue: overdue,
    checkedLine,
  };
}
