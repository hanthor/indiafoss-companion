import { describe, expect, it } from 'vitest';
import type { Activity, EventBundle } from '@indiafoss/model';
import { EVENT_BUNDLE_SCHEMA_VERSION } from '@indiafoss/model';
import {
  activityProgress,
  computeNowState,
  FixedClock,
  formatDayLabel,
  formatTime,
  getEventDays,
  groupByStart,
  isBefore,
  SystemClock,
} from './index.js';

function act(
  overrides: Partial<Activity> & { id: string; title: string; start: string; end: string },
): Activity {
  return {
    type: 'talk',
    flexible: false,
    speakerIds: [],
    tags: [],
    source: 'test',
    ...overrides,
  };
}

function bundle(activities: Activity[]): EventBundle {
  return {
    schemaVersion: EVENT_BUNDLE_SCHEMA_VERSION,
    id: 't',
    name: 'Test',
    timezone: 'Asia/Kolkata',
    start: '2026-09-19T09:00:00+05:30',
    end: '2026-09-20T18:00:00+05:30',
    activities,
    people: [],
    locations: [],
    booths: [],
    tracks: [],
    sourceMetadata: { source: 'test', normalizerVersion: '1' },
  };
}

const D1 = '2026-09-19T';
const D2 = '2026-09-20T';

describe('clock', () => {
  it('system clock returns an ISO instant', () => {
    expect(Date.parse(SystemClock.now())).not.toBeNaN();
  });
  it('fixed clock returns its value', () => {
    expect(new FixedClock('2026-09-19T10:00:00+05:30').now()).toBe('2026-09-19T10:00:00+05:30');
  });
  it('compares mixed offsets via epoch', () => {
    // 09:00+05:30 == 03:30Z
    expect(isBefore('2026-09-19T09:00:00+05:30', '2026-09-19T04:00:00Z')).toBe(true);
    expect(isBefore('2026-09-19T09:00:00+05:30', '2026-09-19T03:00:00Z')).toBe(false);
  });
});

describe('getEventDays', () => {
  it('returns sorted distinct days in event timezone', () => {
    const days = getEventDays(
      bundle([
        act({ id: 'a', title: 'A', start: `${D2}10:00:00+05:30`, end: `${D2}11:00:00+05:30` }),
        act({ id: 'b', title: 'B', start: `${D1}09:00:00+05:30`, end: `${D1}10:00:00+05:30` }),
      ]),
    );
    expect(days).toEqual(['2026-09-19', '2026-09-20']);
  });
});

describe('groupByStart', () => {
  it('groups concurrent sessions and sorts by start', () => {
    const groups = groupByStart([
      act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
      act({ id: 'b', title: 'B', start: `${D1}10:00:00+05:30`, end: `${D1}10:30:00+05:30` }),
      act({ id: 'c', title: 'C', start: `${D1}09:00:00+05:30`, end: `${D1}09:30:00+05:30` }),
    ]);
    expect(groups.map((g) => g.start)).toEqual([`${D1}09:00:00+05:30`, `${D1}10:00:00+05:30`]);
    expect(groups[1]?.activities.map((a) => a.id).sort()).toEqual(['a', 'b']);
  });
});

describe('activityProgress', () => {
  const a = act({
    id: 'a',
    title: 'A',
    start: `${D1}10:00:00+05:30`,
    end: `${D1}11:00:00+05:30`,
  });
  it('is 0 before, 0.5 mid, 1 after', () => {
    expect(activityProgress(a, `${D1}09:59:00+05:30`)).toBe(0);
    expect(activityProgress(a, `${D1}10:30:00+05:30`)).toBeCloseTo(0.5, 5);
    expect(activityProgress(a, `${D1}12:00:00+05:30`)).toBe(1);
  });
});

describe('computeNowState', () => {
  const b = bundle([
    act({ id: 'cur', title: 'Current', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    act({ id: 'next1', title: 'Next', start: `${D1}11:00:00+05:30`, end: `${D1}12:00:00+05:30` }),
    act({
      id: 'cancelled',
      title: 'Cancelled',
      start: `${D1}11:30:00+05:30`,
      end: `${D1}12:30:00+05:30`,
      cancelled: true,
    }),
  ]);

  it('detects the during phase and picks current + next (skipping cancelled)', () => {
    const s = computeNowState(b, `${D1}10:15:00+05:30`);
    expect(s.phase).toBe('during');
    expect(s.current.map((a) => a.id)).toEqual(['cur']);
    expect(s.next?.id).toBe('next1');
    expect(s.day).toBe('2026-09-19');
    expect(s.dayIndex).toBe(0);
  });

  it('returns before phase outside the event', () => {
    const s = computeNowState(b, '2026-09-18T10:00:00+05:30');
    expect(s.phase).toBe('before');
    expect(s.next?.id).toBe('cur');
    expect(s.day).toBeNull();
  });

  it('returns after phase past the event end', () => {
    const s = computeNowState(b, '2026-09-20T18:01:00+05:30');
    expect(s.phase).toBe('after');
    expect(s.current).toEqual([]);
  });
});

describe('formatters', () => {
  it('formats HH:MM and day labels', () => {
    expect(formatTime('2026-09-19T09:05:00+05:30')).toBe('09:05');
    expect(formatDayLabel('2026-09-20')).toBe('Sun 20 Sep');
  });
});
