// The permanent-UTD failure case (companion #182), as a repeatable local
// simulation — no root, no namespaces, everything on loopback:
//
//   alice's client ── A node ──(SimUdpLink)──> UdpFlakyProxy ──> B node ── bob
//
// The nodes run with NEUTRINO_SIM_LINK=1, which swaps the iroh medium for a
// plain-UDP DatagramLink whose peer addresses we seed — pointed at the
// impairment proxies, which add BLE-grade delay/jitter/loss and can drop the
// link on demand. That makes the proxy *authoritative*: iroh's own transport
// exchanges address candidates and migrates the QUIC connection off any
// man-in-the-middle path (we watched it do exactly that), which is why the
// simulation swaps the transport at the fork's own seam instead — the same
// "your impaired path must be the only path" principle n0 recommends for
// custom transports.
//
// The failure recipe: each round opens a *fresh* encrypted DM (a Megolm key
// is shared once per session — reusing a room means later rounds have no key
// in flight to lose), sends, and SIGKILLs the recipient node just after it
// logs that the key share is in its memory→disk window
// (NEUTRINO_TEST_SLOW_JOURNAL_MS widens the window; the marker makes the kill
// deterministic — hanthor/neutrino#8, #9). Against a node without the #7
// durability fix, the recipient acked before the key was durable, the kill
// lost it, dedup swallowed the sender's resend, and the message stayed
// "Waiting for this message" forever. With the fix, the ack waits for disk,
// so the resend after restart heals every round.
//
// Gated on NEUTRINO_FLAKY_SIM=1 and NEUTRINO_LAN_BIN (a neutrino-lan built
// with the sim link, i.e. the neutrino-iroh sim-link change or later).
import { type ChildProcess, spawn } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MatrixSessionManager, MemoryMatrixStore, WasmCryptoBackend } from '@indiafoss/matrix';
import { BLE_FLAKY, UdpFlakyProxy } from './udp-flaky.js';

const enabled = process.env.NEUTRINO_FLAKY_SIM === '1' && !!process.env.NEUTRINO_LAN_BIN;

/** Rounds of fresh-room send → kill-in-window → restart → require decrypt. */
const ROUNDS = 1;

const PORT = { csA: 18008, csB: 18009, simA: 18448, simB: 18449, proxyToB: 19448, proxyToA: 19449 };

