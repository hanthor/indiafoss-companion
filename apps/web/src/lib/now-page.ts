import type { EventBundle } from '@indiafoss/model';
import { getEventDays } from '@indiafoss/schedule';
import { eventDay } from './resolved-plan';

/** Getting there is for arriving: from this hour on the first day it is noise. */
export const ARRIVAL_CUTOFF_HOUR = 10;

/** Asked every second by Now: the first day and the formatter are worked out once. */
const firstDays = new WeakMap<EventBundle, string | undefined>();
const hourFormats = new Map<string, Intl.DateTimeFormat>();

/** Whether Now still shows how to reach the venue: until 10:00 on day one. */
export function showGettingThere(bundle: EventBundle, now: string): boolean {
  if (!firstDays.has(bundle)) firstDays.set(bundle, getEventDays(bundle)[0]);
  const first = firstDays.get(bundle);
  if (!first) return false;
  const today = eventDay(now, bundle.timezone);
  if (today !== first) return today < first;
  let format = hourFormats.get(bundle.timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', {
      timeZone: bundle.timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    });
    hourFormats.set(bundle.timezone, format);
  }
  return Number(format.format(new Date(now))) < ARRIVAL_CUTOFF_HOUR;
}

export const GOING_LABEL = "You're going";
export const UP_NEXT_LABEL = 'Up next';

export interface GoInput {
  planStatus: 'loading' | 'ready' | 'error';
  planConflicted: boolean;
  /** The resolved plan's item in progress or next: a talk or a personal block. */
  planItemId: string | undefined;
  /** What the grid is showing. */
  gridIds: ReadonlySet<string>;
  /** The programme's next session to start, whatever the plan says. */
  programmeNextId: string | undefined;
}

/**
 * The one card Now draws in gold, or none.
 *
 * Your plan's talk first. With nothing left in the plan today, the
 * programme's next session, labelled as that and not as your choice. Nothing
 * while the plan loads, so the gold never jumps from one card to another, and
 * nothing while it has conflicting choices: then no destination can be
 * picked for the attendee (#221). A personal block has no card to light.
 */
export function goTarget(input: GoInput): { id: string; label: string } | null {
  if (input.planStatus === 'loading' || input.planConflicted) return null;
  if (input.planItemId) {
    return input.gridIds.has(input.planItemId)
      ? { id: input.planItemId, label: GOING_LABEL }
      : null;
  }
  return input.programmeNextId && input.gridIds.has(input.programmeNextId)
    ? { id: input.programmeNextId, label: UP_NEXT_LABEL }
    : null;
}
