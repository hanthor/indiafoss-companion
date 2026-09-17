import { describe, expect, it } from 'vitest';
import type { ConferenceDirectory } from '@indiafoss/model/contracts';
import { acceptDirectory } from './directory-accept';

const good: ConferenceDirectory = {
  schemaVersion: 1,
  eventId: 'demo-2026',
  generatedAt: '2026-09-17T10:00:00.000Z',
  server: 'example.org',
  rooms: [
    {
      id: 'main',
      name: 'Main',
      alias: '#demo:example.org',
      route: 'classic',
      visibility: 'public',
    },
  ],
};

describe('acceptDirectory keeps the last good value', () => {
  it('accepts a valid directory for the event', () => {
    expect(acceptDirectory(null, good, 'demo-2026')).toEqual(good);
  });

  it('keeps the previous directory when the candidate fails validation', () => {
    const broken = { ...good, rooms: [good.rooms[0], { ...good.rooms[0], id: 'dup' }] };
    expect(acceptDirectory(good, broken, 'demo-2026')).toBe(good);
    expect(acceptDirectory(good, { nonsense: true }, 'demo-2026')).toBe(good);
  });

  it('keeps the previous directory when the candidate belongs to another event', () => {
    expect(acceptDirectory(good, { ...good, eventId: 'other' }, 'demo-2026')).toBe(good);
  });

  it('has nothing to keep when there was nothing and the candidate is bad', () => {
    expect(acceptDirectory(null, { nonsense: true }, 'demo-2026')).toBeNull();
  });
});
