/**
 * Restart survival, the way a phone does it: the app is killed mid-
 * conversation and comes back. Node B is stopped and restarted on the same
 * data directory between two encrypted messages; the second must still
 * decrypt, which needs B's device keys, its unclaimed one-time keys and any
 * undelivered room key to have been on disk.
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
const PORT_A = 8018;
const PORT_B = 8019;
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

describe.skipIf(!BIN)('E2EE survives a node restart', () => {
  const alice = session();
  const bob = session();

  afterAll(async () => {
    // Nodes first, so an orphan can never outlive the test and hold the port
    // for the next run; the sessions then fail their in-flight polls fast.
    for (const child of children) await stopNode(child);
    // A session whose server just vanished may sit in a backoff; give it a
    // moment to notice and move on regardless — the process ends anyway.
    const grace = new Promise((r) => setTimeout(r, 3000));
    await Promise.race([Promise.allSettled([alice.stop(), bob.stop()]), grace]);
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }, 30_000);

  it('still decrypts after node B is killed and restarted on the same data', async () => {
    const dirA = mkdtempSync(join(tmpdir(), 'neutrino-a-'));
    const dirB = mkdtempSync(join(tmpdir(), 'neutrino-b-'));
    dirs.push(dirA, dirB);
    startNode(PORT_A, dirA);
    const nodeB = startNode(PORT_B, dirB);
    await until(() => up(A), Boolean, 'node A up');
    await until(() => up(B), Boolean, 'node B up');

    await alice.signInWithPassword(A, 'alice', 'neutrino');
    await bob.signInWithPassword(B, 'alice', 'neutrino');
    const bobId = bob.snapshot().session!.userId;
    await until(() => alice.snapshot().encryptionReady, Boolean, 'alice ready');
    await until(() => bob.snapshot().encryptionReady, Boolean, 'bob ready');

    const aToken = alice.snapshot().session!.accessToken;
    const created = await raw(A, aToken, 'POST', '/_matrix/client/v3/createRoom', {
      name: 'restart',
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

    // One message before the restart, so the Megolm session and Bob's
    // claimed one-time key both predate it.
    await alice.sendMessage(roomId, 'before the restart');
    await until(
      () => bob.openRoom(roomId),
      (events) => events.some((e) => e.body === 'before the restart' && !e.undecryptable),
      'bob to decrypt before the restart',
      30_000,
    );

    // The phone is killed and comes back.
    await stopNode(nodeB);
    await until(async () => !(await up(B)), Boolean, 'node B down', 10_000);
    startNode(PORT_B, dirB);
    await until(() => up(B), Boolean, 'node B back up');

    // Bob's client reconnects (M_UNKNOWN_POS → fresh sliding-sync
    // connection); Alice rotates nothing and sends again. If B forgot Bob's
    // device or its keys, Alice's next share would fail or Bob would see
    // ciphertext.
    await alice.sendMessage(roomId, 'after the restart');
    try {
      await until(
        () => bob.openRoom(roomId),
        (events) => events.some((e) => e.body === 'after the restart' && !e.undecryptable),
        'bob to decrypt after the restart',
        45_000,
      );
    } catch (error) {
      console.log('--- node A log ---\n' + tailOf(dirA));
      console.log('--- node B log ---\n' + tailOf(dirB));
      console.log(
        '--- bob snapshot ---',
        JSON.stringify({ status: bob.snapshot().status, error: bob.snapshot().error }),
      );
      throw error;
    }

    // And a fresh session establishment in the other direction still works:
    // Bob's server must still hold Alice's device and hand out keys.
    await bob.sendMessage(roomId, 'and back after the restart');
    await until(
      () => alice.openRoom(roomId),
      (events) => events.some((e) => e.body === 'and back after the restart' && !e.undecryptable),
      'alice to decrypt after the restart',
      45_000,
    );
  }, 120_000);
});
