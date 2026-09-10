/**
 * CapabilityRecord — exactly what was built, exactly what was tested, and on
 * exactly what.
 *
 * This contract exists because of a specific recurring failure: a fix merged
 * in Rust, a passing host test, or an upstream release being mistaken for a
 * capability an attendee actually has. A patch is not an installed APK; a
 * green unit test is not a two-phone result; a pinned tag is not a rehearsed
 * migration.
 *
 * ## The default is "unavailable"
 *
 * A capability that is not listed with evidence is **unavailable**. Never
 * invert that — absence of a `false` is not a `true`. {@link supportsCapability}
 * is the only correct way to ask.
 *
 * See `docs/architecture/system.md` ("Delivery sequence and release
 * evidence"), `docs/release.md`, and the review's finding 4 in
 * `docs/architecture/review-2026-09-07.md`.
 */
import {
  collectDuplicates,
  collectSchemaVersionIssues,
  isRecord,
  optionalString,
  requireArray,
  requireInstant,
  requireLiteral,
  requireString,
} from './common.js';

export const CAPABILITY_RECORD_SCHEMA_VERSION = 1;

/**
 * How strong the evidence behind a capability claim is. Ordered weakest to
 * strongest; {@link supportsCapability} takes a minimum.
 */
export type EvidenceLevel =
  /** Code exists and compiles. Says nothing about behaviour. */
  | 'implemented'
  /** Automated tests pass on a build host. */
  | 'host-tested'
  /** Verified on one physical device running an installed build. */
  | 'device-tested'
  /** Verified across the real topology: two or more devices, real network. */
  | 'topology-tested';

/** A component whose exact revision the record pins. */
export interface ComponentPin {
  /** Component name, e.g. `neutrino`, `matrix-rust-sdk`, `chat-android`. */
  name: string;
  /** Exact revision — a commit sha, not a branch or tag. */
  revision: string;
  /** Artifact checksum where one exists, e.g. the AAR or APK digest. */
  checksum?: string;
  /** Where the revision came from, for someone reproducing this. */
  source?: string;
}

/** One capability claim with its evidence. */
export interface CapabilityClaim {
  /** Capability name, e.g. `mesh.media.photo`, `room.federation.v12`. */
  name: string;
  /**
   * Whether it works. `false` is a valuable record — it stops the claim being
   * re-litigated — and is not the same as absence.
   */
  supported: boolean;
  level: EvidenceLevel;
  /** Devices, OS versions and network topology the result came from. */
  topology?: string;
  /** Link to the run, log or evidence file. */
  evidence?: string;
  /** What was explicitly *not* covered. The most useful field here. */
  limitations?: string;
}

export interface CapabilityRecord {
  schemaVersion: number;
  /** Release or evidence-run identifier. */
  id: string;
  /** When the record was produced, ISO-8601. */
  recordedAt: string;
  /** Exact revisions of everything that could change the answer. */
  components: ComponentPin[];
  claims: CapabilityClaim[];
  /** Event this record was produced for, when it is release evidence. */
  eventId?: string;
}

const LEVELS: readonly EvidenceLevel[] = [
  'implemented',
  'host-tested',
  'device-tested',
  'topology-tested',
];

function collectPinIssues(value: unknown, index: number): string[] {
  const at = `components[${index}].`;
  if (!isRecord(value)) return [`components[${index}] must be an object`];
  const issues: string[] = [
    ...requireString(value, 'name', at),
    ...requireString(value, 'revision', at),
    ...optionalString(value, 'checksum', at),
    ...optionalString(value, 'source', at),
  ];
  // A branch name here would make the record unreproducible the moment the
  // branch moves, which is the whole failure this contract addresses.
  if (typeof value.revision === 'string' && !/^[0-9a-f]{7,64}$/.test(value.revision)) {
    issues.push(`${at}revision must be a commit sha, got ${JSON.stringify(value.revision)}`);
  }
  return issues;
}

function collectClaimIssues(value: unknown, index: number): string[] {
  const at = `claims[${index}].`;
  if (!isRecord(value)) return [`claims[${index}] must be an object`];

  const issues: string[] = [
    ...requireString(value, 'name', at),
    ...requireLiteral(value, 'level', LEVELS, at),
    ...optionalString(value, 'topology', at),
    ...optionalString(value, 'evidence', at),
    ...optionalString(value, 'limitations', at),
  ];

  if (typeof value.supported !== 'boolean') {
    issues.push(`${at}supported must be a boolean`);
  }

  // A topology claim without a stated topology is not a topology claim.
  if (value.level === 'topology-tested' && typeof value.topology !== 'string') {
    issues.push(`${at}topology is required when level is topology-tested`);
  }

  return issues;
}

/** Structural validation for an untrusted record. */
export function collectCapabilityRecordIssues(value: unknown): string[] {
  if (!isRecord(value)) return ['record must be an object'];

  const issues: string[] = [
    ...collectSchemaVersionIssues(value, CAPABILITY_RECORD_SCHEMA_VERSION, 'record'),
    ...requireString(value, 'id'),
    ...requireInstant(value, 'recordedAt'),
    ...optionalString(value, 'eventId'),
    ...requireArray(value, 'components', { nonEmpty: true }),
    ...requireArray(value, 'claims', { nonEmpty: true }),
  ];

  if (Array.isArray(value.components)) {
    const names: string[] = [];
    for (const [index, pin] of value.components.entries()) {
      issues.push(...collectPinIssues(pin, index));
      if (isRecord(pin) && typeof pin.name === 'string') names.push(pin.name);
    }
    issues.push(...collectDuplicates(names, 'component'));
  }

  if (Array.isArray(value.claims)) {
    const names: string[] = [];
    for (const [index, claim] of value.claims.entries()) {
      issues.push(...collectClaimIssues(claim, index));
      if (isRecord(claim) && typeof claim.name === 'string') names.push(claim.name);
    }
    issues.push(...collectDuplicates(names, 'claim'));
  }

  return issues;
}

/** True when the record passes structural checks. */
export function isValidCapabilityRecord(value: unknown): value is CapabilityRecord {
  return collectCapabilityRecordIssues(value).length === 0;
}

/**
 * Whether a capability may be offered, at or above `minimum` evidence.
 *
 * Unknown is unavailable. An unlisted capability, a capability recorded as
 * `supported: false`, and one whose evidence is weaker than required all
 * return `false`.
 */
export function supportsCapability(
  record: CapabilityRecord,
  name: string,
  minimum: EvidenceLevel = 'device-tested',
): boolean {
  const claim = record.claims.find((c) => c.name === name);
  if (!claim || !claim.supported) return false;
  return LEVELS.indexOf(claim.level) >= LEVELS.indexOf(minimum);
}

/** The exact revision recorded for a component, if any. */
export function pinnedRevision(record: CapabilityRecord, component: string): string | undefined {
  return record.components.find((c) => c.name === component)?.revision;
}
