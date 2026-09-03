import { FixedClock } from '@indiafoss/schedule';
import type { Clock } from '@indiafoss/schedule';
import { appClock } from '$lib/simulator.svelte';

/**
 * Build the app clock from URL parameters (§13):
 *   ?event=indiafoss-2025&now=2025-09-20T10:45:00+05:30          fixed developer time
 *   ?now=2025-09-20T09:00:00+05:30&speed=100                     start the day simulator (#93)
 * Without them, the app clock is used: the running simulator when one is
 * active, wall-clock time otherwise. Playwright drives time-travel and the
 * simulator through these parameters. The layout starts the run for a
 * `speed` parameter (a state write, so not from here, which runs in deriveds);
 * this only decides which clock to hand back.
 */
export function clockFromParams(nowParam: string | null, speedParam?: string | null): Clock {
  if (nowParam && simulationSpeed(speedParam) !== null) return appClock();
  return nowParam ? new FixedClock(nowParam) : appClock();
}

/** The `speed` URL parameter as a positive number, or null when absent or invalid. */
export function simulationSpeed(speedParam: string | null | undefined): number | null {
  if (!speedParam) return null;
  const speed = Number(speedParam);
  return Number.isFinite(speed) && speed > 0 ? speed : null;
}

export function isFixedClock(clock: Clock): boolean {
  return clock instanceof FixedClock;
}
