import type { PublicRoomSummary, RawMatrixEvent, SyncResponse, MatrixSession } from './types.js';

export interface CreateRoomOptions {
  name?: string;
  topic?: string;
  /** Localpart of the canonical alias (`hallway` → `#hallway:server`). */
  aliasLocalpart?: string;
  invite?: string[];
  isDirect?: boolean;
  preset?: 'private_chat' | 'trusted_private_chat' | 'public_chat';
  visibility?: 'public' | 'private';
  /** Turn on Megolm encryption from the first event. */
  encrypted?: boolean;
}

export class MatrixError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errcode?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'MatrixError';
  }

  /** True when the access token is no longer valid and the user must sign in again. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.errcode === 'M_UNKNOWN_TOKEN';
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const CS = '/_matrix/client/v3';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Sync filter: message timelines, lazy-loaded members, typing only, no presence. */
export const SYNC_FILTER = JSON.stringify({
  presence: { types: [] },
  room: {
    timeline: { limit: 30, lazy_load_members: true },
    state: { lazy_load_members: true },
    ephemeral: { types: ['m.typing'] },
  },
});

function normalizeBaseUrlHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

/** True for an on-device homeserver (e.g. an embedded Neutrino node). */
export function isLoopbackHomeserver(url: string): boolean {
  return normalizeBaseUrlHost(url);
}

/**
 * Thin, dependency-free client for the Matrix client-server API. Only the
 * endpoints the companion needs are exposed; everything is plain `fetch`.
 */
export class MatrixClient {
  readonly baseUrl: string;
  private readonly fetchFn: FetchLike;

  constructor(
    homeserver: string,
    private accessToken: string | null = null,
    fetchFn: FetchLike = (input, init) => globalThis.fetch(input, init),
  ) {
    this.baseUrl = normalizeBaseUrl(homeserver);
    this.fetchFn = fetchFn;
  }

  /**
   * Resolve the client API base URL for a server name or URL using
   * `.well-known/matrix/client` (§ Matrix spec, server discovery). Falls back
   * to `https://<name>` when discovery is unavailable.
   */
  static async discover(
    input: string,
    fetchFn: FetchLike = (i, init) => globalThis.fetch(i, init),
  ): Promise<string> {
    const trimmed = input.trim();
    if (!trimmed) throw new Error('Enter a homeserver name such as matrix.org');
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const origin = normalizeBaseUrl(new URL(candidate).origin);
    try {
      const res = await fetchFn(`${origin}/.well-known/matrix/client`, {
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const json = (await res.json()) as { 'm.homeserver'?: { base_url?: string } };
        const base = json['m.homeserver']?.base_url;
        if (base) return normalizeBaseUrl(base);
      }
    } catch {
      // No well-known: use the origin as-is.
    }
    return origin;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  /** Escape hatch for endpoints not wrapped below (MSC extensions). */
  rawRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    return this.request<T>(method, path, body);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    init: { signal?: AbortSignal; auth?: boolean } = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.auth !== false && this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: init.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      const err = (json ?? {}) as { errcode?: string; error?: string; retry_after_ms?: number };
      throw new MatrixError(
        err.error ?? `Matrix request failed (HTTP ${res.status})`,
        res.status,
        err.errcode,
        err.retry_after_ms,
      );
    }
    return json as T;
  }

  // ---- authentication ------------------------------------------------------

  async loginFlows(): Promise<string[]> {
    const json = await this.request<{ flows?: { type: string }[] }>(
      'GET',
      `${CS}/login`,
      undefined,
      {
        auth: false,
      },
    );
    return (json.flows ?? []).map((f) => f.type);
  }

