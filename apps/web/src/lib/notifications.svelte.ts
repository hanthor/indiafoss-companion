import { CompanionStorage } from '@indiafoss/storage';
import { base } from '$app/paths';
import {
  computeNotifications,
  NativeLocalNotificationTransport,
  RealTransportClock,
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
import { journeyRoute } from '$lib/journey';
import { hydrateRoutingProfile, routingPrefs } from '$lib/routingPrefs.svelte';
import { appNowMs, appSpeed, logSimEvent, simActive } from '$lib/simulator.svelte';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

/** Local notification preferences (§37) — off by default, on-device only. */
export const notificationsEnabled = $state<{ value: boolean }>({ value: false });
export const reminderState = $state<{
  status: 'off' | 'requesting' | 'granted' | 'blocked' | 'unsupported' | 'dismissed' | 'error';
  testMessage: string;
}>({ status: 'off', testMessage: '' });
let preferenceGeneration = 0;

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
      base,
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
    return new WebLocalNotificationTransport(RealTransportClock, () => {}, base);
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
  if (reminderState.status === 'requesting') return;
  const generation = preferenceGeneration;
  try {
    const setting = await getStorage().getSetting('notifications-enabled');
    const permission = await (await getTransport()).permission();
    if (generation !== preferenceGeneration) return;
    notificationsEnabled.value = setting === 'true' && permission === 'granted';
    reminderState.status =
      permission === 'unsupported'
        ? 'unsupported'
        : permission === 'denied'
          ? 'blocked'
          : notificationsEnabled.value
            ? 'granted'
            : 'off';
  } catch {
    if (generation !== preferenceGeneration) return;
    notificationsEnabled.value = false;
    reminderState.status = 'error';
  }
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  if (reminderState.status === 'requesting') return;
  preferenceGeneration++;
  reminderState.testMessage = '';
  reminderState.status = enabled ? 'requesting' : 'off';
  notificationsEnabled.value = false;
  try {
    // Request first, directly from the user action; never persist success before permission.
    const transport = await getTransport();
    const granted = enabled && (await transport.requestPermission());
    const permission = await transport.permission();
    await getStorage().setSetting('notifications-enabled', String(granted));
    notificationsEnabled.value = granted;
    reminderState.status = !enabled
      ? 'off'
      : granted
        ? 'granted'
        : permission === 'unsupported'
          ? 'unsupported'
          : permission === 'denied'
            ? 'blocked'
            : 'dismissed';
    if (!granted) await disarmNotifications();
  } catch {
    notificationsEnabled.value = false;
    reminderState.status = 'error';
  }
}

/** An immediate delivery check, not proof of background or future delivery. */
export async function testReminder(): Promise<void> {
  if (!notificationsEnabled.value) return;
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      await hydrateNotifications();
      return;
    }
    const shown = new Notification('IndiaFOSS reminder test', {
      body: 'This is a test while the Companion is open.',
      tag: 'indiafoss-reminder-test',
    });
    setTimeout(() => shown.close(), 10_000);
    reminderState.testMessage =
      'Test sent to your browser. Check whether it appeared; this does not test delivery with the app closed.';
  } catch {
    reminderState.testMessage =
      'This browser could not show the test notification. Use your calendar for reminders.';
  }
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
        out.push({
          id: block.id,
          label: block.label,
          start: block.start,
          locationName: eventState.bundle?.locations.find((l) => l.id === block.locationId)?.name,
        });
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

  await hydrateRoutingProfile();
  // Resolve travel estimates from the venue graph when a location is known.
  let venue: Awaited<ReturnType<typeof loadVenue>> | null = null;
  try {
    venue = await loadVenue(venueKeyForEvent(bundle.id));
  } catch {
    venue = null;
  }
  // Null when the walk cannot be worked out (no location set, no route): the
  // alert then leaves the walk out rather than inventing five minutes.
  const travelSecondsFor = (locationId: string | undefined): number | null => {
    return (
      journeyRoute(venue, currentLocation.value, locationId, routingPrefs.profile)
        ?.durationSeconds ?? null
    );
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
