import { describe, expect, it } from 'vitest';
import type { EventBundle } from './index.js';
import { EVENT_BUNDLE_SCHEMA_VERSION } from './index.js';
import { collectBundleIssues, isValidEventBundle } from './validation.js';

function makeBundle(overrides: Partial<EventBundle> = {}): EventBundle {
  return {
    schemaVersion: EVENT_BUNDLE_SCHEMA_VERSION,
    id: 'test-2026',
    name: 'Test Event',
    timezone: 'Asia/Kolkata',
    start: '2026-09-19T09:00:00+05:30',
    end: '2026-09-20T18:00:00+05:30',
    activities: [],
    people: [],
    locations: [],
    booths: [],
    tracks: [],
    sourceMetadata: { source: 'fixture', normalizerVersion: '0.1.0' },
    ...overrides,
  };
}

describe('collectBundleIssues', () => {
  it('accepts a minimal valid bundle', () => {
    expect(collectBundleIssues(makeBundle())).toEqual([]);
    expect(isValidEventBundle(makeBundle())).toBe(true);
  });

  it('rejects a mismatched schema version', () => {
    const issues = collectBundleIssues(makeBundle({ schemaVersion: 99 }));
    expect(issues.some((i) => i.includes('schemaVersion'))).toBe(true);
  });

  it('rejects a start after end', () => {
    const issues = collectBundleIssues(
      makeBundle({ start: '2026-09-20T18:00:00+05:30', end: '2026-09-19T09:00:00+05:30' }),
    );
    expect(issues.some((i) => i.includes('before end'))).toBe(true);
  });

  it('rejects duplicate activity ids', () => {
    const issues = collectBundleIssues(
      makeBundle({
        activities: [
          {
            id: 'a',
            type: 'talk',
            title: 'Talk A',
            flexible: false,
            speakerIds: [],
            tags: [],
            source: 'fixture',
          },
          {
            id: 'a',
            type: 'talk',
            title: 'Talk B',
            flexible: false,
            speakerIds: [],
            tags: [],
            source: 'fixture',
          },
        ],
      }),
    );
    expect(issues.some((i) => i.includes('duplicate activity id'))).toBe(true);
  });
});
