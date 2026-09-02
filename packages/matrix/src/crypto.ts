import type { MatrixClient } from './http.js';
import type { RawMatrixEvent } from './types.js';

/**
 * End-to-end encryption backend (Megolm) built on the Matrix Rust SDK crypto
 * crate compiled to WebAssembly. The interface is small so the session
 * manager can run without any crypto (tests, unsupported browsers) and the
 * WASM is only loaded once the attendee signs in.
 */
export interface CryptoBackend {
  readonly deviceId: string;
  /** Feed one `/sync` response's device-level changes. */
  receiveSync(input: {
    toDevice: RawMatrixEvent[];
    changed: string[];
    left: string[];
    oneTimeKeyCounts: Record<string, number>;
    unusedFallbackKeys?: string[];
  }): Promise<void>;
  /** Send every queued key upload/query/claim/to-device request. */
  flushOutgoing(client: MatrixClient): Promise<void>;
  /** Make sure every device of `memberIds` holds the current room key. */
  ensureRoomKey(client: MatrixClient, roomId: string, memberIds: string[]): Promise<void>;
  encryptEvent(roomId: string, type: string, content: unknown): Promise<Record<string, unknown>>;
  /** Decrypt `m.room.encrypted`; `null` when the key has not arrived (yet). */
  decryptEvent(roomId: string, event: RawMatrixEvent): Promise<RawMatrixEvent | null>;
  encryptAttachment(bytes: Uint8Array): Promise<{ data: Uint8Array; info: string }>;
  decryptAttachment(bytes: Uint8Array, info: string): Promise<Uint8Array>;
  /** Called whenever new room keys arrive, so cached undecryptable events can be retried. */
  onRoomKeys(listener: (roomIds: string[]) => void): void;
  close(): Promise<void>;
}

type Wasm = typeof import('@matrix-org/matrix-sdk-crypto-wasm');

let wasmModule: Promise<Wasm> | null = null;

/** Load and initialise the WASM once; safe to call repeatedly. */
export async function loadCryptoWasm(): Promise<Wasm> {
  wasmModule ??= (async () => {
    const mod = await import('@matrix-org/matrix-sdk-crypto-wasm');
    await mod.initAsync();
    return mod;
  })();
  return wasmModule;
}

/** Name of the persistent (IndexedDB) crypto store for one account/device. */
export function cryptoStoreName(userId: string, deviceId: string): string {
  return `indiafoss-crypto-${userId}-${deviceId}`.replace(/[^A-Za-z0-9_.@:-]/g, '_');
}

export class WasmCryptoBackend implements CryptoBackend {
  private listeners: ((roomIds: string[]) => void)[] = [];
  private constructor(
    private readonly wasm: Wasm,
    private readonly machine: InstanceType<Wasm['OlmMachine']>,
    readonly deviceId: string,
  ) {
    machine.registerRoomKeyUpdatedCallback(async (infos) => {
      const roomIds = [...new Set(infos.map((i) => i.roomId.toString()))];
      for (const l of this.listeners) l(roomIds);
    });
  }

  /**
   * @param storeName persistent store name (IndexedDB in browsers); omit for an
   * in-memory machine (tests).
   */
  static async create(
    userId: string,
    deviceId: string,
    storeName?: string,
  ): Promise<WasmCryptoBackend> {
    const wasm = await loadCryptoWasm();
    const machine = await wasm.OlmMachine.initialize(
      new wasm.UserId(userId),
      new wasm.DeviceId(deviceId),
      storeName,
    );
    return new WasmCryptoBackend(wasm, machine, deviceId);
  }

  onRoomKeys(listener: (roomIds: string[]) => void): void {
    this.listeners.push(listener);
  }

  async receiveSync(input: {
    toDevice: RawMatrixEvent[];
    changed: string[];
    left: string[];
    oneTimeKeyCounts: Record<string, number>;
    unusedFallbackKeys?: string[];
  }): Promise<void> {
    const { wasm, machine } = this;
    const counts = new Map(Object.entries(input.oneTimeKeyCounts));
    await machine.receiveSyncChanges(
      JSON.stringify(input.toDevice),
      new wasm.DeviceLists(
        input.changed.map((u) => new wasm.UserId(u)),
        input.left.map((u) => new wasm.UserId(u)),
      ),
      counts,
      input.unusedFallbackKeys ? new Set(input.unusedFallbackKeys) : undefined,
    );
  }

