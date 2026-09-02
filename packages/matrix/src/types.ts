export type { MatrixEventRecord, MatrixOutboxRecord, MatrixRoomRecord } from '@indiafoss/storage';

/** Credentials for one signed-in device. Stored only on this device. */
export interface MatrixSession {
  homeserver: string;
  userId: string;
  accessToken: string;
  deviceId?: string;
  displayName?: string;
}

/** Raw Matrix event as returned by the client-server API. */
export interface RawMatrixEvent {
  event_id?: string;
  type: string;
  sender?: string;
  state_key?: string;
  origin_server_ts?: number;
  content?: Record<string, unknown>;
  unsigned?: { transaction_id?: string; [key: string]: unknown };
}

export interface SyncTimeline {
  events?: RawMatrixEvent[];
  limited?: boolean;
  prev_batch?: string;
}

export interface SyncJoinedRoom {
  state?: { events?: RawMatrixEvent[] };
  timeline?: SyncTimeline;
  unread_notifications?: { notification_count?: number; highlight_count?: number };
  account_data?: { events?: RawMatrixEvent[] };
  ephemeral?: { events?: RawMatrixEvent[] };
}

export interface SyncInvitedRoom {
  invite_state?: { events?: RawMatrixEvent[] };
}

export interface SyncResponse {
  next_batch: string;
  rooms?: {
    join?: Record<string, SyncJoinedRoom>;
    invite?: Record<string, SyncInvitedRoom>;
    leave?: Record<string, unknown>;
  };
  account_data?: { events?: RawMatrixEvent[] };
  /** Olm-encrypted room keys and other device messages (E2EE). */
  to_device?: { events?: RawMatrixEvent[] };
  device_lists?: { changed?: string[]; left?: string[] };
  device_one_time_keys_count?: Record<string, number>;
  device_unused_fallback_key_types?: string[];
}

/** Encrypted attachment descriptor (spec: EncryptedFile). */
export interface EncryptedFileInfo {
  url: string;
  key: { kty: string; key_ops: string[]; alg: string; k: string; ext: boolean };
  iv: string;
  hashes: Record<string, string>;
  v: string;
}

export interface PublicRoomSummary {
  roomId: string;
  name?: string;
  alias?: string;
  topic?: string;
  members: number;
  joinRule?: string;
}

export type MatrixConnectionStatus = 'signed-out' | 'connecting' | 'online' | 'offline' | 'error';
