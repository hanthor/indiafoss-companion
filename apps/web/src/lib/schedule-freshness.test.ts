import { describe, expect, it } from 'vitest';
import {
  bundleOffset,
  describeElapsed,
  describeScheduleFreshness,
  parseSourceTimestamp,
} from './schedule-freshness';

const START = '2026-09-26T09:00:00+05:30';
const NOW = Date.parse('2026-09-11T06:00:00Z');
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

type Bundle = NonNullable<Parameters<typeof describeScheduleFreshness>[0]['bundle']>;

function bundle(sourceMetadata: Bundle['sourceMetadata']): Bundle {
  return { start: START, sourceMetadata };
}

describe('bundleOffset', () => {
  it('reads the offset the bundle publishes', () => {
    expect(bundleOffset(START)).toBe('+05:30');
    expect(bundleOffset('2026-09-26T03:30:00Z')).toBe('+00:00');
  });

  it('returns null rather than guessing a zone', () => {
    expect(bundleOffset('2026-09-26T09:00:00')).toBeNull();
    expect(bundleOffset(undefined)).toBeNull();
  });
});

describe('parseSourceTimestamp', () => {
  it('anchors an unzoned upstream timestamp to the event offset', () => {
    // 12:05 IST is 06:35 UTC; a browser-local reading would be wrong by hours.
    expect(parseSourceTimestamp('2026-09-10 12:05:56.522624', '+05:30')).toBe(
      '2026-09-10T06:35:56.522Z',
    );
  });

  it('keeps a timestamp that already carries a zone', () => {
    expect(parseSourceTimestamp('2026-09-10T06:35:56Z', '+05:30')).toBe('2026-09-10T06:35:56.000Z');
  });

  it('reports nothing usable rather than inventing an instant', () => {
    expect(parseSourceTimestamp(undefined, '+05:30')).toBeNull();
    expect(parseSourceTimestamp('2026-09-10 12:05:56', null)).toBeNull();
    expect(parseSourceTimestamp('not a date', '+05:30')).toBeNull();
  });
});

describe('describeElapsed', () => {
  it('stays coarse so it never looks more precise than it is', () => {
    expect(describeElapsed(5 * 60_000)).toBe('less than an hour ago');
    expect(describeElapsed(HOUR)).toBe('1 hour ago');
    expect(describeElapsed(5 * HOUR)).toBe('5 hours ago');
    expect(describeElapsed(DAY)).toBe('1 day ago');
    expect(describeElapsed(9 * DAY)).toBe('9 days ago');
  });
});

describe('describeScheduleFreshness', () => {
  it('calls a draft programme provisional', () => {
    const state = describeScheduleFreshness({
      bundle: bundle({
        source: 'fossunited',
        normalizerVersion: '0.2.0',
        sourceUpdatedAt: '2026-09-10 12:05:56.522624',
        scheduleStatus: 'draft',
      }),
      lastCheckedAt: NOW - HOUR,
      now: NOW,
    });
    expect(state.provisional).toBe(true);
    expect(state.statusLine).toContain('Provisional');
    expect(state.age).toBe('current');
  });

  it('says nothing about publication status when the bundle does not (2025 archive)', () => {
    const state = describeScheduleFreshness({
      bundle: bundle({
        source: 'fossunited',
        normalizerVersion: '0.1.0',
        sourceUpdatedAt: '2026-06-02 16:08:47.991809',
      }),
      lastCheckedAt: NOW - HOUR,
      now: NOW,
    });
    expect(state.provisional).toBe(false);
    expect(state.statusLine).toBeNull();
  });

  it('marks a confirmed programme', () => {
    const state = describeScheduleFreshness({
      bundle: bundle({
        source: 'fossunited',
        normalizerVersion: '0.2.0',
        sourceUpdatedAt: '2026-09-11 11:00:00',
        scheduleStatus: 'confirmed',
      }),
      lastCheckedAt: NOW - HOUR,
      now: NOW,
    });
    expect(state.provisional).toBe(false);
    expect(state.statusLine).toBe('The organisers have marked this programme final.');
  });

  it('buckets the import age from the bundle, not from the last check', () => {
    const at = (importedDaysAgo: number) =>
      describeScheduleFreshness({
        bundle: bundle({
          source: 'fossunited',
          normalizerVersion: '0.2.0',
          sourceUpdatedAt: new Date(NOW - importedDaysAgo * DAY).toISOString(),
          scheduleStatus: 'confirmed',
        }),
        lastCheckedAt: NOW - 60_000,
        now: NOW,
      }).age;
    expect(at(0)).toBe('current');
    expect(at(1)).toBe('current');
    expect(at(3)).toBe('ageing');
    expect(at(8)).toBe('stale');
  });

  it('does not present an undated import as fresh', () => {
    const state = describeScheduleFreshness({
      bundle: bundle({ source: 'fossunited', normalizerVersion: '0.2.0' }),
      lastCheckedAt: NOW,
      now: NOW,
    });
    expect(state.age).toBe('unknown');
    expect(state.importedLine).toBe('This schedule does not record when it was imported.');
  });

  it('keeps the device check separate from the age of the data', () => {
    const state = describeScheduleFreshness({
      bundle: bundle({
        source: 'fossunited',
        normalizerVersion: '0.2.0',
        sourceUpdatedAt: new Date(NOW - 30 * DAY).toISOString(),
        scheduleStatus: 'confirmed',
      }),
      lastCheckedAt: NOW - 60_000,
      now: NOW,
    });
    // A check a minute ago says nothing about a month-old import.
    expect(state.checkOverdue).toBe(false);
    expect(state.age).toBe('stale');
    expect(state.checkedLine).toContain('That is when it looked, not how old the programme is.');
  });

  it('says plainly when this device has never checked', () => {
    const state = describeScheduleFreshness({
      bundle: bundle({
        source: 'fossunited',
        normalizerVersion: '0.2.0',
        sourceUpdatedAt: new Date(NOW - HOUR).toISOString(),
        scheduleStatus: 'confirmed',
      }),
      lastCheckedAt: null,
      now: NOW,
    });
    expect(state.checkOverdue).toBe(true);
    expect(state.checkedLine).toContain('has not checked for a newer programme yet');
  });

  it('is honest before any bundle is loaded', () => {
    const state = describeScheduleFreshness({ bundle: null, lastCheckedAt: null, now: NOW });
    expect(state.age).toBe('unknown');
    expect(state.statusLine).toBeNull();
  });
});