  async flushOutgoing(client: MatrixClient): Promise<void> {
    const { wasm, machine } = this;
    // Bounded loop: each round may queue follow-up requests (e.g. query after upload).
    for (let round = 0; round < 8; round += 1) {
      const requests = await machine.outgoingRequests();
      if (requests.length === 0) return;
      for (const request of requests) {
        let response: unknown = {};
        switch (request.type) {
          case wasm.RequestType.KeysUpload:
            response = await client.keysUpload(JSON.parse(request.body));
            break;
          case wasm.RequestType.KeysQuery:
            response = await client.keysQuery(JSON.parse(request.body));
            break;
          case wasm.RequestType.KeysClaim:
            response = await client.keysClaim(JSON.parse(request.body));
            break;
          case wasm.RequestType.ToDevice: {
            const r = request as InstanceType<Wasm['ToDeviceRequest']>;
            response = await client.sendToDevice(r.event_type, r.txn_id, JSON.parse(r.body));
            break;
          }
          case wasm.RequestType.SignatureUpload:
            response = await client.keysSignatureUpload(JSON.parse(request.body));
            break;
          case wasm.RequestType.RoomMessage: {
            const r = request as InstanceType<Wasm['RoomMessageRequest']>;
            response = await client.sendEvent(
              r.room_id,
              r.event_type,
              JSON.parse(r.body),
              r.txn_id,
            );
            break;
          }
          default:
            // Key backups are not used by the companion.
            break;
        }
        if (request.id) {
          await machine.markRequestAsSent(request.id, request.type, JSON.stringify(response ?? {}));
        }
      }
    }
  }

  async ensureRoomKey(client: MatrixClient, roomId: string, memberIds: string[]): Promise<void> {
    const { wasm, machine } = this;
    // wasm-bindgen consumes the id objects it is handed, so build them per call.
    const users = () => memberIds.map((u) => new wasm.UserId(u));
    await machine.updateTrackedUsers(users());
    await this.flushOutgoing(client);
    const claim = await machine.getMissingSessions(users());
    if (claim) {
      const response = await client.keysClaim(JSON.parse(claim.body));
      await machine.markRequestAsSent(claim.id, claim.type, JSON.stringify(response));
    }
    const settings = new wasm.EncryptionSettings();
    settings.algorithm = wasm.EncryptionAlgorithm.MegolmV1AesSha2;
    settings.historyVisibility = wasm.HistoryVisibility.Shared;
    settings.sharingStrategy = wasm.CollectStrategy.allDevices();
    const shares = await machine.shareRoomKey(new wasm.RoomId(roomId), users(), settings);
    for (const share of shares) {
      const response = await client.sendToDevice(
        share.event_type,
        share.txn_id,
        JSON.parse(share.body),
      );
      await machine.markRequestAsSent(share.id, share.type, JSON.stringify(response ?? {}));
    }
  }

  async encryptEvent(
    roomId: string,
    type: string,
    content: unknown,
  ): Promise<Record<string, unknown>> {
    const encrypted = await this.machine.encryptRoomEvent(
      new this.wasm.RoomId(roomId),
      type,
      JSON.stringify(content),
    );
    return JSON.parse(encrypted) as Record<string, unknown>;
  }

  async decryptEvent(roomId: string, event: RawMatrixEvent): Promise<RawMatrixEvent | null> {
    try {
      const decrypted = await this.machine.decryptRoomEvent(
        JSON.stringify(event),
        new this.wasm.RoomId(roomId),
        new this.wasm.DecryptionSettings(this.wasm.TrustRequirement.Untrusted),
      );
      const clear = JSON.parse(decrypted.event) as RawMatrixEvent;
      return {
        ...clear,
        event_id: event.event_id,
        sender: event.sender,
        origin_server_ts: event.origin_server_ts,
        unsigned: { ...(event.unsigned ?? {}), ...(clear.unsigned ?? {}) },
      };
    } catch {
      return null;
    }
  }

  async encryptAttachment(bytes: Uint8Array): Promise<{ data: Uint8Array; info: string }> {
    const encrypted = this.wasm.Attachment.encrypt(bytes);
    return { data: encrypted.encryptedData, info: encrypted.mediaEncryptionInfo ?? '{}' };
  }

  async decryptAttachment(bytes: Uint8Array, info: string): Promise<Uint8Array> {
    return this.wasm.Attachment.decrypt(new this.wasm.EncryptedAttachment(bytes, info));
  }

  async close(): Promise<void> {
    this.machine.close();
  }
}

/** Best-effort removal of the persistent crypto store on sign-out (browser only). */
export async function deleteCryptoStore(storeName: string): Promise<void> {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!idb) return;
  for (const suffix of ['::matrix-sdk-crypto', '::matrix-sdk-crypto-meta']) {
    await new Promise<void>((resolve) => {
      const req = idb.deleteDatabase(`${storeName}${suffix}`);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }
}
