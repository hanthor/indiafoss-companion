import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { collectBundleIssues, type EventBundle } from '@indiafoss/model';
import { FixtureSource, repoRoot } from './fixture.js';

const bundle = JSON.parse(
  readFileSync(repoRoot('events/indiafoss-2026/normalized/event-bundle.json'), 'utf8'),
) as EventBundle;
const venue = JSON.parse(
  readFileSync(repoRoot('events/indiafoss-2026/venue/venue.metadata.json'), 'utf8'),
) as { locations: Record<string, unknown> };
function scheduleIssues(value: EventBundle): string[] {
  const issues = collectBundleIssues(value);
  for (const a of value.activities) {
    if (a.scheduleNote && a.start?.startsWith('2026-09-27') && !a.end) continue;
    const days =
      a.type === 'workshop'
        ? ['2026-09-25', '2026-09-26', '2026-09-27']
        : ['2026-09-26', '2026-09-27'];
    if (
      !a.start ||
      !a.end ||
      !days.includes(a.start.slice(0, 10)) ||
      !days.includes(a.end.slice(0, 10)) ||
      !a.start.endsWith('+05:30') ||
      !a.end.endsWith('+05:30') ||
      Date.parse(a.end) <= Date.parse(a.start)
    )
      issues.push(`invalid time: ${a.id}`);
    if (
      !a.locationId ||
      !venue.locations[a.locationId] ||
      !value.locations.some((l) => l.id === a.locationId)
    )
      issues.push(`unmapped room: ${a.id}`);
  }
  return issues;
}

describe('published IndiaFOSS 2026 draft', () => {
  it('contains actual dates, stable IDs, mapped physical rooms and an explicit draft label', () => {
    expect(bundle.id).toBe('indiafoss-2026');
    expect(bundle.sourceMetadata.scheduleStatus).toBe('draft');
    expect(bundle.activities.length).toBeGreaterThan(0);
    expect(scheduleIssues(bundle)).toEqual([]);
  });
  it('rejects a stale year or an invented room', () => {
    const wrongDate = structuredClone(bundle);
    wrongDate.activities[0]!.start = '2025-09-20T08:00:00+05:30';
    expect(scheduleIssues(wrongDate).some((i) => i.startsWith('invalid time'))).toBe(true);
    const wrongRoom = structuredClone(bundle);
    wrongRoom.activities[0]!.locationId = 'invented';
    expect(scheduleIssues(wrongRoom).some((i) => i.startsWith('unmapped room'))).toBe(true);
  });
  it('reproduces the programme from captured public inputs', async () => {
    const normalized = await new FixtureSource().loadRef({ id: 'indiafoss-2026', locator: '' });
    expect(normalized.activities).toEqual(bundle.activities);
    expect(normalized.tracks).toEqual(bundle.tracks);
  });
  it('separates morning and afternoon programmes occupying Room 1', () => {
    const docs = bundle.activities.filter(
      (a) => a.trackId === 'devroom-documentation-technical-writing',
    );
    const android = bundle.activities.filter(
      (a) => a.trackId === 'devroom-android-open-source-project-aosp',
    );
    expect(docs.length).toBeGreaterThan(0);
    expect(android.length).toBeGreaterThan(0);
    expect(new Set([...docs, ...android].map((a) => a.locationId))).toEqual(new Set(['room-1']));
    expect(docs.some((a) => a.title.startsWith('Devroom Intro:'))).toBe(true);
    expect(android.some((a) => a.title.startsWith('Devroom Intro:'))).toBe(true);
    expect(bundle.tracks.filter((t) => t.id.startsWith('devroom-'))).toHaveLength(8);
  });
});
