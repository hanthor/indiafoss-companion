import { describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import {
  devroomBlocks,
  devroomTrackNames,
  isMainRoom,
  labelHeadingFor,
  splitTrackName,
} from './devrooms';

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

  it('splits a CFP-style "<room> (<topic>)" name, topic first', () => {
    // Real track names from the 2025 bundle: one physical devroom hosts
    // several topics across the day, so the room is a booking, not an
    // identity — the topic is what the attendee is choosing between.
    expect(splitTrackName('Devroom 1 (FOSS in Science)')).toEqual({
      title: 'FOSS in Science',
      subtitle: 'Devroom 1',
    });
    expect(splitTrackName('Devroom 2 (Compilers)')).toEqual({
      title: 'Compilers',
      subtitle: 'Devroom 2',
    });
    // No parenthesised topic: the name stands alone, main hall or devroom.
    expect(splitTrackName('Audi 1')).toEqual({ title: 'Audi 1' });
    expect(splitTrackName('Devroom 2')).toEqual({ title: 'Devroom 2' });
    expect(splitTrackName('BoF Room')).toEqual({ title: 'BoF Room' });
  });
});

describe('devroomBlocks', () => {
  const names = new Map([
    ['aosp', 'AOSP'],
    ['docs', 'Documentation'],
  ]);
  const at = (h: number, m = 0) =>
    `2026-09-26T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`;

  it('labels each contiguous run of one devroom once, ending at its last session', () => {
    const blocks = devroomBlocks(
      [
        { devroomId: 'aosp', start: at(11), end: at(11, 30) },
        { devroomId: 'aosp', start: at(10), end: at(10, 30) },
        { devroomId: 'aosp', start: at(10, 30), end: at(11) },
        { devroomId: 'docs', start: at(14), end: at(14, 30) },
        { devroomId: 'docs', start: at(14, 30), end: at(15) },
      ],
      names,
    );
    expect(blocks).toEqual([
      { trackId: 'aosp', name: 'AOSP', start: at(10), end: at(11, 30) },
      { trackId: 'docs', name: 'Documentation', start: at(14), end: at(15) },
    ]);
  });

  it('breaks a run at a session with no devroom, and skips unnamed or untimed ones', () => {
    const blocks = devroomBlocks(
      [
        { devroomId: 'aosp', start: at(10), end: at(11) },
        { start: at(11), end: at(12) },
        { devroomId: 'aosp', start: at(12), end: at(13) },
        { devroomId: 'aosp', start: undefined, end: undefined },
        { devroomId: 'unknown', start: at(13), end: at(14) },
      ],
      names,
    );
    expect(blocks.map((b) => [b.start, b.end])).toEqual([
      [at(10), at(11)],
      [at(12), at(13)],
    ]);
  });

  it('ignores a session that only has a track, so main halls get no band', () => {
    expect(devroomBlocks([{ start: at(9), end: at(10) }], names)).toEqual([]);
  });
});
