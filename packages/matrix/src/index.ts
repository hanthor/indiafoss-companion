export { MatrixClient, MatrixError, SYNC_FILTER } from './http.js';
export type { FetchLike } from './http.js';
export { applySyncResponse, deriveRoomName, describeEvent } from './sync.js';
export type { SyncDelta } from './sync.js';
export { MatrixSessionManager, MemoryMatrixStore } from './session.js';
export type { MatrixSessionOptions, MatrixSnapshot, MatrixStore } from './session.js';
export {
  companionChatLink,
  localpart,
  matrixToUrl,
  matrixUri,
  parseMatrixTarget,
} from './links.js';
export type { MatrixTarget, MatrixTargetKind } from './links.js';
export {
  FOSSUNITED_PROFILE_URL_FIELD,
  FOSSUNITED_USERNAME_FIELD,
  readExtendedProfile,
  supportsExtendedProfiles,
  writeExtendedProfile,
} from './profile-fields.js';
export type { ExtendedProfileFields } from './profile-fields.js';
export type {
  MatrixConnectionStatus,
  MatrixEventRecord,
  MatrixOutboxRecord,
  MatrixRoomRecord,
  MatrixSession,
  PublicRoomSummary,
  RawMatrixEvent,
  SyncResponse,
} from './types.js';
