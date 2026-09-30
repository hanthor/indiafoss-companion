import type { EventBundle } from '@indiafoss/model';
import { computeNowState, getEventDays } from '@indiafoss/schedule';
import type { EditedPlan } from '@indiafoss/solver';

/** Building a formatter costs far more than using one, and Now asks every second. */
const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** Calendar date at the venue, independent of the phone's time zone. */
export function eventDay(now: string, timezone: string): string {
  let format = dayFormats.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayFormats.set(timezone, format);
  }
  const parts = format.formatToParts(new Date(now));
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** The plan item under way at `now`: what the attendee is assumed to be doing. */
export function plannedItemAt(plan: EditedPlan, now: string) {
  if (!plan.feasible) return null;
  const nowMs = Date.parse(now);
  return (
    plan.items.find((item) => Date.parse(item.start) <= nowMs && Date.parse(item.end) > nowMs) ??
    null
  );
}

/**
 * Where the attendee was according to their plan, as a phrase for the contact
 * card: the talk's title, or a block such as "Lunch, day 1". Falls back to the
 * programme's running session when nothing is planned.
 */
export function metDuringLabel(
  plan: EditedPlan | null,
  bundle: EventBundle,
  now: string,
): { label?: string; activityId?: string } {
  const item = plan ? plannedItemAt(plan, now) : null;
  if (item) {
    const activity = bundle.activities.find((a) => a.id === item.id);
    if (activity) return { label: activity.title, activityId: activity.id };
    const dayIndex = getEventDays(bundle).indexOf(eventDay(item.start, bundle.timezone));
    const dayPart = dayIndex >= 0 ? `, day ${dayIndex + 1}` : '';
    const label = (item.label ?? 'Personal time').split(' · ')[0];
    return { label: `${label}${dayPart}` };
  }
  const running = computeNowState(bundle, now).current[0];
  return running ? { label: running.title, activityId: running.id } : {};
}

/** Conflicts must be resolved before presenting a single item as the attendee's destination. */
export function nextPlannedItem(plan: EditedPlan, now: string) {
  if (!plan.feasible) return null;
  return plan.items.find((item) => Date.parse(item.end) > Date.parse(now)) ?? null;
}
