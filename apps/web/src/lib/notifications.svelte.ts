import { CompanionStorage } from '@indiafoss/storage';
import { base } from '$app/paths';
import {
  computeNotifications,
  NativeLocalNotificationTransport,
  RealTransportClock,
  WebLocalNotificationTransport,
} from '$lib/notifications';
import type { NotificationTransport, PlannedBlock, ReminderTier } from '$lib/notifications';
import { computeBlockNotifications } from '$lib/notifications';
import { getEventDays } from '@indiafoss/schedule';
import { resolveSavedDayPlan } from './resolved-plan.svelte';
import { ReminderReconciler } from './reminder-reconciler';
import { dispositionOf } from '$lib/prefs.svelte';
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

const reconciler = new ReminderReconciler();

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
  await reconciler.clear();
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

/**
 * All alerts come from feasible edited plans, including removals/replacements.
 * Reconciliation cancels old timers before resolving and serialises transport writes.
 */
export async function armNotifications(): Promise<void> {
  await reconciler.replace(async () => {
    const bundle = eventState.bundle;
    if (!notificationsEnabled.value || !bundle) return null;
    await hydrateRoutingProfile();
    const plans = await Promise.all(
      getEventDays(bundle).map((day) => resolveSavedDayPlan(bundle, day)),
    );
    let venue: Awaited<ReturnType<typeof loadVenue>> | null = null;
    try {
      venue = await loadVenue(venueKeyForEvent(bundle.id));
    } catch {
      /* no invented walk */
    }
    const travelSecondsFor = (locationId: string | undefined): number | null =>
      journeyRoute(venue, currentLocation.value, locationId, routingPrefs.profile)
        ?.durationSeconds ?? null;
    const validPlans = plans.filter((p) => p.edited.feasible && p.mustAttendConflicts.length === 0);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const ids = new Set(validPlans.flatMap((p) => p.edited.items.map((item) => item.id)));
    const tierFor = (id: string): ReminderTier =>
      !ids.has(id) ? 'none' : dispositionOf(id) === 'must-attend' ? 'must-attend' : 'planned';
    const blocks: PlannedBlock[] = validPlans.flatMap((p) =>
      p.edited.items
        .filter((item) => item.manual && !bundle.activities.some((a) => a.id === item.id))
        .map((item) => ({
          id: item.id,
          label: item.label ?? 'Personal time',
          start: item.start,
          locationName: bundle.locations.find((l) => l.id === item.locationId)?.name,
        })),
    );
    // Compute at the current instant after async reads, not when they started.
    // Snapshot of this scheduling instant; no mutable Date enters reactive state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const now = new Date(appNowMs()).toISOString();
    return {
      transport: await getTransport(),
      notifications: [
        ...computeNotifications(bundle, now, travelSecondsFor, tierFor),
        ...computeBlockNotifications(blocks, now),
      ],
    };
  });
}
