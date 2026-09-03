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

/** How the web transport tells time: real by default, the simulator's when a run is on. */
export interface TransportClock {
  /** Current app time as epoch milliseconds. */
  nowMs(): number;
  /** App milliseconds per real millisecond (1 on the real clock). */
  speed(): number;
}

export const RealTransportClock: TransportClock = { nowMs: () => Date.now(), speed: () => 1 };

/**
 * Web implementation: uses the Notification API and a short-lived timer for
 * delivery. Pending notifications are re-armed on load (kept in settings).
 * Under the day simulator the timers run on the simulated clock, so a
 * reminder due in 15 simulated minutes fires in 15 real seconds at 60×.
 */
export class WebLocalNotificationTransport implements NotificationTransport {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly clock: TransportClock = RealTransportClock,
    /** Called when a notification fires, before the system notification. */
    private readonly onFire: (notification: AppNotification) => void = () => {},
  ) {}

  async requestPermission(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  async schedule(notification: AppNotification): Promise<void> {
    const speed = this.clock.speed();
    if (speed <= 0) return; // paused: re-armed on resume
    const delay = (Date.parse(notification.at) - this.clock.nowMs()) / speed;
    this.cancel(notification.id);
    const timer = setTimeout(
      () => {
        this.timers.delete(notification.id);
        this.onFire(notification);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(notification.title, { body: notification.body });
        }
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
 * How much reminding a session gets. `must-attend` is the attendee's own
 * "do not let me miss this" tier: an early heads-up, the usual starting-soon
 * and leave-now alerts, and one more at the start. `planned` (bookmarked or
 * on the itinerary) gets starting-soon and leave-now. Everything else is
 * silent: the programme has hundreds of sessions and nobody wants them all.
 */
export type ReminderTier = 'must-attend' | 'planned' | 'none';

/** A time block the attendee put on their own plan (custom block or booth visit). */
export interface PlannedBlock {
  id: string;
  label: string;
  start: string;
}

/**
 * Reminders for the attendee's own plan blocks: one alert ten minutes before
 * each block that starts within the lookahead.
 */
export function computeBlockNotifications(
  blocks: PlannedBlock[],
  now: string,
  minutesBefore = 10,
): AppNotification[] {
  const nowMs = Date.parse(now);
  const lookaheadMs = 90 * 60_000;
  const out: AppNotification[] = [];
  for (const block of blocks) {
    const startMs = Date.parse(block.start);
    if (Number.isNaN(startMs) || startMs < nowMs || startMs > nowMs + lookaheadMs) continue;
    const at = startMs - minutesBefore * 60_000;
    if (at <= nowMs) continue;
    out.push({
      id: `block-${block.id}`,
      title: 'On your plan',
      body: `${block.label} in ${minutesBefore} min.`,
      at: new Date(at).toISOString(),
    });
  }
  return out;
}

/** Ids armed last time that are no longer wanted: cancel them (room or time changed, unbookmarked). */
export function staleNotificationIds(
  previous: Iterable<string>,
  next: AppNotification[],
): string[] {
  const keep = new Set(next.map((n) => n.id));
  return [...previous].filter((id) => !keep.has(id));
}

/** Minutes before a must-attend session for the early heads-up. */
export const MUST_ATTEND_HEADS_UP_MINUTES = 30;

/**
 * Compute the local notifications the app should have armed for `now`.
 * Pure and testable — returns notifications whose fire time is in the
 * future but within the lookahead window.
 */
export function computeNotifications(
  bundle: EventBundle,
  now: string,
  travelSecondsFor: (locationId: string | undefined) => number,
  tierFor: (activityId: string) => ReminderTier,
  window: NotificationWindow = DEFAULT_NOTIFICATION_WINDOW,
): AppNotification[] {
  const nowMs = Date.parse(now);
  const lookaheadMs = 90 * 60_000;
  const out: AppNotification[] = [];

  for (const activity of bundle.activities) {
    if (activity.cancelled || !activity.start || !activity.end) continue;
    const tier = tierFor(activity.id);
    if (tier === 'none') continue;
    const startMs = Date.parse(activity.start);
    if (startMs < nowMs || startMs > nowMs + lookaheadMs) continue;

    if (tier === 'must-attend') {
      const headsUpAt = startMs - MUST_ATTEND_HEADS_UP_MINUTES * 60_000;
      if (headsUpAt > nowMs) {
        out.push({
          id: `must-${activity.id}`,
          title: "Don't miss this",
          body: `${activity.title} starts in ${MUST_ATTEND_HEADS_UP_MINUTES} min — it's on your must-attend list.`,
          at: new Date(headsUpAt).toISOString(),
        });
      }
      out.push({
        id: `start-${activity.id}`,
        title: 'Starting now',
        body: `${activity.title} is starting. You marked it must attend.`,
        at: new Date(startMs).toISOString(),
      });
    }

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
        body: `Time to head to ${activity.title}.`,
        at: new Date(leaveAtMs).toISOString(),
      });
    }
  }
  return out;
}
