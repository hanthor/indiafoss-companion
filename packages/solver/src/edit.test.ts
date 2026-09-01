import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Activity } from '@indiafoss/model';
import {
  applyItineraryEdits,
  EMPTY_PLAN_EDITS,
  toggleInList,
  type ItineraryItem,
  type PlanEdits,
  type TravelTimeProvider,
} from './index.js';

const DAY = '2026-09-19';
const iso = (t: string) => `${DAY}T${t}:00+05:30`;

function act(id: string, start: string, end: string, locationId?: string): Activity {
  return {
    id,
    title: id,
    type: 'talk',
    start: iso(start),
    end: iso(end),
    flexible: false,
    speakerIds: [],
    tags: [],
    source: 'test',
    locationId,
  };
}

function item(activityId: string, start: string, end: string, flexible = false): ItineraryItem {
  return { activityId, start: iso(start), end: iso(end), flexible };
}

const ZERO_TRAVEL: TravelTimeProvider = { seconds: () => 0 };

function mapOf(...activities: Activity[]): Map<string, Activity> {
  return new Map(activities.map((a) => [a.id, a]));
}

describe('applyItineraryEdits', () => {
  it('returns the base plan unchanged with no edits', () => {
    const activities = mapOf(act('a', '10:00', '10:30'), act('b', '11:00', '11:30'));
    const base = [item('a', '10:00', '10:30'), item('b', '11:00', '11:30')];
    const result = applyItineraryEdits({
      base,
      edits: EMPTY_PLAN_EDITS,
      activities,
      travel: ZERO_TRAVEL,
    });
    expect(result.feasible).toBe(true);
    expect(result.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('removes an item and can restore it by dropping the removal', () => {
    const activities = mapOf(act('a', '10:00', '10:30'), act('b', '11:00', '11:30'));
    const base = [item('a', '10:00', '10:30'), item('b', '11:00', '11:30')];
    const removed = applyItineraryEdits({
      base,
      edits: { ...EMPTY_PLAN_EDITS, removed: ['a'] },
      activities,
      travel: ZERO_TRAVEL,
    });
    expect(removed.items.map((i) => i.id)).toEqual(['b']);
    // Restoring is simply clearing the removal.
    const restored = applyItineraryEdits({
      base,
      edits: EMPTY_PLAN_EDITS,
      activities,
      travel: ZERO_TRAVEL,
    });
    expect(restored.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('marks locked items', () => {
    const activities = mapOf(act('a', '10:00', '10:30'));
    const result = applyItineraryEdits({
      base: [item('a', '10:00', '10:30')],
      edits: { ...EMPTY_PLAN_EDITS, locked: ['a'] },
      activities,
      travel: ZERO_TRAVEL,
    });
    expect(result.items[0]!.locked).toBe(true);
  });

  it('replaces an item with a ranked backup', () => {
    const activities = mapOf(act('a', '10:00', '10:30'), act('alt', '10:00', '10:30'));
    const result = applyItineraryEdits({
      base: [item('a', '10:00', '10:30')],
      edits: { ...EMPTY_PLAN_EDITS, replacements: { a: 'alt' } },
      activities,
      travel: ZERO_TRAVEL,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('alt');
    expect(result.items[0]!.replacedActivityId).toBe('a');
    expect(result.items[0]!.manual).toBe(true);
  });

  it('reports a conflict for a replacement that left the schedule', () => {
    const activities = mapOf(act('a', '10:00', '10:30'));
    const result = applyItineraryEdits({
      base: [item('a', '10:00', '10:30')],
      edits: { ...EMPTY_PLAN_EDITS, replacements: { a: 'ghost' } },
      activities,
      travel: ZERO_TRAVEL,
    });
    expect(result.feasible).toBe(false);
    expect(result.conflicts[0]!.kind).toBe('unknown-activity');
  });

  it('adds a custom block and sorts it chronologically', () => {
    const activities = mapOf(act('a', '11:00', '11:30'));
    const result = applyItineraryEdits({
      base: [item('a', '11:00', '11:30')],
      edits: {
        ...EMPTY_PLAN_EDITS,
        customBlocks: [{ id: 'c1', label: 'Coffee', start: iso('10:00'), end: iso('10:20') }],
      },
      activities,
      travel: ZERO_TRAVEL,
    });
    expect(result.items.map((i) => i.id)).toEqual(['c1', 'a']);
    expect(result.items[0]!.manual).toBe(true);
  });

  it('explains an overlap instead of dropping the item', () => {
    const activities = mapOf(act('a', '10:00', '11:00'), act('b', '10:30', '11:30'));
    const result = applyItineraryEdits({
      base: [item('a', '10:00', '11:00'), item('b', '10:30', '11:30')],
      edits: EMPTY_PLAN_EDITS,
      activities,
      travel: ZERO_TRAVEL,
    });
    // Both items are still present; the plan is flagged infeasible.
    expect(result.items).toHaveLength(2);
    expect(result.feasible).toBe(false);
    expect(result.conflicts.some((c) => c.kind === 'overlap')).toBe(true);
  });

  it('explains a travel/buffer violation for adjacent located activities', () => {
    const activities = mapOf(
      act('a', '10:00', '10:30', 'room-1'),
      act('b', '10:31', '11:00', 'room-2'),
    );
    const result = applyItineraryEdits({
      base: [item('a', '10:00', '10:30'), item('b', '10:31', '11:00')],
      edits: EMPTY_PLAN_EDITS,
      activities,
      travel: { seconds: () => 600 }, // 10 min travel, only 1 min gap
    });
    expect(result.feasible).toBe(false);
    expect(result.conflicts.some((c) => c.kind === 'travel-buffer')).toBe(true);
  });

  it('flags a custom block that ends before it starts', () => {
    const result = applyItineraryEdits({
      base: [],
      edits: {
        ...EMPTY_PLAN_EDITS,
        customBlocks: [{ id: 'bad', label: 'Oops', start: iso('12:00'), end: iso('11:00') }],
      },
      activities: mapOf(),
      travel: ZERO_TRAVEL,
    });
    expect(result.conflicts.some((c) => c.kind === 'invalid-time')).toBe(true);
  });
});

describe('toggleInList', () => {
  it('adds and removes ids', () => {
    expect(toggleInList([], 'x')).toEqual(['x']);
    expect(toggleInList(['x'], 'x')).toEqual([]);
    expect(toggleInList(['a'], 'b')).toEqual(['a', 'b']);
  });
});

describe('applyItineraryEdits properties', () => {
  it('never conflicts for a well-spaced base plan with zero travel', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 8 }), (n) => {
        const activities = new Map<string, Activity>();
        const base: ItineraryItem[] = [];
        for (let i = 0; i < n; i++) {
          const startMin = i * 90; // 90-minute spaced blocks
          const s = `${String(9 + Math.floor(startMin / 60)).padStart(2, '0')}:${String(
            startMin % 60,
          ).padStart(2, '0')}`;
          const endMin = startMin + 30;
          const e = `${String(9 + Math.floor(endMin / 60)).padStart(2, '0')}:${String(
            endMin % 60,
          ).padStart(2, '0')}`;
          const id = `a${i}`;
          activities.set(id, act(id, s, e));
          base.push(item(id, s, e));
        }
        const result = applyItineraryEdits({
          base,
          edits: EMPTY_PLAN_EDITS,
          activities,
          travel: ZERO_TRAVEL,
        });
        return result.feasible && result.items.length === n;
      }),
    );
  });

  it('output items are always sorted by start time', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 600 }), { minLength: 0, maxLength: 6 }),
        (starts) => {
          const activities = new Map<string, Activity>();
          const blocks: PlanEdits['customBlocks'] = starts.map((m, i) => {
            const s = `${String(9 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
            const em = m + 10;
            const e = `${String(9 + Math.floor(em / 60)).padStart(2, '0')}:${String(em % 60).padStart(2, '0')}`;
            return { id: `c${i}`, label: `c${i}`, start: iso(s), end: iso(e) };
          });
          const result = applyItineraryEdits({
            base: [],
            edits: { ...EMPTY_PLAN_EDITS, customBlocks: blocks },
            activities,
            travel: ZERO_TRAVEL,
          });
          for (let i = 0; i < result.items.length - 1; i++) {
            if (Date.parse(result.items[i]!.start) > Date.parse(result.items[i + 1]!.start)) {
              return false;
            }
          }
          return true;
        },
      ),
    );
  });
});
