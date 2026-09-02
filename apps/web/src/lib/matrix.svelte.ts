import { browser } from '$app/environment';
import { CompanionStorage } from '@indiafoss/storage';
import type { MatrixEventRecord, MatrixOutboxRecord, MatrixRoomRecord } from '@indiafoss/storage';
import {
  cryptoStoreName,
  deleteCryptoStore,
  MatrixSessionManager,
  WasmCryptoBackend,
} from '@indiafoss/matrix';
import type { MatrixConnectionStatus, MatrixSession, MatrixStore } from '@indiafoss/matrix';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

const SESSION_KEY = 'matrix-session';
const NEXT_BATCH_KEY = 'matrix-next-batch';

/** IndexedDB-backed persistence for the Matrix session manager. */
class DexieMatrixStore implements MatrixStore {
  private get db(): CompanionStorage {
    return getStorage();
  }
  async loadSession(): Promise<MatrixSession | null> {
    const raw = await this.db.getSetting(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MatrixSession;
    } catch {
      return null;
    }
  }
  async saveSession(session: MatrixSession | null): Promise<void> {
    await this.db.setSetting(SESSION_KEY, session ? JSON.stringify(session) : '');
  }
  async loadNextBatch(): Promise<string | null> {
    return (await this.db.getSetting(NEXT_BATCH_KEY)) || null;
  }
  async saveNextBatch(token: string | null): Promise<void> {
    await this.db.setSetting(NEXT_BATCH_KEY, token ?? '');
  }
  listRooms(): Promise<MatrixRoomRecord[]> {
    return this.db.listMatrixRooms();
  }
  putRooms(rooms: MatrixRoomRecord[]): Promise<void> {
    return this.db.putMatrixRooms(rooms);
  }
  deleteRoom(roomId: string): Promise<void> {
    return this.db.deleteMatrixRoom(roomId);
  }
  listEvents(roomId: string, limit?: number): Promise<MatrixEventRecord[]> {
    return this.db.listMatrixEvents(roomId, limit);
  }
  putEvents(events: MatrixEventRecord[]): Promise<void> {
    return this.db.putMatrixEvents(events);
  }
  listOutbox(): Promise<MatrixOutboxRecord[]> {
    return this.db.listMatrixOutbox();
  }
  putOutbox(item: MatrixOutboxRecord): Promise<void> {
    return this.db.putMatrixOutbox(item);
  }
  deleteOutbox(txnId: string): Promise<void> {
    return this.db.deleteMatrixOutbox(txnId);
  }
  clear(): Promise<void> {
    return this.db.clearMatrix();
  }
}

/** Reactive projection of the Matrix session (§ messaging). */
export const matrixState = $state<{
  status: MatrixConnectionStatus;
  userId: string | null;
  homeserver: string | null;
  displayName: string | null;
  rooms: MatrixRoomRecord[];
  timelines: Record<string, MatrixEventRecord[]>;
  outbox: MatrixOutboxRecord[];
  typing: Record<string, string[]>;
  encryptionReady: boolean;
  /** False once the server proves it cannot carry key material. */
  serverCarriesEncryption: boolean;
  error: string | null;
  hydrated: boolean;
}>({
  status: 'signed-out',
  userId: null,
  homeserver: null,
  displayName: null,
  rooms: [],
  timelines: {},
  outbox: [],
  typing: {},
  encryptionReady: false,
  serverCarriesEncryption: true,
  error: null,
  hydrated: false,
});

let manager: MatrixSessionManager | null = null;

export function getMatrix(): MatrixSessionManager {
  manager ??= new MatrixSessionManager(new DexieMatrixStore(), {
    deviceName: 'IndiaFOSS Companion (web)',
    onChange: (snapshot) => {
      matrixState.status = snapshot.status;
      matrixState.userId = snapshot.session?.userId ?? null;
      matrixState.homeserver = snapshot.session?.homeserver ?? null;
      matrixState.displayName = snapshot.session?.displayName ?? null;
      matrixState.rooms = snapshot.rooms;
      matrixState.timelines = snapshot.timelines;
      matrixState.outbox = snapshot.outbox;
      matrixState.typing = snapshot.typing;
      matrixState.encryptionReady = snapshot.encryptionReady;
      matrixState.serverCarriesEncryption = snapshot.serverCarriesEncryption;
      matrixState.error = snapshot.error;
    },
    // E2EE: the Rust crypto WASM is loaded lazily on sign-in and its store lives in IndexedDB.
    crypto: (userId, deviceId) =>
      WasmCryptoBackend.create(userId, deviceId, cryptoStoreName(userId, deviceId)),
    disposeCrypto: (userId, deviceId) => deleteCryptoStore(cryptoStoreName(userId, deviceId)),
  });
  return manager;
}

let hydrating: Promise<void> | null = null;

/** Restore a persisted session (if any) and start syncing. Safe to call repeatedly. */
export function hydrateMatrix(): Promise<void> {
  if (!browser) return Promise.resolve();
  hydrating ??= (async () => {
    const m = getMatrix();
    await m.restore();
    matrixState.hydrated = true;
    window.addEventListener('online', () => void m.reconnect());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && matrixState.status !== 'signed-out') {
        void m.reconnect();
      }
    });
  })();
  return hydrating;
}

export const unreadTotal = (): number =>
  matrixState.rooms.reduce((sum, room) => sum + (room.membership === 'join' ? room.unread : 0), 0);

export function roomById(roomId: string): MatrixRoomRecord | undefined {
  return matrixState.rooms.find((r) => r.roomId === roomId);
}

import { conferenceChatAlias } from '@indiafoss/model';
import type { ConferenceChatKind, EventBundle } from '@indiafoss/model';
import { messagingConfigFor } from '$lib/messaging-config';
import { features } from '$lib/features.svelte';

/** Query string for /chat that joins or creates a session, booth or venue-room chat. */
export function conferenceChatQuery(
  bundle: EventBundle | null,
  kind: ConferenceChatKind,
  id: string,
  name: string,
  topic?: string,
): string | null {
  const config = messagingConfigFor(bundle);
  if (!features.chat || config.sessionChats === false || !bundle) return null;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const params = new URLSearchParams();
  params.set('open', conferenceChatAlias(config, bundle.id, kind, id));
  params.set('name', name);
  if (topic) params.set('topic', topic);
  return params.toString();
}

export function statusLabel(status: MatrixConnectionStatus): string {
  switch (status) {
    case 'online':
      return 'Connected';
    case 'connecting':
      return 'Connecting…';
    case 'offline':
      return 'Offline — messages will send when you reconnect';
    case 'error':
      return 'Connection problem — retrying';
    case 'signed-out':
      return 'Not signed in';
  }
}
