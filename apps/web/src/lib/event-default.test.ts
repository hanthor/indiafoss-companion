import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EVENT_ID } from './event-id';

/**
 * The default the web client opens on (#191). A constant naming a bundle that
 * is not published, or that carries another event's id, would leave the app
 * with no schedule at all — so both halves are asserted against what is
 * actually on disk rather than against a second copy of the same literal.
 */
describe('the default event', () => {
  const bundlePath = (id: string) =>
    fileURLToPath(new URL(`../../static/events/${id}/event-bundle.json`, import.meta.url));

  it('is the 2026 conference', () => {
    expect(DEFAULT_EVENT_ID).toBe('indiafoss-2026');
  });

  it('names a published bundle that identifies itself as that event', () => {
    const bundle = JSON.parse(readFileSync(bundlePath(DEFAULT_EVENT_ID), 'utf8')) as {
      id: string;
      activities: unknown[];
    };
    expect(bundle.id).toBe(DEFAULT_EVENT_ID);
    // A bundle with no programme in it is a default pointing at nothing.
    expect(bundle.activities.length).toBeGreaterThan(0);
  });

  it('names a manifest for the same event', () => {
    const manifest = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL(`../../static/events/${DEFAULT_EVENT_ID}/manifest.json`, import.meta.url),
        ),
        'utf8',
      ),
    ) as { eventId: string };
    expect(manifest.eventId).toBe(DEFAULT_EVENT_ID);
  });

  it('keeps the 2025 archive reachable without making it the default', () => {
    const archive = JSON.parse(readFileSync(bundlePath('indiafoss-2025'), 'utf8')) as {
      id: string;
    };
    expect(archive.id).toBe('indiafoss-2025');
    expect(archive.id).not.toBe(DEFAULT_EVENT_ID);
  });
});
