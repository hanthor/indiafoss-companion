import { describe, expect, it } from 'vitest';
import { supportsCapability } from '@indiafoss/model/contracts';
import type { CapabilityRecord } from '@indiafoss/model/contracts';
import { CURRENT_RECORD, readinessRows } from './readiness';

const record: CapabilityRecord = {
  schemaVersion: 1,
  id: 'test',
  recordedAt: '2026-09-17T08:00:00.000Z',
  components: [{ name: 'neutrino', revision: 'deadbeef' }],
  claims: [
    {
      name: 'mesh.text',
      supported: true,
      level: 'topology-tested',
      topology: 'two Pixels, BLE only',
    },
    { name: 'schedule.offline', supported: true, level: 'host-tested' },
    {
      name: 'mesh.media.photo',
      supported: false,
      level: 'device-tested',
      limitations: '413 on upload',
    },
  ],
};

describe('readiness is derived from the record and defaults to unavailable', () => {
  it('a name not in the record is unavailable', () => {
    expect(supportsCapability(record, 'mesh.media.video')).toBe(false);
    expect(readinessRows(record).find((r) => r.name === 'mesh.media.voice')?.status).toBe(
      'not-recorded',
    );
  });

  it('supported false is unavailable but distinguishable, carrying its limitation', () => {
    expect(supportsCapability(record, 'mesh.media.photo')).toBe(false);
    const row = readinessRows(record).find((r) => r.name === 'mesh.media.photo')!;
    expect(row.status).toBe('not-working');
    expect(row.detail).toBe('413 on upload');
  });

  it('host-tested is not offered at the default device minimum', () => {
    expect(supportsCapability(record, 'schedule.offline')).toBe(false);
    expect(readinessRows(record).find((r) => r.name === 'schedule.offline')?.status).toBe(
      'unproven',
    );
  });

  it('a topology-tested claim is available and says where it was tested', () => {
    const row = readinessRows(record).find((r) => r.name === 'mesh.text')!;
    expect(row.status).toBe('available');
    expect(row.topology).toBe('two Pixels, BLE only');
  });

  it('the shipped record offers nothing at device level yet, and says so per row', () => {
    const rows = readinessRows(CURRENT_RECORD);
    expect(rows.some((r) => r.status === 'available')).toBe(false);
    for (const row of rows.filter((r) => r.status === 'not-working'))
      expect(row.detail).toBeTruthy();
  });
});
