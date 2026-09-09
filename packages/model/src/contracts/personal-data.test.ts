import { describe, expect, it } from 'vitest';
import {
  decodePersonalData,
  encodePersonalData,
  PERSONAL_DATA_MAX_BYTES,
} from './personal-data.js';

describe('personal data file codec', () => {
  it('preserves notes and unknown optional sections without interpreting or dropping them', () => {
    const original = {
      format: 'indiafoss-personal-data',
      schemaVersion: 1,
      exportedAt: '2026-09-09T00:00:00.000Z',
      events: [
        {
          eventId: 'indiafoss-2026',
          activities: [],
          sections: {
            notes: [{ activityId: 'old', body: 'ನಮಸ್ಕಾರ\nSecond line' }],
            futureSection: { nested: [1, false, null, 'unchanged'] },
          },
        },
      ],
      futureField: 'kept' + '['.repeat(1000),
    };
    const decoded = decodePersonalData(JSON.stringify(original));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('fixture rejected');
    expect(JSON.parse(encodePersonalData(decoded.data))).toEqual(original);
  });
  it('rejects malformed input and enforces a UTF-8 byte limit', () => {
    expect(decodePersonalData('{')).toEqual({
      ok: false,
      issues: ['personal data is not valid JSON'],
    });
    const huge = 'ನ'.repeat(Math.floor(PERSONAL_DATA_MAX_BYTES / 3) + 1);
    expect(huge.length).toBeLessThan(PERSONAL_DATA_MAX_BYTES);
    expect(decodePersonalData(huge)).toEqual({
      ok: false,
      issues: ['personal data exceeds the 5 MiB limit'],
    });
  });
  it('can re-export a compact valid file without expanding it past the byte limit', () => {
    const text = JSON.stringify({
      format: 'indiafoss-personal-data',
      schemaVersion: 1,
      exportedAt: '2026-09-09T00:00:00.000Z',
      events: [],
      futureSection: Array<number>(1_000_000).fill(0),
    });
    const decoded = decodePersonalData(text);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('fixture rejected');
    expect(new TextEncoder().encode(encodePersonalData(decoded.data)).byteLength).toBeLessThan(
      PERSONAL_DATA_MAX_BYTES,
    );
  });
  it('rejects excessive nesting before parsing', () => {
    expect(decodePersonalData('['.repeat(65) + '0' + ']'.repeat(65))).toEqual({
      ok: false,
      issues: ['personal data exceeds the nesting limit'],
    });
  });
  it('rejects invalid data on export rather than creating an unreadable backup', () => {
    expect(() =>
      encodePersonalData({
        format: 'indiafoss-personal-data',
        schemaVersion: 2,
        exportedAt: '2026-09-09T00:00:00.000Z',
        events: [],
      }),
    ).toThrow(/newer than/);
  });
});
