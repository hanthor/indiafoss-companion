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
});
