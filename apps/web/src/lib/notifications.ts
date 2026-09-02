import type { EventBundle } from '@indiafoss/model';
import { leaveByInstant } from '@indiafoss/schedule';

/**
 * Local notifications (§37). Delivery is abstracted behind a transport so the
 * web and Android builds can differ while the app logic stays identical.
 * Phase 1 = local notifications only — no push dependency (F-Droid safe).
 */

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  /** ISO instant at which the notification should fire. */
  at: string;
}

export interface NotificationTransport {
  requestPermission(): Promise<boolean>;
  schedule(notification: AppNotification): Promise<void>;
  cancel(id: string): Promise<void>;
}

/**
 * Web implementation: uses the Notification API and a short-lived timer for
 * delivery. Pending notifications are re-armed on load (kept in settings).
 */
export class WebLocalNotificationTransport implements NotificationTransport {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  async requestPermission(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  async schedule(notification: AppNotification): Promise<void> {
    const delay = Date.parse(notification.at) - Date.now();
    this.cancel(notification.id);
    const timer = setTimeout(
      () => {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(notification.title, { body: notification.body });
        }
        this.timers.delete(notification.id);
      },
      Math.max(0, delay),
    );
    this.timers.set(notification.id, timer);
  }

  async cancel(id: string): Promise<void> {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
}

/** Stable 31-bit id for the native scheduler from the string notification id. */
export function numericNotificationId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash) || 1;
}

/**
 * Android transport: `@capacitor/local-notifications` schedules through the
 * system alarm manager, so reminders fire even when the WebView is gone.
 * Imported lazily; the PWA bundle never loads it.
 */
export class NativeLocalNotificationTransport implements NotificationTransport {
  private plugin: Promise<typeof import('@capacitor/local-notifications')> | null = null;

  private load() {
    this.plugin ??= import('@capacitor/local-notifications');
    return this.plugin;
  }

  async requestPermission(): Promise<boolean> {
    const { LocalNotifications } = await this.load();
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  }

  async schedule(notification: AppNotification): Promise<void> {
    const { LocalNotifications } = await this.load();
    const at = new Date(notification.at);
    if (at.getTime() <= Date.now()) return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: numericNotificationId(notification.id),
          title: notification.title,
          body: notification.body,
          schedule: { at, allowWhileIdle: true },
          extra: { id: notification.id },
        },
      ],
    });
  }

  async cancel(id: string): Promise<void> {
    const { LocalNotifications } = await this.load();
    await LocalNotifications.cancel({ notifications: [{ id: numericNotificationId(id) }] });
  }
}

export interface NotificationWindow {
  /** Fire a 'starting soon' alert this many minutes before the session. */
  startingSoonMinutes: number;
  /** Fire a 'leave now' alert this many minutes before it becomes critical. */
  leaveBufferMinutes: number;
}

export const DEFAULT_NOTIFICATION_WINDOW: NotificationWindow = {
  startingSoonMinutes: 15,
  leaveBufferMinutes: 10,
};

/**
 * Compute the local notifications the app should have armed for `now`.
 * Pure and testable — returns notifications whose fire time is in the
 * future but within the lookahead window.
 */
export function computeNotifications(
  bundle: EventBundle,
  now: string,
  travelSecondsFor: (locationId: string | undefined) => number,
  window: NotificationWindow = DEFAULT_NOTIFICATION_WINDOW,
): AppNotification[] {
  const nowMs = Date.parse(now);
  const lookaheadMs = 60 * 60_000;
  const out: AppNotification[] = [];

  for (const activity of bundle.activities) {
    if (activity.cancelled || !activity.start || !activity.end) continue;
    const startMs = Date.parse(activity.start);
    if (startMs < nowMs || startMs > nowMs + lookaheadMs) continue;

    const startingSoonAt = startMs - window.startingSoonMinutes * 60_000;
    if (startingSoonAt > nowMs) {
      out.push({
        id: `soon-${activity.id}`,
        title: 'Starting soon',
        body: `${activity.title} begins in ${window.startingSoonMinutes} min.`,
        at: new Date(startingSoonAt).toISOString(),
      });
    }

    const travel = travelSecondsFor(activity.locationId);
    const leaveAtMs = Date.parse(
      leaveByInstant(activity.start, travel, window.leaveBufferMinutes * 60),
    );
    if (leaveAtMs > nowMs) {
      out.push({
        id: `leave-${activity.id}`,
        title: 'Leave now',
        body: `Walk to ${activity.title} (${Math.round(travel / 60)} min).`,
        at: new Date(leaveAtMs).toISOString(),
      });
    }
  }
  return out;
}