interface SimNode {
  child: ChildProcess;
  log: string;
  id: string;
}

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
  ms = 120_000,
): Promise<T> {
  const deadline = Date.now() + ms;
  let last: T;
  do {
    last = await read();
    if (ok(last)) return last;
    await new Promise((r) => setTimeout(r, 300));
  } while (Date.now() < deadline);
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(last)}`);
}

async function createEncryptedDm(base: string, token: string, invitee: string): Promise<string> {
  const res = await fetch(`${base}/_matrix/client/v3/createRoom`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      is_direct: true,
      invite: [invitee],
      preset: 'private_chat',
      initial_state: [
        {
          type: 'm.room.encryption',
          state_key: '',
          content: { algorithm: 'm.megolm.v1.aes-sha2' },
        },
      ],
    }),
  });
  if (res.status !== 200) throw new Error(`createRoom failed: ${res.status}`);
  return ((await res.json()) as { room_id: string }).room_id;
}

describe.skipIf(!enabled)('E2EE survives a flaky link and a recipient crash', () => {
  const bin = process.env.NEUTRINO_LAN_BIN!;
  const dirs = { a: '', b: '' };
  const nodes: { a?: SimNode; b?: SimNode } = {};
  const proxies: UdpFlakyProxy[] = [];
  const alice = session();
  const bob = session();
  const A = `http://127.0.0.1:${PORT.csA}`;
  const B = `http://127.0.0.1:${PORT.csB}`;

  function launch(name: 'a' | 'b', csPort: number, simPort: number, peer?: string): SimNode {
    const node: SimNode = { log: '', id: '', child: undefined as unknown as ChildProcess };
    node.child = spawn(
      bin,
      [
        '--bind',
        `127.0.0.1:${csPort}`,
        '--fed-port',
        '18447',
        '--relay-bind',
        `127.0.0.1:${simPort}`,
        '--storage',
        dirs[name],
        ...(peer ? ['--peer', peer] : []),
      ],
      {
        env: {
          ...process.env,
          NEUTRINO_SIM_LINK: '1',
          RUST_LOG: 'info',
          // Widen the memory->disk window so the kill can land inside it.
          NEUTRINO_TEST_SLOW_JOURNAL_MS: '2000',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const gather = (chunk: Buffer) => {
      node.log += chunk.toString();
      if (!node.id) node.id = /\b([0-9a-f]{64})\b/.exec(node.log)?.[1] ?? '';
      // Streamed to disk as it happens, so a post-mortem sees every node
      // incarnation's log even though `nodes.x` is replaced on restart.
      appendFileSync(join(tmpdir(), `flaky-${name}.log`), chunk);
    };
    node.child.stdout!.on('data', gather);
    node.child.stderr!.on('data', gather);
    return node;
  }

  async function ready(node: SimNode, csPort: number): Promise<void> {
    await until(
      async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${csPort}/_matrix/client/versions`, {
            signal: AbortSignal.timeout(1000),
          });
          return res.ok && !!node.id;
        } catch {
          return false;
        }
      },
      Boolean,
      `node on :${csPort} up with an id`,
      60_000,
    );
  }

  /**
   * SIGKILL B inside the key's memory->disk window. Waits for the marker,
   * then a beat: long enough for an unfixed node's 200 (sent right after its
   * direct, un-flushed transaction record) to reach A over the impaired link
   * — so A treats the key as delivered and stops retrying — but well inside
   * the 2s window, so the key is still only in memory when the kill lands.
   * On a fixed node the 200 is withheld until the flush completes (past the
   * window), so this same kill leaves the transaction unrecorded and A's
   * retry heals it. The delay is what turns a race into a discriminator.
   */
  async function killBInWindow(offset: number): Promise<void> {
    await until(
      () => nodes.b!.log.slice(offset).includes('to-device journal window open'),
      Boolean,
      "B to enter the key's memory->disk window",
      60_000,
    );
    await new Promise((r) => setTimeout(r, 700));
    nodes.b!.child.kill('SIGKILL');
  }

  beforeAll(async () => {
    dirs.a = mkdtempSync(join(tmpdir(), 'flaky-a-'));
    dirs.b = mkdtempSync(join(tmpdir(), 'flaky-b-'));

    // First boot without peers, purely to mint identities.
    nodes.a = launch('a', PORT.csA, PORT.simA);
    nodes.b = launch('b', PORT.csB, PORT.simB);
    await ready(nodes.a, PORT.csA);
    await ready(nodes.b, PORT.csB);
    const [idA, idB] = [nodes.a.id, nodes.b.id];
    nodes.a.child.kill();
    nodes.b.child.kill();
    await new Promise((r) => setTimeout(r, 500));

    // The radio: one impairment proxy per direction.
    proxies.push(
      await UdpFlakyProxy.listen('127.0.0.1', PORT.proxyToB, '127.0.0.1', PORT.simB, BLE_FLAKY),
      await UdpFlakyProxy.listen('127.0.0.1', PORT.proxyToA, '127.0.0.1', PORT.simA, BLE_FLAKY),
    );

    // Real boot: each node's peer address is its proxy, the only path there is.
    nodes.a = launch('a', PORT.csA, PORT.simA, `${idB}@127.0.0.1:${PORT.proxyToB}`);
    nodes.b = launch('b', PORT.csB, PORT.simB, `${idA}@127.0.0.1:${PORT.proxyToA}`);
    await ready(nodes.a, PORT.csA);
    await ready(nodes.b, PORT.csB);
  }, 180_000);

  afterAll(async () => {
    for (const s of [alice, bob]) await s.stop().catch(() => undefined);
    for (const p of proxies) p.close();
    nodes.a?.child.kill('SIGKILL');
    nodes.b?.child.kill('SIGKILL');
    if (process.env.NEUTRINO_FLAKY_KEEP === '1') {
      // Post-mortem: dump both nodes' logs where a debugging run can read
      // them, instead of deleting the evidence with the storage.
      const { writeFileSync } = await import('node:fs');
      writeFileSync(join(tmpdir(), 'flaky-a.log'), nodes.a?.log ?? '');
      writeFileSync(join(tmpdir(), 'flaky-b.log'), nodes.b?.log ?? '');
      console.log(`kept: ${dirs.a} ${dirs.b} and /tmp/flaky-{a,b}.log`);
      return;
    }
    for (const dir of Object.values(dirs)) if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it(
    'every message decrypts eventually, whatever the link and the crash do',
    { timeout: 15 * 60_000 },
    async () => {
      await alice.signInWithPassword(A, 'flaky-alice', 'neutrino');
      await bob.signInWithPassword(B, 'flaky-bob', 'neutrino');
      await until(() => alice.snapshot().encryptionReady, Boolean, 'alice crypto');
      await until(() => bob.snapshot().encryptionReady, Boolean, 'bob crypto');
      const aToken = alice.snapshot().session!.accessToken;
      const bobId = bob.snapshot().session!.userId;

      for (let round = 0; round < ROUNDS; round++) {
        const body = `flaky-round-${round}`;
        const room = await createEncryptedDm(A, aToken, bobId);
        await until(
          () => bob.snapshot().rooms.find((r) => r.roomId === room)?.membership,
          (m) => m === 'invite',
          `round ${round}: invite crosses the impaired link`,
        );
        await bob.acceptInvite(room);
        await until(
          () => alice.snapshot().rooms.find((r) => r.roomId === room)?.memberIds.length ?? 0,
          (n) => n >= 2,
          `round ${round}: alice sees bob join`,
        );

        // Arm the deterministic kill, then send: the fresh room means this
        // send carries a fresh Megolm key share, and the marker fires the
        // moment that key is in B's memory but not yet on its disk.
        const markerOffset = nodes.b!.log.length;
        const armed = killBInWindow(markerOffset);
        const send = alice.sendMessage(room, body);
        await armed;
        await send.catch(() => undefined);

        // Restart B on its surviving storage. On an unfixed node the key died
        // with the process while the transaction record survived — and the
        // resend is deduped, so no timeout is long enough. With #7, A's
        // retry re-delivers the key and the round heals.
        nodes.b = launch('b', PORT.csB, PORT.simB, `${nodes.a!.id}@127.0.0.1:${PORT.proxyToA}`);
        await ready(nodes.b, PORT.csB);

        const timeline = await until(
          () => bob.openRoom(room),
          (events) => events.some((e) => e.body === body),
          `round ${round}: "${body}" to decrypt after the crash + flap`,
          180_000,
        );
        const message = timeline.find((e) => e.body === body)!;
        expect(message.encrypted, `round ${round} rode the wire encrypted`).toBe(true);
        expect(message.undecryptable, `round ${round} permanently undecryptable`).toBeUndefined();
      }
    },
  );
});
