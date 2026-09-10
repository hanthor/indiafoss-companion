import { describe, expect, it } from 'vitest';
import type { Activity, EventBundle } from '@indiafoss/model';
import { EVENT_BUNDLE_SCHEMA_VERSION } from '@indiafoss/model';
import {
  activityProgress,
  computeNowState,
  FixedClock,
  describeChangeCount,
  describeChanges,
  diffBundles,
  formatDayLabel,
  formatTime,
  leaveByInstant,
  getEventDays,
  groupByStart,
  isBefore,
  RunningClock,
  summarizeChanges,
  SystemClock,
} from './index.js';
import type { ScheduleChangeType } from './index.js';

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

describe('leaveByInstant', () => {
  it('subtracts travel + buffer from the session start', () => {
    const leave = leaveByInstant('2026-09-19T11:00:00+05:30', 360, 300);
    expect(Date.parse(leave)).toBe(Date.parse('2026-09-19T11:00:00+05:30') - 660 * 1000);
  });

  it('keeps the session start offset so formatTime shows event-local time', () => {
    expect(leaveByInstant('2026-09-19T11:00:00+05:30', 360, 300)).toBe('2026-09-19T10:49:00+05:30');
    expect(formatTime(leaveByInstant('2026-09-19T11:00:00+05:30', 360, 300))).toBe('10:49');
    expect(leaveByInstant('2026-09-19T05:30:00Z', 0, 1800)).toBe('2026-09-19T05:00:00Z');
  });
});

