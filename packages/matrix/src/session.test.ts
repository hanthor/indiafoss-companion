import { describe, expect, it } from 'vitest';
import { MatrixSessionManager, MemoryMatrixStore } from './session.js';
import type { FetchLike } from './http.js';
import type { SyncResponse } from './types.js';

/** Tiny in-memory homeserver covering the endpoints the manager uses. */
class FakeHomeserver {
  online = true;
  sent: { roomId: string; txnId: string; body: string }[] = [];
  syncQueue: SyncResponse[] = [];
  requests: string[] = [];
  syncCalls = 0;

  fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? 'GET';
    this.requests.push(`${method} ${url.pathname}`);
    if (!this.online) throw new TypeError('Failed to fetch');
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    const path = url.pathname;

    if (path === '/.well-known/matrix/client')
      return json({ 'm.homeserver': { base_url: 'https://hs.test/' } });
    if (path.endsWith('/login') && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { identifier?: { user?: string } };
      if (body.identifier?.user !== 'alice')
        return json({ errcode: 'M_FORBIDDEN', error: 'bad' }, 403);
      return json({ user_id: '@alice:hs.test', access_token: 'tok', device_id: 'DEV' });
    }
    if (path.includes('/profile/')) return json({ displayname: 'Alice' });
    if (path.endsWith('/sync')) {
      this.syncCalls += 1;
      if (
        init?.headers &&
        (init.headers as Record<string, string>).Authorization !== 'Bearer tok'
      ) {
        return json({ errcode: 'M_UNKNOWN_TOKEN', error: 'expired' }, 401);
      }
      const next = this.syncQueue.shift();
      if (next) return json(next);
      // Nothing new: behave like a long-poll that timed out.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return json({ next_batch: `s${this.syncCalls}` });
    }
    const send = path.match(/\/rooms\/([^/]+)\/send\/m\.room\.message\/([^/]+)$/);
    if (send) {
      const roomId = decodeURIComponent(send[1]!);
      const txnId = decodeURIComponent(send[2]!);
      if (roomId === '!forbidden:hs.test')
        return json({ errcode: 'M_FORBIDDEN', error: 'not in room' }, 403);
      const body = JSON.parse(String(init?.body)) as { body: string };
      if (!this.sent.some((s) => s.txnId === txnId))
        this.sent.push({ roomId, txnId, body: body.body });
      return json({ event_id: `$${txnId}` });
    }
    if (path.startsWith('/_matrix/client/v3/join/')) {
      const alias = decodeURIComponent(path.split('/join/')[1]!);
      return json({
        room_id: alias === '#hallway:hs.test' ? '!hallway:hs.test' : '!joined:hs.test',
      });
    }
    if (path.endsWith('/account_data/m.direct') && method === 'GET') return json({}, 404);
    if (path.endsWith('/account_data/m.direct') && method === 'PUT') return json({});
    if (path.endsWith('/createRoom')) return json({ room_id: '!dm:hs.test' });
    if (path.endsWith('/logout')) return json({});
    if (path.includes('/receipt/')) return json({});
    return json({ errcode: 'M_UNRECOGNIZED', error: path }, 404);
  };
}

async function settle(ms = 30): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function manager(hs: FakeHomeserver, store = new MemoryMatrixStore()) {
  const snapshots: string[] = [];
  const m = new MatrixSessionManager(store, {
    fetch: hs.fetch,
    syncTimeoutMs: 0,
    maxBackoffMs: 10,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 10))),
    onChange: (s) => snapshots.push(s.status),
  });
  return { m, store, snapshots };
}

