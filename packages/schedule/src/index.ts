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
  | 'reinstated'
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
    } else if (!a.cancelled && old.cancelled) {
      // A talk coming back is as important to an attendee as one going away,
      // and detecting it only in the false-to-true direction meant a
      // reinstated session produced an empty diff, which the update path then
      // treated as "nothing to apply" (#190).
      changes.push({ activityId: a.id, title: a.title, type: 'reinstated' });
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

/**
 * Human wording for a change type, singular and plural.
 *
 * The update banner previously interpolated the raw type and appended an `s`,
 * which reads as "2 room-changeds". Every type needs a real label, so a new
 * one cannot be added without also being sayable.
 */
const CHANGE_LABELS: Record<ScheduleChangeType, [string, string]> = {
  added: ['new session', 'new sessions'],
  cancelled: ['cancellation', 'cancellations'],
  reinstated: ['session back on', 'sessions back on'],
  'time-changed': ['time change', 'time changes'],
  'room-changed': ['room change', 'room changes'],
  'title-changed': ['title change', 'title changes'],
  'speaker-changed': ['speaker change', 'speaker changes'],
  'recording-added': ['new recording', 'new recordings'],
};

/** Label a count of one change type, e.g. `2 room changes`. */
export function describeChangeCount(type: ScheduleChangeType, count: number): string {
  const label = CHANGE_LABELS[type];
  return `${count} ${count === 1 ? label[0] : label[1]}`;
}

/**
 * One change, said in plain language: what it was and what it now is (#312).
 *
 * The banner used to give only counts ("1 room change"), which told an
 * attendee that something moved but not what, so they had to hunt for it.
 */
export interface ScheduleChangeDetail extends ScheduleChange {
  /** A whole sentence, safe to render on its own. */
  description: string;
}

/**
 * Order the list by how much it can cost an attendee who acts on it late: a
 * session that is gone, or has moved in time or room, before a rename or a
 * newly published recording.
 */
const CHANGE_RANK: Record<ScheduleChangeType, number> = {
  cancelled: 0,
  'time-changed': 1,
  'room-changed': 2,
  reinstated: 3,
  added: 4,
  'title-changed': 5,
  'speaker-changed': 6,
  'recording-added': 7,
};

/** `Hall A`, or the raw id when the revision that used it did not name it. */
function roomLabel(bundle: EventBundle, locationId: string | undefined): string | null {
  if (!locationId) return null;
  return bundle.locations.find((l) => l.id === locationId)?.name ?? locationId;
}

/**
 * `10:00-11:00`, with the day when the caller needs it to be unambiguous.
 * Returns null for a flexible activity that has no slot at all.
 */
function slotLabel(activity: Activity | undefined, withDay: boolean): string | null {
  if (!activity?.start) return null;
  const time = activity.end
    ? `${formatTime(activity.start)}\u2013${formatTime(activity.end)}`
    : formatTime(activity.start);
  return withDay ? `${formatDayLabel(dayKey(activity.start))} ${time}` : time;
}

function speakerLabel(bundle: EventBundle, ids: string[]): string | null {
  const names = ids.map((id) => bundle.people.find((p) => p.id === id)?.name ?? id).filter(Boolean);
  return names.length > 0 ? names.join(', ') : null;
}

function describeTimeChange(before: Activity, after: Activity): string {
  // A session can gain or lose its slot entirely: both bundles are normalized
  // with explicit offsets, but `start` is optional for flexible activities.
  if (!before.start && after.start) return `Now scheduled for ${slotLabel(after, true)}.`;
  if (before.start && !after.start) {
    return `No longer has a time; it was ${slotLabel(before, true)}.`;
  }
  // Only name the day when the session actually moved to another one, so a
  // routine ten-minute shift does not read as a bigger change than it is.
  const movedDay = dayKey(before.start!) !== dayKey(after.start!);
  return `Moved from ${slotLabel(before, movedDay)} to ${slotLabel(after, movedDay)}.`;
}

function describeRoomChange(
  prev: EventBundle,
  next: EventBundle,
  before: Activity,
  after: Activity,
): string {
  // Resolve each side against the revision it came from: a room dropped in the
  // new bundle is still named in the old one.
  const was = roomLabel(prev, before.locationId);
  const now = roomLabel(next, after.locationId);
  if (!was && now) return `Room set to ${now}.`;
  if (was && !now) return `No longer has a room; it was ${was}.`;
  return `Moved from ${was} to ${now}.`;
}

function describeChange(
  change: ScheduleChange,
  prev: EventBundle,
  next: EventBundle,
): ScheduleChangeDetail {
  const before = prev.activities.find((a) => a.id === change.activityId);
  const after = next.activities.find((a) => a.id === change.activityId);
  let description: string;
  switch (change.type) {
    case 'added': {
      const slot = slotLabel(after, true);
      const room = roomLabel(next, after?.locationId);
      description = slot
        ? `New session, ${slot}${room ? ` in ${room}` : ''}.`
        : 'New session, no time announced yet.';
      break;
    }
    case 'cancelled':
      description = 'No longer on the programme.';
      break;
    case 'reinstated':
      description = 'Back on the programme.';
      break;
    case 'time-changed':
      description = before && after ? describeTimeChange(before, after) : 'The time changed.';
      break;
    case 'room-changed':
      description =
        before && after ? describeRoomChange(prev, next, before, after) : 'The room changed.';
      break;
    case 'title-changed':
      description = before ? `Renamed from \u201c${before.title}\u201d.` : 'The title changed.';
      break;
    case 'speaker-changed': {
      const was = before ? speakerLabel(prev, before.speakerIds) : null;
      const now = after ? speakerLabel(next, after.speakerIds) : null;
      description = !was
        ? `Speakers announced: ${now ?? 'none listed'}.`
        : !now
          ? `No speakers listed now; they were ${was}.`
          : `Speakers changed from ${was} to ${now}.`;
      break;
    }
    case 'recording-added':
      description = 'A recording is now available.';
      break;
  }
  return { ...change, description };
}

/**
 * The complete list of attendee-visible changes between two revisions, each
 * said in plain language (#312).
 *
 * Built on `diffBundles` so there is one notion of what changed; this adds
 * only the wording, and both bundles are needed because the "was" side of a
 * move can only be resolved against the revision it came from.
 *
 * The result is always complete for the pair it was given. A caller that
 * cannot supply the previous revision must say the programme changed without
 * a list, never show part of one.
 */
export function describeChanges(prev: EventBundle, next: EventBundle): ScheduleChangeDetail[] {
  return diffBundles(prev, next)
    .map((change) => describeChange(change, prev, next))
    .sort((a, b) => CHANGE_RANK[a.type] - CHANGE_RANK[b.type] || a.title.localeCompare(b.title));
}

export {
  activityToIcs,
  calendarEntriesToIcs,
  calendarEntryToIcs,
  eventToIcs,
  itineraryToIcs,
} from './calendar.js';
export type { CalendarEntry, CalendarOptions, ItineraryCalendarItem } from './calendar.js';
