/**
 * E2EE in a *group* across three mesh nodes.
 *
 * `two-nodes.e2e.test.ts` proves the 1:1 case: one Olm session, one Megolm
 * key crossing one federation link. A conference DM group is the harder shape
 * — the sender must claim a one-time key for *every* device in the room, open
 * an Olm session with each, and the outbox must deliver a to-device key share
 * to each member's own homeserver. On the mesh every member IS their own
 * homeserver, so a three-person group exercises two distinct key deliveries
 * over two distinct federation links, plus the same fan-out for every reply.
 *
 * Run against nodes on the real iroh medium (`neutrino-lan`) and this is the
 * encrypted-group-chat contract for the venue, minus only the radio.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { MatrixSessionManager, MemoryMatrixStore, WasmCryptoBackend } from '@indiafoss/matrix';

const A = process.env.NEUTRINO_URL ?? 'http://127.0.0.1:8008';
const B = process.env.NEUTRINO_URL_B ?? 'http://127.0.0.1:8009';
const C = process.env.NEUTRINO_URL_C ?? '';

async function up(base: string): Promise<boolean> {
  if (!base) return false;
  try {
    const res = await fetch(`${base}/_matrix/client/versions`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Module scope: `describe.skipIf` is evaluated at collection time.
const reachable = (await Promise.all([up(A), up(B), up(C)])).every(Boolean);

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
  ms = 30_000,
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

describe.skipIf(!reachable)('E2EE in a group across three mesh nodes', () => {
  const alice = session();
  const bob = session();
  const carol = session();

  afterAll(async () => {
    for (const s of [alice, bob, carol]) await s.stop().catch(() => undefined);
  });

  it(
    'one sender, two receivers, every hop ciphertext, replies prove each link',
    { timeout: 180_000 },
    async () => {
      // Distinct localparts, not three 'alice's. Beyond realism, this keeps
      // the test independent of whatever ran before it in the same job: a
      // second sign-in as an existing user mints a second *device*, and the
      // sender then depends on the device_list_update EDU landing before she
      // encrypts — a race that produced exactly one undecryptable receiver in
      // CI while the same test passed locally. Three fresh users have no
      // stale devices to race against.
      await alice.signInWithPassword(A, 'mesh-alice', 'neutrino');
      await bob.signInWithPassword(B, 'mesh-bob', 'neutrino');
      await carol.signInWithPassword(C, 'mesh-carol', 'neutrino');
      const ids = [alice, bob, carol].map((s) => s.snapshot().session!.userId);
      expect(new Set(ids).size).toBe(3);
      for (const [s, name] of [
        [alice, 'alice'],
        [bob, 'bob'],
        [carol, 'carol'],
      ] as const) {
        await until(() => s.snapshot().encryptionReady, Boolean, `${name} encryption ready`);
      }

      const aToken = alice.snapshot().session!.accessToken;
      const created = await raw(A, aToken, 'POST', '/_matrix/client/v3/createRoom', {
        name: 'mesh group',
        preset: 'private_chat',
      });
      expect(created.status).toBe(200);
      const roomId = created.body.room_id as string;
      const encRoom = encodeURIComponent(roomId);
      const enc = await raw(
        A,
        aToken,
        'PUT',
        `/_matrix/client/v3/rooms/${encRoom}/state/m.room.encryption/`,
        { algorithm: 'm.megolm.v1.aes-sha2' },
      );
      expect(enc.status).toBe(200);
      for (const id of [ids[1]!, ids[2]!]) {
        const invite = await raw(A, aToken, 'POST', `/_matrix/client/v3/rooms/${encRoom}/invite`, {
          user_id: id,
        });
        expect(invite.status).toBe(200);
      }

      for (const [s, name] of [
        [bob, 'bob'],
        [carol, 'carol'],
      ] as const) {
        await until(
          () => s.snapshot().rooms.find((r) => r.roomId === roomId)?.membership,
          (m) => m === 'invite',
          `invite to reach ${name}`,
        );
        await s.acceptInvite(roomId);
        await until(
          () => s.snapshot().rooms.find((r) => r.roomId === roomId)?.membership,
          (m) => m === 'join',
          `${name} joined`,
        );
      }
      await until(
        () => alice.snapshot().rooms.find((r) => r.roomId === roomId)?.encrypted,
        Boolean,
        'alice sees the room as encrypted',
      );
      // Alice must see both members before she encrypts, or the key share goes
      // to a one-person room and the others get undecryptable history.
      await until(
        () => alice.snapshot().rooms.find((r) => r.roomId === roomId)?.memberIds.length ?? 0,
        (n) => n >= 3,
        'alice sees all three members',
      );

      await alice.sendMessage(roomId, 'keys for everyone');
      for (const [s, name] of [
        [bob, 'bob'],
        [carol, 'carol'],
      ] as const) {
        const timeline = await until(
          () => s.openRoom(roomId),
          (events) => events.some((e) => e.body === 'keys for everyone'),
          `${name} to decrypt`,
          45_000,
        );
        const message = timeline.find((e) => e.body === 'keys for everyone')!;
        expect(message.encrypted, name).toBe(true);
        expect(message.undecryptable, name).toBeUndefined();
      }

      // The wire carried ciphertext: no plaintext body on the sender's server.
      const messages = await raw(
        A,
        aToken,
        'GET',
        `/_matrix/client/v3/rooms/${encRoom}/messages?dir=b&limit=10`,
      );
      const chunk = JSON.stringify(messages.body.chunk ?? []);
      expect(chunk).toContain('m.room.encrypted');
      expect(chunk).not.toContain('keys for everyone');

      // A reply from the third node fans its own key out to two servers the
      // other way, so every pairwise link has now carried key material.
      await carol.sendMessage(roomId, 'carol replies');
      for (const [s, name] of [
        [alice, 'alice'],
        [bob, 'bob'],
      ] as const) {
        const timeline = await until(
          () => s.openRoom(roomId),
          (events) => events.some((e) => e.body === 'carol replies'),
          `${name} to decrypt the reply`,
          45_000,
        );
        const reply = timeline.find((e) => e.body === 'carol replies')!;
        expect(reply.encrypted, name).toBe(true);
        expect(reply.undecryptable, name).toBeUndefined();
      }
    },
  );
});
