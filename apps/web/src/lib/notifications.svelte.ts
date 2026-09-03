import { CompanionStorage } from '@indiafoss/storage';
import {
  computeNotifications,
  NativeLocalNotificationTransport,
  WebLocalNotificationTransport,
} from '$lib/notifications';
import type { NotificationTransport, PlannedBlock, ReminderTier } from '$lib/notifications';
import { computeBlockNotifications, staleNotificationIds } from '$lib/notifications';
import { getEventDays } from '@indiafoss/schedule';
import type { PlanEdits } from '@indiafoss/solver';
import { bookmarked, dispositionOf, hydratePreferences } from '$lib/prefs.svelte';
import { eventState } from '$lib/event.svelte';
import { currentLocation } from '$lib/location.svelte';
import { loadVenue, venueKeyForEvent } from '$lib/venue.svelte';
import { findRoute } from '@indiafoss/venue';
import { appNowMs, appSpeed, logSimEvent, simActive } from '$lib/simulator.svelte';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

/** Local notification preferences (§37) — off by default, on-device only. */
export const notificationsEnabled = $state<{ value: boolean }>({ value: false });

let armedAt: string | null = null;
// Bookkeeping only; nothing renders from it.
let armedIds = new Set<string>();
/** The transport those ids were armed on, so they are cancelled on the same one. */
let armedOn: NotificationTransport | null = null;

let transportPromise: Promise<NotificationTransport> | null = null;
let simulatorTransport: WebLocalNotificationTransport | null = null;

/**
 * Native alarms on Android, the Notification API + timers on the web. While
 * the day simulator runs, always the web timers on the simulated clock: a
 * system alarm set for a simulated instant would ring at the wrong real time.
 */
function getTransport(): Promise<NotificationTransport> {
  if (simActive()) {
    simulatorTransport ??= new WebLocalNotificationTransport(
      { nowMs: appNowMs, speed: appSpeed },
      (n) => logSimEvent('notification', n.title, n.body),
    );
    return Promise.resolve(simulatorTransport);
  }
  transportPromise ??= (async () => {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) return new NativeLocalNotificationTransport();
    } catch {
      /* not running under Capacitor */
    }
    return new WebLocalNotificationTransport();
  })();
  return transportPromise;
}

/** Drop everything armed so far; the next `armNotifications()` starts clean. */
export async function disarmNotifications(): Promise<void> {
  if (armedOn) for (const id of armedIds) await armedOn.cancel(id);
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  armedIds = new Set();
  armedOn = null;
  armedAt = null;
}

export async function hydrateNotifications(): Promise<void> {
  const setting = await getStorage().getSetting('notifications-enabled');
  if (setting !== null) notificationsEnabled.value = setting === 'true';
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  notificationsEnabled.value = enabled;
  await getStorage().setSetting('notifications-enabled', String(enabled));
  if (enabled) await (await getTransport()).requestPermission();
}

/** Custom blocks from every day's plan edits (stored per day, see planEdits.svelte.ts). */
async function plannedBlocks(eventId: string, days: string[]): Promise<PlannedBlock[]> {
  const out: PlannedBlock[] = [];
  for (const day of days) {
    const saved = await getStorage().getSetting(`plan-edits-${eventId}-${day}`);
    if (!saved) continue;
    try {
      const edits = JSON.parse(saved) as Partial<PlanEdits>;
      for (const block of edits.customBlocks ?? []) {
        out.push({ id: block.id, label: block.label, start: block.start });
      }
    } catch {
      /* malformed local data: no reminders for that day */
    }
  }
  return out;
}

/**
 * Arm notifications for the coming hour: compute the alerts for the current
 * event revision and hand them to the transport. Called once per minute while
 * the app is open; timers survive reload via re-arming from `now`.
 */
export async function armNotifications(): Promise<void> {
  if (!notificationsEnabled.value) return;
  const bundle = eventState.bundle;
  if (!bundle) return;

  // Resolve travel estimates from the venue graph when a location is known.
  let venue: Awaited<ReturnType<typeof loadVenue>> | null = null;
  try {
    venue = await loadVenue(venueKeyForEvent(bundle.id));
  } catch {
    venue = null;
  }
  const travelSecondsFor = (locationId: string | undefined): number => {
    if (!venue || !locationId || !currentLocation.value) return 300;
    const from = venue.metadata.locations[currentLocation.value]?.entrances[0];
    const to = venue.metadata.locations[locationId]?.entrances[0];
    if (!from || !to || from === to) return 300;
    const route = findRoute(venue.graph, from, to, 'fastest');
    return route?.durationSeconds ?? 300;
  };

  const nowMs = appNowMs();
  // Once per half minute of app time; a clock that jumped (a simulator run
  // starting) counts as due.
  if (armedAt && Math.abs(nowMs - Date.parse(armedAt)) < 30_000) return;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const isoNow = new Date(nowMs).toISOString();
  armedAt = isoNow;

  await hydratePreferences();
  const tierFor = (activityId: string): ReminderTier =>
    dispositionOf(activityId) === 'must-attend'
      ? 'must-attend'
      : bookmarked(activityId)
        ? 'planned'
        : 'none';
  const notifications = [
    ...computeNotifications(bundle, isoNow, travelSecondsFor, tierFor),
    ...computeBlockNotifications(await plannedBlocks(bundle.id, getEventDays(bundle)), isoNow),
  ];
  const transport = await getTransport();
  if (armedOn && armedOn !== transport) await disarmNotifications();
  // Time or room changes and un-bookmarking: cancel what was armed but is not wanted any more.
  for (const id of staleNotificationIds(armedIds, notifications)) await transport.cancel(id);
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  armedIds = new Set(notifications.map((n) => n.id));
  armedOn = transport;
  for (const n of notifications) await transport.schedule(n);
}
