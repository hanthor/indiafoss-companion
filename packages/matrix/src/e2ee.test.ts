import { describe, expect, it } from 'vitest';
import { MatrixSessionManager, MemoryMatrixStore } from './session.js';
import { WasmCryptoBackend } from './crypto.js';
import type { FetchLike } from './http.js';
import type { RawMatrixEvent } from './types.js';

/**
 * Fake homeserver with just enough of the key-management, to-device, media
 * and typing endpoints for two devices to establish Olm sessions, share a
 * Megolm room key and exchange encrypted messages and attachments.
 */
class KeyServer {
  deviceKeys: Record<string, Record<string, unknown>> = {};
  oneTimeKeys: Record<string, Record<string, Record<string, unknown>[]>> = {};
  fallbackKeys: Record<string, Record<string, Record<string, unknown>>> = {};
  toDevice: Record<string, RawMatrixEvent[]> = {};
  /** Room timeline shared by everyone (unencrypted transport of encrypted events). */
  timeline: RawMatrixEvent[] = [];
  media: Record<string, Uint8Array> = {};
  typing: Record<string, string[]> = {};
  /** Bodies of every /createRoom, and the rooms encryption was switched on for. */
  created: Record<string, unknown>[] = [];
  encryptionEnabled: string[] = [];
  /** Users whose to-device messages are withheld from /sync (simulates key arriving late). */
  holdToDevice = new Set<string>();
  syncCursor: Record<string, number> = {};
  private initialSyncDone = new Set<string>();
  private counter = 0;

