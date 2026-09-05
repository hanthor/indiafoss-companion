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
