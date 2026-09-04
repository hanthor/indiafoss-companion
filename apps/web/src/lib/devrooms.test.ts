import { describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import { devroomTrackNames, isMainRoom, labelHeadingFor } from './devrooms';

const bundle = {
  id: 'test',
  tracks: [
    { id: 'main', name: 'Main Hall' },
    { id: 'rust', name: 'Rust' },
    { id: 'kernel', name: 'Linux Kernel' },
  ],
  activities: [
    { id: 'k1', trackId: 'main', type: 'keynote' },
    { id: 'a1', trackId: 'rust', type: 'talk' },
    { id: 'a2', trackId: 'kernel', type: 'talk' },
  ],
} as unknown as EventBundle;

describe('devrooms', () => {
  it('calls the keynote hall main and everything else a devroom', () => {
    expect(isMainRoom(bundle, bundle.tracks[0]!)).toBe(true);
    expect(isMainRoom(bundle, bundle.tracks[1]!)).toBe(false);
    expect([...devroomTrackNames(bundle).entries()]).toEqual([
      ['rust', 'Rust'],
      ['kernel', 'Linux Kernel'],
    ]);
    expect(devroomTrackNames(null).size).toBe(0);
  });

  it('heads a label with the devroom name, and with the room otherwise', () => {
    const names = devroomTrackNames(bundle);
    expect(labelHeadingFor('HALL 3', 'rust', names)).toEqual({ text: 'Rust', devroom: true });
    expect(labelHeadingFor('HALL 1', 'main', names)).toEqual({ text: 'HALL 1', devroom: false });
    expect(labelHeadingFor('HALL 1', undefined, names)).toEqual({
      text: 'HALL 1',
      devroom: false,
    });
  });
});
