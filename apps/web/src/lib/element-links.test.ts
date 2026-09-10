import { describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import {
  boothRoomLink,
  listedRooms,
  matrixToRoom,
  roomHandoffHref,
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

  it('leads with a matrix: URI, because matrix.to needs the internet', () => {
    // The reason this matters, measured on a handset: with the radios off a
    // `matrix.to` link lands on the browser's offline page and never reaches a
    // client, because matrix.to is a *web page* that redirects. A `matrix:`
    // URI is resolved locally by the package manager and opens the installed
    // client in airplane mode — which is the venue this app is built for.
    const room = sessionRoomLink(bundle, 'a', 'audi-1', 'Talk A');
    expect(room?.href.startsWith('matrix:')).toBe(true);
    expect(room?.webHref.startsWith('https://matrix.to/')).toBe(true);
  });

  it('falls back to matrix.to for an alias the matrix: scheme cannot express', () => {
    // Never emit a dead `matrix:` link: anything malformed still gets a URL a
    // browser can show.
    expect(roomHandoffHref('not-a-matrix-id')).toBe(matrixToRoom('not-a-matrix-id'));
  });

  it('lists the space and rooms, recommended first', () => {
    expect(spaceLink(bundle)?.alias).toBe('#indiafoss:reilly.asia');
    expect(listedRooms(bundle).map((r) => r.name)).toEqual(['Announcements', 'Hallway', 'Audi 1']);
  });

  it('points a session at its hall room, listed or derived', () => {
    expect(sessionRoomLink(bundle, 'a', 'audi-1', 'Talk A')?.alias).toBe(
      '#indiafoss-2025-room-audi-1:reilly.asia',
    );
    expect(sessionRoomLink(bundle, 'a', 'audi-2', 'Talk A')).toEqual({
      alias: '#indiafoss-2025-room-audi-2:reilly.asia',
      name: 'Audi 2',
      // `matrix:` leads: it resolves with no network, which is the venue.
      href: 'matrix:r/indiafoss-2025-room-audi-2%3Areilly.asia?action=join',
      webHref: matrixToRoom('#indiafoss-2025-room-audi-2:reilly.asia'),
      recommended: false,
    });
  });

  it('falls back to the deterministic per-session alias with no room and no location', () => {
    expect(sessionRoomLink(bundle, 'a', undefined, 'Talk A')).toEqual({
      alias: '#indiafoss-2025-session-a:reilly.asia',
      name: 'Talk A',
      href: 'matrix:r/indiafoss-2025-session-a%3Areilly.asia?action=join',
      webHref: matrixToRoom('#indiafoss-2025-session-a:reilly.asia'),
      recommended: false,
    });
  });

  it('gives nothing without an organiser messaging block — a link to nobody-s homeserver is worse than no link', () => {
    const plain = { ...bundle, messaging: undefined } as EventBundle;
    expect(spaceLink(plain)).toBeNull();
    expect(listedRooms(plain)).toEqual([]);
    expect(sessionRoomLink(plain, 'a', 'audi-1', 'Talk A')).toBeNull();
    expect(boothRoomLink(plain, { id: 'b', name: 'B' } as never)).toBeNull();
  });

  it('sends a booth to its listed location room, else its own deterministic alias', () => {
    expect(boothRoomLink(bundle, { id: 'b', name: 'B', locationId: 'audi-1' } as never)?.name).toBe(
      'Audi 1',
    );
    expect(boothRoomLink(bundle, { id: 'b', name: 'B' } as never)?.alias).toBe(
      '#indiafoss-2025-booth-b:reilly.asia',
    );
  });
});
