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

  it('publishes a revision from the fixture and no-ops on unchanged content', async () => {
    dir = mkdtempSync(join(tmpdir(), 'eventsync-'));
    const m1 = await syncEvent('indiafoss-2025', 'fixture', dir);
    expect(m1.revision).toBe(1);
    expect(m1.assets['event']).toMatch(/^event\.[0-9a-f]{8}\.json$/);

    const m2 = await syncEvent('indiafoss-2025', 'fixture', dir);
    expect(m2.revision).toBe(m1.revision); // unchanged -> no bump
  });
});
