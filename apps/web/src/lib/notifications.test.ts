import { describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import { EVENT_BUNDLE_SCHEMA_VERSION } from '@indiafoss/model';
import { computeNotifications } from './notifications.js';

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
    locations: [],
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
  const travel = () => 300;
  const planned = () => 'planned' as const;

  it('schedules starting-soon and leave-now alerts for an upcoming session', () => {
    const b = bundle([act('a', '2026-09-19T11:00:00+05:30', '2026-09-19T12:00:00+05:30')]);
    const notifications = computeNotifications(b, '2026-09-19T10:30:00+05:30', travel, planned);
    const soon = notifications.find((n) => n.id === 'soon-a');
    const leave = notifications.find((n) => n.id === 'leave-a');
    expect(soon).toBeDefined();
    expect(Date.parse(soon!.at)).toBe(Date.parse('2026-09-19T11:00:00+05:30') - 15 * 60 * 1000);
    expect(leave).toBeDefined();
    // leave = start - travel(300s) - buffer(600s)
    expect(Date.parse(leave!.at)).toBe(Date.parse('2026-09-19T11:00:00+05:30') - 900 * 1000);
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
    expect(must.title).toBe("Don't miss this");
    expect(Date.parse(notifications.find((n) => n.id === 'start-a')!.at)).toBe(
      Date.parse('2026-09-19T11:00:00+05:30'),
    );
  });
});
