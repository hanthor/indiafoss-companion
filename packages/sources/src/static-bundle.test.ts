import { describe, expect, it, vi } from 'vitest';
import type { EventReference } from '@indiafoss/model';
import { StaticBundleSource } from './static-bundle.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import * as fs from 'node:fs/promises';

const mockReadFile = vi.mocked(fs.readFile);

describe('StaticBundleSource', () => {
  describe('constructor', () => {
    it('uses default events directory', () => {
      const source = new StaticBundleSource();
      expect(source).toBeDefined();
    });

    it('accepts custom events directory', () => {
      const source = new StaticBundleSource('/custom/path');
      expect(source).toBeDefined();
    });
  });

  describe('loadBundle', () => {
    beforeEach(() => {
      mockReadFile.mockClear();
    });

    it('loads and parses event bundle from disk', async () => {
      const bundleJson = JSON.stringify({
        people: [],
        activities: [],
        locations: [],
        sessions: [],
      });
      mockReadFile.mockResolvedValue(bundleJson as any);

      const source = new StaticBundleSource('/events');
      const ref: EventReference = { id: 'event-2025', locator: 'india-foss-2025' };

      const bundle = await source.loadBundle(ref);

      expect(mockReadFile).toHaveBeenCalledWith(
        '/events/event-2025/normalized/event-bundle.json',
        'utf8',
      );
      expect(bundle).toEqual({
        people: [],
        activities: [],
        locations: [],
        sessions: [],
      });
    });

    it('constructs the correct file path from EventReference', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({}) as any);

      const source = new StaticBundleSource('/custom-events');
      await source.loadBundle({ id: 'my-event-id', locator: 'my-locator' });

      expect(mockReadFile).toHaveBeenCalledWith(
        '/custom-events/my-event-id/normalized/event-bundle.json',
        'utf8',
      );
    });

    it('rejects when the file does not exist', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'));

      const source = new StaticBundleSource();
      const ref: EventReference = { id: 'missing-event', locator: 'missing' };

      await expect(source.loadBundle(ref)).rejects.toThrow('ENOENT');
    });

    it('rejects when the file contains invalid JSON', async () => {
      mockReadFile.mockResolvedValue('not valid json' as any);

      const source = new StaticBundleSource();
      const ref: EventReference = { id: 'bad-json', locator: 'bad' };

      await expect(source.loadBundle(ref)).rejects.toThrow();
    });

    it('preserves bundle structure with all optional fields', async () => {
      const bundleJson = JSON.stringify({
        people: [{ id: 'p1', name: 'Alice' }],
        activities: [{ id: 'a1', title: 'Talk' }],
        locations: [{ id: 'l1', name: 'Hall A' }],
        rooms: [{ id: 'r1', name: 'Room 1' }],
        sessions: [{ id: 's1', title: 'Session' }],
        booths: [{ id: 'b1', name: 'Booth' }],
      });
      mockReadFile.mockResolvedValue(bundleJson as any);

      const source = new StaticBundleSource();
      const ref: EventReference = { id: 'full-event', locator: 'full' };
      const bundle = await source.loadBundle(ref);

      expect(bundle).toHaveProperty('people');
      expect(bundle).toHaveProperty('activities');
      expect(bundle).toHaveProperty('locations');
      expect(bundle).toHaveProperty('rooms');
      expect(bundle).toHaveProperty('sessions');
      expect(bundle).toHaveProperty('booths');
    });

    it('handles multiple concurrent loads', async () => {
      const bundleJson = JSON.stringify({ people: [] });
      mockReadFile.mockResolvedValue(bundleJson as any);

      const source = new StaticBundleSource();
      const ref1: EventReference = { id: 'event1', locator: 'e1' };
      const ref2: EventReference = { id: 'event2', locator: 'e2' };

      const [bundle1, bundle2] = await Promise.all([
        source.loadBundle(ref1),
        source.loadBundle(ref2),
      ]);

      expect(mockReadFile).toHaveBeenCalledTimes(2);
      expect(bundle1).toEqual({ people: [] });
      expect(bundle2).toEqual({ people: [] });
    });
  });
});
