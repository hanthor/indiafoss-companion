import { existsSync, readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '@indiafoss/test-fixtures';
import { describe, expect, it } from 'vitest';
import type { EventManifest } from './event-manifest.js';
import { collectEventManifestIssues, supersedes } from './event-manifest.js';

const base: EventManifest = {
  schemaVersion: 1,
  eventId: 'indiafoss-2026',
  revision: 3,
  generatedAt: '2026-09-01T09:00:00.000Z',
  assets: { event: 'event.683f9fc4.json' },
};

describe('supersedes', () => {
  it('accepts the first manifest a client ever sees', () => {
    expect(supersedes(base, undefined)).toBe(true);
  });

  it('accepts a higher revision', () => {
    expect(supersedes({ ...base, revision: 4 }, base)).toBe(true);
  });

  it('refuses an equal revision, so a re-sync does not churn storage', () => {
    expect(supersedes(base, base)).toBe(false);
  });

  it('refuses to roll back, so a stale cache or replay cannot downgrade a client', () => {
    expect(supersedes({ ...base, revision: 2 }, base)).toBe(false);
  });

  it('refuses a manifest for a different event', () => {
    expect(supersedes({ ...base, eventId: 'indiafoss-2025', revision: 99 }, base)).toBe(false);
  });
});

describe('published manifests on disk', () => {
  // The contract exists to describe files that already ship. If this fails,
  // either a real publish is malformed or the contract drifted from reality.
  const eventsDir = repoRoot('events');
  const manifests = existsSync(eventsDir)
    ? readdirSync(eventsDir)
        .map((eventId) => join(eventsDir, eventId, 'published', 'manifest.json'))
        .filter((path) => existsSync(path))
    : [];

  it('finds at least one published manifest to check', () => {
    expect(manifests.length).toBeGreaterThan(0);
  });

  for (const path of manifests) {
    it(`validates ${path.replace(eventsDir, 'events')}`, () => {
      const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
      expect(collectEventManifestIssues(manifest)).toEqual([]);
    });
  }
});