  fetchFor(userId: string, deviceId: string): FetchLike {
    return async (input, init) => {
      const url = new URL(input);
      const path = url.pathname;
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      const body = () => JSON.parse(String(init?.body)) as Record<string, unknown>;

      if (path.endsWith('/login'))
        return json({ user_id: userId, access_token: `tok-${userId}`, device_id: deviceId });
      if (path.includes('/profile/'))
        return json({ displayname: userId.slice(1, 2).toUpperCase() });
      if (path.endsWith('/keys/upload')) {
        const b = body() as {
          device_keys?: { user_id: string; device_id: string };
          one_time_keys?: Record<string, unknown>;
          fallback_keys?: Record<string, unknown>;
        };
        if (b.device_keys) (this.deviceKeys[userId] ??= {})[deviceId] = b.device_keys;
        if (b.one_time_keys) {
          const list = ((this.oneTimeKeys[userId] ??= {})[deviceId] ??= []);
          for (const [k, v] of Object.entries(b.one_time_keys)) list.push({ [k]: v });
        }
        if (b.fallback_keys) {
          const [k, v] = Object.entries(b.fallback_keys)[0] ?? [];
          if (k) (this.fallbackKeys[userId] ??= {})[deviceId] = { [k]: v };
        }
        return json({
          one_time_key_counts: {
            signed_curve25519: this.oneTimeKeys[userId]?.[deviceId]?.length ?? 0,
          },
        });
      }
      if (path.endsWith('/keys/query')) {
        const b = body() as { device_keys: Record<string, unknown> };
        const device_keys: Record<string, unknown> = {};
        for (const u of Object.keys(b.device_keys)) device_keys[u] = this.deviceKeys[u] ?? {};
        return json({ device_keys, failures: {} });
      }
      if (path.endsWith('/keys/claim')) {
        const b = body() as { one_time_keys: Record<string, Record<string, string>> };
        const one_time_keys: Record<string, Record<string, unknown>> = {};
        for (const [u, devs] of Object.entries(b.one_time_keys)) {
          one_time_keys[u] = {};
          for (const d of Object.keys(devs)) {
            const key = this.oneTimeKeys[u]?.[d]?.shift() ?? this.fallbackKeys[u]?.[d];
            if (key) one_time_keys[u]![d] = key;
          }
        }
        return json({ one_time_keys, failures: {} });
      }
      if (path.endsWith('/keys/signatures/upload')) return json({ failures: {} });
      if (path.includes('/sendToDevice/')) {
        const type = decodeURIComponent(path.split('/sendToDevice/')[1]!.split('/')[0]!);
        const b = body() as { messages: Record<string, Record<string, unknown>> };
        for (const [u, devs] of Object.entries(b.messages)) {
          for (const content of Object.values(devs)) {
            (this.toDevice[u] ??= []).push({
              type,
              sender: userId,
              content: content as Record<string, unknown>,
            });
          }
        }
        return json({});
      }
      if (path.endsWith('/joined_members')) {
        return json({
          joined: Object.fromEntries(Object.keys(this.deviceKeys).map((u) => [u, {}])),
        });
      }
      if (path.includes('/rooms/') && path.includes('/send/')) {
        const type = decodeURIComponent(path.split('/send/')[1]!.split('/')[0]!);
        const txnId = decodeURIComponent(path.split('/send/')[1]!.split('/')[1]!);
        const event: RawMatrixEvent = {
          event_id: `$e${++this.counter}`,
          type,
          sender: userId,
          origin_server_ts: 1000 + this.counter,
          content: body(),
          unsigned: { transaction_id: txnId },
        };
        this.timeline.push(event);
        return json({ event_id: event.event_id });
      }
      if (path.includes('/typing/')) {
        const b = body() as { typing: boolean };
        const set = new Set(this.typing['!r:hs'] ?? []);
        if (b.typing) set.add(userId);
        else set.delete(userId);
        this.typing['!r:hs'] = [...set];
        return json({});
      }
      if (path.includes('/media/v3/upload')) {
        const id = `m${++this.counter}`;
        this.media[id] = new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer());
        return json({ content_uri: `mxc://hs/${id}` });
      }
      if (path.includes('/media/download/')) {
        const id = decodeURIComponent(path.split('/').pop()!);
        const bytes = this.media[id];
        return bytes
          ? new Response(bytes as unknown as BodyInit, { status: 200 })
          : json({ errcode: 'M_NOT_FOUND' }, 404);
      }
      if (path.endsWith('/sync')) {
        const cursor = this.syncCursor[userId] ?? 0;
        const first = !this.initialSyncDone.has(userId);
        this.initialSyncDone.add(userId);
        const events = this.timeline.slice(cursor);
        this.syncCursor[userId] = this.timeline.length;
        const toDevice = this.holdToDevice.has(userId) ? [] : (this.toDevice[userId] ?? []);
        if (!this.holdToDevice.has(userId)) this.toDevice[userId] = [];
        // Both users see the shared, encrypted room.
        const state = first
          ? [
              {
                type: 'm.room.encryption',
                state_key: '',
                content: { algorithm: 'm.megolm.v1.aes-sha2' },
              },
              { type: 'm.room.name', content: { name: 'Secret room' } },
              { type: 'm.room.member', state_key: '@alice:hs', content: { membership: 'join' } },
              { type: 'm.room.member', state_key: '@bob:hs', content: { membership: 'join' } },
            ]
          : [];
        // Long-poll stand-in: always yield to the event loop when nothing is new.
        if (!events.length && !toDevice.length && !first)
          await new Promise((r) => setTimeout(r, 5));
        return json({
          next_batch: `s-${userId}-${this.timeline.length}`,
          to_device: { events: toDevice },
          device_lists: { changed: first ? Object.keys(this.deviceKeys) : [], left: [] },
          device_one_time_keys_count: {
            signed_curve25519: this.oneTimeKeys[userId]?.[deviceId]?.length ?? 0,
          },
          device_unused_fallback_key_types: ['signed_curve25519'],
          rooms: {
            join: {
              '!r:hs': {
                state: { events: state },
                timeline: { events },
                ephemeral: {
                  events: [{ type: 'm.typing', content: { user_ids: this.typing['!r:hs'] ?? [] } }],
                },
              },
            },
          },
        });
      }
      if (path.endsWith('/createRoom')) {
        this.created.push(body());
        return json({ room_id: '!dm:hs' });
      }
      if (path.endsWith('/state/m.room.encryption/')) {
        this.encryptionEnabled.push(decodeURIComponent(path.split('/rooms/')[1]!.split('/')[0]!));
        return json({ event_id: `$state${++this.counter}` });
      }
      if (path.endsWith('/logout')) return json({});
      if (path.includes('/receipt/')) return json({});
      return json({ errcode: 'M_UNRECOGNIZED', error: path }, 404);
    };
  }
}

async function settle(ms = 60): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function client(server: KeyServer, userId: string, deviceId: string) {
  const store = new MemoryMatrixStore();
  const manager = new MatrixSessionManager(store, {
    fetch: server.fetchFor(userId, deviceId),
    syncTimeoutMs: 0,
    maxBackoffMs: 10,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 10))),
    crypto: (u, d) => WasmCryptoBackend.create(u, d),
  });
  return { manager, store };
}

