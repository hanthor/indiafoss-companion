import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '@indiafoss/sources';
import type { EventBundle, MessagingConfig } from '@indiafoss/model';
import { collectConferenceDirectoryIssues } from '@indiafoss/model/contracts';
import { buildConferenceDirectory } from './directory.js';

const messaging: MessagingConfig = {
  homeserver: 'https://matrix.example.org',
  aliasServer: 'example.org',
  aliasPrefix: 'demo-2026',
  rooms: [
    { alias: '#demo-2026:example.org', name: 'Demo 2026', purpose: 'Announcements' },
    { alias: '#demo-2026-room-hall-1:example.org', name: 'Hall 1', locationId: 'hall-1' },
  ],
};

function aBundle(overrides: Partial<EventBundle> = {}): EventBundle {
  return {
    id: 'demo-2026',
    name: 'Demo 2026',
    activities: [],
    locations: [
      { id: 'hall-1', name: 'Hall 1' },
      { id: 'hall-2', name: 'Hall 2' },
    ],
    messaging,
    ...overrides,
  } as EventBundle;
}

const AT = '2026-09-17T10:00:00.000Z';

describe('buildConferenceDirectory', () => {
  it('derives a directory that validates, one entry per authored and per-location room', () => {
    const directory = buildConferenceDirectory(aBundle(), AT)!;
    expect(collectConferenceDirectoryIssues(directory)).toEqual([]);
    expect(directory.server).toBe('example.org');
    expect(directory.rooms.map((r) => r.alias)).toEqual([
      '#demo-2026:example.org',
      '#demo-2026-room-hall-1:example.org',
      '#demo-2026-room-hall-2:example.org',
    ]);
    // Defaults are the honest ones: never federated, never invite-only by accident.
    expect(directory.rooms.every((r) => r.route === 'classic' && r.visibility === 'public')).toBe(
      true,
    );
    expect(directory.rooms[1]).toMatchObject({ id: 'hall-1', locationId: 'hall-1' });
  });

  it('is null without a messaging block', () => {
    expect(buildConferenceDirectory(aBundle({ messaging: undefined }), AT)).toBeNull();
  });

  it('fails the publish on a dangling location or activity id', () => {
    const dangling = aBundle({
      messaging: {
        ...messaging,
        rooms: [{ alias: '#x:example.org', name: 'X', locationId: 'nowhere' }],
      },
    });
    expect(() => buildConferenceDirectory(dangling, AT)).toThrow(/unknown location: nowhere/);
    const ghost = aBundle({
      messaging: {
        ...messaging,
        rooms: [{ alias: '#x:example.org', name: 'X', activityId: 'act-ghost' }],
      },
    });
    expect(() => buildConferenceDirectory(ghost, AT)).toThrow(/unknown activity: act-ghost/);
  });

  it('rejects two entries that resolve to the same alias through the contract', () => {
    const directory = buildConferenceDirectory(aBundle(), AT)!;
    directory.rooms[2]!.alias = directory.rooms[1]!.alias;
    expect(collectConferenceDirectoryIssues(directory).join('\n')).toContain(
      'duplicate room alias id',
    );
  });

  it('is byte-identical for the same input', () => {
    const a = JSON.stringify(buildConferenceDirectory(aBundle(), AT));
    const b = JSON.stringify(buildConferenceDirectory(aBundle(), AT));
    expect(a).toBe(b);
  });
});

describe('published directories on disk', () => {
  const eventsDir = repoRoot('events');
  for (const eventId of readdirSync(eventsDir)) {
    const manifestPath = join(eventsDir, eventId, 'published', 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      assets: Record<string, string>;
    };
    const asset = manifest.assets['directory'];
    if (!asset) continue;
    it(`validates events/${eventId}/published/${asset}`, () => {
      const directory: unknown = JSON.parse(
        readFileSync(join(eventsDir, eventId, 'published', asset), 'utf8'),
      );
      expect(collectConferenceDirectoryIssues(directory)).toEqual([]);
    });
  }
  it('runs even when no event publishes a directory yet', () => {
    expect(existsSync(eventsDir)).toBe(true);
  });
});
