import type { Activity, EventBundle } from '@indiafoss/model';

/**
 * Injectable clock (§13). All "current time" logic must go through a Clock so
 * the app can be time-travelled in tests and for historical simulation.
 *
 * `now()` returns an ISO 8601 instant string. Parsing and comparison go
 * through `Date.parse` so mixed offsets (Z vs +05:30) compare correctly.
 */
export interface Clock {
  now(): string;
}

/** Real wall-clock time. */
export const SystemClock: Clock = {
  now: () => new Date().toISOString(),
};

/** Fixed time for tests, historical simulation and dev time-travel. */
export class FixedClock implements Clock {
  constructor(private readonly fixed: string) {}
  now(): string {
    return this.fixed;
  }
}

/**
 * A clock that starts at one instant and runs at a multiple of real time: the
 * conference-day simulator. `now()` keeps the offset of the start instant, so
 * formatting (`formatTime`, `dayKey`) reads in the event's time zone exactly
 * as it would on the day. `speed` 0 pauses it.
 */
export class RunningClock implements Clock {
  private readonly startMs: number;
  private readonly offsetMinutes: number;

  constructor(
    readonly start: string,
    readonly speed: number,
    private readonly anchorMs: number = Date.now(),
    private readonly realNow: () => number = () => Date.now(),
  ) {
    this.startMs = parseInstant(start);
    this.offsetMinutes = offsetMinutesOf(start);
  }

  /** Simulated instant as epoch milliseconds. */
  nowMs(): number {
    return this.startMs + Math.max(0, this.realNow() - this.anchorMs) * this.speed;
  }

  now(): string {
    return formatInstant(this.nowMs(), this.offsetMinutes);
  }
}

export function parseInstant(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid ISO instant: ${iso}`);
  return ms;
}

export function isBefore(a: string, b: string): boolean {
  return parseInstant(a) < parseInstant(b);
}

/**
 * Day key (YYYY-MM-DD) of an instant in the event's own timezone. Bundles are
 * normalized with explicit +05:30 offsets, so the date part of the ISO string
 * is the local (Asia/Kolkata) date.
 */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Distinct event days (YYYY-MM-DD), sorted, in bundle timezone. */
export function getEventDays(bundle: EventBundle): string[] {
  const days = new Set<string>();
  for (const a of bundle.activities) {
    if (a.start) days.add(dayKey(a.start));
  }
  return [...days].sort();
}

export function activitiesForDay(bundle: EventBundle, day: string): Activity[] {
  return bundle.activities
    .filter((a) => a.start && dayKey(a.start) === day)
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.title.localeCompare(b.title));
}

export interface TimeGroup {
  /** Start instant of the group. */
  start: string;
  /** End instant of the group (max of members). */
  end: string;
  activities: Activity[];
}

/** Group activities sharing a start time (concurrent sessions). */
export function groupByStart(activities: Activity[]): TimeGroup[] {
  const byStart = new Map<string, Activity[]>();
  for (const a of activities) {
    if (!a.start) continue;
    const list = byStart.get(a.start) ?? [];
    list.push(a);
    byStart.set(a.start, list);
  }
  const groups: TimeGroup[] = [];
  for (const [start, acts] of byStart) {
    const end = acts
      .map((a) => a.end)
      .filter((e): e is string => Boolean(e))
      .sort()
      .at(-1);
    groups.push({ start, end: end ?? start, activities: acts });
  }
  return groups.sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Progress of an activity at `now`, clamped to [0, 1] (§12).
 * elapsed = now - start; duration = end - start; progress = clamp(elapsed/duration, 0, 1).
 */
export function activityProgress(activity: Activity, now: string): number {
  if (!activity.start || !activity.end) return 0;
  const duration = parseInstant(activity.end) - parseInstant(activity.start);
  if (duration <= 0) return 0;
  const elapsed = parseInstant(now) - parseInstant(activity.start);
  return Math.min(1, Math.max(0, elapsed / duration));
}

export type EventPhase = 'before' | 'during' | 'after';

export interface NowState {
  phase: EventPhase;
  /** Sessions happening right now (start <= now < end), not cancelled. */
  current: Activity[];
  /** Earliest upcoming session (start >= now), not cancelled. */
  next: Activity | null;
  /** Day key of `now` within the event, or null outside it. */
  day: string | null;
  dayIndex: number;
}

/** Operational snapshot of the programme at `now` (§12). */
export function computeNowState(bundle: EventBundle, now: string): NowState {
  const days = getEventDays(bundle);
  const live = bundle.activities.filter((a) => !a.cancelled && a.start && a.end);

  const current = live.filter(
    (a) => parseInstant(a.start!) <= parseInstant(now) && parseInstant(now) < parseInstant(a.end!),
  );

  const upcoming = live
    .filter((a) => parseInstant(a.start!) >= parseInstant(now))
    .sort(
      (a, b) => parseInstant(a.start!) - parseInstant(b.start!) || a.title.localeCompare(b.title),
    );
  const next = upcoming[0] ?? null;

  const nowMs = parseInstant(now);
  const phase: EventPhase =
    nowMs < parseInstant(bundle.start)
      ? 'before'
      : nowMs >= parseInstant(bundle.end)
        ? 'after'
        : 'during';

  const day = phase === 'during' ? dayKey(now) : null;
  const dayIndex = day ? Math.max(0, days.indexOf(day)) : 0;

  return { phase, current, next, day, dayIndex };
}

/** Human-friendly HH:MM for an instant in the event timezone. */
export function formatTime(iso: string): string {
  return iso.slice(11, 16);
}

/** Human-friendly day label, e.g. "Sat 20 Sep". */
export function formatDayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${weekday} ${d} ${month}`;
}

