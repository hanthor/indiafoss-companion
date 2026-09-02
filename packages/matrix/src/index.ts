export { MatrixClient, MatrixError, SYNC_FILTER, isLoopbackHomeserver } from './http.js';
export type { CreateRoomOptions, FetchLike } from './http.js';
export { WasmCryptoBackend, cryptoStoreName, deleteCryptoStore, loadCryptoWasm } from './crypto.js';
export type { CryptoBackend } from './crypto.js';
export { applySyncResponse, deriveRoomName, describeEvent } from './sync.js';
export type { SyncDelta } from './sync.js';
export { MatrixSessionManager, MemoryMatrixStore } from './session.js';
export type { MatrixSessionOptions, MatrixSnapshot, MatrixStore, RoomSpec } from './session.js';
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
  EncryptedFileInfo,
  MatrixConnectionStatus,
  MatrixEventRecord,
  MatrixOutboxRecord,
  MatrixRoomRecord,
  MatrixSession,
  PublicRoomSummary,
  RawMatrixEvent,
  SyncResponse,
} from './types.js';
