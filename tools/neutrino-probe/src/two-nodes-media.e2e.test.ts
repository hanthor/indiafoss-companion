/**
 * A photo sent on node A opens on node B, and a file over the cap never
 * leaves the phone.
 *
 * The attachment is encrypted client-side (the room is encrypted), uploaded
 * to A's content repository, and referenced from the room event. Bob's
 * client on B asks B for the `mxc://` URI; B does not hold it, fetches it
 * from A over federation, caches it, and serves it. Then Bob decrypts.
 *
 * Needs two fork nodes (see two-nodes.e2e.test.ts); skips otherwise.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { MatrixSessionManager, MemoryMatrixStore, WasmCryptoBackend } from '@indiafoss/matrix';

const A = process.env.NEUTRINO_URL ?? 'http://localhost:8008';
const B = process.env.NEUTRINO_URL_B ?? '';
const fork = process.env.NEUTRINO_FORK === '1';

async function versions(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/_matrix/client/versions`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const reachable = fork && B !== '' && (await versions(A)) && (await versions(B));

function session() {
  return new MatrixSessionManager(new MemoryMatrixStore(), {
    syncTimeoutMs: 2000,
    maxBackoffMs: 200,
    crypto: (u, d) => WasmCryptoBackend.create(u, d),
  });
}

async function until<T>(
  read: () => T | Promise<T>,
  ok: (value: T) => boolean,
  label: string,
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
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

describe.skipIf(!reachable)('media between two Neutrino nodes', () => {
  const alice = session();
  const bob = session();

  afterAll(async () => {
    await alice.stop().catch(() => undefined);
    await bob.stop().catch(() => undefined);
  });

  it('a photo sent on node A opens on node B; a file over the cap never leaves A', async () => {
    await alice.signInWithPassword(A, 'alice', 'neutrino');
    await bob.signInWithPassword(B, 'alice', 'neutrino');
    const bobId = bob.snapshot().session!.userId;
    await until(() => alice.snapshot().encryptionReady, Boolean, 'alice encryption ready');
    await until(() => bob.snapshot().encryptionReady, Boolean, 'bob encryption ready');

    const aToken = alice.snapshot().session!.accessToken;
    const created = await raw(A, aToken, 'POST', '/_matrix/client/v3/createRoom', {
      name: 'mesh media',
      preset: 'private_chat',
    });
    const roomId = created.body.room_id as string;
    await raw(
      A,
      aToken,
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.encryption/`,
      { algorithm: 'm.megolm.v1.aes-sha2' },
    );
    await raw(A, aToken, 'POST', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`, {
      user_id: bobId,
    });
    await until(
      () => bob.snapshot().rooms.find((r) => r.roomId === roomId)?.membership,
      (m) => m === 'invite',
      'invite to reach node B',
    );
    await bob.acceptInvite(roomId);
    await until(
      () => alice.snapshot().rooms.find((r) => r.roomId === roomId)?.encrypted,
      Boolean,
      'alice sees the room as encrypted',
    );

    // A small "photo": PNG magic plus a pattern, well under the cap.
    const photo = new Uint8Array(3000);
    photo.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    for (let i = 8; i < photo.length; i++) photo[i] = i % 251;
    await alice.sendFile(roomId, photo, 'venue.png', 'image/png');

    const image = await until(
      async () => (await bob.openRoom(roomId)).find((e) => e.msgtype === 'm.image'),
      (e) => e !== undefined,
      'bob to see the photo event',
      30_000,
    );
    expect(image!.mediaUrl).toMatch(/^mxc:\/\//);
    expect(image!.mediaFile).toBeTruthy();
    const bytes = await bob.mediaBytes(image!);
    expect(bytes).toEqual(photo);

    // The cap is learnt from the server and enforced before upload.
    const limit = alice.snapshot().uploadLimit;
    expect(limit).not.toBeNull();
    const oversized = new Uint8Array(limit! + 1);
    await expect(
      alice.sendFile(roomId, oversized, 'huge.bin', 'application/pdf'),
    ).rejects.toMatchObject({
      errcode: 'M_TOO_LARGE',
    });
  }, 90_000);
});
