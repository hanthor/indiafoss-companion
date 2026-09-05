import { describe, expect, it } from 'vitest';
import type { Activity, EventBundle } from '@indiafoss/model';
import { roomSummary } from './roomInfo';

const bundle = { id: 'test', people: [], tracks: [], activities: [] } as unknown as EventBundle;

const session = (id: string, type: string): Activity =>
  ({ id, trackId: 't', type, speakerIds: [] }) as unknown as Activity;

describe('roomSummary counts', () => {
  it('calls talks talks', () => {
    expect(roomSummary(bundle, [session('a', 'talk'), session('b', 'lightning-talk')]).line).toBe(
      '2 talks',
    );
    expect(roomSummary(bundle, [session('a', 'talk')]).line).toBe('1 talk');
  });

  it('does not call a room full of BoFs a room full of talks', () => {
    // The word is what an attendee decides on: a BoF asks them to take part,
    // a talk does not. At IndiaFOSS 2025 the six BoFs sit in a bare
    // "Devroom 2" and the "Food Area", so the count was the only signal
    // either row carried — and it said "talks" (#132).
    const bofs = [session('a', 'bof'), session('b', 'bof'), session('c', 'bof')];
    expect(roomSummary(bundle, bofs).line).toBe('3 BoFs');
    expect(roomSummary(bundle, [session('a', 'bof')]).line).toBe('1 BoF');
  });

  it('falls back to the neutral word when a room mixes kinds', () => {
    // Neither "2 talks" nor "2 BoFs" would be true, and picking the majority
    // would hide whichever kind lost.
    expect(roomSummary(bundle, [session('a', 'talk'), session('b', 'bof')]).line).toBe(
      '2 sessions',
    );
  });
});

describe('roomSummary kinds', () => {
  it('names the participatory kinds, with counts', () => {
    const mixed = [
      session('a', 'talk'),
      session('b', 'bof'),
      session('c', 'bof'),
      session('d', 'workshop'),
    ];
    expect(roomSummary(bundle, mixed).kinds).toEqual([
      { label: 'BoFs', count: 2 },
      { label: 'workshop', count: 1 },
    ]);
  });

  it('says nothing about a room that is only talks', () => {
    // A badge on every row conveys nothing; these exist to mark the exception.
    expect(roomSummary(bundle, [session('a', 'talk'), session('b', 'keynote')]).kinds).toEqual([]);
  });

  it('does not repeat what the count already said', () => {
    // An all-BoF room reads "3 BoFs"; a "3 BoFs" badge beside it is the same
    // sentence twice, and makes the exception look like emphasis.
    const bofs = [session('a', 'bof'), session('b', 'bof'), session('c', 'bof')];
    const summary = roomSummary(bundle, bofs);
    expect(summary.line).toBe('3 BoFs');
    expect(summary.kinds).toEqual([]);
  });
});