describe('diffBundles', () => {
  it('detects added, cancelled, time, room, title and recording changes by stable id', () => {
    const base = bundle([
      act({ id: 'a', title: 'Talk A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    ]);
    const changed = bundle([
      {
        ...act({
          id: 'a',
          title: 'Talk A Renamed',
          start: `${D1}10:30:00+05:30`,
          end: `${D1}11:30:00+05:30`,
        }),
        locationId: 'other',
        recordingUrl: 'https://x/y.mp4',
      },
      act({ id: 'b', title: 'New Talk', start: `${D1}12:00:00+05:30`, end: `${D1}13:00:00+05:30` }),
    ]);
    const changes = diffBundles(base, changed);
    const byType = Object.fromEntries(changes.map((c) => [c.type, c.activityId]));
    expect(byType['title-changed']).toBe('a');
    expect(byType['time-changed']).toBe('a');
    expect(byType['room-changed']).toBe('a');
    expect(byType['recording-added']).toBe('a');
    expect(byType['added']).toBe('b');
  });

  it('reports removed activities as cancelled', () => {
    const base = bundle([
      act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    ]);
    const changes = diffBundles(base, bundle([]));
    expect(changes.some((c) => c.type === 'cancelled' && c.activityId === 'a')).toBe(true);
  });

  it('reports a reinstated talk, not silence — the #190 regression', () => {
    // Detecting cancellation only in the false-to-true direction made a
    // reinstatement an empty diff, which the update path read as "nothing to
    // apply". The attendee kept a cancelled talk that was back on.
    const cancelled = bundle([
      {
        ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
        cancelled: true,
      },
    ]);
    const backOn = bundle([
      {
        ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
        cancelled: false,
      },
    ]);
    expect(diffBundles(cancelled, backOn)).toEqual([
      { activityId: 'a', title: 'A', type: 'reinstated' },
    ]);
  });

  it('still reports a newly cancelled talk as cancelled', () => {
    const base = bundle([
      act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    ]);
    const off = bundle([
      {
        ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
        cancelled: true,
      },
    ]);
    expect(diffBundles(base, off)).toEqual([{ activityId: 'a', title: 'A', type: 'cancelled' }]);
  });

  it('ignores irrelevant metadata edits', () => {
    const base = bundle([
      act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    ]);
    const withTags = bundle([
      {
        ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
        tags: ['new-tag'],
      },
    ]);
    expect(diffBundles(base, withTags)).toEqual([]);
  });
});

describe('describeChangeCount', () => {
  it('reads as English for every change type, singular and plural', () => {
    // The banner used to interpolate the raw type and append an "s", giving
    // "2 room-changeds". Every type must be sayable, so a new one cannot be
    // added without a label.
    const types: ScheduleChangeType[] = [
      'added',
      'cancelled',
      'reinstated',
      'time-changed',
      'room-changed',
      'title-changed',
      'speaker-changed',
      'recording-added',
    ];
    for (const type of types) {
      expect(describeChangeCount(type, 1)).not.toContain(type);
      expect(describeChangeCount(type, 2)).not.toContain(type);
    }
    expect(describeChangeCount('room-changed', 1)).toBe('1 room change');
    expect(describeChangeCount('room-changed', 2)).toBe('2 room changes');
    expect(describeChangeCount('reinstated', 1)).toBe('1 session back on');
  });

  it('summarizes the new type alongside the others', () => {
    expect(
      summarizeChanges([
        { activityId: 'a', title: 'A', type: 'reinstated' },
        { activityId: 'b', title: 'B', type: 'reinstated' },
        { activityId: 'c', title: 'C', type: 'cancelled' },
      ]),
    ).toEqual({ reinstated: 2, cancelled: 1 });
  });
});

describe('describeChanges', () => {
  const rooms = (b: EventBundle, locations: EventBundle['locations']): EventBundle => ({
    ...b,
    locations,
  });
  const HALL_A = { id: 'hall-a', name: 'Hall A', kind: 'session' as const, routingNodeIds: [] };
  const HALL_B = { id: 'hall-b', name: 'Hall B', kind: 'session' as const, routingNodeIds: [] };

  const said = (details: { description: string }[]) => details.map((d) => d.description);

  it('says what a time was and what it now is', () => {
    const before = bundle([
      act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    ]);
    const after = bundle([
      act({ id: 'a', title: 'A', start: `${D1}10:30:00+05:30`, end: `${D1}11:30:00+05:30` }),
    ]);
    expect(said(describeChanges(before, after))).toEqual([
      'Moved from 10:00\u201311:00 to 10:30\u201311:30.',
    ]);
  });

  it('names the day only when the session moved to a different one', () => {
    const before = bundle([
      act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    ]);
    const after = bundle([
      act({ id: 'a', title: 'A', start: `${D2}10:00:00+05:30`, end: `${D2}11:00:00+05:30` }),
    ]);
    expect(said(describeChanges(before, after))).toEqual([
      'Moved from Sat 19 Sep 10:00\u201311:00 to Sun 20 Sep 10:00\u201311:00.',
    ]);
  });

  it('reports an end-only change without repeating the start as if it moved', () => {
    const before = bundle([
      act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    ]);
    const after = bundle([
      act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}10:30:00+05:30` }),
    ]);
    expect(said(describeChanges(before, after))).toEqual([
      'Moved from 10:00\u201311:00 to 10:00\u201310:30.',
    ]);
  });

  it('handles a session gaining and losing its slot', () => {
    const slotted = bundle([
      act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    ]);
    const flexible = bundle([
      {
        ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
        start: undefined,
        end: undefined,
        flexible: true,
      },
    ]);
    expect(said(describeChanges(slotted, flexible))).toEqual([
      'No longer has a time; it was Sat 19 Sep 10:00\u201311:00.',
    ]);
    expect(said(describeChanges(flexible, slotted))).toEqual([
      'Now scheduled for Sat 19 Sep 10:00\u201311:00.',
    ]);
  });

  it('names rooms, resolving the old one against the revision that named it', () => {
    // Hall A exists only in the previous bundle: the organisers dropped it
    // from the new revision's location list when they emptied it.
    const before = rooms(
      bundle([
        {
          ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
          locationId: 'hall-a',
        },
      ]),
      [HALL_A],
    );
    const after = rooms(
      bundle([
        {
          ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
          locationId: 'hall-b',
        },
      ]),
      [HALL_B],
    );
    expect(said(describeChanges(before, after))).toEqual(['Moved from Hall A to Hall B.']);
  });

  it('falls back to the raw id rather than claiming the room is unknown', () => {
    const before = bundle([
      {
        ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
        locationId: 'hall-a',
      },
    ]);
    const after = bundle([
      {
        ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
        locationId: 'hall-b',
      },
    ]);
    expect(said(describeChanges(before, after))).toEqual(['Moved from hall-a to hall-b.']);
  });

  it('says a session is gone, back on, or new', () => {
    const base = bundle([
      act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    ]);
    expect(said(describeChanges(base, bundle([])))).toEqual(['No longer on the programme.']);

    const withNew = rooms(
      bundle([
        act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
        {
          ...act({ id: 'b', title: 'B', start: `${D2}12:00:00+05:30`, end: `${D2}13:00:00+05:30` }),
          locationId: 'hall-b',
        },
      ]),
      [HALL_B],
    );
    expect(said(describeChanges(base, withNew))).toEqual([
      'New session, Sun 20 Sep 12:00\u201313:00 in Hall B.',
    ]);

    const off = bundle([
      {
        ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
        cancelled: true,
      },
    ]);
    expect(said(describeChanges(off, base))).toEqual(['Back on the programme.']);
  });

  it('names speakers on both sides of a change', () => {
    const people = [
      { id: 'p1', name: 'Asha', links: [] },
      { id: 'p2', name: 'Bimal', links: [] },
    ];
    const before: EventBundle = {
      ...bundle([
        {
          ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
          speakerIds: ['p1'],
        },
      ]),
      people,
    };
    const after: EventBundle = {
      ...bundle([
        {
          ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
          speakerIds: ['p2'],
        },
      ]),
      people,
    };
    expect(said(describeChanges(before, after))).toEqual(['Speakers changed from Asha to Bimal.']);
  });

  it('quotes the old title on a rename', () => {
    const before = bundle([
      act({ id: 'a', title: 'Old name', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    ]);
    const after = bundle([
      act({ id: 'a', title: 'New name', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    ]);
    const details = describeChanges(before, after);
    expect(details[0]!.title).toBe('New name');
    expect(details[0]!.description).toBe('Renamed from \u201cOld name\u201d.');
  });

  it('lists what costs an attendee most first', () => {
    const before = bundle([
      act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
      act({ id: 'b', title: 'B', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
      act({ id: 'c', title: 'C', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
    ]);
    const after = bundle([
      {
        ...act({
          id: 'a',
          title: 'A renamed',
          start: `${D1}10:00:00+05:30`,
          end: `${D1}11:00:00+05:30`,
        }),
      },
      {
        ...act({ id: 'b', title: 'B', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
        cancelled: true,
      },
      act({ id: 'c', title: 'C', start: `${D1}14:00:00+05:30`, end: `${D1}15:00:00+05:30` }),
    ]);
    expect(describeChanges(before, after).map((d) => d.type)).toEqual([
      'cancelled',
      'time-changed',
      'title-changed',
    ]);
  });

  it('covers every change type it can be handed, with no leftover machine wording', () => {
    // A new change type must be given wording here before it can reach the
    // notice; the fallback is the raw type, which is not a sentence.
    const types: ScheduleChangeType[] = [
      'added',
      'cancelled',
      'reinstated',
      'time-changed',
      'room-changed',
      'title-changed',
      'speaker-changed',
      'recording-added',
    ];
    const before = rooms(
      bundle([
        {
          ...act({ id: 'a', title: 'A', start: `${D1}10:00:00+05:30`, end: `${D1}11:00:00+05:30` }),
          locationId: 'hall-a',
          speakerIds: ['p1'],
        },
        act({
          id: 'gone',
          title: 'Gone',
          start: `${D1}10:00:00+05:30`,
          end: `${D1}11:00:00+05:30`,
        }),
        {
          ...act({
            id: 'back',
            title: 'Back',
            start: `${D1}10:00:00+05:30`,
            end: `${D1}11:00:00+05:30`,
          }),
          cancelled: true,
        },
      ]),
      [HALL_A, HALL_B],
    );
    const after = rooms(
      bundle([
        {
          ...act({
            id: 'a',
            title: 'A renamed',
            start: `${D1}11:00:00+05:30`,
            end: `${D1}12:00:00+05:30`,
          }),
          locationId: 'hall-b',
          speakerIds: ['p2'],
          recordingUrl: 'https://example.test/a.mp4',
        },
        act({
          id: 'back',
          title: 'Back',
          start: `${D1}10:00:00+05:30`,
          end: `${D1}11:00:00+05:30`,
        }),
        act({ id: 'new', title: 'New', start: `${D1}15:00:00+05:30`, end: `${D1}16:00:00+05:30` }),
      ]),
      [HALL_A, HALL_B],
    );
    const details = describeChanges(before, after);
    expect(new Set(details.map((d) => d.type))).toEqual(new Set(types));
    for (const detail of details) {
      expect(detail.description).not.toContain(detail.type);
      expect(detail.description).not.toContain('undefined');
      expect(detail.description).not.toContain('null');
      expect(detail.description.endsWith('.')).toBe(true);
    }
  });
});

describe('formatters', () => {
  it('formats HH:MM and day labels', () => {
    expect(formatTime('2026-09-19T09:05:00+05:30')).toBe('09:05');
    expect(formatDayLabel('2026-09-20')).toBe('Sun 20 Sep');
  });
});

describe('RunningClock', () => {
  it('advances at the given multiple of real time and keeps the event offset', () => {
    let real = 1_000_000;
    const clock = new RunningClock('2025-09-20T09:00:00+05:30', 60, real, () => real);
    expect(clock.now()).toBe('2025-09-20T09:00:00+05:30');
    real += 30_000; // 30 real seconds = 30 simulated minutes at 60x
    expect(clock.now()).toBe('2025-09-20T09:30:00+05:30');
  });

  it('stands still at speed 0 and never runs backwards', () => {
    let real = 5_000;
    const paused = new RunningClock('2025-09-20T09:00:00+05:30', 0, real, () => real);
    real += 60_000;
    expect(paused.now()).toBe('2025-09-20T09:00:00+05:30');
    const early = new RunningClock('2025-09-20T09:00:00+05:30', 10, 10_000, () => 5_000);
    expect(early.now()).toBe('2025-09-20T09:00:00+05:30');
  });
});
