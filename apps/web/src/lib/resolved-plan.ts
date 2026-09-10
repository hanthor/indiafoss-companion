import type { EditedPlan } from '@indiafoss/solver';

/** Calendar date at the venue, independent of the phone's time zone. */
export function eventDay(now: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Conflicts must be resolved before presenting a single item as the attendee's destination. */
export function nextPlannedItem(plan: EditedPlan, now: string) {
  if (!plan.feasible) return null;
  return plan.items.find((item) => Date.parse(item.end) > Date.parse(now)) ?? null;
}