describe('MatrixSessionManager', () => {
  it('signs in via well-known discovery, syncs rooms and persists the session', async () => {
    const hs = new FakeHomeserver();
    hs.syncQueue.push({
      next_batch: 'first',
      rooms: {
        join: {
          '!hallway:hs.test': {
            state: { events: [{ type: 'm.room.name', content: { name: 'Hallway' } }] },
            timeline: {
              events: [
                {
                  event_id: '$a',
                  type: 'm.room.message',
                  sender: '@bob:hs.test',
                  origin_server_ts: 100,
                  content: { msgtype: 'm.text', body: 'welcome' },
                },
              ],
            },
          },
        },
      },
    });
    const { m, store } = manager(hs);
    await m.signInWithPassword('hs.test', '@alice:hs.test', 'pw');
    await settle();

    expect(store.session?.userId).toBe('@alice:hs.test');
    expect(store.session?.homeserver).toBe('https://hs.test');
    expect(store.session?.displayName).toBe('Alice');
    const snap = m.snapshot();
    expect(snap.status).toBe('online');
    expect(snap.rooms.map((r) => r.name)).toEqual(['Hallway']);
    expect(snap.rooms[0]!.unread).toBe(1);
    expect((await m.openRoom('!hallway:hs.test')).map((e) => e.body)).toEqual(['welcome']);
    await m.markRead('!hallway:hs.test');
    expect(m.snapshot().rooms[0]!.unread).toBe(0);
    await m.stop();
  });

  it('rejects a bad password with the homeserver message', async () => {
    const hs = new FakeHomeserver();
    const { m } = manager(hs);
    await expect(m.signInWithPassword('hs.test', 'mallory', 'pw')).rejects.toThrow('bad');
    expect(m.snapshot().status).toBe('signed-out');
  });

  it('queues messages while offline and delivers them once, in order, on reconnect', async () => {
    const hs = new FakeHomeserver();
    const { m, store } = manager(hs);
    await m.signInWithPassword('hs.test', 'alice', 'pw');
    await settle();
    expect(m.snapshot().status).toBe('online');

    hs.online = false;
    await settle(40);
    expect(m.snapshot().status).toBe('offline');

    await m.sendMessage('!hallway:hs.test', 'first');
    await m.sendMessage('!hallway:hs.test', 'second');
    await settle();
    expect(m.snapshot().outbox.map((o) => o.body)).toEqual(['first', 'second']);
    expect(store.outbox.size).toBe(2);
    // Local echo is visible immediately.
    expect(m.snapshot().timelines['!hallway:hs.test']!.map((e) => e.body)).toEqual([
      'first',
      'second',
    ]);
    expect(hs.sent).toEqual([]);

    hs.online = true;
    await settle(80);
    expect(m.snapshot().status).toBe('online');
    expect(hs.sent.map((s) => s.body)).toEqual(['first', 'second']);
    expect(m.snapshot().outbox).toEqual([]);
    expect(store.outbox.size).toBe(0);
    await m.stop();
  });

  it('drops permanently rejected messages and reports the error', async () => {
    const hs = new FakeHomeserver();
    const { m } = manager(hs);
    await m.signInWithPassword('hs.test', 'alice', 'pw');
    await settle();
    await m.sendMessage('!forbidden:hs.test', 'nope');
    await settle();
    expect(m.snapshot().outbox).toEqual([]);
    expect(m.snapshot().error).toMatch(/not in room/);
    expect(m.snapshot().timelines['!forbidden:hs.test']).toEqual([]);
    await m.stop();
  });

  it('restores a persisted session and outbox after a reload', async () => {
    const hs = new FakeHomeserver();
    const store = new MemoryMatrixStore();
    const first = manager(hs, store);
    await first.m.signInWithPassword('hs.test', 'alice', 'pw');
    await settle();
    hs.online = false;
    await settle(40);
    await first.m.sendMessage('!hallway:hs.test', 'queued before reload');
    await first.m.stop();

    hs.online = true;
    const second = manager(hs, store);
    expect(await second.m.restore()).toBe(true);
    await settle(60);
    expect(second.m.snapshot().status).toBe('online');
    expect(hs.sent.map((s) => s.body)).toEqual(['queued before reload']);
    expect(second.m.userId).toBe('@alice:hs.test');
    await second.m.stop();
  });

  it('signs out locally when the token is rejected', async () => {
    const hs = new FakeHomeserver();
    const store = new MemoryMatrixStore();
    store.session = {
      homeserver: 'https://hs.test',
      userId: '@alice:hs.test',
      accessToken: 'stale',
    };
    const { m } = manager(hs, store);
    await m.restore();
    await settle();
    expect(m.snapshot().status).toBe('signed-out');
    expect(m.snapshot().error).toMatch(/expired/);
    expect(store.session).toBeNull();
  });

  it('joins rooms, creates direct messages once and clears everything on sign-out', async () => {
    const hs = new FakeHomeserver();
    const { m, store } = manager(hs);
    await m.signInWithPassword('hs.test', 'alice', 'pw');
    await settle();
    expect(await m.joinRoom('#hallway:hs.test')).toBe('!hallway:hs.test');
    expect(m.snapshot().rooms[0]!.alias).toBe('#hallway:hs.test');

    const dm = await m.openDirectMessage('@bob:hs.test');
    expect(dm).toBe('!dm:hs.test');
    expect(await m.openDirectMessage('@bob:hs.test')).toBe(dm);
    expect(hs.requests.filter((r) => r.endsWith('/createRoom'))).toHaveLength(1);
    expect(m.snapshot().rooms.find((r) => r.roomId === dm)?.isDirect).toBe(true);

    await m.signOut();
    expect(m.snapshot().status).toBe('signed-out');
    expect(store.session).toBeNull();
    expect(store.rooms.size).toBe(0);
    expect(hs.requests.some((r) => r.endsWith('/logout'))).toBe(true);
  });
});
