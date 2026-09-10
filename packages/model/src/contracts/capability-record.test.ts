import { describe, expect, it } from 'vitest';
import type { CapabilityRecord } from './capability-record.js';
import { pinnedRevision, supportsCapability } from './capability-record.js';

const record: CapabilityRecord = {
  schemaVersion: 1,
  id: 'release-2026.09.20',
  recordedAt: '2026-09-20T18:00:00.000Z',
  components: [
    { name: 'neutrino', revision: '2a93cf0' },
    { name: 'chat-android', revision: 'dba27084' },
  ],
  claims: [
    {
      name: 'mesh.text',
      supported: true,
      level: 'topology-tested',
      topology: 'two Pixels, BLE only',
    },
    { name: 'mesh.media.voice', supported: true, level: 'host-tested' },
    { name: 'mesh.media.photo', supported: false, level: 'device-tested' },
  ],
};

describe('supportsCapability', () => {
  it('treats an unlisted capability as unavailable', () => {
    expect(supportsCapability(record, 'seam.encrypted.async')).toBe(false);
  });

  it('treats a capability recorded as not working as unavailable', () => {
    expect(supportsCapability(record, 'mesh.media.photo')).toBe(false);
  });

  it('refuses evidence weaker than the caller requires', () => {
    // A host test is not a phone. This is the distinction the contract exists
    // to keep, so the default minimum is device-tested.
    expect(supportsCapability(record, 'mesh.media.voice')).toBe(false);
    expect(supportsCapability(record, 'mesh.media.voice', 'host-tested')).toBe(true);
  });

  it('accepts evidence stronger than required', () => {
    expect(supportsCapability(record, 'mesh.text', 'host-tested')).toBe(true);
    expect(supportsCapability(record, 'mesh.text', 'topology-tested')).toBe(true);
  });
});

describe('pinnedRevision', () => {
  it('returns the recorded revision', () => {
    expect(pinnedRevision(record, 'neutrino')).toBe('2a93cf0');
  });

  it('returns undefined for a component the record does not pin', () => {
    expect(pinnedRevision(record, 'spindle')).toBeUndefined();
  });
});