describe('end-to-end encryption', () => {
  it('shares a Megolm key and exchanges encrypted text, typing and an encrypted attachment', async () => {
    const server = new KeyServer();
    const alice = client(server, '@alice:hs', 'ALICE1');
    const bob = client(server, '@bob:hs', 'BOB1');

    await alice.manager.signInWithPassword('https://hs', 'alice', 'pw');
    await bob.manager.signInWithPassword('https://hs', 'bob', 'pw');
    await settle(150);
    expect(alice.manager.snapshot().encryptionReady).toBe(true);
    expect(alice.manager.snapshot().rooms[0]?.encrypted).toBe(true);

    // Alice sends; the wire carries only m.room.encrypted.
    await alice.manager.sendMessage('!r:hs', 'hello bob, this is private');
    await settle(200);
    expect(server.timeline.map((e) => e.type)).toEqual(['m.room.encrypted']);
    expect(JSON.stringify(server.timeline[0]!.content)).not.toContain('private');

    // Bob decrypts it after receiving the room key over to-device.
    await settle(200);
    const bobTimeline = await bob.manager.openRoom('!r:hs');
    expect(bobTimeline.map((e) => e.body)).toEqual(['hello bob, this is private']);
    expect(bobTimeline[0]!.encrypted).toBe(true);
    expect(bobTimeline[0]!.undecryptable).toBeUndefined();

    // Alice's own local echo is replaced by the decrypted server copy.
    const aliceTimeline = await alice.manager.openRoom('!r:hs');
    expect(aliceTimeline.map((e) => e.body)).toEqual(['hello bob, this is private']);

    // Bob replies; Alice decrypts.
    await bob.manager.sendMessage('!r:hs', 'reply');
    await settle(250);
    expect((await alice.manager.openRoom('!r:hs')).map((e) => e.body)).toEqual([
      'hello bob, this is private',
      'reply',
    ]);

    // Typing notices reach the other side and exclude the sender.
    await bob.manager.setTyping('!r:hs', true);
    await settle(80);
    expect(alice.manager.snapshot().typing['!r:hs']).toEqual(['@bob:hs']);
    expect(bob.manager.snapshot().typing['!r:hs']).toEqual([]);

    // Encrypted attachment round-trip.
    const png = new TextEncoder().encode('not really a png but bytes');
    await alice.manager.sendFile('!r:hs', png, 'photo.png', 'image/png');
    await settle(250);
    const stored = Object.values(server.media)[0]!;
    expect(new TextDecoder().decode(stored)).not.toContain('not really');
    const bobEvents = await bob.manager.openRoom('!r:hs');
    const image = bobEvents.find((e) => e.msgtype === 'm.image')!;
    expect(image.mediaUrl).toMatch(/^mxc:\/\/hs\//);
    expect(image.mediaFile).toBeTruthy();
    expect(new TextDecoder().decode(await bob.manager.mediaBytes(image))).toBe(
      'not really a png but bytes',
    );

    await alice.manager.stop();
    await bob.manager.stop();
  }, 30_000);

  it('keeps undecryptable events and decrypts them once the key arrives', async () => {
    const server = new KeyServer();
    const alice = client(server, '@alice:hs', 'ALICE1');
    const bob = client(server, '@bob:hs', 'BOB1');
    await alice.manager.signInWithPassword('https://hs', 'alice', 'pw');
    await bob.manager.signInWithPassword('https://hs', 'bob', 'pw');
    await settle(150);

    // Bob's homeserver delivers the message before the room key (e.g. the
    // to-device queue is slow): the event is kept as ciphertext.
    server.holdToDevice.add('@bob:hs');
    await alice.manager.sendMessage('!r:hs', 'early message');
    await settle(250);
    const events = await bob.manager.openRoom('!r:hs');
    expect(events.map((e) => e.undecryptable)).toEqual([true]);
    expect(events[0]!.body).toMatch(/waiting for the key/);
    expect(events[0]!.raw).toBeTruthy();

    // The key arrives: the cached ciphertext is decrypted without a new sync of the event.
    server.holdToDevice.delete('@bob:hs');
    await settle(250);
    const after = await bob.manager.openRoom('!r:hs');
    expect(after.map((e) => [e.body, e.undecryptable ?? false])).toEqual([
      ['early message', false],
    ]);
    expect((await bob.store.listEvents('!r:hs'))[0]!.undecryptable).toBeUndefined();

    // A device that joins later cannot read history shared before it existed (Megolm semantics).
    const carol = client(server, '@carol:hs', 'CAROL1');
    await carol.manager.signInWithPassword('https://hs', 'carol', 'pw');
    await settle(200);
    await alice.manager.sendMessage('!r:hs', 'after carol');
    await settle(300);
    const carolEvents = await carol.manager.openRoom('!r:hs');
    expect(carolEvents.map((e) => e.undecryptable ?? false)).toEqual([true, false]);
    expect(carolEvents[1]!.body).toBe('after carol');

    await alice.manager.stop();
    await bob.manager.stop();
    await carol.manager.stop();
  }, 30_000);
});

describe('direct messages on an encrypting server', () => {
  it('asks for encryption at creation and sets the state event, and the record says so', async () => {
    // Neutrino ignores `initial_state` on /createRoom but accepts the state
    // event; a real homeserver honours both. Ask both ways, and let the
    // record reflect what happened rather than what was asked.
    const server = new KeyServer();
    const alice = client(server, '@alice:hs', 'ALICE1');
    await alice.manager.signInWithPassword('https://hs', 'alice', 'pw');
    await settle(150);
    expect(alice.manager.snapshot().encryptionReady).toBe(true);

    const roomId = await alice.manager.openDirectMessage('@bob:hs');
    expect(roomId).toBe('!dm:hs');
    expect(server.created[0]!.initial_state).toEqual([
      { type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } },
    ]);
    expect(server.encryptionEnabled).toEqual(['!dm:hs']);
    expect(alice.manager.snapshot().rooms.find((r) => r.roomId === roomId)?.encrypted).toBe(true);
    await alice.manager.stop();
  });

  it('leaves the record unencrypted when the server refuses the state event', async () => {
    const server = new KeyServer();
    const refusing = {
      fetchFor(userId: string, deviceId: string): FetchLike {
        const inner = server.fetchFor(userId, deviceId);
        return async (input, init) => {
          if (new URL(input).pathname.endsWith('/state/m.room.encryption/')) {
            return new Response(JSON.stringify({ errcode: 'M_UNRECOGNIZED', error: 'no' }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            });
          }
          return inner(input, init);
        };
      },
    } as KeyServer;
    const alice = client(refusing, '@alice:hs', 'ALICE1');
    await alice.manager.signInWithPassword('https://hs', 'alice', 'pw');
    await settle(150);
    const roomId = await alice.manager.openDirectMessage('@bob:hs');
    expect(alice.manager.snapshot().rooms.find((r) => r.roomId === roomId)?.encrypted).toBe(false);
    await alice.manager.stop();
  });
});

