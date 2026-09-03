/**
 * The proof that matters: two Neutrino nodes, one of *our* client sessions on
 * each, and a message that is encrypted on one phone and decrypted on the
 * other — through the sliding sync the client actually uses, with the room
 * key crossing federation.
 *
 * Needs two servers on loopback that speak federation to each other. With a
 * checkout of hanthor/neutrino@e2ee-key-transport:
 *
 *   NEUTRINO_SERVER_NAME=127.0.0.1:8008 NEUTRINO_BIND_ADDR=127.0.0.1:8008 \
 *     NEUTRINO_STORAGE_DIR=/tmp/a cargo run --bin neutrino &
 *   NEUTRINO_SERVER_NAME=127.0.0.1:8009 NEUTRINO_BIND_ADDR=127.0.0.1:8009 \
 *     NEUTRINO_STORAGE_DIR=/tmp/b cargo run --bin neutrino &
 *
 * Without both the file skips. Against stock Neutrino it fails, and should:
 * that is the gap the patches in patches/neutrino/ close.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { MatrixSessionManager, MemoryMatrixStore, WasmCryptoBackend } from '@indiafoss/matrix';

const A = process.env.NEUTRINO_URL ?? 'http://127.0.0.1:8008';
const B = process.env.NEUTRINO_URL_B ?? 'http://127.0.0.1:8009';

async function versions(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/_matrix/client/versions`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Evaluated while the file is collected, so `describe.skipIf` sees it.
const reachable = (await Promise.all([versions(A), versions(B)])).every(Boolean);

function session() {
  return new MatrixSessionManager(new MemoryMatrixStore(), {
    syncTimeoutMs: 2000,
    maxBackoffMs: 200,
    crypto: (u, d) => WasmCryptoBackend.create(u, d),
  });
}

async function until<T>(
  read: () => Promise<T> | T,
  ok: (value: T) => boolean,
  label: string,
  ms = 20_000,
): Promise<T> {
  const deadline = Date.now() + ms;
  let last: T;
  do {
    last = await read();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 250));
  } while (Date.now() < deadline);
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(last)}`);
}

async function raw(base: string, token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

describe.skipIf(!reachable)('E2EE between two Neutrino nodes with our client', () => {
  const alice = session();
  const bob = session();

  afterAll(async () => {
    await alice.stop().catch(() => undefined);
    await bob.stop().catch(() => undefined);
  });

  it('encrypts on node A and decrypts on node B, key delivered over federation', async () => {
    await alice.signInWithPassword(A, 'alice', 'neutrino');
    await bob.signInWithPassword(B, 'alice', 'neutrino');
    const aliceId = alice.snapshot().session!.userId;
    const bobId = bob.snapshot().session!.userId;
    expect(aliceId).not.toBe(bobId);

    // Both crypto stacks upload their device and one-time keys.
    await until(() => alice.snapshot().encryptionReady, Boolean, 'alice encryption ready');
    await until(() => bob.snapshot().encryptionReady, Boolean, 'bob encryption ready');

    // Create the room on A, switch encryption on (Neutrino ignores
    // `initial_state` on /createRoom, so it is a state event after the fact),
    // and invite Bob's user on B.
    const aToken = alice.snapshot().session!.accessToken;
    const created = await raw(A, aToken, 'POST', '/_matrix/client/v3/createRoom', {
      name: 'mesh e2ee',
      preset: 'private_chat',
    });
    expect(created.status).toBe(200);
    const roomId = created.body.room_id as string;
    const enc = await raw(
      A,
      aToken,
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.encryption/`,
      { algorithm: 'm.megolm.v1.aes-sha2' },
    );
    expect(enc.status).toBe(200);
    const invite = await raw(
      A,
      aToken,
      'POST',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
      { user_id: bobId },
    );
    expect(invite.status).toBe(200);

    // Bob's node learns of the invite over federation; Bob joins back over
    // federation (make_join / send_join to A).
    await until(
      () => bob.snapshot().rooms.find((r) => r.roomId === roomId)?.membership,
      (m) => m === 'invite',
      'invite to reach node B',
    );
    await bob.acceptInvite(roomId);
    await until(
      () => bob.snapshot().rooms.find((r) => r.roomId === roomId)?.membership,
      (m) => m === 'join',
      'bob joined',
    );
    await until(
      () => alice.snapshot().rooms.find((r) => r.roomId === roomId)?.encrypted,
      Boolean,
      'alice sees the room as encrypted',
    );

    // Alice sends. Her client claims a one-time key for Bob's device — on
    // node B, via A's federated /keys/claim — opens an Olm session, and ships
    // the Megolm session as a to-device message that A's outbox delivers.
    await alice.sendMessage(roomId, 'hello from the other phone');

    const bobTimeline = await until(
      () => bob.openRoom(roomId),
      (events) => events.some((e) => e.body === 'hello from the other phone'),
      'bob to decrypt the message',
      30_000,
    );
    const message = bobTimeline.find((e) => e.body === 'hello from the other phone')!;
    expect(message.encrypted).toBe(true);
    expect(message.undecryptable).toBeUndefined();

    // And the wire really carried ciphertext: A's timeline for the room shows
    // no plaintext body.
    const messages = await raw(
      A,
      aToken,
      'GET',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=10`,
    );
    const chunk = JSON.stringify(messages.body.chunk ?? []);
    expect(chunk).toContain('m.room.encrypted');
    expect(chunk).not.toContain('hello from the other phone');

    // Reply the other way, so both directions are proven.
    await bob.sendMessage(roomId, 'and back');
    await until(
      () => alice.openRoom(roomId),
      (events) => events.some((e) => e.body === 'and back' && !e.undecryptable),
      'alice to decrypt the reply',
      30_000,
    );
  }, 90_000);
});
