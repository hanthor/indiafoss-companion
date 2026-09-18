import { describe, expect, it } from 'vitest';
import type { EditedPlan } from '@indiafoss/solver';
import type { EventBundle } from '@indiafoss/model';
import { eventDay, metDuringLabel, nextPlannedItem, plannedItemAt } from './resolved-plan';

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

const dayTwo: EditedPlan = {
  feasible: true,
  conflicts: [],
  items: [
    {
      id: 'flex-lunch-2026-09-27',
      label: 'Lunch · food area',
      start: '2026-09-27T12:30:00+05:30',
      end: '2026-09-27T13:00:00+05:30',
      locked: false,
      flexible: true,
      manual: false,
    },
  ],
};

const bundle = {
  id: 'test',
  timezone: 'Asia/Kolkata',
  start: '2026-09-26T09:00:00+05:30',
  end: '2026-09-27T18:00:00+05:30',
  locations: [],
  activities: [
    {
      id: 'talk',
      title: 'Opening keynote',
      type: 'talk',
      start: '2026-09-26T10:00:00+05:30',
      end: '2026-09-26T10:30:00+05:30',
      speakerIds: [],
      tags: [],
      flexible: false,
      source: 't',
    },
    {
      id: 'other',
      title: 'A talk not in the plan',
      type: 'talk',
      start: '2026-09-26T11:00:00+05:30',
      end: '2026-09-26T11:30:00+05:30',
      speakerIds: [],
      tags: [],
      flexible: false,
      source: 't',
    },
    {
      id: 'day-two',
      title: 'Closing',
      type: 'talk',
      start: '2026-09-27T16:00:00+05:30',
      end: '2026-09-27T16:30:00+05:30',
      speakerIds: [],
      tags: [],
      flexible: false,
      source: 't',
    },
  ],
  people: [],
  booths: [],
  tracks: [],
} as unknown as EventBundle;
describe('resolved plan next item', () => {
  it('includes a session in progress, then a personal block, then an empty day', () => {
    expect(nextPlannedItem(plan, '2026-09-26T10:15:00+05:30')?.id).toBe('talk');
    expect(nextPlannedItem(plan, '2026-09-26T10:30:00+05:30')?.id).toBe('meeting');
    expect(nextPlannedItem(plan, '2026-09-26T11:00:00+05:30')).toBeNull();
  });
  it('does not choose an authoritative destination from a conflicting plan', () => {
    expect(nextPlannedItem({ ...plan, feasible: false }, '2026-09-26T10:15:00+05:30')).toBeNull();
  });
  it('finds the plan item under way at an instant', () => {
    expect(plannedItemAt(plan, '2026-09-26T10:15:00+05:30')?.id).toBe('talk');
    expect(plannedItemAt(plan, '2026-09-26T10:30:00+05:30')?.id).toBe('meeting');
    expect(plannedItemAt(plan, '2026-09-26T11:00:00+05:30')).toBeNull();
    expect(plannedItemAt({ ...plan, feasible: false }, '2026-09-26T10:15:00+05:30')).toBeNull();
  });
  it('describes where you met by the plan: a talk title, or a block with its day', () => {
    expect(metDuringLabel(plan, bundle, '2026-09-26T10:15:00+05:30')).toEqual({
      label: 'Opening keynote',
      activityId: 'talk',
    });
    expect(metDuringLabel(plan, bundle, '2026-09-26T10:45:00+05:30')).toEqual({
      label: 'Meet a friend, day 1',
    });
    expect(metDuringLabel(dayTwo, bundle, '2026-09-27T12:45:00+05:30')).toEqual({
      label: 'Lunch, day 2',
    });
  });
  it('falls back to the running session without a plan, and to nothing outside one', () => {
    expect(metDuringLabel(null, bundle, '2026-09-26T11:10:00+05:30')).toEqual({
      label: 'A talk not in the plan',
      activityId: 'other',
    });
    expect(metDuringLabel(plan, bundle, '2026-09-26T11:10:00+05:30')).toEqual({
      label: 'A talk not in the plan',
      activityId: 'other',
    });
    expect(metDuringLabel(plan, bundle, '2026-09-26T16:00:00+05:30')).toEqual({});
  });
  it('uses the venue date even when the instant is on the previous UTC day', () => {
    expect(eventDay('2026-09-25T20:00:00Z', 'Asia/Kolkata')).toBe('2026-09-26');
    expect(eventDay('2026-09-26T20:00:00Z', 'Asia/Kolkata')).toBe('2026-09-27');
  });
});
