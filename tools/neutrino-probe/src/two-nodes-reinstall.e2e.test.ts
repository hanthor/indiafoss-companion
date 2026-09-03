/**
 * A reinstalled app is a new device. Bob's client is thrown away and a fresh
 * one signs in on the same node — new crypto store, new device id, new keys
 * — while Alice's session carries on. For Alice's next message to decrypt
 * on the new client, her server has to be told of Bob's new device
 * (`m.device_list_update` over federation), her client has to hear of it
 * (`device_lists.changed` in sync) and fetch the new keys, and the room key
 * has to reach the new device. None of that has a room event behind it.
 *
 * This file starts both nodes itself, so it needs the server binary:
 *
 *   NEUTRINO_BIN=/path/to/neutrino pnpm --filter @indiafoss/neutrino-probe test
 *
 * Without it the file skips.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, it } from 'vitest';
import { MatrixSessionManager, MemoryMatrixStore, WasmCryptoBackend } from '@indiafoss/matrix';

const BIN = process.env.NEUTRINO_BIN;
const PORT_A = 8028;
const PORT_B = 8029;
const A = `http://127.0.0.1:${PORT_A}`;
const B = `http://127.0.0.1:${PORT_B}`;

const dirs: string[] = [];
const children: ChildProcess[] = [];

function startNode(port: number, dir: string): ChildProcess {
  const child = spawn(BIN!, [], {
    env: {
      ...process.env,
      NEUTRINO_SERVER_NAME: `127.0.0.1:${port}`,
      NEUTRINO_BIND_ADDR: `127.0.0.1:${port}`,
      NEUTRINO_STORAGE_DIR: dir,
      NEUTRINO_STARTUP_JITTER_MS: '0',
    },
    // Server logs go next to the data so a failure can say what the node saw.
    stdio: ['ignore', openSync(join(dir, 'log'), 'a'), openSync(join(dir, 'log'), 'a')],
  });
  children.push(child);
  return child;
}

function tailOf(dir: string, lines = 40): string {
  try {
    return readFileSync(join(dir, 'log'), 'utf8').split('\n').slice(-lines).join('\n');
  } catch {
    return '(no log)';
  }
}

async function stopNode(child: ChildProcess): Promise<void> {
  // Already gone — by exit code or by signal — means no 'exit' event is
  // coming, so waiting for one would hang the teardown.
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGKILL');
  });
}

async function up(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/_matrix/client/versions`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
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

function session() {
  return new MatrixSessionManager(new MemoryMatrixStore(), {
    syncTimeoutMs: 2000,
    maxBackoffMs: 300,
    crypto: (u, d) => WasmCryptoBackend.create(u, d),
  });
}

describe.skipIf(!BIN)('E2EE survives a client reinstall', () => {
  const alice = session();
  const bob = session();
  const bobAgain = session();

  afterAll(async () => {
    for (const child of children) await stopNode(child);
    const grace = new Promise((r) => setTimeout(r, 3000));
    await Promise.race([Promise.allSettled([alice.stop(), bob.stop(), bobAgain.stop()]), grace]);
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }, 30_000);

  it('still decrypts on a fresh client with a new device after Bob reinstalls', async () => {
    const dirA = mkdtempSync(join(tmpdir(), 'neutrino-a-'));
    const dirB = mkdtempSync(join(tmpdir(), 'neutrino-b-'));
    dirs.push(dirA, dirB);
    startNode(PORT_A, dirA);
    startNode(PORT_B, dirB);
    await until(() => up(A), Boolean, 'node A up');
    await until(() => up(B), Boolean, 'node B up');

    await alice.signInWithPassword(A, 'alice', 'neutrino');
    await bob.signInWithPassword(B, 'alice', 'neutrino');
    const bobId = bob.snapshot().session!.userId;
    const firstDevice = bob.snapshot().session!.deviceId;
    await until(() => alice.snapshot().encryptionReady, Boolean, 'alice ready');
    await until(() => bob.snapshot().encryptionReady, Boolean, 'bob ready');

    const aToken = alice.snapshot().session!.accessToken;
    const created = await raw(A, aToken, 'POST', '/_matrix/client/v3/createRoom', {
      name: 'reinstall',
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
      'invite on B',
    );
    await bob.acceptInvite(roomId);
    await until(
      () => alice.snapshot().rooms.find((r) => r.roomId === roomId)?.encrypted,
      Boolean,
      'room encrypted on A',
    );
    await alice.sendMessage(roomId, 'before the reinstall');
    await until(
      () => bob.openRoom(roomId),
      (events) => events.some((e) => e.body === 'before the reinstall' && !e.undecryptable),
      'bob to decrypt before the reinstall',
      30_000,
    );

    // The reinstall: Bob's client is gone, a fresh one signs in. Its device
    // id must differ — that is what makes it a new device rather than a
    // client claiming the old device with keys that do not match.
    await bob.stop();
    await bobAgain.signInWithPassword(B, 'alice', 'neutrino');
    const secondDevice = bobAgain.snapshot().session!.deviceId;
    if (!secondDevice || secondDevice === firstDevice) {
      throw new Error(`reinstall did not make a new device: ${firstDevice} → ${secondDevice}`);
    }
    await until(() => bobAgain.snapshot().encryptionReady, Boolean, 'bob again ready');
    await until(
      () => bobAgain.snapshot().rooms.find((r) => r.roomId === roomId)?.membership,
      (m) => m === 'join',
      'room on the fresh client',
    );

    // Alice's next message: her client must have been told Bob's devices
    // changed, fetched the new one, and shared the room key with it.
    await alice.sendMessage(roomId, 'after the reinstall');
    try {
      await until(
        () => bobAgain.openRoom(roomId),
        (events) => events.some((e) => e.body === 'after the reinstall' && !e.undecryptable),
        'the fresh client to decrypt after the reinstall',
        60_000,
      );
    } catch (error) {
      console.log('--- node A log ---\n' + tailOf(dirA));
      console.log('--- node B log ---\n' + tailOf(dirB));
      console.log(
        '--- bob-again snapshot ---',
        JSON.stringify({ status: bobAgain.snapshot().status, error: bobAgain.snapshot().error }),
      );
      throw error;
    }
  }, 150_000);
});
