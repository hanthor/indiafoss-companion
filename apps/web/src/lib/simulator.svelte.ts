import { browser } from '$app/environment';
import { RunningClock, SystemClock, formatInstant, offsetMinutesOf } from '@indiafoss/schedule';
import type { Clock } from '@indiafoss/schedule';

/**
 * Conference-day simulator (#93). Runs the whole app on a clock that starts
 * at a chosen moment of the event and advances at a multiple of real time, so
 * every screen, the leave-by banner and every reminder behave as they would
 * on the day — in minutes instead of hours. Nothing about the attendee's own
 * data changes: bookmarks, ratings and contacts are the real ones.
 *
 * The run lives in `sessionStorage`, so it survives navigation and a reload
 * of the tab and ends when the tab closes. A log of everything the app did
 * (reminders fired, the banner changing, the screens visited) is kept for the
 * strip at the top and for automation through `window.__indiafossSim`.
 */

export const SIM_SPEEDS = [10, 60, 100, 600] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];

export interface SimRun {
  /** ISO instant (event offset) the run started or was last resumed from. */
  start: string;
  /** Multiple of real time; 0 while paused. */
  speed: number;
  /** `Date.now()` when `start` was the simulated time. */
  anchor: number;
  /** Speed to return to after a pause. */
  resumeSpeed: number;
}

export type SimEventKind =
  'started' | 'stopped' | 'paused' | 'resumed' | 'notification' | 'banner' | 'screen';

export interface SimEvent {
  /** Simulated instant the event happened at. */
  simAt: string;
  /** Real wall-clock instant, for pacing analysis. */
  realAt: string;
  kind: SimEventKind;
  title: string;
  body?: string;
}

const STORAGE_KEY = 'indiafoss-sim';
const LOG_KEY = 'indiafoss-sim-log';
const LOG_LIMIT = 500;

export const simState = $state<{ run: SimRun | null; log: SimEvent[]; hydrated: boolean }>({
  run: null,
  log: [],
  hydrated: false,
});

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or quota: the run just does not survive a reload */
  }
}

/**
 * Read the saved run once, at module load: this must never run from inside a
 * `$derived`, which is where `appClock()` is mostly called from, and Svelte
 * (rightly) refuses state writes there.
 */
export function hydrateSimulator(): void {
  if (!browser || simState.hydrated) return;
  simState.run = read<SimRun>(STORAGE_KEY);
  simState.log = read<SimEvent[]>(LOG_KEY) ?? [];
  simState.hydrated = true;
  installAutomationHook();
}

export function simActive(): boolean {
  return simState.run !== null;
}

let cached: { key: string; clock: RunningClock } | null = null;

/** The clock the app runs on: the simulator's when a run is active, else real time. */
export function appClock(): Clock {
  const run = simState.run;
  if (!run) return SystemClock;
  const key = `${run.start}|${run.speed}|${run.anchor}`;
  if (cached?.key !== key) {
    cached = { key, clock: new RunningClock(run.start, run.speed, run.anchor) };
  }
  return cached.clock;
}

export function appNow(): string {
  return appClock().now();
}

export function appNowMs(): number {
  const clock = appClock();
  return clock instanceof RunningClock ? clock.nowMs() : Date.now();
}

/** Current speed multiplier (1 on the real clock, 0 while paused). */
export function appSpeed(): number {
  return simState.run ? simState.run.speed : 1;
}

/**
 * Real milliseconds between refreshes for something that wants to update
 * every `simMs` of app time: faster while simulating, never below 250 ms.
 */
export function tickInterval(simMs: number): number {
  const speed = appSpeed();
  if (speed <= 1) return simMs;
  return Math.max(250, Math.round(simMs / speed));
}

function nowIso(): string {
  return new Date().toISOString();
}

export function logSimEvent(kind: SimEventKind, title: string, body?: string): void {
  if (!simState.run && kind !== 'stopped') return;
  const event: SimEvent = { simAt: appNow(), realAt: nowIso(), kind, title, body };
  simState.log = [...simState.log.slice(-(LOG_LIMIT - 1)), event];
  write(LOG_KEY, simState.log);
}

/** Start (or restart) a run at `start`, running `speed` times faster than real time. */
export function startSimulation(start: string, speed: number): void {
  const run: SimRun = { start, speed, anchor: Date.now(), resumeSpeed: speed || 60 };
  simState.run = run;
  simState.log = [];
  write(STORAGE_KEY, run);
  write(LOG_KEY, simState.log);
  logSimEvent('started', `Simulation started at ${speed}×`, start);
}

/** Start from a URL: `?now=<iso>&speed=<n>`; a run with the same parameters keeps going. */
export function startSimulationFromParams(now: string, speed: number): void {
  const run = simState.run;
  if (run && run.start === now && (run.speed === speed || run.resumeSpeed === speed)) return;
  startSimulation(now, speed);
}

export function pauseSimulation(): void {
  const run = simState.run;
  if (!run || run.speed === 0) return;
  const now = appNow();
  logSimEvent('paused', 'Paused');
  simState.run = { start: now, speed: 0, anchor: Date.now(), resumeSpeed: run.speed };
  write(STORAGE_KEY, simState.run);
}

export function resumeSimulation(): void {
  const run = simState.run;
  if (!run || run.speed !== 0) return;
  simState.run = { ...run, speed: run.resumeSpeed, anchor: Date.now() };
  write(STORAGE_KEY, simState.run);
  logSimEvent('resumed', `Resumed at ${run.resumeSpeed}×`);
}

export function stopSimulation(): void {
  if (!simState.run) return;
  logSimEvent('stopped', 'Simulation stopped');
  simState.run = null;
  write(STORAGE_KEY, null);
  // A `?now=&speed=` link started it; a reload must not start it again.
  if (browser) {
    // One-off rewrite of the address bar; nothing reactive.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const url = new URL(location.href);
    if (url.searchParams.has('speed')) {
      url.searchParams.delete('speed');
      url.searchParams.delete('now');
      history.replaceState(history.state, '', url);
    }
  }
}

/** "Sat 20 Sep · 10:42" for the strip. */
export function formatSimTime(iso: string): string {
  // One-off formatting of a plain string; nothing reactive.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const day = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  const weekday = day.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return `${weekday} ${+iso.slice(8, 10)} · ${iso.slice(11, 16)}`;
}

/** The start of a day in the event's offset: `dayStart('2025-09-20', '08:30', '+05:30')`. */
export function dayStart(day: string, hhmm: string, sampleIso: string): string {
  const offset = offsetMinutesOf(sampleIso);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return formatInstant(Date.parse(`${day}T${hhmm}:00${tz}`), offset);
}

/**
 * Automation hook (#93): Playwright, or an agent driving Playwright, reads the
 * run and its log here and can start, pause and stop runs without the UI.
 */
export interface SimAutomation {
  state(): { run: SimRun | null; now: string | null; speed: number };
  log(): SimEvent[];
  start(startIso: string, speed: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

declare global {
  interface Window {
    __indiafossSim?: SimAutomation;
  }
}

function installAutomationHook(): void {
  if (!browser || window.__indiafossSim) return;
  window.__indiafossSim = {
    state: () => ({
      run: simState.run ? { ...simState.run } : null,
      now: simState.run ? appNow() : null,
      speed: appSpeed(),
    }),
    log: () => simState.log.map((e) => ({ ...e })),
    start: startSimulation,
    pause: pauseSimulation,
    resume: resumeSimulation,
    stop: stopSimulation,
  };
}

hydrateSimulator();
