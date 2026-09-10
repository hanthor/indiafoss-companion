import { describe, expect, it } from 'vitest';
import {
  loadContactTrustFixtures,
  loadIdentityEnvelopeFixtures,
  test_fixturesVersion,
} from './index.js';

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

describe('identity envelope table (#160)', () => {
  const table = loadIdentityEnvelopeFixtures();

  it('covers the legacy, explicit-v1, unknown-shape and future-version cases', () => {
    const names = table.cases.map((c) => c.name);
    for (const required of [
      'legacy-unversioned-v1-card',
      'legacy-old-spellings',
      'explicit-v1-card',
      'unknown-mesh-shape-under-v1',
      'future-identity-version',
      'malformed-identity-version',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('never routes on a retained field and never retains a promoted one', () => {
    for (const c of table.cases) {
      const { expect: e } = c;
      for (const key of Object.keys(e.retained))
        expect(table.vocabulary.retainedKeys).toContain(key);
      for (const route of e.routes) expect(table.vocabulary.routes).toContain(route);
      if (!e.understood) {
        expect(e.meshNodeId).toBeNull();
        expect(e.matrixId).toBeNull();
        expect(e.routes).toEqual([]);
        expect(e.retained.version).toBeDefined();
      }
      if (e.retained.mesh) expect(e.meshNodeId).toBeNull();
      if (e.retained.matrix) expect(e.matrixId).toBeNull();
      if (e.routes.includes('mesh')) expect(e.meshNodeId).not.toBeNull();
      if (e.routes.includes('matrix')) expect(e.matrixId).not.toBeNull();
      // A vCard case is the cross-platform contract; every row has one.
      expect(c.vcard[0]).toBe('BEGIN:VCARD');
    }
  });
});
