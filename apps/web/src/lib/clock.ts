import { FixedClock, SystemClock } from '@indiafoss/schedule';
import type { Clock } from '@indiafoss/schedule';

/**
 * Build the app clock from the `now` URL parameter (§13):
 *   ?event=indiafoss-2025&now=2025-09-20T10:45:00+05:30
 * Without it, wall-clock time is used. Playwright drives time-travel through
 * this parameter.
 */
export function clockFromParams(nowParam: string | null): Clock {
  return nowParam ? new FixedClock(nowParam) : SystemClock;
}

export function isFixedClock(clock: Clock): boolean {
  return clock instanceof FixedClock;
}
