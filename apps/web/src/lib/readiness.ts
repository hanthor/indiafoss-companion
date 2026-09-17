import { CAPABILITIES } from '@indiafoss/model';
import { supportsCapability } from '@indiafoss/model/contracts';
import type { CapabilityRecord } from '@indiafoss/model/contracts';
import current from '../../../../docs/evidence/records/release-2026-09-17.json';

/** The record this build ships with. Checked in beside its evidence (C-11). */
export const CURRENT_RECORD: CapabilityRecord = current as CapabilityRecord;

export type ReadinessStatus =
  /** Recorded as working at device evidence or better. */
  | 'available'
  /** Recorded as working, but only on a build host: not offered. */
  | 'unproven'
  /** Somebody tested it and it does not work; `detail` says why. */
  | 'not-working'
  /** Nobody has said. Unknown is unavailable. */
  | 'not-recorded';

export interface ReadinessRow {
  name: string;
  meaning: string;
  status: ReadinessStatus;
  level?: string;
  topology?: string;
  evidence?: string;
  detail?: string;
}

/**
 * One row per capability in the namespace, derived from the record and
 * nothing else. Absence and `supported: false` are kept apart on purpose:
 * one says "we tested and it does not work, here is why", the other says
 * "nobody has said". Both are unavailable.
 */
export function readinessRows(record: CapabilityRecord): ReadinessRow[] {
  return CAPABILITIES.map(({ name, meaning }) => {
    const claim = record.claims.find((c) => c.name === name);
    if (!claim) return { name, meaning, status: 'not-recorded' };
    const shared = {
      name,
      meaning,
      level: claim.level,
      topology: claim.topology,
      evidence: claim.evidence,
      detail: claim.limitations,
    };
    if (!claim.supported) return { ...shared, status: 'not-working' };
    // supportsCapability is the only correct way to ask; its default minimum is device-tested.
    return { ...shared, status: supportsCapability(record, name) ? 'available' : 'unproven' };
  });
}
