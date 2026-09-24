import { describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import { GOING_LABEL, UP_NEXT_LABEL, goTarget, showGettingThere } from './now-page';

const bundle = {
  id: 'test',
  timezone: 'Asia/Kolkata',
  activities: [
    { id: 'a', start: '2026-09-26T08:00:00+05:30', end: '2026-09-26T09:00:00+05:30' },
    { id: 'b', start: '2026-09-27T09:00:00+05:30', end: '2026-09-27T10:00:00+05:30' },
  ],
} as unknown as EventBundle;

describe('showGettingThere', () => {
  it('shows before the event and until 10:00 on day one, in the venue time zone', () => {
    expect(showGettingThere(bundle, '2026-09-24T12:00:00+05:30')).toBe(true);
    expect(showGettingThere(bundle, '2026-09-26T09:59:00+05:30')).toBe(true);
    // 04:29 UTC is 09:59 at the venue: the phone's zone must not matter.
    expect(showGettingThere(bundle, '2026-09-26T04:29:00Z')).toBe(true);
  });

  it('hides from 10:00 on day one onwards, day two included', () => {
    expect(showGettingThere(bundle, '2026-09-26T10:00:00+05:30')).toBe(false);
    expect(showGettingThere(bundle, '2026-09-26T11:30:00+05:30')).toBe(false);
    expect(showGettingThere(bundle, '2026-09-27T08:00:00+05:30')).toBe(false);
  });
});

describe('goTarget', () => {
  const grid = new Set(['talk', 'next']);
  const base = {
    planStatus: 'ready' as const,
    planConflicted: false,
    planItemId: undefined,
    gridIds: grid,
    programmeNextId: 'next',
  };

  it('lights your plan talk as the one you are going to', () => {
    expect(goTarget({ ...base, planItemId: 'talk' })).toEqual({ id: 'talk', label: GOING_LABEL });
  });

  it('falls back to the programme, labelled as such, only when the plan has nothing left', () => {
    expect(goTarget(base)).toEqual({ id: 'next', label: UP_NEXT_LABEL });
    expect(goTarget({ ...base, planStatus: 'error' })).toEqual({
      id: 'next',
      label: UP_NEXT_LABEL,
    });
  });

  it('lights nothing while the plan loads or conflicts, or for a personal block', () => {
    expect(goTarget({ ...base, planStatus: 'loading', planItemId: 'talk' })).toBeNull();
    expect(goTarget({ ...base, planConflicted: true, planItemId: 'talk' })).toBeNull();
    // A block is not on the grid; the programme must not stand in for it.
    expect(goTarget({ ...base, planItemId: 'block-1' })).toBeNull();
  });

  it('lights nothing that the grid is not showing', () => {
    expect(goTarget({ ...base, programmeNextId: 'elsewhere' })).toBeNull();
  });
});
