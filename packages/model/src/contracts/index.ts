/**
 * Versioned contracts that cross an app, device or platform boundary.
 *
 * Every format in here is read by more than one implementation — the PWA, the
 * Kotlin core, and eventually Swift — so each carries its own integer
 * `schemaVersion` and a `collectXIssues(value: unknown): string[]` validator
 * with the same compatibility policy:
 *
 * - unknown optional fields are tolerated and preserved;
 * - an unrecognised **newer** major version is rejected, and the caller keeps
 *   whatever it already had;
 * - rejection never discards the last good value.
 *
 * The golden fixtures in `@indiafoss/test-fixtures` are the conformance suite.
 * A contract change is not done until its fixtures change with it.
 *
 * See ADR 0009 and `docs/architecture/system.md`.
 */

export {
  collectDuplicates,
  collectSchemaVersionIssues,
  isHex64,
  isMatrixRoomAlias,
  isMatrixRoomId,
  isMatrixUserId,
  isRecord,
  optionalInstant,
  optionalString,
  requireArray,
  requireInstant,
  requireLiteral,
  requireString,
  schemaCompatibility,
} from './common.js';
export type { SchemaCompatibility } from './common.js';

export {
  EVENT_MANIFEST_SCHEMA_VERSION,
  collectEventManifestIssues,
  isValidEventManifest,
  supersedes,
} from './event-manifest.js';
export type { EventManifest } from './event-manifest.js';

export {
  CONFERENCE_DIRECTORY_SCHEMA_VERSION,
  collectConferenceDirectoryIssues,
  directoryClaims,
  isValidConferenceDirectory,
  roomByAlias,
} from './conference-directory.js';
export type {
  ConferenceDirectory,
  DirectoryRoom,
  RoomRoute,
  RoomVisibility,
} from './conference-directory.js';

export {
  CONTACT_CARD_SCHEMA_VERSION,
  MAX_CONTACT_CARD_BYTES,
  asReceived,
  collectContactCardIssues,
  isPresentable,
  isValidContactCard,
} from './contact-card.js';
export type {
  AccountClaim,
  AccountClaimTrust,
  AccountKind,
  CardProfile,
  ContactCard,
} from './contact-card.js';

export {
  IDENTITY_BINDING_DOMAIN,
  IDENTITY_BINDING_SCHEMA_VERSION,
  collectIdentityBindingIssues,
  isStructurallyValidBinding,
  mayActOn,
  pendingVerification,
} from './identity-binding.js';
export type {
  BindingScope,
  BindingVerification,
  DeviceTrustSource,
  IdentityBinding,
} from './identity-binding.js';

export {
  APP_HANDOFF_SCHEMA_VERSION,
  HANDOFF_HOSTS,
  HANDOFF_SCHEME,
  MAX_HANDOFF_BYTES,
  collectAppHandoffIssues,
  isHandoffUrl,
  isValidAppHandoff,
  parseHandoffUrl,
  toHandoffUrl,
} from './app-handoff.js';
export type { AppHandoff, HandoffAction } from './app-handoff.js';

export {
  CAPABILITY_RECORD_SCHEMA_VERSION,
  collectCapabilityRecordIssues,
  isValidCapabilityRecord,
  pinnedRevision,
  supportsCapability,
} from './capability-record.js';
export type {
  CapabilityClaim,
  CapabilityRecord,
  ComponentPin,
  EvidenceLevel,
} from './capability-record.js';

/**
 * Every contract's current version, by name. A client can report this to say
 * what it understands, and a publisher can check what it may safely emit.
 */
export const CONTRACT_VERSIONS = {
  eventManifest: 1,
  conferenceDirectory: 1,
  contactCard: 1,
  identityBinding: 1,
  appHandoff: 1,
  capabilityRecord: 1,
} as const;
