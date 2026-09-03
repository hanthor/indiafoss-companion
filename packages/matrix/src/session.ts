import type {
  MatrixConnectionStatus,
  MatrixEventRecord,
  MatrixOutboxRecord,
  MatrixRoomRecord,
  MatrixSession,
  PublicRoomSummary,
} from './types.js';
import { MatrixClient, MatrixError, type FetchLike } from './http.js';
import { publishMeshLink } from './mesh-link.js';
import { applySyncResponse, deriveRoomName, describeEvent, eventToRecord } from './sync.js';
import type { CryptoBackend } from './crypto.js';
import type { RawMatrixEvent, SyncJoinedRoom } from './types.js';

/** Persistence contract; the web app backs it with IndexedDB. */
export interface MatrixStore {
  loadSession(): Promise<MatrixSession | null>;
  saveSession(session: MatrixSession | null): Promise<void>;
  loadNextBatch(): Promise<string | null>;
  saveNextBatch(token: string | null): Promise<void>;
  listRooms(): Promise<MatrixRoomRecord[]>;
  putRooms(rooms: MatrixRoomRecord[]): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
  listEvents(roomId: string, limit?: number): Promise<MatrixEventRecord[]>;
  putEvents(events: MatrixEventRecord[]): Promise<void>;
  listOutbox(): Promise<MatrixOutboxRecord[]>;
  putOutbox(item: MatrixOutboxRecord): Promise<void>;
  deleteOutbox(txnId: string): Promise<void>;
  clear(): Promise<void>;
}

/** In-memory store for tests and previews. */
export class MemoryMatrixStore implements MatrixStore {
  session: MatrixSession | null = null;
  nextBatch: string | null = null;
  rooms = new Map<string, MatrixRoomRecord>();
  events = new Map<string, MatrixEventRecord>();
  outbox = new Map<string, MatrixOutboxRecord>();

