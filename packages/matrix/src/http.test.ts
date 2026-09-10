/**
 * The Matrix HTTP client's own behaviour: how it authenticates, and how a
 * server's refusal becomes something the app can act on.
 *
 * The sliding-sync folding this module also exports is covered in
 * `sync.test.ts`; this file is about the request path around it.
 */
import { describe, expect, it } from 'vitest';
import { isLoopbackHomeserver, MatrixClient, MatrixError } from './http.js';

function recording(status: number, body: unknown, ok = false) {
  const seen: { url: string; method: string; headers: Record<string, string>; body?: string }[] =
    [];
  const fetchFn = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    seen.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body === undefined ? undefined : String(init.body),
    });
    return Promise.resolve(
      new Response(body === undefined ? '' : JSON.stringify(body), {
        status: ok ? 200 : status,
      }),
    );
  };
  return { seen, fetchFn };
}

describe('MatrixError', () => {
  it('calls a 401 an auth failure, and M_UNKNOWN_TOKEN at any status', () => {
    // Both mean "sign in again". Neutrino answers 401 for an expired token and
    // some servers answer 403 with the errcode, so keying on either is what
    // keeps a stale session from looking like a permissions problem.
    expect(new MatrixError('x', 401).isAuthFailure).toBe(true);
    expect(new MatrixError('x', 403, 'M_UNKNOWN_TOKEN').isAuthFailure).toBe(true);
    expect(new MatrixError('x', 403, 'M_FORBIDDEN').isAuthFailure).toBe(false);
    expect(new MatrixError('x', 500).isAuthFailure).toBe(false);
  });

  it('is an Error with a name, so it survives logging and instanceof', () => {
    const e = new MatrixError('nope', 429, 'M_LIMIT_EXCEEDED', 2000);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('MatrixError');
    expect(e.message).toBe('nope');
    expect(e.retryAfterMs).toBe(2000);
  });
});

describe('isLoopbackHomeserver', () => {
  it('recognises a local homeserver however it is written', () => {
    // Re-exported from the model so the bundle validator and the client cannot
    // disagree about what counts as local (#152, #157).
    for (const good of ['http://localhost:8008', 'http://127.0.0.1:8008', '127.0.0.1:8008']) {
      expect(isLoopbackHomeserver(good), good).toBe(true);
    }
    for (const bad of ['https://matrix.reilly.asia', 'localhost.evil.example']) {
      expect(isLoopbackHomeserver(bad), bad).toBe(false);
    }
  });
});

describe('MatrixClient requests', () => {
  it('sends the access token, and JSON only when there is a body', async () => {
    const { seen, fetchFn } = recording(200, {}, true);
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    await c.rawRequest('GET', '/a');
    await c.rawRequest('POST', '/b', { x: 1 });
    expect(seen[0]?.headers.Authorization).toBe('Bearer tok');
    // No body means no Content-Type: sending one on a GET makes some proxies
    // and homeservers reject the request outright.
    expect(seen[0]?.headers['Content-Type']).toBeUndefined();
    expect(seen[1]?.headers['Content-Type']).toBe('application/json');
    expect(seen[1]?.body).toBe('{"x":1}');
  });

  it('omits the header entirely when there is no token', async () => {
    const { seen, fetchFn } = recording(200, {}, true);
    await new MatrixClient('https://hs.test', null, fetchFn).rawRequest('GET', '/a');
    expect(seen[0]?.headers.Authorization).toBeUndefined();
  });

  it('turns a refusal into a MatrixError carrying what the server said', async () => {
    const { fetchFn } = recording(429, {
      errcode: 'M_LIMIT_EXCEEDED',
      error: 'Too many requests',
      retry_after_ms: 3000,
    });
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    // retry_after_ms is the whole reason a caller can back off correctly
    // rather than hammering a rate-limited server.
    await expect(c.rawRequest('GET', '/a')).rejects.toMatchObject({
      status: 429,
      errcode: 'M_LIMIT_EXCEEDED',
      message: 'Too many requests',
      retryAfterMs: 3000,
    });
  });

  it('still reports the status when the error body is not JSON', async () => {
    // A reverse proxy in front of a node answers HTML, and the client must not
    // lose the status to a parse failure.
    const fetchFn = () => Promise.resolve(new Response('<html>502</html>', { status: 502 }));
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    await expect(c.rawRequest('GET', '/a')).rejects.toMatchObject({
      status: 502,
      message: 'Matrix request failed (HTTP 502)',
    });
  });

  it('reads an empty 200 as null rather than throwing', async () => {
    // Several Matrix endpoints answer 200 with no body at all.
    const fetchFn = () => Promise.resolve(new Response('', { status: 200 }));
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    await expect(c.rawRequest('POST', '/a', {})).resolves.toBeNull();
  });

  it('can have its token replaced without rebuilding the client', async () => {
    const { seen, fetchFn } = recording(200, {}, true);
    const c = new MatrixClient('https://hs.test', 'old', fetchFn);
    c.setAccessToken('new');
    await c.rawRequest('GET', '/a');
    expect(seen[0]?.headers.Authorization).toBe('Bearer new');
  });
});