describe('a homeserver that cannot carry key material', () => {
  it('names the failure instead of surfacing a bare 404, and marks the server', async () => {
    // Neutrino answers 404 on /keys/claim and /sendToDevice while accepting
    // key uploads, so a client can believe encryption is configured right up
    // until it tries to send. The failure must say what is wrong, and nothing
    // may go out in the clear from a room marked encrypted.
    const server = new KeyServer();
    // Same server, but the two endpoints Megolm needs are missing.
    const withoutKeyTransport = {
      fetchFor(userId: string, deviceId: string): FetchLike {
        const inner = server.fetchFor(userId, deviceId);
        return async (input, init) => {
          const path = new URL(input).pathname;
          if (path.endsWith('/keys/claim') || path.includes('/sendToDevice/')) {
            return new Response(JSON.stringify({ errcode: 'M_UNRECOGNIZED', error: 'nope' }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            });
          }
          return inner(input, init);
        };
      },
    } as KeyServer;
    const alice = client(withoutKeyTransport, '@alice:hs', 'ALICE1');
    const bob = client(server, '@bob:hs', 'BOB1');

    // Bob has to be present and have uploaded keys, or Alice has nobody to
    // share a Megolm session with and never touches the missing endpoints —
    // the failure only bites when there is someone to encrypt to.
    await alice.manager.signInWithPassword('https://hs', 'alice', 'pw');
    await bob.manager.signInWithPassword('https://hs', 'bob', 'pw');
    await settle(150);

    // Sends are queued, so the failure surfaces through the outbox rather than
    // by rejecting: the item is dropped as a permanent 4xx, its local echo is
    // removed, and the reason is put in front of the attendee.
    await alice.manager.sendMessage('!r:hs', 'this must not go out');
    await settle(200);

    const snapshot = alice.manager.snapshot();
    expect(String(snapshot.error)).toMatch(/cannot carry encryption keys/i);
    expect(snapshot.serverCarriesEncryption).toBe(false);
    expect(snapshot.encryptionReady).toBe(false);
    // No pending message left implying it will go later, no local echo left
    // implying it went, and nothing on the wire in the clear.
    expect(snapshot.outbox).toHaveLength(0);
    expect(snapshot.timelines['!r:hs'] ?? []).toHaveLength(0);
    expect(server.timeline).toHaveLength(0);
  });
});
