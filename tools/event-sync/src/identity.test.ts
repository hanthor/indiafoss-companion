import { describe, expect, it } from 'vitest';
import type { Activity, EventBundle } from '@indiafoss/model';
import { preserveActivityIds } from './identity';
const activity = (values: Partial<Activity>): Activity => ({
  id: 'old-choice',
  sourceId: 'old-row',
  source: 'fossunited',
  type: 'talk',
  title: 'Talk',
  flexible: false,
  speakerIds: [],
  tags: [],
  ...values,
});
const bundle = (activities: Activity[]) => ({ activities }) as EventBundle;

describe('CFP choice identity', () => {
  it('keeps choices when the row, title, URL, day and room change', () => {
    const old = activity({ proposalId: 'cfp-123', sourceUrl: 'https://old' });
    const next = activity({
      id: 'new-row',
      sourceId: 'recreated',
      proposalId: 'cfp-123',
      title: 'New title',
      sourceUrl: 'https://new',
      start: '2026-09-27T10:00:00+05:30',
      locationId: 'room-3',
    });
    preserveActivityIds(bundle([old]), bundle([next]));
    expect(next.id).toBe('old-choice');
  });
  it('migrates an old revision using its proposal URL', () => {
    const old = activity({ sourceUrl: 'https://fossunited.org/cfp/123' });
    const next = activity({
      id: 'new',
      sourceId: 'new-row',
      proposalId: '123',
      sourceUrl: old.sourceUrl,
    });
    preserveActivityIds(bundle([old]), bundle([next]));
    expect(next.id).toBe(old.id);
  });
  it('gives new talks CFP keys while keeping repeated occurrences distinct', () => {
    const next = bundle([activity({ sourceId: 'a', proposalId: '123' })]);
    preserveActivityIds(bundle([]), next);
    expect(next.activities[0]!.id).toBe('act-cfp-123');
    const repeated = bundle([
      activity({ id: 'a', sourceId: 'a', proposalId: '123' }),
      activity({ id: 'b', sourceId: 'b', proposalId: '123' }),
    ]);
    preserveActivityIds(bundle([]), repeated);
    expect(repeated.activities.map((a) => a.id)).toEqual(['a', 'b']);
  });
  it('keeps organiser rows when the organiser re-saves the schedule with new row names', () => {
    const schedule = 'https://fossunited.org/c/indiafoss/2026/schedule';
    const row = (values: Partial<Activity>): Activity =>
      activity({
        type: 'ceremony',
        sourceUrl: schedule,
        start: '2026-09-26T09:30:00+05:30',
        ...values,
      });
    const previous = bundle([
      row({ id: 'act-old-welcome', sourceId: 'r1', title: 'Welcome Note', locationId: 'hall-1' }),
      row({ id: 'act-old-awards', sourceId: 'r2', title: 'FOSS Awards', locationId: 'hall-1' }),
    ]);
    const next = bundle([
      row({ id: 'act-n1', sourceId: 'n1', title: 'Welcome Note', locationId: 'hall-1' }),
      row({
        id: 'act-n2',
        sourceId: 'n2',
        title: 'FOSS Awards',
        locationId: 'hall-1',
        start: '2026-09-26T17:30:00+05:30',
      }),
      row({ id: 'act-n3', sourceId: 'n3', title: 'Group Photo', locationId: 'room-1' }),
    ]);
    preserveActivityIds(previous, next);
    expect(next.activities.map((a) => a.id)).toEqual([
      'act-old-welcome',
      'act-old-awards',
      'act-n3',
    ]);
  });
  it('gives a new key to organiser rows it cannot tell apart', () => {
    const lunch = (values: Partial<Activity>): Activity =>
      activity({
        type: 'meal',
        title: 'Lunch Break',
        sourceUrl: 'https://fossunited.org/c/indiafoss/2026/schedule',
        start: '2026-09-26T13:00:00+05:30',
        locationId: 'hall-1',
        ...values,
      });
    const previous = bundle([
      lunch({ id: 'act-old-a', sourceId: 'a' }),
      lunch({ id: 'act-old-b', sourceId: 'b' }),
    ]);
    const next = bundle([lunch({ id: 'act-new-a', sourceId: 'c' })]);
    preserveActivityIds(previous, next);
    expect(next.activities[0]!.id).toBe('act-new-a');
  });
});
