import { describe, expect, it } from 'vitest';
import { loadContactTrustFixtures, test_fixturesVersion } from './index.js';

describe('test-fixtures', () => {
  it('exports a version', () => {
    expect(test_fixturesVersion).toBe('0.1.0');
  });
});

describe('contact trust-state table (#31, #188)', () => {
  const table = loadContactTrustFixtures();

  it('has a case for every separated state the UI must show', () => {
    const names = table.cases.map((c) => c.name);
    for (const required of [
      'signed-card-signature-valid',
      'profile-confirmed',
      'profile-mismatch',
      'in-person-confirmed',
      'adversarial-someone-elses-mxid-on-a-self-signed-card',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('never expects a verified account or chat state: nothing produces one yet', () => {
    expect(table.vocabulary.chat).toEqual(['not-verified']);
    expect(table.vocabulary.account).not.toContain('verified');
    for (const c of table.cases) {
      expect(c.expect.chat).toBe('not-verified');
      expect(c.expect.account).not.toBe('verified');
      for (const [key, values] of Object.entries(table.vocabulary)) {
        const actual = c.expect[key as keyof typeof c.expect];
        for (const v of Array.isArray(actual) ? actual : [actual]) expect(values).toContain(v);
      }
    }
  });
});
