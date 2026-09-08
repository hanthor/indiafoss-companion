import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publicEventRoute, syncEvent } from './index.js';

let dir: string;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('event-sync', () => {
  it('maps event ids to public FOSS United routes', () => {
    expect(publicEventRoute('indiafoss-2026')).toBe('c/indiafoss/2026');
    expect(publicEventRoute('indiafoss-2025')).toBe('c/indiafoss/2025');
  });

  it.each(['indiafoss-2025', 'indiafoss-2026'])(
    'publishes %s and no-ops on unchanged content',
    async (eventId) => {
      dir = mkdtempSync(join(tmpdir(), 'eventsync-'));
      const m1 = await syncEvent(eventId, 'fixture', dir);
      expect(m1.revision).toBe(1);
      expect(m1.assets['event']).toMatch(/^event\.[0-9a-f]{8}\.json$/);
      expect(Object.keys(m1.assets).sort()).toEqual(['booths', 'event', 'people', 'schedule']);

      const m2 = await syncEvent(eventId, 'fixture', dir);
      expect(m2.revision).toBe(m1.revision); // unchanged -> no bump
    },
  );
});
