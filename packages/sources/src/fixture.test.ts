import { describe, expect, it } from 'vitest';
import { isValidEventBundle } from '@indiafoss/model';
import { FixtureSource } from './fixture.js';

const source = new FixtureSource();
const REF = { id: 'indiafoss-2025', locator: 'c/indiafoss/2025' };

describe('IndiaFOSS 2025 fixture integration', () => {
  it('normalizes the real 2025 event without network', async () => {
    const fetched = await source.fetchEvent(REF);
    expect(fetched.kind).toBe('fossunited');
    const bundle = await source.normalize(fetched);

    expect(bundle.id).toBe('indiafoss-2025');
    expect(bundle.name).toBe('IndiaFOSS 2025');
    expect(bundle.timezone).toBe('Asia/Kolkata');
    expect(bundle.start).toBe('2025-09-20T09:00:00+05:30');
    expect(bundle.end).toBe('2025-09-21T17:00:00+05:30');
  });

  it('loads a structurally valid bundle', async () => {
    const bundle = await source.loadRef(REF);
    expect(isValidEventBundle(bundle)).toBe(true);
  });

  it('contains the expected programme volume', async () => {
    const bundle = await source.loadRef(REF);
    expect(bundle.activities.length).toBe(131);
    expect(bundle.locations.length).toBeGreaterThanOrEqual(11);
    expect(bundle.people.length).toBeGreaterThan(100);
    expect(bundle.tracks.length).toBe(bundle.locations.length);
  });

  it('contains the known NIMHANS rooms and devrooms', async () => {
    const bundle = await source.loadRef(REF);
    const names = bundle.locations.map((l) => l.name);
    for (const expected of ['Audi 1', 'Audi 2', 'Devroom 2', 'Workshops Room', 'Food Area']) {
      expect(names).toContain(expected);
    }
    const devrooms = bundle.locations.filter((l) => l.name.toLowerCase().startsWith('devroom'));
    expect(devrooms.length).toBeGreaterThanOrEqual(6);
  });

  it('has up to four concurrent programme streams', async () => {
    const bundle = await source.loadRef(REF);
    const byStart = new Map<string, number>();
    for (const a of bundle.activities) {
      if (!a.start) continue;
      byStart.set(a.start, (byStart.get(a.start) ?? 0) + 1);
    }
    const maxConcurrent = Math.max(...byStart.values());
    expect(maxConcurrent).toBeGreaterThanOrEqual(4);
  });

  it('produces no temporal overlaps within an activity and consistent ids', async () => {
    const bundle = await source.loadRef(REF);
    const ids = new Set<string>();
    for (const a of bundle.activities) {
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
      expect(a.start).toBeTruthy();
      expect(a.end).toBeTruthy();
      if (a.start && a.end) {
        expect(Date.parse(a.start)).toBeLessThan(Date.parse(a.end));
      }
      if (a.locationId) {
        const loc = bundle.locations.find((l) => l.id === a.locationId);
        expect(loc, `activity ${a.id} points at missing location ${a.locationId}`).toBeDefined();
      }
    }
  });

  it('links speakers by id', async () => {
    const bundle = await source.loadRef(REF);
    const peopleIds = new Set(bundle.people.map((p) => p.id));
    for (const a of bundle.activities) {
      for (const sid of a.speakerIds) {
        expect(peopleIds.has(sid), `activity ${a.id} references missing speaker ${sid}`).toBe(true);
      }
    }
  });
});

describe('StaticBundleSource', () => {
  it('loads the committed normalized bundle', async () => {
    const { StaticBundleSource } = await import('./static-bundle.js');
    const staticSource = new StaticBundleSource();
    const bundle = await staticSource.loadBundle(REF);
    expect(bundle.id).toBe('indiafoss-2025');
    expect(isValidEventBundle(bundle)).toBe(true);
    expect(bundle.activities.length).toBe(131);
  });
});
