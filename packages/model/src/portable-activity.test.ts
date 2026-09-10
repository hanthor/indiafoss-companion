import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolvePortableActivity, type PortableActivityReference } from './portable-activity.js';

const cases = JSON.parse(
  readFileSync(
    new URL('../../test-fixtures/fixtures/portable-activity-resolution.json', import.meta.url),
    'utf8',
  ),
) as {
  name: string;
  reference: PortableActivityReference;
  eventId: string;
  activities: { id: string; proposalId?: string }[];
  expected: unknown;
}[];

describe('portable activity identity (shared with native)', () => {
  for (const scenario of cases)
    it(scenario.name, () => {
      expect(
        resolvePortableActivity(scenario.reference, scenario.eventId, scenario.activities),
      ).toEqual(scenario.expected);
    });
});
