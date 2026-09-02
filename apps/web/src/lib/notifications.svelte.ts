import { CompanionStorage } from '@indiafoss/storage';
import {
  computeNotifications,
  NativeLocalNotificationTransport,
  WebLocalNotificationTransport,
} from '$lib/notifications';
import type { NotificationTransport, ReminderTier } from '$lib/notifications';
import { bookmarked, dispositionOf, hydratePreferences } from '$lib/prefs.svelte';
import { eventState } from '$lib/event.svelte';
import { currentLocation } from '$lib/location.svelte';
import { loadVenue, venueKeyForEvent } from '$lib/venue.svelte';
import { findRoute } from '@indiafoss/venue';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

/** Local notification preferences (§37) — off by default, on-device only. */
export const notificationsEnabled = $state<{ value: boolean }>({ value: false });

let transportPromise: Promise<NotificationTransport> | null = null;

/** Native alarms on Android, the Notification API + timers on the web. */
function getTransport(): Promise<NotificationTransport> {
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

export async function hydrateNotifications(): Promise<void> {
  const setting = await getStorage().getSetting('notifications-enabled');
  if (setting !== null) notificationsEnabled.value = setting === 'true';
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  notificationsEnabled.value = enabled;
  await getStorage().setSetting('notifications-enabled', String(enabled));
  if (enabled) await (await getTransport()).requestPermission();
}

let armedAt: string | null = null;

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

  const nowMs = Date.now();
  if (armedAt && nowMs - Date.parse(armedAt) < 30_000) return;
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
  const notifications = computeNotifications(bundle, isoNow, travelSecondsFor, tierFor);
  const transport = await getTransport();
  for (const n of notifications) await transport.schedule(n);
}
