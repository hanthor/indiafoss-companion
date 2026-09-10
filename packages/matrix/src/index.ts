/**
 * `@indiafoss/matrix` is no longer a chat client (ADR 0004: chat lives in
 * hanthor/indiafoss-chat-android). What the companion apps still use:
 *
 * - public-profile checks: `verifyMeshLink` (the `in.indiafoss.mesh` field)
 *   and the MSC4133 profile-field helpers;
 * - handoff helpers: `matrix.to` / `matrix:` links and id parsing for the
 *   PWA's "open in a Matrix client" buttons and the QR scanner.
 *
 * `MatrixSessionManager` and the crypto backend remain for
 * `tools/neutrino-probe`, which drives them against live Neutrino / Spindle
 * servers in CI as the mesh chat contract harness.
 */
export { MatrixClient, MatrixError } from './http.js';
export type { CreateRoomOptions, FetchLike } from './http.js';
export { WasmCryptoBackend } from './crypto.js';
export type { CryptoBackend } from './crypto.js';
export { MatrixSessionManager, MemoryMatrixStore } from './session.js';
export type { MatrixSessionOptions, MatrixSnapshot, MatrixStore, RoomSpec } from './session.js';
export { localpart, matrixToUrl, matrixUri, parseMatrixTarget } from './links.js';
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
export {
  MESH_IDENTITY_FIELD,
  meshLinkLabel,
  publishMeshLink,
  verifyMeshLink,
} from './mesh-link.js';
export type { MeshLinkCheck, MeshLinkState } from './mesh-link.js';
