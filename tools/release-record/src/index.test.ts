import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CAPABILITIES } from '@indiafoss/model';
import { collectCapabilityRecordIssues, supportsCapability } from '@indiafoss/model/contracts';
import { assertValidRecord, buildDraftRecord, readNeutrinoPin, writeRecord } from './index.js';

const pin = readNeutrinoPin();
const inputs = {
  id: 'test-record',
  recordedAt: '2026-09-17T08:00:00.000Z',
  eventId: 'indiafoss-2026',
  companionRevision: '763491e2a0455bffcec3d324f82ca92f064ce755',
  pin,
  chatRevision: 'b23e77faf5a2956dd68f061f2d71299122f4f542',
  bindingsVersion: '0.8.2-e2ee.2d85348-ble.15117e9',
  aarSha256: '26cf81315af5d9f06ee0c6a12d15578570f1a218e3191aa8406b9cd83d4fc3af',
};

describe('release-record', () => {
  it('emits exact pins from version.json and validates', () => {
    const record = buildDraftRecord(inputs);
    expect(collectCapabilityRecordIssues(record)).toEqual([]);
    expect(record.components.map((c) => c.name)).toEqual([
      'companion',
      'neutrino',
      'neutrino-iroh',
      'chat-android',
    ]);
    expect(record.components[1]!.revision).toBe(pin.neutrino.rev);
    expect(record.components[2]!.checksum).toBe(`sha256:${inputs.aarSha256}`);
  });

  it('never invents a claim: every capability starts unsupported at implemented', () => {
    const record = buildDraftRecord(inputs);
    expect(record.claims.map((c) => c.name)).toEqual(CAPABILITIES.map((c) => c.name));
    for (const claim of record.claims) {
      expect(claim.supported).toBe(false);
      expect(claim.level).toBe('implemented');
      expect(supportsCapability(record, claim.name)).toBe(false);
    }
  });

  it('refuses a branch name where a commit sha belongs', () => {
    const record = buildDraftRecord({ ...inputs, chatRevision: 'main' });
    expect(() => assertValidRecord(record)).toThrow(/revision must be a commit sha/);
  });

  it('refuses a topology claim with no topology', () => {
    const record = buildDraftRecord(inputs);
    record.claims[0] = { name: 'mesh.text', supported: true, level: 'topology-tested' };
    expect(() => assertValidRecord(record)).toThrow(
      /topology is required when level is topology-tested/,
    );
  });

  it('writes a record once and never overwrites it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-record-'));
    try {
      const path = writeRecord(buildDraftRecord(inputs), dir);
      expect(collectCapabilityRecordIssues(JSON.parse(readFileSync(path, 'utf8')))).toEqual([]);
      expect(() => writeRecord(buildDraftRecord(inputs), dir)).toThrow(/never overwritten/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
