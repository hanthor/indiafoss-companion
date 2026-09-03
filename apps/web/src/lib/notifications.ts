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
  /** Where tapping the notification should land, as an app path. */
  url?: string;
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
    /** Base path the app is served under, so a tapped notification lands in the right place. */
    private readonly basePath = '',
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
          // `tag` replaces an earlier alert for the same session instead of
          // stacking a second one; the icon is what turns a generic browser
          // notification into one the attendee recognises as this app.
          const shown = new Notification(notification.title, {
            body: notification.body,
            tag: notification.id,
            icon: `${this.basePath}/icons/icon-192.png`,
            badge: `${this.basePath}/icons/icon-192.png`,
          });
          const url = notification.url;
          if (url) {
            shown.onclick = () => {
              window.focus();
              window.location.assign(`${this.basePath}${url}`);
              shown.close();
            };
          }
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
          extra: { id: notification.id, url: notification.url },
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
  /** Where the block happens, when it has a place (a booth visit does). */
  locationName?: string;
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
      title: `In ${minutesBefore} min: ${shortTitle(block.label)}`,
      body: [`On your plan`, block.locationName, `starts ${clockTime(block.start)}`]
        .filter(Boolean)
        .join(' · '),
      at: new Date(at).toISOString(),
      url: '/plan',
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
 * A notification title has one line on a phone, and the time cue at the front
 * is what makes it scannable — so a very long session title is trimmed on a
 * word boundary rather than left for the system to cut mid-word.
 */
export const MAX_NOTIFICATION_TITLE = 56;

export function shortTitle(title: string, max = MAX_NOTIFICATION_TITLE): string {
  const trimmed = title.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const kept = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${kept.replace(/[\s,.:;–-]+$/, '')}…`;
}

/** `10:15` from an ISO instant, in the offset the instant carries. */
function clockTime(iso: string): string {
  return iso.slice(11, 16);
}

function walkText(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min walk`;
}

/**
 * Two alerts a few minutes apart saying nearly the same thing is noise, so
 * "starting soon" is dropped when "leave now" lands within this window: the
 * leave-now alert carries the walk and the start time, so it says strictly
 * more.
 */
export const MERGE_WINDOW_MINUTES = 5;

/**
 * Compute the local notifications the app should have armed for `now`.
 * Pure and testable — returns notifications whose fire time is in the
 * future but within the lookahead window.
 *
 * Every alert names the session, the room and (when the attendee's location
 * is known) the walk, because a reminder that does not say where to go is
 * only half a reminder. `travelSecondsFor` returns null when the walk cannot
 * be worked out; the leave-by time then falls back to a default allowance and
 * the body simply leaves the walk out.
 */
export function computeNotifications(
  bundle: EventBundle,
  now: string,
  travelSecondsFor: (locationId: string | undefined) => number | null,
  tierFor: (activityId: string) => ReminderTier,
  window: NotificationWindow = DEFAULT_NOTIFICATION_WINDOW,
): AppNotification[] {
  const nowMs = Date.parse(now);
  const lookaheadMs = 90 * 60_000;
  const out: AppNotification[] = [];
  const roomFor = (locationId: string | undefined): string | undefined =>
    bundle.locations.find((l) => l.id === locationId)?.name;

  for (const activity of bundle.activities) {
    if (activity.cancelled || !activity.start || !activity.end) continue;
    const tier = tierFor(activity.id);
    if (tier === 'none') continue;
    const startMs = Date.parse(activity.start);
    if (startMs < nowMs || startMs > nowMs + lookaheadMs) continue;

    const name = shortTitle(activity.title);
    const url = `/activity/${activity.id}`;
    const room = roomFor(activity.locationId);
    const travel = travelSecondsFor(activity.locationId);
    const walk = walkText(travel);
    const startsAt = clockTime(activity.start);
    /** "10:15 in Devroom 1 (AOSP) · 4 min walk", with whatever is known. */
    const whereAndWhen = [room ? `${startsAt} in ${room}` : `Starts ${startsAt}`, walk]
      .filter(Boolean)
      .join(' · ');

    if (tier === 'must-attend') {
      const headsUpAt = startMs - MUST_ATTEND_HEADS_UP_MINUTES * 60_000;
      if (headsUpAt > nowMs) {
        out.push({
          id: `must-${activity.id}`,
          title: `In ${MUST_ATTEND_HEADS_UP_MINUTES} min: ${name}`,
          body: `Must attend · ${whereAndWhen}`,
          at: new Date(headsUpAt).toISOString(),
          url,
        });
      }
      out.push({
        id: `start-${activity.id}`,
        title: `Starting now: ${name}`,
        body: [room, 'you marked it must attend'].filter(Boolean).join(' · '),
        at: new Date(startMs).toISOString(),
        url,
      });
    }

    const startingSoonAt = startMs - window.startingSoonMinutes * 60_000;
    const leaveAtMs = Date.parse(
      leaveByInstant(activity.start, travel ?? 300, window.leaveBufferMinutes * 60),
    );
    const bothAhead = startingSoonAt > nowMs && leaveAtMs > nowMs;
    const merged =
      bothAhead && Math.abs(leaveAtMs - startingSoonAt) <= MERGE_WINDOW_MINUTES * 60_000;

    if (startingSoonAt > nowMs && !merged) {
      out.push({
        id: `soon-${activity.id}`,
        title: `In ${window.startingSoonMinutes} min: ${name}`,
        body: whereAndWhen,
        at: new Date(startingSoonAt).toISOString(),
        url,
      });
    }

    if (leaveAtMs > nowMs) {
      out.push({
        id: `leave-${activity.id}`,
        title: `Leave now: ${name}`,
        body: [walk ? `${walk} to ${room ?? 'the room'}` : room, `starts ${startsAt}`]
          .filter(Boolean)
          .join(' · '),
        at: new Date(leaveAtMs).toISOString(),
        url,
      });
    }
  }
  return out;
}
