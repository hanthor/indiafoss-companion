import { describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import {
  boothRoomLink,
  listedRooms,
  matrixToRoom,
  sessionRoomLink,
  spaceLink,
} from './element-links';

const bundle = {
  id: 'indiafoss-2025',
  name: 'IndiaFOSS 2025',
  locations: [
    { id: 'audi-1', name: 'Audi 1' },
    { id: 'audi-2', name: 'Audi 2' },
  ],
  booths: [],
  messaging: {
    homeserver: 'https://matrix.reilly.asia',
    aliasServer: 'reilly.asia',
    space: '#indiafoss:reilly.asia',
    rooms: [
      { alias: '#indiafoss-hallway:reilly.asia', name: 'Hallway' },
      { alias: '#indiafoss-2025:reilly.asia', name: 'Announcements', recommended: true },
      { alias: '#indiafoss-2025-room-audi-1:reilly.asia', name: 'Audi 1', locationId: 'audi-1' },
    ],
  },
} as unknown as EventBundle;

describe('element links', () => {
  it('builds matrix.to links', () => {
    expect(matrixToRoom('#indiafoss:reilly.asia')).toBe(
      'https://matrix.to/#/%23indiafoss%3Areilly.asia',
    );
  });

  it('lists the space and rooms, recommended first', () => {
    expect(spaceLink(bundle)?.alias).toBe('#indiafoss:reilly.asia');
    expect(listedRooms(bundle).map((r) => r.name)).toEqual(['Announcements', 'Hallway', 'Audi 1']);
  });

  it('points a session at its hall room, listed or derived', () => {
    expect(sessionRoomLink(bundle, 'a', 'audi-1')?.alias).toBe(
      '#indiafoss-2025-room-audi-1:reilly.asia',
    );
    expect(sessionRoomLink(bundle, 'a', 'audi-2')).toEqual({
      alias: '#indiafoss-2025-room-audi-2:reilly.asia',
      name: 'Audi 2',
      href: matrixToRoom('#indiafoss-2025-room-audi-2:reilly.asia'),
      recommended: false,
    });
    expect(sessionRoomLink(bundle, 'a', undefined)).toBeNull();
  });

  it('gives nothing without an organiser messaging block', () => {
    const plain = { ...bundle, messaging: undefined } as EventBundle;
    expect(spaceLink(plain)).toBeNull();
    expect(listedRooms(plain)).toEqual([]);
    expect(sessionRoomLink(plain, 'a', 'audi-1')).toBeNull();
    expect(boothRoomLink(plain, { id: 'b', name: 'B' } as never)).toBeNull();
  });

  it('sends a booth to its location room or the space', () => {
    expect(boothRoomLink(bundle, { id: 'b', name: 'B', locationId: 'audi-1' } as never)?.name).toBe(
      'Audi 1',
    );
    expect(boothRoomLink(bundle, { id: 'b', name: 'B' } as never)?.alias).toBe(
      '#indiafoss:reilly.asia',
    );
  });
});
