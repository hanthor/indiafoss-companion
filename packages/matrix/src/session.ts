import type {
  MatrixConnectionStatus,
  MatrixEventRecord,
  MatrixOutboxRecord,
  MatrixRoomRecord,
  MatrixSession,
  PublicRoomSummary,
} from './types.js';
import { MatrixClient, MatrixError, type FetchLike } from './http.js';
import { applySyncResponse, deriveRoomName, describeEvent } from './sync.js';

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
  error: string | null;
}

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
}

const LOCAL_ECHO_PREFIX = 'local:';

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
  private readonly opts: Required<Omit<MatrixSessionOptions, 'onChange'>> & {
    onChange: (snapshot: MatrixSnapshot) => void;
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
      error: this.error,
    };
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
    this.setStatus('connecting');
    this.start();
    return true;
  }

  async signInWithPassword(homeserverInput: string, user: string, password: string): Promise<void> {
    const base = await MatrixClient.discover(homeserverInput, this.opts.fetch);
    const client = new MatrixClient(base, null, this.opts.fetch);
    const session = await client.loginWithPassword(user, password, this.opts.deviceName);
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
    this.setStatus('connecting');
    this.start();
  }

  async signOut(): Promise<void> {
    await this.stop();
    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // Best effort: the token is dropped locally regardless.
      }
    }
    this.client = null;
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
    const delta = applySyncResponse(this.rooms, response, selfId, this.directMap);
    if (delta.directMap) this.directMap = delta.directMap;
    for (const room of delta.rooms) this.rooms.set(room.roomId, room);
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
    this.nextBatch = delta.nextBatch;
    await this.store.saveNextBatch(delta.nextBatch);
    this.emit();
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
    const roomId = await client.createDirectRoom(userId);
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
      encrypted: false,
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
    };
  }

  /**
   * Queue a text message. It shows immediately as a local echo, is persisted
   * so it survives reloads, and is delivered as soon as the homeserver is
   * reachable. The transaction id keeps retries idempotent.
   */
  async sendMessage(roomId: string, body: string): Promise<void> {
    if (!this.session) throw new Error('Sign in to Matrix first.');
    const text = body.trim();
    if (!text) return;
    const item: MatrixOutboxRecord = {
      txnId: `ifc-${this.opts.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      roomId,
      body: text,
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

  /** Deliver queued messages in order; stops at the first network failure. */
  async flushOutbox(): Promise<void> {
    if (this.flushing || !this.client) return;
    this.flushing = true;
    try {
      for (const item of [...this.outbox]) {
        try {
          await this.client.sendTextMessage(item.roomId, item.body, item.txnId);
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