  async loadSession() {
    return this.session;
  }
  async saveSession(session: MatrixSession | null) {
    this.session = session;
  }
  async loadNextBatch() {
    return this.nextBatch;
  }
  async saveNextBatch(token: string | null) {
    this.nextBatch = token;
  }
  async listRooms() {
    return [...this.rooms.values()].sort((a, b) => b.lastActivityTs - a.lastActivityTs);
  }
  async putRooms(rooms: MatrixRoomRecord[]) {
    for (const room of rooms) this.rooms.set(room.roomId, room);
  }
  async deleteRoom(roomId: string) {
    this.rooms.delete(roomId);
    for (const [id, event] of this.events) if (event.roomId === roomId) this.events.delete(id);
  }
  async listEvents(roomId: string, limit = 200) {
    return [...this.events.values()]
      .filter((e) => e.roomId === roomId)
      .sort((a, b) => a.ts - b.ts)
      .slice(-limit);
  }
  async putEvents(events: MatrixEventRecord[]) {
    for (const event of events) this.events.set(event.eventId, event);
  }
  async listOutbox() {
    return [...this.outbox.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async putOutbox(item: MatrixOutboxRecord) {
    this.outbox.set(item.txnId, item);
  }
  async deleteOutbox(txnId: string) {
    this.outbox.delete(txnId);
  }
  async clear() {
    this.session = null;
    this.nextBatch = null;
    this.rooms.clear();
    this.events.clear();
    this.outbox.clear();
  }
}

export interface MatrixSnapshot {
  status: MatrixConnectionStatus;
  session: MatrixSession | null;
  rooms: MatrixRoomRecord[];
  /** Timeline per room; only rooms that were opened are populated. */
  timelines: Record<string, MatrixEventRecord[]>;
  outbox: MatrixOutboxRecord[];
  /** Other users currently typing, per room. */
  typing: Record<string, string[]>;
  /** True when end-to-end encryption is available for this session. */
  encryptionReady: boolean;
  /**
   * The server's upload cap in bytes, once asked (`null` until then, or
   * when the server does not say). On the mesh this is small: a photo has
   * to cross a BLE link.
   */
  uploadLimit: number | null;
  /**
   * False once the homeserver has proved it cannot carry key material — no
   * `/keys/claim`, no `/sendToDevice`. Distinct from `encryptionReady`, which
   * also covers "this browser has no crypto backend": the two need different
   * things said to the attendee.
   */
  serverCarriesEncryption: boolean;
  error: string | null;
}

/** A room the app wants to exist (session/booth/venue chats). */
export interface RoomSpec {
  alias: string;
  name: string;
  topic?: string;
  /**
   * A read-mostly room: whoever creates it (the organiser, on the conference
   * homeserver) is its owner and only moderators (level 50+) may post;
   * everyone else reads. Issue #113.
   */
  announcements?: boolean;
}

/** `power_level_content_override` for an announcements room. */
export const ANNOUNCEMENTS_POWER_LEVELS = { events_default: 50 } as const;

export interface MatrixSessionOptions {
  fetch?: FetchLike;
  /** Device name shown in the account's session list. */
  deviceName?: string;
  /** Long-poll timeout for `/sync`; tests use 0. */
  syncTimeoutMs?: number;
  /** Retry backoff ceiling after a failed sync. */
  maxBackoffMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Called after every state change with a fresh snapshot. */
  onChange?: (snapshot: MatrixSnapshot) => void;
  /**
   * Factory for the E2EE backend. Omit to run without encryption support
   * (encrypted rooms then show placeholders and cannot be written to).
   */
  crypto?: (userId: string, deviceId: string) => Promise<CryptoBackend | null>;
  /** Called on sign-out so the host can delete the persistent crypto store. */
  disposeCrypto?: (userId: string, deviceId: string) => Promise<void>;
  /**
   * Shrink an image that is over the server's upload cap. Returns the
   * smaller encoding, or `null` when it cannot get under `maxBytes`; the
   * host supplies this because encoding needs a canvas, which the package
   * does not assume. Without it an oversized image is refused up front.
   */
  downscaleImage?: (
    bytes: Uint8Array,
    mime: string,
    maxBytes: number,
  ) => Promise<Uint8Array | null>;
}

const LOCAL_ECHO_PREFIX = 'local:';

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/**
 * Orchestrates one signed-in Matrix account: restore, sync loop with
 * reconnection backoff, cached rooms/timelines, and an offline outbox whose
 * transaction ids make retries idempotent (§ Matrix spec, txnId semantics).
 */
export class MatrixSessionManager {
  private client: MatrixClient | null = null;
  private session: MatrixSession | null = null;
  private nextBatch: string | null = null;
  private readonly rooms = new Map<string, MatrixRoomRecord>();
  private readonly timelines = new Map<string, MatrixEventRecord[]>();
  private outbox: MatrixOutboxRecord[] = [];
  private directMap: Record<string, string[]> = {};
  private status: MatrixConnectionStatus = 'signed-out';
  private error: string | null = null;
  private abort: AbortController | null = null;
  private loop: Promise<void> | null = null;
  private flushing = false;
  private crypto: CryptoBackend | null = null;
  private typing: Record<string, string[]> = {};
  private typingSent: Record<string, { typing: boolean; at: number }> = {};
  private readonly memberCache = new Map<string, { at: number; ids: string[] }>();
  private readonly mediaCache = new Map<string, Uint8Array>();
  private readonly opts: Required<
    Omit<MatrixSessionOptions, 'onChange' | 'crypto' | 'disposeCrypto' | 'downscaleImage'>
  > & {
    onChange: (snapshot: MatrixSnapshot) => void;
    crypto: MatrixSessionOptions['crypto'];
    disposeCrypto: MatrixSessionOptions['disposeCrypto'];
    downscaleImage: MatrixSessionOptions['downscaleImage'];
  };

  constructor(
    private readonly store: MatrixStore,
    options: MatrixSessionOptions = {},
  ) {
    this.opts = {
      fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
      deviceName: options.deviceName ?? 'IndiaFOSS Companion',
      syncTimeoutMs: options.syncTimeoutMs ?? 30_000,
      maxBackoffMs: options.maxBackoffMs ?? 60_000,
      now: options.now ?? (() => Date.now()),
      sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      onChange: options.onChange ?? (() => {}),
      crypto: options.crypto,
      disposeCrypto: options.disposeCrypto,
      downscaleImage: options.downscaleImage,
    };
  }

  // ---- state ---------------------------------------------------------------

  snapshot(): MatrixSnapshot {
    const selfId = this.session?.userId ?? '';
    return {
      status: this.status,
      session: this.session,
      rooms: [...this.rooms.values()]
        .map((room) => ({ ...room, name: deriveRoomName(room, selfId) }))
        .sort((a, b) => b.lastActivityTs - a.lastActivityTs),
      timelines: Object.fromEntries(this.timelines),
      outbox: [...this.outbox],
      typing: Object.fromEntries(
        Object.entries(this.typing).map(([roomId, ids]) => [
          roomId,
          ids.filter((id) => id !== selfId),
        ]),
      ),
      encryptionReady: this.crypto !== null && this.serverCarriesEncryption,
      serverCarriesEncryption: this.serverCarriesEncryption,
      uploadLimit: this.uploadLimit,
      error: this.error,
    };
  }

  get encryptionReady(): boolean {
    return this.crypto !== null && this.serverCarriesEncryption;
  }

  /**
   * False once a server has proved it cannot carry key material (no
   * `/keys/claim`, no `/sendToDevice`). Assumed true until then: probing every
   * server up front would cost a round trip on a link where round trips are
   * the expensive part.
   */
  private serverCarriesEncryption = true;
  /** `null` until asked; see `MatrixSnapshot.uploadLimit`. */
  private uploadLimit: number | null = null;
  private uploadLimitAsked = false;

  private async initCrypto(): Promise<void> {
    if (!this.opts.crypto || !this.session?.deviceId) return;
    try {
      this.crypto = await this.opts.crypto(this.session.userId, this.session.deviceId);
      this.crypto?.onRoomKeys((roomIds) => void this.redecrypt(roomIds));
    } catch (error) {
      this.crypto = null;
      this.error = `Encryption unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private emit(): void {
    this.opts.onChange(this.snapshot());
  }

  private setStatus(status: MatrixConnectionStatus, error: string | null = null): void {
    this.status = status;
    this.error = error;
    this.emit();
  }

  get userId(): string | null {
    return this.session?.userId ?? null;
  }

  get homeserver(): string | null {
    return this.session?.homeserver ?? null;
  }

  // ---- lifecycle -----------------------------------------------------------

  /** Load the persisted session and cache, then start syncing if signed in. */
  async restore(): Promise<boolean> {
    const session = await this.store.loadSession();
    if (!session) {
      this.setStatus('signed-out');
      return false;
    }
    this.session = session;
    this.client = new MatrixClient(session.homeserver, session.accessToken, this.opts.fetch);
    this.nextBatch = await this.store.loadNextBatch();
    for (const room of await this.store.listRooms()) this.rooms.set(room.roomId, room);
    this.outbox = await this.store.listOutbox();
    await this.initCrypto();
    this.setStatus('connecting');
    this.start();
    return true;
  }

  async signInWithPassword(homeserverInput: string, user: string, password: string): Promise<void> {
    const base = await MatrixClient.discover(homeserverInput, this.opts.fetch);
    const client = new MatrixClient(base, null, this.opts.fetch);
    const session = await client.loginWithPassword(
      user,
      password,
      this.opts.deviceName,
      freshDeviceId(),
    );
    await this.adopt(client, session);
  }

  async signInWithToken(homeserver: string, loginToken: string): Promise<void> {
    const client = new MatrixClient(homeserver, null, this.opts.fetch);
    const session = await client.loginWithToken(loginToken, this.opts.deviceName);
    await this.adopt(client, session);
  }

  /** URL to start an SSO flow; the callback receives `?loginToken=` for {@link signInWithToken}. */
  async ssoStartUrl(homeserverInput: string, redirectUrl: string): Promise<string> {
    const base = await MatrixClient.discover(homeserverInput, this.opts.fetch);
    return new MatrixClient(base, null, this.opts.fetch).ssoRedirectUrl(redirectUrl);
  }

  private async adopt(client: MatrixClient, session: MatrixSession): Promise<void> {
    await this.stop();
    await this.store.clear();
    this.rooms.clear();
    this.timelines.clear();
    this.outbox = [];
    this.nextBatch = null;
    this.client = client;
    this.session = session;
    session.displayName = await client.displayName(session.userId);
    await this.store.saveSession(session);
    await this.initCrypto();
    this.setStatus('connecting');
    this.start();
  }

  async signOut(): Promise<void> {
    await this.stop();
    const { userId, deviceId } = this.session ?? {};
    if (this.crypto) {
      await this.crypto.close().catch(() => {});
      this.crypto = null;
      if (userId && deviceId) await this.opts.disposeCrypto?.(userId, deviceId).catch(() => {});
    }
    this.typing = {};
    this.memberCache.clear();
    this.mediaCache.clear();
    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // Best effort: the token is dropped locally regardless.
      }
    }
    this.client = null;
    this.uploadLimit = null;
    this.uploadLimitAsked = false;
    this.session = null;
    this.nextBatch = null;
    this.rooms.clear();
    this.timelines.clear();
    this.outbox = [];
    this.directMap = {};
    await this.store.clear();
    this.setStatus('signed-out');
  }

  start(): void {
    if (this.loop || !this.client) return;
    this.abort = new AbortController();
    this.loop = this.runSyncLoop(this.abort.signal).finally(() => {
      this.loop = null;
    });
  }

  async stop(): Promise<void> {
    this.abort?.abort();
    this.abort = null;
    await this.loop;
  }

  /** Called by the host when connectivity returns; wakes the loop immediately. */
  async reconnect(): Promise<void> {
    if (!this.client) return;
    await this.stop();
    this.setStatus('connecting');
    this.start();
  }

  // ---- sync loop -----------------------------------------------------------

  private async runSyncLoop(signal: AbortSignal): Promise<void> {
    let backoff = 1000;
    while (!signal.aborted && this.client) {
      try {
        const response = await this.client.sync({
          since: this.nextBatch ?? undefined,
          timeoutMs: this.nextBatch ? this.opts.syncTimeoutMs : 0,
          signal,
        });
        await this.applySync(response);
        backoff = 1000;
        if (this.status !== 'online') this.setStatus('online');
        await this.flushOutbox();
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof MatrixError && error.isAuthFailure) {
          this.client = null;
          this.session = null;
          await this.store.saveSession(null);
          this.setStatus('signed-out', 'Your Matrix session expired. Sign in again.');
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        const offline = !(error instanceof MatrixError);
        this.setStatus(offline ? 'offline' : 'error', offline ? null : message);
        const wait =
          error instanceof MatrixError && error.retryAfterMs ? error.retryAfterMs : backoff;
        await this.opts.sleep(wait);
        backoff = Math.min(backoff * 2, this.opts.maxBackoffMs);
      }
    }
  }

  private async applySync(response: Parameters<typeof applySyncResponse>[1]): Promise<void> {
    const selfId = this.session?.userId ?? '';
    if (this.crypto) {
      try {
        await this.crypto.receiveSync({
          toDevice: response.to_device?.events ?? [],
          changed: response.device_lists?.changed ?? [],
          left: response.device_lists?.left ?? [],
          oneTimeKeyCounts: response.device_one_time_keys_count ?? {},
          unusedFallbackKeys: response.device_unused_fallback_key_types,
        });
        await this.decryptSyncTimelines(response.rooms?.join ?? {});
      } catch (error) {
        this.error = `Encryption error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    const delta = applySyncResponse(this.rooms, response, selfId, this.directMap);
    for (const [roomId, ids] of Object.entries(delta.typing)) this.typing[roomId] = ids;
    for (const event of delta.events) {
      if (event.undecryptable) {
        const raw = this.rawByEventId.get(event.eventId);
        if (raw) event.raw = raw;
      }
    }
    this.rawByEventId.clear();
    if (delta.directMap) this.directMap = delta.directMap;
    for (const room of delta.rooms) {
      this.rooms.set(room.roomId, room);
      // Membership may have changed: re-fetch members before the next key share.
      this.memberCache.delete(room.roomId);
    }
    for (const roomId of delta.leftRoomIds) {
      this.rooms.delete(roomId);
      this.timelines.delete(roomId);
      await this.store.deleteRoom(roomId);
    }
    if (delta.rooms.length) await this.store.putRooms(delta.rooms);
    if (delta.events.length) {
      await this.store.putEvents(delta.events);
      for (const event of delta.events) this.mergeIntoTimeline(event);
    }
    if (delta.redactedIds.length) await this.applyRedactions(delta.redactedIds);
    this.nextBatch = delta.nextBatch;
    await this.store.saveNextBatch(delta.nextBatch);
    this.emit();
    if (this.crypto && this.client) {
      try {
        await this.crypto.flushOutgoing(this.client);
      } catch {
        // Key uploads retry on the next sync.
      }
    }
  }

  /**
   * Blank the cached copies of redacted events. The server already serves
   * them pruned on the next read; this is for what the client holds now —
   * an open timeline, the store — so a deleted message and a withdrawn
   * reaction disappear without a refetch.
   */
  private async applyRedactions(eventIds: string[]): Promise<void> {
    const wanted = new Set(eventIds);
    const rooms = new Set<string>();
    for (const [roomId, timeline] of this.timelines) {
      if (timeline.some((e) => wanted.has(e.eventId))) rooms.add(roomId);
    }
    for (const room of this.rooms.keys()) rooms.add(room);
    const updated: MatrixEventRecord[] = [];
    for (const roomId of rooms) {
      const cached = this.timelines.get(roomId) ?? (await this.store.listEvents(roomId, 500));
      for (const record of cached) {
        if (!wanted.has(record.eventId) || record.redacted) continue;
        const blank: MatrixEventRecord = {
          eventId: record.eventId,
          roomId: record.roomId,
          sender: record.sender,
          ts: record.ts,
          type: record.type,
          body: record.msgtype === 'm.reaction' ? '' : 'Message deleted',
          msgtype: record.msgtype === 'm.reaction' ? 'm.reaction' : 'm.redacted',
          redacted: true,
        };
        updated.push(blank);
        this.mergeIntoTimeline(blank);
      }
    }
    if (updated.length) await this.store.putEvents(updated);
  }

  /** Ciphertext of events that could not be decrypted in the current sync, by event id. */
  private readonly rawByEventId = new Map<string, string>();

  /** Replace decryptable `m.room.encrypted` events in place before the reducer runs. */
  private async decryptSyncTimelines(join: Record<string, SyncJoinedRoom>): Promise<void> {
    if (!this.crypto) return;
    for (const [roomId, room] of Object.entries(join)) {
      const events = room.timeline?.events;
      if (!events) continue;
      for (let i = 0; i < events.length; i += 1) {
        const event = events[i]!;
        if (event.type !== 'm.room.encrypted') continue;
        const clear = await this.crypto.decryptEvent(roomId, event);
        if (clear) {
          events[i] = { ...clear, unsigned: { ...(clear.unsigned ?? {}), encrypted: true } };
        } else if (event.event_id) {
          this.rawByEventId.set(event.event_id, JSON.stringify(event));
        }
      }
    }
  }

  /** Retry decryption of cached events once room keys arrive. */
  private async redecrypt(roomIds: string[]): Promise<void> {
    if (!this.crypto) return;
    let changed = false;
    for (const roomId of roomIds) {
      const cached = await this.store.listEvents(roomId, 500);
      for (const record of cached) {
        if (!record.undecryptable || !record.raw) continue;
        const clear = await this.crypto.decryptEvent(
          roomId,
          JSON.parse(record.raw) as RawMatrixEvent,
        );
        if (!clear) continue;
        const next = eventToRecord(roomId, {
          ...clear,
          unsigned: { ...(clear.unsigned ?? {}), encrypted: true },
        });
        if (!next) continue;
        await this.store.putEvents([next]);
        this.mergeIntoTimeline(next);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  private async membersOf(roomId: string): Promise<string[]> {
    const cached = this.memberCache.get(roomId);
    if (cached && this.opts.now() - cached.at < 60_000) return cached.ids;
    const ids = await this.requireClient().roomMembers(roomId);
    this.memberCache.set(roomId, { at: this.opts.now(), ids });
    return ids;
  }

  /** Encrypt `content` for `roomId` (sharing the room key first) and send it. */
  private async sendEncrypted(
    roomId: string,
    type: string,
    content: unknown,
    txnId: string,
  ): Promise<string> {
    const client = this.requireClient();
    if (!this.crypto) {
      throw new MatrixError(
        'This room is encrypted and encryption is unavailable here.',
        400,
        'M_UNSUPPORTED',
      );
    }
    const members = await this.membersOf(roomId);
    try {
      await this.crypto.ensureRoomKey(client, roomId, members);
    } catch (error) {
      // Establishing a Megolm session needs the server to hand out one-time
      // keys and carry to-device messages. A homeserver without those answers
      // 404 — Neutrino does today — and the failure is worth naming, because
      // "404" tells an attendee nothing and the alternative (sending in the
      // clear from a room marked encrypted) is not an option.
      if (error instanceof MatrixError && error.status === 404) {
        this.serverCarriesEncryption = false;
        this.emit();
        throw new MatrixError(
          'This server cannot carry encryption keys, so the room cannot be encrypted here. ' +
            'Messages were not sent.',
          400,
          'M_UNSUPPORTED',
        );
      }
      throw error;
    }
    const encrypted = await this.crypto.encryptEvent(roomId, type, content);
    const res = await client.sendEvent(roomId, 'm.room.encrypted', encrypted, txnId);
    return res.event_id;
  }

  // ---- reactions and invites -------------------------------------------------

  /**
   * Toggle an annotation on an event. Reactions are never encrypted (the spec
   * keeps `m.reaction` in the clear) and are not queued: a failed reaction is
   * simply not applied.
   */
  async toggleReaction(roomId: string, eventId: string, key = '👍'): Promise<void> {
    const client = this.requireClient();
    const self = this.session?.userId;
    const timeline = this.timelines.get(roomId) ?? [];
    const mine = timeline.find(
      (e) => e.reactsTo === eventId && e.reactionKey === key && e.sender === self,
    );
    if (mine) {
      await client.redactEvent(roomId, mine.eventId, this.newTxnId());
      this.timelines.set(
        roomId,
        timeline.filter((e) => e.eventId !== mine.eventId),
      );
      await this.store.putEvents([]);
      this.emit();
      return;
    }
    await client.sendEvent(
      roomId,
      'm.reaction',
      { 'm.relates_to': { rel_type: 'm.annotation', event_id: eventId, key } },
      this.newTxnId(),
    );
  }

  /** Accept a pending invite (joins and opens the room). */
  async acceptInvite(roomId: string): Promise<void> {
    const client = this.requireClient();
    await client.joinRoom(roomId);
    const room = this.rooms.get(roomId);
    if (room) {
      room.membership = 'join';
      await this.store.putRooms([room]);
      this.emit();
    }
  }

  /** Decline a pending invite and forget the room. */
  async declineInvite(roomId: string): Promise<void> {
    const client = this.requireClient();
    await client.leaveRoom(roomId);
    this.rooms.delete(roomId);
    await this.store.deleteRoom(roomId);
    this.emit();
  }

  // ---- typing ---------------------------------------------------------------

  /** Throttled typing notice (§ Matrix typing); no-op while offline. */
  async setTyping(roomId: string, typing: boolean): Promise<void> {
    if (!this.client || !this.session || this.status !== 'online') return;
    const last = this.typingSent[roomId];
    const now = this.opts.now();
    if (last && last.typing === typing && now - last.at < 15_000) return;
    this.typingSent[roomId] = { typing, at: now };
    try {
      await this.client.setTyping(roomId, this.session.userId, typing);
    } catch {
      // Typing is best effort.
    }
  }

  // ---- files ----------------------------------------------------------------

  /**
   * Upload and send an attachment. In encrypted rooms the bytes are encrypted
   * with a fresh AES-CTR key before upload (spec: EncryptedFile). Attachments
   * are not queued offline: the caller sees the error and can retry.
   */
  async sendFile(roomId: string, bytes: Uint8Array, filename: string, mime: string): Promise<void> {
    const client = this.requireClient();
    const room = this.rooms.get(roomId);
    // Honour the cap before a byte leaves the device: on the mesh the
    // server's limit is what a BLE hop can carry, and an image that is
    // over it is shrunk when the host knows how, refused otherwise.
    const limit = await this.ensureUploadLimit();
    if (limit !== null && bytes.byteLength > limit) {
      const smaller =
        mime.startsWith('image/') && this.opts.downscaleImage
          ? await this.opts.downscaleImage(bytes, mime, limit)
          : null;
      if (!smaller || smaller.byteLength > limit) {
        throw new MatrixError(
          `This file is ${formatBytes(bytes.byteLength)}; the server accepts up to ${formatBytes(limit)}.`,
          413,
          'M_TOO_LARGE',
        );
      }
      bytes = smaller;
    }
    const msgtype = mime.startsWith('image/')
      ? 'm.image'
      : mime.startsWith('video/')
        ? 'm.video'
        : mime.startsWith('audio/')
          ? 'm.audio'
          : 'm.file';
    const txnId = this.newTxnId();
    const info = { mimetype: mime, size: bytes.byteLength };
    if (room?.encrypted) {
      if (!this.crypto)
        throw new Error('This room is encrypted and encryption is unavailable here.');
      const { data, info: encInfo } = await this.crypto.encryptAttachment(bytes);
      const mxc = await client.uploadMedia(data, 'application/octet-stream', filename);
      const file = { ...(JSON.parse(encInfo) as Record<string, unknown>), url: mxc };
      await this.sendEncrypted(
        roomId,
        'm.room.message',
        { msgtype, body: filename, file, info },
        txnId,
      );
    } else {
      const mxc = await client.uploadMedia(bytes, mime, filename);
      await client.sendEvent(
        roomId,
        'm.room.message',
        { msgtype, body: filename, url: mxc, info },
        txnId,
      );
    }
  }

  /**
   * Publish this phone's mesh identity on the signed-in account's profile
   * (issue #111), so peers holding this account's id on a card can verify
   * the link. `null` clears it. Only meaningful on an internet homeserver.
   */
  async publishMeshIdentity(meshServerName: string | null): Promise<void> {
    const client = this.requireClient();
    if (!this.session) throw new Error('Not signed in.');
    await publishMeshLink(client, this.session.userId, meshServerName);
  }

  /** Ask the server for its upload cap once per signed-in client. */
  private async ensureUploadLimit(): Promise<number | null> {
    if (this.uploadLimitAsked) return this.uploadLimit;
    const client = this.requireClient();
    this.uploadLimit = await client.mediaUploadLimit();
    this.uploadLimitAsked = true;
    this.emit();
    return this.uploadLimit;
  }

  /** Bytes of an attachment, decrypted when needed; cached per event. */
  async mediaBytes(record: MatrixEventRecord): Promise<Uint8Array> {
    const cached = this.mediaCache.get(record.eventId);
    if (cached) return cached;
    if (!record.mediaUrl) throw new Error('Event has no media.');
    const client = this.requireClient();
    let bytes = await client.downloadMedia(record.mediaUrl);
    if (record.mediaFile) {
      if (!this.crypto) throw new Error('Encrypted attachment and encryption is unavailable here.');
      bytes = await this.crypto.decryptAttachment(bytes, record.mediaFile);
    }
    this.mediaCache.set(record.eventId, bytes);
    return bytes;
  }

  // ---- conference rooms ------------------------------------------------------

  /** Join a room by alias, creating it (public, with that alias) when nobody has yet. */
  async joinOrCreateRoom(spec: RoomSpec): Promise<string> {
    const client = this.requireClient();
    const known = [...this.rooms.values()].find(
      (r) => r.alias === spec.alias && r.membership === 'join',
    );
    if (known) return known.roomId;
    try {
      return await this.joinRoom(spec.alias);
    } catch (error) {
      if (
        !(error instanceof MatrixError) ||
        (error.status !== 404 && error.errcode !== 'M_NOT_FOUND')
      ) {
        throw error;
      }
    }
    const localpart = spec.alias.slice(1).split(':')[0] ?? spec.alias;
    try {
      const roomId = await client.createRoom({
        aliasLocalpart: localpart,
        name: spec.name,
        topic: spec.topic,
        preset: 'public_chat',
        visibility: 'public',
        powerLevelOverride: spec.announcements ? { ...ANNOUNCEMENTS_POWER_LEVELS } : undefined,
      });
      const room: MatrixRoomRecord = {
        roomId,
        name: spec.name,
        alias: spec.alias,
        topic: spec.topic,
        isDirect: false,
        memberIds: [this.session?.userId ?? ''],
        memberNames: {},
        encrypted: false,
        membership: 'join',
        lastActivityTs: this.opts.now(),
        unread: 0,
      };
      this.rooms.set(roomId, room);
      await this.store.putRooms([room]);
      this.emit();
      return roomId;
    } catch (error) {
      // Someone else created it a moment ago.
      if (error instanceof MatrixError && error.errcode === 'M_ROOM_IN_USE')
        return this.joinRoom(spec.alias);
      throw error;
    }
  }

  private mergeIntoTimeline(event: MatrixEventRecord): void {
    const timeline = this.timelines.get(event.roomId);
    if (!timeline) return;
    // Replace the local echo (same txnId) or an existing copy of the event.
    const idx = timeline.findIndex(
      (e) => e.eventId === event.eventId || (event.txnId && e.txnId === event.txnId),
    );
    if (idx >= 0) timeline[idx] = event;
    else timeline.push(event);
    timeline.sort((a, b) => a.ts - b.ts);
  }

  // ---- rooms ---------------------------------------------------------------

  private requireClient(): MatrixClient {
    if (!this.client) throw new Error('Sign in to Matrix first.');
    return this.client;
  }

  async openRoom(roomId: string): Promise<MatrixEventRecord[]> {
    if (!this.timelines.has(roomId)) {
      const cached = await this.store.listEvents(roomId);
      const pending = this.outbox
        .filter((item) => item.roomId === roomId)
        .map((item) => this.localEcho(item));
      this.timelines.set(
        roomId,
        [...cached, ...pending].sort((a, b) => a.ts - b.ts),
      );
    }
    this.emit();
    return this.timelines.get(roomId) ?? [];
  }

  async joinRoom(idOrAlias: string): Promise<string> {
    const roomId = await this.requireClient().joinRoom(idOrAlias);
    if (!this.rooms.has(roomId)) {
      const room: MatrixRoomRecord = {
        roomId,
        name: '',
        alias: idOrAlias.startsWith('#') ? idOrAlias : undefined,
        isDirect: false,
        memberIds: [],
        memberNames: {},
        encrypted: false,
        membership: 'join',
        lastActivityTs: this.opts.now(),
        unread: 0,
      };
      this.rooms.set(roomId, room);
      await this.store.putRooms([room]);
      this.emit();
    }
    return roomId;
  }

  async leaveRoom(roomId: string): Promise<void> {
    await this.requireClient().leaveRoom(roomId);
    this.rooms.delete(roomId);
    this.timelines.delete(roomId);
    await this.store.deleteRoom(roomId);
    this.emit();
  }

  /** Existing DM with `userId` from `m.direct`, else a new private room. */
  async openDirectMessage(userId: string): Promise<string> {
    const client = this.requireClient();
    const selfId = this.session?.userId ?? '';
    if (!Object.keys(this.directMap).length) {
      this.directMap = await client.getDirectRooms(selfId);
    }
    const existing = (this.directMap[userId] ?? []).find(
      (id) => this.rooms.get(id)?.membership === 'join',
    );
    if (existing) return existing;
    // Ask for encryption from the first event where the server honours
    // `initial_state`, then set it as a state event as well: Neutrino ignores
    // `initial_state` on /createRoom but accepts the state event, and on a
    // real homeserver the second write is a no-op. `encrypted` on the record
    // is what actually happened, not what was asked for — the padlock must
    // mean it.
    const wantEncrypted = this.encryptionReady;
    const roomId = await client.createDirectRoom(userId, wantEncrypted);
    let encrypted = false;
    if (wantEncrypted) {
      try {
        await client.enableEncryption(roomId);
        encrypted = true;
      } catch {
        // A server that cannot store the state event cannot carry an
        // encrypted room; the record stays honest and the notice explains.
      }
    }
    this.directMap = { ...this.directMap, [userId]: [...(this.directMap[userId] ?? []), roomId] };
    try {
      await client.setDirectRooms(selfId, this.directMap);
    } catch {
      // Losing the m.direct flag only affects grouping, not delivery.
    }
    const room: MatrixRoomRecord = {
      roomId,
      name: '',
      isDirect: true,
      memberIds: [selfId, userId],
      memberNames: {},
      encrypted,
      membership: 'join',
      lastActivityTs: this.opts.now(),
      unread: 0,
    };
    this.rooms.set(roomId, room);
    await this.store.putRooms([room]);
    this.emit();
    return roomId;
  }

  /** Invite a contact into a room (e.g. the conference hallway). */
  async inviteToRoom(roomId: string, userId: string): Promise<void> {
    await this.requireClient().inviteUser(roomId, userId);
  }

  async searchPublicRooms(term: string): Promise<PublicRoomSummary[]> {
    return this.requireClient().publicRooms(term);
  }

  async markRead(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const timeline = this.timelines.get(roomId) ?? (await this.store.listEvents(roomId, 1));
    const last = [...timeline].reverse().find((e) => !e.eventId.startsWith(LOCAL_ECHO_PREFIX));
    if (room.unread !== 0) {
      room.unread = 0;
      await this.store.putRooms([room]);
      this.emit();
    }
    if (last && this.client && this.status === 'online') {
      try {
        await this.client.sendReadReceipt(roomId, last.eventId);
      } catch {
        // Receipts are best effort.
      }
    }
  }

  /** Backfill older history for a room; returns how many events were added. */
  async loadOlder(roomId: string): Promise<number> {
    const room = this.rooms.get(roomId);
    if (!room?.prevBatch) return 0;
    const client = this.requireClient();
    const page = await client.roomMessages(roomId, room.prevBatch);
    const records: MatrixEventRecord[] = [];
    for (const event of page.chunk) {
      if (!event.event_id || !event.sender) continue;
      const described = describeEvent(event);
      if (!described) continue;
      records.push({
        eventId: event.event_id,
        roomId,
        sender: event.sender,
        ts: event.origin_server_ts ?? 0,
        type: event.type,
        body: described.body,
        msgtype: described.msgtype,
      });
    }
    room.prevBatch = page.end;
    await this.store.putRooms([room]);
    if (records.length) {
      await this.store.putEvents(records);
      for (const record of records) this.mergeIntoTimeline(record);
    }
    this.emit();
    return records.length;
  }

  // ---- sending -------------------------------------------------------------

  private localEcho(item: MatrixOutboxRecord): MatrixEventRecord {
    return {
      eventId: `${LOCAL_ECHO_PREFIX}${item.txnId}`,
      roomId: item.roomId,
      sender: this.session?.userId ?? '',
      ts: Date.parse(item.createdAt),
      type: 'm.room.message',
      body: item.body,
      msgtype: 'm.text',
      txnId: item.txnId,
      ...(this.rooms.get(item.roomId)?.encrypted ? { encrypted: true } : {}),
    };
  }

  /**
   * Queue a text message. It shows immediately as a local echo, is persisted
   * so it survives reloads, and is delivered as soon as the homeserver is
   * reachable. The transaction id keeps retries idempotent.
   */
  async sendMessage(roomId: string, body: string, replyTo?: string): Promise<void> {
    if (!this.session) throw new Error('Sign in to Matrix first.');
    const text = body.trim();
    if (!text) return;
    const item: MatrixOutboxRecord = {
      txnId: this.newTxnId(),
      roomId,
      body: text,
      ...(replyTo ? { replyTo } : {}),
      createdAt: new Date(this.opts.now()).toISOString(),
      attempts: 0,
    };
    this.outbox.push(item);
    await this.store.putOutbox(item);
    await this.openRoom(roomId);
    this.mergeIntoTimeline(this.localEcho(item));
    const room = this.rooms.get(roomId);
    if (room) room.lastActivityTs = Math.max(room.lastActivityTs, this.opts.now());
    this.emit();
    void this.flushOutbox();
  }

  private newTxnId(): string {
    return `ifc-${this.opts.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /** Deliver queued messages in order; stops at the first network failure. */
  async flushOutbox(): Promise<void> {
    if (this.flushing || !this.client) return;
    this.flushing = true;
    try {
      for (const item of [...this.outbox]) {
        try {
          const content: Record<string, unknown> = { msgtype: 'm.text', body: item.body };
          if (item.replyTo) {
            content['m.relates_to'] = { 'm.in_reply_to': { event_id: item.replyTo } };
          }
          if (this.rooms.get(item.roomId)?.encrypted) {
            await this.sendEncrypted(item.roomId, 'm.room.message', content, item.txnId);
          } else {
            await this.client.sendEvent(item.roomId, 'm.room.message', content, item.txnId);
          }
          this.outbox = this.outbox.filter((o) => o.txnId !== item.txnId);
          await this.store.deleteOutbox(item.txnId);
          this.emit();
        } catch (error) {
          item.attempts += 1;
          item.lastError = error instanceof Error ? error.message : String(error);
          await this.store.putOutbox(item);
          if (
            error instanceof MatrixError &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 429
          ) {
            // Permanent rejection (e.g. not in room): drop it and surface the error.
            this.outbox = this.outbox.filter((o) => o.txnId !== item.txnId);
            await this.store.deleteOutbox(item.txnId);
            const timeline = this.timelines.get(item.roomId);
            if (timeline) {
              const idx = timeline.findIndex((e) => e.txnId === item.txnId);
              if (idx >= 0) timeline.splice(idx, 1);
            }
            this.error = `Message not sent: ${item.lastError}`;
            this.emit();
            continue;
          }
          this.emit();
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}

/**
 * A device id for a new sign-in. Ten characters from the alphabet real
 * homeservers use, so it reads like theirs; the prefix says which app made
 * it when it shows up in a device list.
 */
function freshDeviceId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return 'IF' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
