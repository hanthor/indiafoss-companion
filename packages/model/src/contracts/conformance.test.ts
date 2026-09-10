/**
 * The cross-language conformance suite.
 *
 * Every case in `packages/test-fixtures/fixtures/index.json` is run against
 * the validator that owns its contract. A Kotlin or Swift adapter reads the
 * same index and must reach the same verdicts — that agreement is the whole
 * point of the fixture files (ADR 0009).
 *
 * Invalid cases assert on a *substring* of the issue message, so wording can
 * be improved without breaking other platforms, while still proving the
 * validator rejected the case for the intended reason rather than by accident.
 */
import type { ContractName } from '@indiafoss/test-fixtures';
import { allFixtureCases, loadFixture, loadFixtureIndex } from '@indiafoss/test-fixtures';
import { describe, expect, it } from 'vitest';
import { collectAppHandoffIssues } from './app-handoff.js';
import { collectCapabilityRecordIssues } from './capability-record.js';
import { collectConferenceDirectoryIssues } from './conference-directory.js';
import { collectContactCardIssues } from './contact-card.js';
import { collectEventManifestIssues } from './event-manifest.js';
import { collectIdentityBindingIssues } from './identity-binding.js';

import { collectPersonalDataIssues } from './personal-data.js';

const VALIDATORS: Record<ContractName, (value: unknown) => string[]> = {
  'personal-data': collectPersonalDataIssues,
  'event-manifest': collectEventManifestIssues,
  'conference-directory': collectConferenceDirectoryIssues,
  'contact-card': collectContactCardIssues,
  'identity-binding': collectIdentityBindingIssues,
  'app-handoff': collectAppHandoffIssues,
  'capability-record': collectCapabilityRecordIssues,
};

describe('contract fixtures', () => {
  const cases = allFixtureCases();

  it('covers every contract in both directions', () => {
    const index = loadFixtureIndex();
    for (const contract of Object.keys(VALIDATORS) as ContractName[]) {
      expect(index[contract]?.valid.length, `${contract} has no valid fixtures`).toBeGreaterThan(0);
      // A validator with no rejection fixtures has not been shown to reject
      // anything, which is the failure mode this assertion exists to catch.
      expect(
        index[contract]?.invalid.length,
        `${contract} has no invalid fixtures`,
      ).toBeGreaterThan(0);
    }
  });

  for (const { contract, validity, fixture } of cases) {
    const validate = VALIDATORS[contract];

    if (validity === 'valid') {
      it(`${contract}/${fixture.file} is accepted — ${fixture.describes}`, () => {
        const issues = validate(loadFixture(contract, 'valid', fixture.file));
        expect(issues).toEqual([]);
      });
    } else {
      it(`${contract}/${fixture.file} is rejected — ${fixture.describes}`, () => {
        const issues = validate(loadFixture(contract, 'invalid', fixture.file));
        expect(issues.length, 'expected at least one issue').toBeGreaterThan(0);
        expect(
          issues.some((issue) => issue.includes(fixture.expectIssue ?? '')),
          `expected an issue containing ${JSON.stringify(fixture.expectIssue)}, got ${JSON.stringify(issues)}`,
        ).toBe(true);
      });
    }
  }
});

describe('fixture index integrity', () => {
  it('gives every invalid case an expected issue substring', () => {
    for (const { contract, validity, fixture } of allFixtureCases()) {
      if (validity !== 'invalid') continue;
      expect(fixture.expectIssue, `${contract}/${fixture.file}`).toBeTruthy();
    }
  });

  it('describes every case', () => {
    for (const { contract, fixture } of allFixtureCases()) {
      expect(fixture.describes, `${contract}/${fixture.file}`).toBeTruthy();
    }
  });
});