/**
 * Route requests by path so one fetch can answer a whole conversation. The
 * first matching path wins; anything unmatched is a 404, which is also how a
 * homeserver answers an endpoint it does not implement.
 */
function routed(routes: Record<string, () => Response>) {
  const seen: { url: string; method: string; headers: Record<string, string>; body?: string }[] =
    [];
  const fetchFn = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    seen.push({
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body === undefined ? undefined : String(init.body),
    });
    const hit = Object.entries(routes).find(([path]) => url.includes(path));
    return Promise.resolve(hit ? hit[1]() : new Response('', { status: 404 }));
  };
  return { seen, fetchFn };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('MatrixClient.discover', () => {
  it('follows .well-known to the client API base the server names', async () => {
    const { seen, fetchFn } = routed({
      '/.well-known/matrix/client': () =>
        json({ 'm.homeserver': { base_url: 'https://matrix.hs.test/' } }),
    });
    await expect(MatrixClient.discover('hs.test', fetchFn)).resolves.toBe('https://matrix.hs.test');
    expect(seen[0]?.url).toBe('https://hs.test/.well-known/matrix/client');
  });

  it('uses the origin when there is no .well-known or the server is unreachable', async () => {
    await expect(MatrixClient.discover('hs.test', routed({}).fetchFn)).resolves.toBe(
      'https://hs.test',
    );
    // An explicit scheme is kept: an embedded node is plain http.
    await expect(
      MatrixClient.discover('http://localhost:8008/', () =>
        Promise.reject(new TypeError('offline')),
      ),
    ).resolves.toBe('http://localhost:8008');
  });

  it('refuses a blank name rather than probing https://', async () => {
    await expect(MatrixClient.discover('  ', routed({}).fetchFn)).rejects.toThrow(
      'Enter a homeserver name',
    );
  });
});

describe('MatrixClient.loginWithPassword', () => {
  const answer = () =>
    json({ user_id: '@asha:hs.test', access_token: 'syt_new', device_id: 'SERVERDEV' });

  it('sends the localpart and the requested device id, without any stale token', async () => {
    const { seen, fetchFn } = routed({ '/login': answer });
    const c = new MatrixClient('https://hs.test/', 'stale', fetchFn);
    const session = await c.loginWithPassword('@asha:hs.test', 'pw', 'Companion', 'FRESHDEV');
    expect(seen[0]?.method).toBe('POST');
    // Login is unauthenticated: a token left over from a previous install
    // must not be presented, or a server can reject the whole request.
    expect(seen[0]?.headers.Authorization).toBeUndefined();
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: 'asha' },
      password: 'pw',
      initial_device_display_name: 'Companion',
      device_id: 'FRESHDEV',
    });
    // The device id stored is the one the server answered with, which a
    // server that ignores the request may choose itself.
    expect(session).toEqual({
      homeserver: 'https://hs.test',
      userId: '@asha:hs.test',
      accessToken: 'syt_new',
      deviceId: 'SERVERDEV',
    });
  });

  it('leaves device_id out when none is requested, and then uses the new token', async () => {
    const { seen, fetchFn } = routed({ '/login': answer, '/after': () => json({}) });
    const c = new MatrixClient('https://hs.test', null, fetchFn);
    await c.loginWithPassword('asha', 'pw', 'Companion');
    expect(JSON.parse(seen[0]?.body ?? '{}')).not.toHaveProperty('device_id');
    await c.rawRequest('GET', '/after');
    expect(seen[1]?.headers.Authorization).toBe('Bearer syt_new');
  });

  it('surfaces a wrong password as a MatrixError the UI can explain', async () => {
    const { fetchFn } = routed({
      '/login': () => json({ errcode: 'M_FORBIDDEN', error: 'Invalid password' }, 403),
    });
    const c = new MatrixClient('https://hs.test', null, fetchFn);
    await expect(c.loginWithPassword('asha', 'wrong', 'Companion')).rejects.toMatchObject({
      status: 403,
      errcode: 'M_FORBIDDEN',
      message: 'Invalid password',
    });
  });
});

