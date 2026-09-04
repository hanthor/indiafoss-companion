import { describe, expect, it, vi } from 'vitest';
import {
  MatrixClient,
  MatrixError,
  isLoopbackHomeserver,
  slidingSyncToSyncResponse,
  SLIDING_SYNC_CONN_ID,
  SLIDING_SYNC_FLAG,
  SLIDING_SYNC_PATH,
  SYNC_FILTER,
  type FetchLike,
  type SlidingSyncResponse,
} from './http.js';

describe('isLoopbackHomeserver', () => {
  it('returns true for loopback addresses', () => {
    expect(isLoopbackHomeserver('http://localhost:8008')).toBe(true);
    expect(isLoopbackHomeserver('http://127.0.0.1:8008')).toBe(true);
    expect(isLoopbackHomeserver('http://[::1]:8008')).toBe(true);
  });

  it('returns false for remote servers or invalid URLs', () => {
    expect(isLoopbackHomeserver('https://matrix.org')).toBe(false);
    expect(isLoopbackHomeserver('invalid-url')).toBe(false);
  });
});

describe('MatrixError', () => {
  it('identifies auth failures correctly', () => {
    const err401 = new MatrixError('Unauthorized', 401, 'M_UNAUTHORIZED');
    expect(err401.isAuthFailure).toBe(true);

    const errUnknownToken = new MatrixError('Invalid token', 403, 'M_UNKNOWN_TOKEN');
    expect(errUnknownToken.isAuthFailure).toBe(true);

    const errForbidden = new MatrixError('Forbidden', 403, 'M_FORBIDDEN');
    expect(errForbidden.isAuthFailure).toBe(false);
  });

  it('preserves status, errcode, and retryAfterMs', () => {
    const err = new MatrixError('Rate limited', 429, 'M_LIMIT_EXCEEDED', 5000);
    expect(err.message).toBe('Rate limited');
    expect(err.status).toBe(429);
    expect(err.errcode).toBe('M_LIMIT_EXCEEDED');
    expect(err.retryAfterMs).toBe(5000);
    expect(err.name).toBe('MatrixError');
  });
});

describe('slidingSyncToSyncResponse', () => {
  it('converts sliding sync response to standard sync response', () => {
    const input: SlidingSyncResponse = {
      pos: 's123_456',
      rooms: {
        '!room1:example.org': {
          timeline: [{ type: 'm.room.message', content: { body: 'hello' } } as any],
          prev_batch: 't12',
          limited: false,
          required_state: [{ type: 'm.room.name', content: { name: 'Room 1' } } as any],
        },
        '!room2:example.org': {
          invite_state: [{ type: 'm.room.name', content: { name: 'Room 2' } } as any],
        },
      },
      extensions: {
        typing: {
          rooms: {
            '!room1:example.org': { type: 'm.typing', content: { user_ids: ['@alice:ex.org'] } } as any,
          },
        },
        to_device: {
          events: [{ type: 'm.new_device', content: {} } as any],
        },
        account_data: {
          global: [{ type: 'm.direct', content: {} } as any],
        },
        e2ee: {
          device_lists: { changed: ['@bob:ex.org'] },
          device_one_time_keys_count: { curve25519: 10 },
          device_unused_fallback_key_types: ['signed_curve25519'],
        },
      },
    };

    const res = slidingSyncToSyncResponse(input);
    expect(res.next_batch).toBe('s123_456');
    expect(res.rooms.join['!room1:example.org']).toBeDefined();
    expect(res.rooms.join['!room1:example.org']?.timeline.events.length).toBe(1);
    expect(res.rooms.join['!room1:example.org']?.ephemeral?.events.length).toBe(1);
    expect(res.rooms.invite['!room2:example.org']).toBeDefined();
    expect(res.to_device?.events.length).toBe(1);
    expect(res.account_data?.events.length).toBe(1);
    expect(res.device_lists?.changed).toEqual(['@bob:ex.org']);
    expect(res.device_one_time_keys_count).toEqual({ curve25519: 10 });
    expect(res.device_unused_fallback_key_types).toEqual(['signed_curve25519']);
  });
});

describe('MatrixClient', () => {
  it('normalizes base URL and handles discovery', async () => {
    const mockFetch: FetchLike = async (url) => {
      if (url === 'https://example.org/.well-known/matrix/client') {
        return new Response(JSON.stringify({ 'm.homeserver': { base_url: 'https://matrix.example.org/' } }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    };

    const discovered = await MatrixClient.discover('example.org', mockFetch);
    expect(discovered).toBe('https://matrix.example.org');

    const fallback = await MatrixClient.discover('https://fallback.org', async () => new Response(null, { status: 404 }));
    expect(fallback).toBe('https://fallback.org');
  });

  it('throws on empty discover input', async () => {
    await expect(MatrixClient.discover('  ')).rejects.toThrow('Enter a homeserver name');
  });

  it('logs in with password and sets access token', async () => {
    let capturedBody: any = null;
    const mockFetch: FetchLike = async (url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          user_id: '@alice:example.org',
          access_token: 'syt_secret_123',
          device_id: 'DEV123',
        }),
        { status: 200 },
      );
    };

    const client = new MatrixClient('https://example.org', null, mockFetch);
    const session = await client.loginWithPassword('@alice:example.org', 'password123', 'Web Client', 'CUSTOM_DEV');

    expect(capturedBody.type).toBe('m.login.password');
    expect(capturedBody.identifier.user).toBe('alice');
    expect(capturedBody.password).toBe('password123');
    expect(capturedBody.device_id).toBe('CUSTOM_DEV');

    expect(session.userId).toBe('@alice:example.org');
    expect(session.accessToken).toBe('syt_secret_123');
    expect(session.deviceId).toBe('DEV123');
  });

  it('handles room management calls and member fallback', async () => {
    const calls: { url: string; method: string }[] = [];
    const mockFetch: FetchLike = async (url, init) => {
      calls.push({ url, method: init?.method || 'GET' });
      if (url.includes('/joined_members')) {
        return new Response(null, { status: 404 });
      }
      if (url.includes('/members')) {
        return new Response(
          JSON.stringify({
            chunk: [
              { state_key: '@alice:ex.org', content: { membership: 'join' } },
              { state_key: '@bob:ex.org', content: { membership: 'leave' } },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/createRoom')) {
        return new Response(JSON.stringify({ room_id: '!newroom:ex.org' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const client = new MatrixClient('https://example.org', 'token', mockFetch);
    const roomId = await client.createRoom({ name: 'Test Room', encrypted: true });
    expect(roomId).toBe('!newroom:ex.org');

    const members = await client.roomMembers('!newroom:ex.org');
    expect(members).toEqual(['@alice:ex.org']);
  });

  it('handles media upload and download with fallback', async () => {
    const mockFetch: FetchLike = async (url) => {
      if (url.includes('/upload')) {
        return new Response(JSON.stringify({ content_uri: 'mxc://example.org/media123' }), { status: 200 });
      }
      if (url.includes('/media/v1/media/download/')) {
        return new Response(null, { status: 404 });
      }
      if (url.includes('/media/v3/download/')) {
        return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 });
      }
      return new Response(null, { status: 404 });
    };

    const client = new MatrixClient('https://example.org', 'token', mockFetch);
    const uri = await client.uploadMedia(new Uint8Array([1, 2, 3]), 'image/png', 'test.png');
    expect(uri).toBe('mxc://example.org/media123');

    const bytes = await client.downloadMedia('mxc://example.org/media123');
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });
});
