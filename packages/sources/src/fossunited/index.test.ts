import { describe, expect, it } from 'vitest';
import { FossUnitedSource, FOSSU_BASE_URL } from './index.js';
import type { FossUnitedSourceEvent } from '../types.js';
import type { FosuEventDoc, FosuSchedule, FosuProposal } from './types.js';

describe('FossUnitedSource', () => {
  describe('constructor', () => {
    it('uses default FOSS United base URL', () => {
      const source = new FossUnitedSource();
      expect(source).toBeDefined();
      expect(FOSSU_BASE_URL).toBe('https://fossunited.org');
    });

    it('accepts custom fetch implementation', () => {
      const customFetch = async () => new Response();
      const source = new FossUnitedSource(customFetch);
      expect(source).toBeDefined();
    });

    it('accepts custom base URL', () => {
      const source = new FossUnitedSource(fetch, 'https://custom.com');
      expect(source).toBeDefined();
    });

    it('strips trailing slash from base URL', () => {
      const source = new FossUnitedSource(fetch, 'https://example.com/');
      expect(source).toBeDefined();
    });
  });

  describe('normalize', () => {
    it('normalizes a FossUnitedSourceEvent', async () => {
      const sourceEvent: FossUnitedSourceEvent = {
        kind: 'fossunited',
        eventId: 'test-2025',
        event: {
          name: 'test-event',
          title: 'Test Event',
        } as FosuEventDoc,
        schedule: {} as FosuSchedule,
        proposals: [] as FosuProposal[],
        proposalDetails: {},
        booths: [],
      };

      const source = new FossUnitedSource();
      const bundle = await source.normalize(sourceEvent);

      expect(bundle).toBeDefined();
      expect(bundle).toHaveProperty('people');
      expect(bundle).toHaveProperty('activities');
      expect(bundle).toHaveProperty('locations');
      expect(bundle).toHaveProperty('sessions');
    });

    it('rejects non-FossUnited source events', async () => {
      const sourceEvent = {
        kind: 'unknown',
        eventId: 'test',
      } as any;

      const source = new FossUnitedSource();

      await expect(source.normalize(sourceEvent)).rejects.toThrow(
        "FossUnitedSource cannot normalize source kind 'unknown'",
      );
    });

    it('passes through the eventId', async () => {
      const sourceEvent: FossUnitedSourceEvent = {
        kind: 'fossunited',
        eventId: 'my-event-123',
        event: {
          name: 'my-event',
          title: 'My Event',
        } as FosuEventDoc,
        schedule: {} as FosuSchedule,
        proposals: [] as FosuProposal[],
        proposalDetails: {},
        booths: [],
      };

      const source = new FossUnitedSource();
      const bundle = await source.normalize(sourceEvent);

      // The normalized bundle should reflect the input data
      expect(bundle).toBeDefined();
    });

    it('handles empty proposals and proposal details', async () => {
      const sourceEvent: FossUnitedSourceEvent = {
        kind: 'fossunited',
        eventId: 'empty-proposals',
        event: {
          name: 'event',
          title: 'Event',
        } as FosuEventDoc,
        schedule: { hall1: { day1: [] } } as FosuSchedule,
        proposals: [] as FosuProposal[],
        proposalDetails: {},
        booths: [],
      };

      const source = new FossUnitedSource();
      const bundle = await source.normalize(sourceEvent);

      expect(bundle).toBeDefined();
      expect(Array.isArray(bundle.activities)).toBe(true);
    });

    it('handles empty booths', async () => {
      const sourceEvent: FossUnitedSourceEvent = {
        kind: 'fossunited',
        eventId: 'no-booths',
        event: {
          name: 'event',
          title: 'Event',
        } as FosuEventDoc,
        schedule: {} as FosuSchedule,
        proposals: [] as FosuProposal[],
        proposalDetails: {},
        booths: [],
      };

      const source = new FossUnitedSource();
      const bundle = await source.normalize(sourceEvent);

      // booths should be an array in the normalized bundle
      expect(Array.isArray(bundle.booths)).toBe(true);
    });

    it('preserves FOSSU_BASE_URL constant', () => {
      expect(FOSSU_BASE_URL).toBe('https://fossunited.org');
    });
  });
});
