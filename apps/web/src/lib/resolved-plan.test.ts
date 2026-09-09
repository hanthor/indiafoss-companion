import { describe, expect, it } from 'vitest';
import type { EditedPlan } from '@indiafoss/solver';
import { eventDay, nextPlannedItem } from './resolved-plan';

const plan: EditedPlan = {
  feasible: true,
  conflicts: [],
  items: [
    {
      id: 'talk',
      start: '2026-09-26T10:00:00+05:30',
      end: '2026-09-26T10:30:00+05:30',
      locked: false,
      flexible: false,
      manual: false,
    },
    {
      id: 'meeting',
      label: 'Meet a friend',
      start: '2026-09-26T10:30:00+05:30',
      end: '2026-09-26T11:00:00+05:30',
      locked: false,
      flexible: false,
      manual: true,
    },
  ],
};
describe('resolved plan next item', () => {
  it('includes a session in progress, then a personal block, then an empty day', () => {
    expect(nextPlannedItem(plan, '2026-09-26T10:15:00+05:30')?.id).toBe('talk');
    expect(nextPlannedItem(plan, '2026-09-26T10:30:00+05:30')?.id).toBe('meeting');
    expect(nextPlannedItem(plan, '2026-09-26T11:00:00+05:30')).toBeNull();
  });
  it('does not choose an authoritative destination from a conflicting plan', () => {
    expect(nextPlannedItem({ ...plan, feasible: false }, '2026-09-26T10:15:00+05:30')).toBeNull();
  });
  it('uses the venue date even when the instant is on the previous UTC day', () => {
    expect(eventDay('2026-09-25T20:00:00Z', 'Asia/Kolkata')).toBe('2026-09-26');
    expect(eventDay('2026-09-26T20:00:00Z', 'Asia/Kolkata')).toBe('2026-09-27');
  });
});