/**
 * Leave-by calculation (§29):
 *   leaveAt = start(next) − travel(current, next) − userBuffer
 * Returns the instant the attendee must start walking.
 */
export function leaveByInstant(
  nextStartIso: string,
  travelSeconds: number,
  bufferSeconds: number,
): string {
  const leaveMs = parseInstant(nextStartIso) - (travelSeconds + bufferSeconds) * 1000;
  return formatInstant(leaveMs, offsetMinutesOf(nextStartIso));
}

/** UTC offset in minutes carried by an ISO string (`+05:30` → 330; `Z` or none → 0). */
export function offsetMinutesOf(iso: string): number {
  const m = iso.match(/([+-])(\d{2}):?(\d{2})$/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * ISO string for an instant in a fixed UTC offset, so `formatTime()` shows
 * event-local wall-clock time rather than UTC.
 */
export function formatInstant(ms: number, offsetMinutes: number): string {
  const local = new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 19);
  if (offsetMinutes === 0) return `${local}Z`;
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${local}${offsetMinutes < 0 ? '-' : '+'}${hh}:${mm}`;
}

export type ScheduleChangeType =
  | 'added'
  | 'cancelled'
  | 'time-changed'
  | 'room-changed'
  | 'title-changed'
  | 'speaker-changed'
  | 'recording-added';

export interface ScheduleChange {
  activityId: string;
  title: string;
  type: ScheduleChangeType;
  detail?: string;
}

/**
 * Diff two revisions of an event bundle by stable activity id (§35, §36).
 * Recognizes added / cancelled / time / room / title / speaker / recording
 * changes and deliberately ignores irrelevant metadata edits.
 */
export function diffBundles(prev: EventBundle, next: EventBundle): ScheduleChange[] {
  const changes: ScheduleChange[] = [];
  const prevById = new Map(prev.activities.map((a) => [a.id, a]));

  for (const a of next.activities) {
    const old = prevById.get(a.id);
    if (!old) {
      changes.push({ activityId: a.id, title: a.title, type: 'added' });
      continue;
    }
    if (a.cancelled && !old.cancelled) {
      changes.push({ activityId: a.id, title: a.title, type: 'cancelled' });
    }
    if (a.start !== old.start || a.end !== old.end) {
      changes.push({ activityId: a.id, title: a.title, type: 'time-changed' });
    }
    if (a.locationId !== old.locationId) {
      changes.push({
        activityId: a.id,
        title: a.title,
        type: 'room-changed',
        detail: `${old.locationId ?? 'unknown'} → ${a.locationId ?? 'unknown'}`,
      });
    }
    if (a.title !== old.title) {
      changes.push({ activityId: a.id, title: a.title, type: 'title-changed' });
    }
    if (a.speakerIds.join(',') !== old.speakerIds.join(',')) {
      changes.push({ activityId: a.id, title: a.title, type: 'speaker-changed' });
    }
    if (a.recordingUrl && !old.recordingUrl) {
      changes.push({ activityId: a.id, title: a.title, type: 'recording-added' });
    }
  }

  for (const a of prev.activities) {
    if (!next.activities.some((n) => n.id === a.id)) {
      changes.push({ activityId: a.id, title: a.title, type: 'cancelled' });
    }
  }

  return changes;
}

/** Group changes by type for a compact summary (§35). */
export function summarizeChanges(changes: ScheduleChange[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const change of changes) {
    summary[change.type] = (summary[change.type] ?? 0) + 1;
  }
  return summary;
}

export {
  activityToIcs,
  calendarEntriesToIcs,
  calendarEntryToIcs,
  eventToIcs,
  itineraryToIcs,
} from './calendar.js';
export type { CalendarEntry, CalendarOptions, ItineraryCalendarItem } from './calendar.js';