describe('MatrixClient rooms', () => {
  it('asks for encryption in the first event and reads the alias back from the server', async () => {
    const { seen, fetchFn } = routed({
      '/createRoom': () => json({ room_id: '!r:hs.test', room_alias: '#talk-1:hs.test' }),
    });
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    const created = await c.createRoom({
      name: 'Talk 1',
      aliasLocalpart: 'talk-1',
      encrypted: true,
    });
    expect(created).toEqual({ roomId: '!r:hs.test', alias: '#talk-1:hs.test' });
    const body = JSON.parse(seen[0]?.body ?? '{}');
    expect(body.room_alias_name).toBe('talk-1');
    expect(body.initial_state).toEqual([
      {
        type: 'm.room.encryption',
        state_key: '',
        content: { algorithm: 'm.megolm.v1.aes-sha2' },
      },
    ]);
  });

  it('reports no alias when the server drops the request for one', async () => {
    const { fetchFn } = routed({ '/createRoom': () => json({ room_id: '!r:hs.test' }) });
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    await expect(c.createRoom({ aliasLocalpart: 'talk-1' })).resolves.toEqual({
      roomId: '!r:hs.test',
      alias: undefined,
    });
  });

  it('lists members from /joined_members when the server has it', async () => {
    const { seen, fetchFn } = routed({
      '/joined_members': () => json({ joined: { '@a:hs.test': {}, '@b:hs.test': {} } }),
    });
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    await expect(c.roomMembers('!r:hs.test')).resolves.toEqual(['@a:hs.test', '@b:hs.test']);
    expect(seen).toHaveLength(1);
  });

  it('falls back to /members on a server without /joined_members, counting only joined once', async () => {
    // Neutrino answers 404 to /joined_members; without the fallback the mesh
    // member list came back empty.
    const { seen, fetchFn } = routed({
      '/members': () =>
        json({
          chunk: [
            { state_key: '@a:hs.test', content: { membership: 'join' } },
            { state_key: '@a:hs.test', content: { membership: 'join' } },
            { state_key: '@gone:hs.test', content: { membership: 'leave' } },
            { sender: '@s:hs.test', content: { membership: 'join' } },
          ],
        }),
    });
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    await expect(c.roomMembers('!r:hs.test')).resolves.toEqual(['@a:hs.test', '@s:hs.test']);
    expect(seen.map((s) => s.url)).toEqual([
      'https://hs.test/_matrix/client/v3/rooms/!r%3Ahs.test/joined_members',
      'https://hs.test/_matrix/client/v3/rooms/!r%3Ahs.test/members',
    ]);
  });
});

describe('MatrixClient media', () => {
  it('uploads with the token and content type, and returns the mxc URI', async () => {
    const { seen, fetchFn } = routed({
      '/_matrix/media/v3/upload': () => json({ content_uri: 'mxc://hs.test/abc' }),
    });
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    await expect(c.uploadMedia(new Uint8Array([1, 2, 3]), 'image/png', 'me.png')).resolves.toBe(
      'mxc://hs.test/abc',
    );
    expect(seen[0]?.url).toBe('https://hs.test/_matrix/media/v3/upload?filename=me.png');
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.headers).toEqual({ 'Content-Type': 'image/png', Authorization: 'Bearer tok' });
  });

  it('turns an upload refusal into a MatrixError carrying the reason', async () => {
    const { fetchFn } = routed({
      '/upload': () => json({ errcode: 'M_TOO_LARGE', error: 'Upload too large' }, 413),
    });
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    await expect(c.uploadMedia(new Uint8Array(1), 'image/png')).rejects.toMatchObject({
      status: 413,
      errcode: 'M_TOO_LARGE',
      message: 'Upload too large',
    });
  });

  it('downloads through the authenticated endpoint, falling back to the legacy one', async () => {
    // A pre-1.11 server answers 404 for /client/v1/media; the legacy path
    // still serves the bytes.
    const { seen, fetchFn } = routed({
      '/_matrix/media/v3/download/': () => new Response(new Uint8Array([9, 8]), { status: 200 }),
    });
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    await expect(c.downloadMedia('mxc://hs.test/abc')).resolves.toEqual(new Uint8Array([9, 8]));
    expect(seen.map((s) => s.url)).toEqual([
      'https://hs.test/_matrix/client/v1/media/download/hs.test/abc',
      'https://hs.test/_matrix/media/v3/download/hs.test/abc',
    ]);
    expect(seen[0]?.headers.Authorization).toBe('Bearer tok');
  });

  it('does not try the legacy path for a refusal that is not 404', async () => {
    // 403 means the server has the endpoint and said no; asking the
    // unauthenticated path next would only leak the attempt.
    const { seen, fetchFn } = routed({
      '/_matrix/client/v1/media/download/': () => json({ errcode: 'M_FORBIDDEN' }, 403),
    });
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    await expect(c.downloadMedia('mxc://hs.test/abc')).rejects.toMatchObject({ status: 403 });
    expect(seen).toHaveLength(1);
  });

  it('rejects something that is not an mxc URL before touching the network', async () => {
    const { seen, fetchFn } = routed({});
    const c = new MatrixClient('https://hs.test', 'tok', fetchFn);
    await expect(c.downloadMedia('https://hs.test/abc')).rejects.toThrow('Not an mxc:// URL');
    expect(seen).toHaveLength(0);
  });
});
