import { describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import { EVENT_BUNDLE_SCHEMA_VERSION } from '@indiafoss/model';
import { vi } from 'vitest';
import {
  catchUpLateAlerts,
  computeBlockNotifications,
  computeNotifications,
  staleNotificationIds,
  WebLocalNotificationTransport,
} from './notifications.js';

const ROOMS = [
  { id: 'audi-1', name: 'Audi 1', kind: 'room' as const, routingNodeIds: [] },
  { id: 'devroom', name: 'Devroom 1 (AOSP)', kind: 'room' as const, routingNodeIds: [] },
];

function bundle(activities: EventBundle['activities']): EventBundle {
  return {
    schemaVersion: EVENT_BUNDLE_SCHEMA_VERSION,
    id: 't',
    name: 'Test',
    timezone: 'Asia/Kolkata',
    start: '2026-09-19T09:00:00+05:30',
    end: '2026-09-20T18:00:00+05:30',
    activities,
    people: [],
    locations: ROOMS,
    booths: [],
    tracks: [],
    sourceMetadata: { source: 'test', normalizerVersion: '1' },
  };
}

const act = (
  id: string,
  start: string,
  end: string,
  overrides: Partial<EventBundle['activities'][number]> = {},
): EventBundle['activities'][number] => ({
  id,
  title: id,
  type: 'talk' as const,
  start,
  end,
  flexible: false,
  speakerIds: [],
  tags: [],
  source: 'test',
  ...overrides,
});

describe('computeNotifications', () => {
  // A long walk, so starting-soon and leave-now stay far enough apart to be
  // two separate alerts (the near case is covered by the merge test below).
  const travel = () => 900;
  const planned = () => 'planned' as const;

  it('schedules starting-soon and leave-now alerts for an upcoming session', () => {
    const b = bundle([
      act('a', '2026-09-19T11:00:00+05:30', '2026-09-19T12:00:00+05:30', {
        locationId: 'audi-1',
      }),
    ]);
    const notifications = computeNotifications(b, '2026-09-19T10:30:00+05:30', travel, planned);
    const soon = notifications.find((n) => n.id === 'soon-a');
    const leave = notifications.find((n) => n.id === 'leave-a');
    expect(soon).toBeDefined();
    expect(Date.parse(soon!.at)).toBe(Date.parse('2026-09-19T11:00:00+05:30') - 15 * 60 * 1000);
    expect(leave).toBeDefined();
    // leave = start - travel(900s) - buffer(600s)
    expect(Date.parse(leave!.at)).toBe(Date.parse('2026-09-19T11:00:00+05:30') - 1500 * 1000);
    // Every alert names the session, the room and the walk, and opens it when tapped.
    expect(soon!.title).toBe('In 15 min: a');
    expect(soon!.body).toBe('11:00 in Audi 1 · 15 min walk');
    expect(leave!.title).toBe('Leave now: a');
    expect(leave!.body).toBe('15 min walk to Audi 1 · starts 11:00');
    expect(leave!.url).toBe('/activity/a');
  });

  it('leaves the walk out when the attendee has not said where they are', () => {
    const b = bundle([
      act('a', '2026-09-19T11:00:00+05:30', '2026-09-19T12:00:00+05:30', {
        locationId: 'audi-1',
      }),
    ]);
    const notifications = computeNotifications(b, '2026-09-19T10:30:00+05:30', () => null, planned);
    expect(notifications.find((n) => n.id === 'leave-a')).toBeUndefined();
    const soon = notifications.find((n) => n.id === 'soon-a')!;
    expect(soon.body).toBe('11:00 in Audi 1');
    expect(Date.parse(soon.at)).toBe(Date.parse('2026-09-19T11:00:00+05:30') - 900 * 1000);
  });

  it('merges leave-now and starting-soon when they would land minutes apart', () => {
    const b = bundle([
      act('a', '2026-09-19T11:00:00+05:30', '2026-09-19T12:00:00+05:30', {
        locationId: 'audi-1',
      }),
    ]);
    // A two-minute walk puts leave-now at 10:48 and starting-soon at 10:45.
    const notifications = computeNotifications(b, '2026-09-19T10:00:00+05:30', () => 120, planned);
    expect(notifications.map((n) => n.id)).toEqual(['leave-a']);
    expect(notifications[0]!.body).toBe('2 min walk to Audi 1 · starts 11:00');
  });

  it('trims a very long session title so the time cue stays readable', () => {
    const long =
      'Mesquite MoCap: Democratizing Real-Time Motion Capture with Affordable, Open-Source, Networked IMU Hardware';
    const b = bundle([
      act('a', '2026-09-19T11:00:00+05:30', '2026-09-19T12:00:00+05:30', { title: long }),
    ]);
    const soon = computeNotifications(b, '2026-09-19T10:30:00+05:30', travel, planned).find(
      (n) => n.id === 'soon-a',
    )!;
    expect(soon.title.length).toBeLessThanOrEqual('In 15 min: '.length + 56);
    expect(soon.title.endsWith('…')).toBe(true);
    expect(soon.title.startsWith('In 15 min: Mesquite MoCap')).toBe(true);
  });

  it('does not schedule alerts in the past', () => {
    const b = bundle([act('a', '2026-09-19T10:30:00+05:30', '2026-09-19T11:30:00+05:30')]);
    const notifications = computeNotifications(b, '2026-09-19T10:40:00+05:30', travel, planned);
    // starting-soon at 10:15 is past; leave at 10:15 is past
    expect(notifications).toEqual([]);
  });

  it('skips cancelled sessions', () => {
    const b = bundle([
      act('a', '2026-09-19T11:00:00+05:30', '2026-09-19T12:00:00+05:30', { cancelled: true }),
    ]);
    expect(computeNotifications(b, '2026-09-19T10:30:00+05:30', travel, planned)).toEqual([]);
  });

  it('stays silent for sessions that are neither planned nor must-attend', () => {
    const b = bundle([act('a', '2026-09-19T11:00:00+05:30', '2026-09-19T12:00:00+05:30')]);
    expect(computeNotifications(b, '2026-09-19T10:30:00+05:30', travel, () => 'none')).toEqual([]);
  });

  it('adds an early heads-up and a starting-now alert for must-attend sessions', () => {
    const b = bundle([
      act('a', '2026-09-19T11:00:00+05:30', '2026-09-19T12:00:00+05:30'),
      act('b', '2026-09-19T11:00:00+05:30', '2026-09-19T12:00:00+05:30'),
    ]);
    const tier = (id: string) => (id === 'a' ? ('must-attend' as const) : ('planned' as const));
    const notifications = computeNotifications(b, '2026-09-19T10:00:00+05:30', travel, tier);
    expect(notifications.map((n) => n.id).sort()).toEqual([
      'leave-a',
      'leave-b',
      'must-a',
      'soon-a',
      'soon-b',
      'start-a',
    ]);
    const must = notifications.find((n) => n.id === 'must-a')!;
    expect(Date.parse(must.at)).toBe(Date.parse('2026-09-19T10:30:00+05:30'));
    expect(must.title).toBe('In 30 min: a');
    expect(must.body).toBe('Must attend · Starts 11:00 · 15 min walk');
    expect(notifications.find((n) => n.id === 'start-a')!.title).toBe('Starting now: a');
    expect(Date.parse(notifications.find((n) => n.id === 'start-a')!.at)).toBe(
      Date.parse('2026-09-19T11:00:00+05:30'),
    );
  });

  it("reminds about the attendee's own plan blocks and cancels what is no longer wanted", () => {
    const blocks = [
      {
        id: 'custom-1',
        label: 'Lunch with the KDE folks',
        start: '2026-09-19T11:00:00+05:30',
        locationName: 'Food Area',
      },
      { id: 'custom-2', label: 'Far away', start: '2026-09-19T15:00:00+05:30' },
    ];
    const out = computeBlockNotifications(blocks, '2026-09-19T10:30:00+05:30');
    expect(out.map((n) => n.id)).toEqual(['block-custom-1']);
    expect(Date.parse(out[0]!.at)).toBe(Date.parse('2026-09-19T10:50:00+05:30'));
    expect(out[0]!.title).toBe('In 10 min: Lunch with the KDE folks');
    expect(out[0]!.body).toBe('On your plan · Food Area · starts 11:00');
    expect(staleNotificationIds(['soon-a', 'block-custom-1', 'leave-z'], out)).toEqual([
      'soon-a',
      'leave-z',
    ]);
  });
});

describe('catching up after the page was frozen', () => {
  const now = '2026-09-19T10:08:00+05:30';
  const noWalk = () => null;

  it('delivers at once the latest alert that fell due in the last 20 minutes', () => {
    // A bookmarked 10:15 talk: "in 15 min" was due at 10:00, eight minutes ago.
    const out = computeNotifications(
      bundle([act('a', '2026-09-19T10:15:00+05:30', '2026-09-19T10:45:00+05:30')]),
      now,
      noWalk,
      () => 'planned',
    );
    expect(out.map((n) => [n.id, n.at])).toEqual([['soon-a', now]]);
  });

  it('shows only the latest late alert for a session, not the whole missed run', () => {
    // Must-attend 10:15 talk: heads-up 09:45, soon 10:00, both late; start 10:15 still ahead.
    const out = computeNotifications(
      bundle([act('a', '2026-09-19T10:15:00+05:30', '2026-09-19T10:45:00+05:30')]),
      now,
      noWalk,
      () => 'must-attend',
    );
    expect(out.map((n) => n.id).sort()).toEqual(['soon-a', 'start-a']);
    expect(out.find((n) => n.id === 'soon-a')?.at).toBe(now);
    expect(out.find((n) => n.id === 'start-a')?.at).toBe('2026-09-19T04:45:00.000Z');
  });

  it('still says "starting now" for a must-attend session that began a few minutes ago', () => {
    const out = computeNotifications(
      bundle([act('a', '2026-09-19T10:03:00+05:30', '2026-09-19T10:45:00+05:30')]),
      now,
      noWalk,
      () => 'must-attend',
    );
    expect(out.map((n) => [n.id, n.at])).toEqual([['start-a', now]]);
  });

  it('lets a session go once it is well under way or the alert is older than the grace', () => {
    const out = computeNotifications(
      bundle([
        act('old', '2026-09-19T09:50:00+05:30', '2026-09-19T10:45:00+05:30'),
        act('stale', '2026-09-19T09:56:00+05:30', '2026-09-19T10:45:00+05:30'),
      ]),
      now,
      noWalk,
      () => 'must-attend',
    );
    expect(out).toEqual([]);
  });

  it('does the same for a plan block, until the block starts', () => {
    const out = computeBlockNotifications(
      [
        { id: 'b', label: 'Booth walk', start: '2026-09-19T10:12:00+05:30' },
        { id: 'gone', label: 'Coffee', start: '2026-09-19T10:05:00+05:30' },
      ],
      now,
    );
    expect(out.map((n) => [n.id, n.at])).toEqual([['block-b', now]]);
  });

  it('keeps ahead alerts as they are and moves only the late ones', () => {
    const out = catchUpLateAlerts(
      [
        { id: 'x1', title: '', body: '', at: '2026-09-19T04:20:00.000Z', url: '/activity/x' },
        { id: 'x2', title: '', body: '', at: '2026-09-19T04:30:00.000Z', url: '/activity/x' },
        { id: 'y', title: '', body: '', at: '2026-09-19T05:00:00.000Z', url: '/activity/y' },
        { id: 'ancient', title: '', body: '', at: '2026-09-19T04:00:00.000Z', url: '/activity/z' },
      ],
      '2026-09-19T04:38:00.000Z',
      20,
    );
    expect(out.map((n) => [n.id, n.at])).toEqual([
      ['x2', '2026-09-19T04:38:00.000Z'],
      ['y', '2026-09-19T05:00:00.000Z'],
    ]);
  });
});

describe('WebLocalNotificationTransport', () => {
  it('shows a reminder once, even when a plan change re-arms it after it fired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T04:00:00.000Z'));
    // No Notification API here: the system notification fails quietly, the fire is still recorded.
    vi.stubGlobal('window', { location: { origin: 'https://example.org' } });
    const fired: string[] = [];
    const transport = new WebLocalNotificationTransport(
      { nowMs: () => Date.now(), speed: () => 1 },
      (n) => fired.push(n.id),
    );
    const alert = { id: 'soon-a', title: 't', body: 'b', at: '2026-09-19T04:01:00.000Z' };
    await transport.schedule(alert);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(fired).toEqual(['soon-a']);
    // The reconciler cancels and re-arms everything on a plan change.
    await transport.cancel(alert.id);
    await transport.schedule({ ...alert, at: '2026-09-19T04:01:00.000Z' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fired).toEqual(['soon-a']);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