  async loginWithPassword(
    user: string,
    password: string,
    deviceName: string,
  ): Promise<MatrixSession> {
    const localpart = user.trim().replace(/^@/, '').replace(/:.*$/, '');
    const json = await this.request<{ user_id: string; access_token: string; device_id?: string }>(
      'POST',
      `${CS}/login`,
      {
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user: localpart },
        password,
        initial_device_display_name: deviceName,
      },
      { auth: false },
    );
    return this.sessionFromLogin(json);
  }

  async loginWithToken(token: string, deviceName: string): Promise<MatrixSession> {
    const json = await this.request<{ user_id: string; access_token: string; device_id?: string }>(
      'POST',
      `${CS}/login`,
      { type: 'm.login.token', token, initial_device_display_name: deviceName },
      { auth: false },
    );
    return this.sessionFromLogin(json);
  }

  private sessionFromLogin(json: {
    user_id: string;
    access_token: string;
    device_id?: string;
  }): MatrixSession {
    this.accessToken = json.access_token;
    return {
      homeserver: this.baseUrl,
      userId: json.user_id,
      accessToken: json.access_token,
      deviceId: json.device_id,
    };
  }

  /** URL that starts an SSO login; the homeserver redirects back with `?loginToken=`. */
  ssoRedirectUrl(redirectUrl: string): string {
    return `${this.baseUrl}${CS}/login/sso/redirect?redirectUrl=${encodeURIComponent(redirectUrl)}`;
  }

  async whoami(): Promise<{ user_id: string; device_id?: string }> {
    return this.request('GET', `${CS}/account/whoami`);
  }

  async logout(): Promise<void> {
    await this.request('POST', `${CS}/logout`, {});
  }

  async displayName(userId: string): Promise<string | undefined> {
    try {
      const json = await this.request<{ displayname?: string }>(
        'GET',
        `${CS}/profile/${encodeURIComponent(userId)}/displayname`,
      );
      return json.displayname;
    } catch {
      return undefined;
    }
  }

  // ---- sync + rooms --------------------------------------------------------

  async sync(options: {
    since?: string;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<SyncResponse> {
    const params = new URLSearchParams({ timeout: String(options.timeoutMs), filter: SYNC_FILTER });
    if (options.since) params.set('since', options.since);
    return this.request('GET', `${CS}/sync?${params.toString()}`, undefined, {
      signal: options.signal,
    });
  }

  async joinRoom(idOrAlias: string): Promise<string> {
    const json = await this.request<{ room_id: string }>(
      'POST',
      `${CS}/join/${encodeURIComponent(idOrAlias)}`,
      {},
    );
    return json.room_id;
  }

  async leaveRoom(roomId: string): Promise<void> {
    await this.request('POST', `${CS}/rooms/${encodeURIComponent(roomId)}/leave`, {});
  }

  async inviteUser(roomId: string, userId: string): Promise<void> {
    await this.request('POST', `${CS}/rooms/${encodeURIComponent(roomId)}/invite`, {
      user_id: userId,
    });
  }

  async resolveAlias(alias: string): Promise<string> {
    const json = await this.request<{ room_id: string }>(
      'GET',
      `${CS}/directory/room/${encodeURIComponent(alias)}`,
    );
    return json.room_id;
  }

  async createRoom(options: CreateRoomOptions): Promise<string> {
    const body: Record<string, unknown> = {};
    if (options.name) body.name = options.name;
    if (options.topic) body.topic = options.topic;
    if (options.aliasLocalpart) body.room_alias_name = options.aliasLocalpart;
    if (options.invite?.length) body.invite = options.invite;
    if (options.isDirect) body.is_direct = true;
    if (options.preset) body.preset = options.preset;
    if (options.visibility) body.visibility = options.visibility;
    if (options.encrypted) {
      body.initial_state = [
        {
          type: 'm.room.encryption',
          state_key: '',
          content: { algorithm: 'm.megolm.v1.aes-sha2' },
        },
      ];
    }
    const json = await this.request<{ room_id: string }>('POST', `${CS}/createRoom`, body);
    return json.room_id;
  }

  async createDirectRoom(userId: string, encrypted = false): Promise<string> {
    return this.createRoom({
      preset: 'trusted_private_chat',
      isDirect: true,
      invite: [userId],
      encrypted,
    });
  }

  /** Turn on Megolm encryption for an existing room (irreversible). */
  async enableEncryption(roomId: string): Promise<void> {
    await this.request(
      'PUT',
      `${CS}/rooms/${encodeURIComponent(roomId)}/state/m.room.encryption/`,
      { algorithm: 'm.megolm.v1.aes-sha2' },
    );
  }

  async joinedMembers(roomId: string): Promise<string[]> {
    const json = await this.request<{ joined?: Record<string, unknown> }>(
      'GET',
      `${CS}/rooms/${encodeURIComponent(roomId)}/joined_members`,
    );
    return Object.keys(json.joined ?? {});
  }

  /**
   * Members from the `/members` state endpoint, which some servers implement
   * when `/joined_members` is absent — Neutrino is one, so the mesh member
   * list came back empty until this fallback existed.
   */
  async roomMembers(roomId: string): Promise<string[]> {
    try {
      return await this.joinedMembers(roomId);
    } catch {
      const json = await this.request<{
        chunk?: { sender?: string; state_key?: string; content?: { membership?: string } }[];
      }>('GET', `${CS}/rooms/${encodeURIComponent(roomId)}/members`);
      const joined = (json.chunk ?? []).filter((e) => e.content?.membership === 'join');
      return [...new Set(joined.map((e) => e.state_key ?? e.sender ?? '').filter(Boolean))];
    }
  }

  async sendEvent(
    roomId: string,
    type: string,
    content: unknown,
    txnId: string,
  ): Promise<{ event_id: string }> {
    return this.request<{ event_id: string }>(
      'PUT',
      `${CS}/rooms/${encodeURIComponent(roomId)}/send/${encodeURIComponent(type)}/${encodeURIComponent(txnId)}`,
      content,
    );
  }

  async sendTextMessage(roomId: string, body: string, txnId: string): Promise<string> {
    const json = await this.sendEvent(roomId, 'm.room.message', { msgtype: 'm.text', body }, txnId);
    return json.event_id;
  }

  async setTyping(
    roomId: string,
    userId: string,
    typing: boolean,
    timeoutMs = 20_000,
  ): Promise<void> {
    await this.request(
      'PUT',
      `${CS}/rooms/${encodeURIComponent(roomId)}/typing/${encodeURIComponent(userId)}`,
      typing ? { typing: true, timeout: timeoutMs } : { typing: false },
    );
  }

  // ---- end-to-end encryption -------------------------------------------------

  keysUpload(body: unknown): Promise<unknown> {
    return this.request('POST', `${CS}/keys/upload`, body);
  }

  keysQuery(body: unknown): Promise<unknown> {
    return this.request('POST', `${CS}/keys/query`, body);
  }

  keysClaim(body: unknown): Promise<unknown> {
    return this.request('POST', `${CS}/keys/claim`, body);
  }

  keysSignatureUpload(body: unknown): Promise<unknown> {
    return this.request('POST', `${CS}/keys/signatures/upload`, body);
  }

  sendToDevice(eventType: string, txnId: string, body: unknown): Promise<unknown> {
    return this.request(
      'PUT',
      `${CS}/sendToDevice/${encodeURIComponent(eventType)}/${encodeURIComponent(txnId)}`,
      body,
    );
  }

  // ---- media ---------------------------------------------------------------

  /** Upload bytes to the content repository; returns the `mxc://` URI. */
  async uploadMedia(bytes: Uint8Array, mime: string, filename?: string): Promise<string> {
    const params = filename ? `?filename=${encodeURIComponent(filename)}` : '';
    const headers: Record<string, string> = { 'Content-Type': mime };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    const res = await this.fetchFn(`${this.baseUrl}/_matrix/media/v3/upload${params}`, {
      method: 'POST',
      headers,
      body: bytes as unknown as BodyInit,
    });
    const json = (await res.json().catch(() => ({}))) as {
      content_uri?: string;
      errcode?: string;
      error?: string;
    };
    if (!res.ok || !json.content_uri) {
      throw new MatrixError(
        json.error ?? `Upload failed (HTTP ${res.status})`,
        res.status,
        json.errcode,
      );
    }
    return json.content_uri;
  }

  /** Download media through the authenticated endpoint (v1.11+), falling back to the legacy one. */
  async downloadMedia(mxcUrl: string): Promise<Uint8Array> {
    const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error(`Not an mxc:// URL: ${mxcUrl}`);
    const [, server, mediaId] = match;
    const headers: Record<string, string> = {};
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    const paths = [
      `/_matrix/client/v1/media/download/${encodeURIComponent(server!)}/${encodeURIComponent(mediaId!)}`,
      `/_matrix/media/v3/download/${encodeURIComponent(server!)}/${encodeURIComponent(mediaId!)}`,
    ];
    let last: Response | null = null;
    for (const path of paths) {
      const res = await this.fetchFn(`${this.baseUrl}${path}`, { headers });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      last = res;
      if (res.status !== 404) break;
    }
    throw new MatrixError(`Media download failed (HTTP ${last?.status ?? 0})`, last?.status ?? 0);
  }

  /** Redact an event (used to take back a reaction). */
  async redactEvent(roomId: string, eventId: string, txnId: string): Promise<void> {
    await this.request(
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/redact/${encodeURIComponent(eventId)}/${encodeURIComponent(txnId)}`,
      {},
    );
  }

  async sendReadReceipt(roomId: string, eventId: string): Promise<void> {
    await this.request(
      'POST',
      `${CS}/rooms/${encodeURIComponent(roomId)}/receipt/m.read/${encodeURIComponent(eventId)}`,
      {},
    );
  }

  async roomMessages(
    roomId: string,
    from: string,
    limit = 50,
  ): Promise<{ chunk: RawMatrixEvent[]; end?: string }> {
    const params = new URLSearchParams({ from, dir: 'b', limit: String(limit) });
    return this.request(
      'GET',
      `${CS}/rooms/${encodeURIComponent(roomId)}/messages?${params.toString()}`,
    );
  }

  async publicRooms(term: string, limit = 20): Promise<PublicRoomSummary[]> {
    const json = await this.request<{
      chunk?: {
        room_id: string;
        name?: string;
        canonical_alias?: string;
        topic?: string;
        num_joined_members?: number;
        join_rule?: string;
      }[];
    }>('POST', `${CS}/publicRooms`, { limit, filter: { generic_search_term: term } });
    return (json.chunk ?? []).map((r) => ({
      roomId: r.room_id,
      name: r.name,
      alias: r.canonical_alias,
      topic: r.topic,
      members: r.num_joined_members ?? 0,
      joinRule: r.join_rule,
    }));
  }

  // ---- account data ---------------------------------------------------------

  async getDirectRooms(userId: string): Promise<Record<string, string[]>> {
    try {
      return await this.request(
        'GET',
        `${CS}/user/${encodeURIComponent(userId)}/account_data/m.direct`,
      );
    } catch (error) {
      if (error instanceof MatrixError && error.status === 404) return {};
      throw error;
    }
  }

  async setDirectRooms(userId: string, map: Record<string, string[]>): Promise<void> {
    await this.request(
      'PUT',
      `${CS}/user/${encodeURIComponent(userId)}/account_data/m.direct`,
      map,
    );
  }
}
