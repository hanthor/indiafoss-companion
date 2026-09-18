import type { Activity, EventBundle } from '@indiafoss/model';
import { computeNowState, parseInstant } from '@indiafoss/schedule';

export interface NextUp {
  activity: Activity;
  /** Whether it came from the attendee's bookmarks rather than the programme order. */
  planned: boolean;
  /** The attendee marked it must attend: it wins over bookmarks and gets extra reminders. */
  mustAttend: boolean;
  startsInMinutes: number;
}

export interface NextUpInput {
  bundle: EventBundle;
  now: string;
  /** The attendee's bookmarked session ids; the earliest upcoming one wins. */
  bookmarked: (activityId: string) => boolean;
  /** Must-attend sessions come first, whatever else is bookmarked. */
  mustAttend?: (activityId: string) => boolean;
  /** Ignore sessions further out than this. */
  horizonMinutes?: number;
  /** When present, only upcoming entries in this resolved plan may be selected. */
  plannedIds?: ReadonlySet<string>;
}

/**
 * The one session the leave-by banner is about: the earliest upcoming
 * bookmarked session, or failing that the programme's next session, within
 * the horizon. The venue is small enough that every walk is under five
 * minutes, so the banner counts down to the start rather than to a leave-by.
 */
export function computeNextUp(input: NextUpInput): NextUp | null {
  const { bundle, now } = input;
  const nowMs = parseInstant(now);
  const horizon = (input.horizonMinutes ?? 180) * 60_000;
  const upcoming = bundle.activities
    .filter((a) => !a.cancelled && a.start && a.end && parseInstant(a.start) >= nowMs)
    .filter((a) => parseInstant(a.start!) - nowMs <= horizon)
    .sort((a, b) => parseInstant(a.start!) - parseInstant(b.start!));
  const must = input.plannedIds
    ? undefined
    : input.mustAttend
      ? upcoming.find((a) => input.mustAttend!(a.id))
      : undefined;
  const planned = input.plannedIds
    ? upcoming.find((a) => input.plannedIds!.has(a.id))
    : (must ?? upcoming.find((a) => input.bookmarked(a.id)));
  // Nothing planned: the programme's next talk. Not a break or a meal, which
  // nobody needs to be told to leave for; those still count when bookmarked.
  const activity = input.plannedIds
    ? (planned ?? null)
    : (planned ?? upcoming.find((a) => !isPause(a)) ?? computeNowState(bundle, now).next ?? null);
  if (!activity?.start || parseInstant(activity.start) - nowMs > horizon) return null;

  const startsInMinutes = Math.ceil((parseInstant(activity.start) - nowMs) / 60_000);
  return {
    activity,
    planned: !!planned,
    mustAttend: input.mustAttend?.(activity.id) ?? false,
    startsInMinutes,
  };
}

/** Breaks, meals and registration desks: never the fallback the banner nags about. */
export function isPause(activity: Activity): boolean {
  return (
    activity.type === 'meal' || /\b(break|lunch|tea|breakfast|registration)\b/i.test(activity.title)
  );
}
