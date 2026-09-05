/**
 * A swarm over the **real mesh transport**.
 *
 * `swarm.ts` measures N homeservers federating over HTTP through a shaped
 * proxy. That answers "how does a room behave at latency X", which is a real
 * question, but the thing it drives is `neutrino`'s own binary — which carries
 * no iroh medium at all. The transport a phone actually uses (iroh QUIC, CoAP
 * framing through the `neutrino-lb` sidecar, peers found by mDNS rather than
 * seeded) was never in the measurement.
 *
 * This runner drives `neutrino-lan` instead: the same medium the Android build
 * composes, minus BLE. Nothing is seeded — nodes find each other over the LAN
 * the way handsets on venue Wi-Fi would — so the numbers include discovery,
 * QUIC handshakes and the CoAP block framing, not just the homeserver.
 *
 * Deliberately not shaped: a `ShapedLink` proxy cannot intercept this path,
 * because peers dial each other's real addresses after mDNS, not a proxy we
 * placed in front. Shaping the real medium needs `tc netem` (see
 * `docs/mesh-harness.md`), which this kernel cannot provide.
 *
 *   pnpm --filter @indiafoss/neutrino-probe mesh-swarm -- --size 8
 *
 * `NEUTRINO_LAN_BIN` (or `--bin`) points at the `neutrino-lan` binary.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** One `neutrino-lan` process: a homeserver plus the iroh medium. */
class MeshNode {
  private proc: ChildProcess | null = null;
  /** The 64-hex node id, which is also this server's Matrix server name. */
  serverName = '';

  constructor(
    readonly index: number,
    private readonly bin: string,
    readonly csPort: number,
    readonly fedPort: number,
    readonly storageDir: string,
  ) {}

  get url(): string {
    return `http://127.0.0.1:${this.csPort}`;
  }

  /**
   * Start the node and resolve once it prints its server name.
   *
   * `neutrino-lan` writes the name on the first line of stdout precisely so a
   * harness does not have to scrape logs for it.
   */
  async start(timeoutMs = 60_000): Promise<void> {
    mkdirSync(this.storageDir, { recursive: true });
    const proc = spawn(
      this.bin,
      [
        '--bind',
        `127.0.0.1:${this.csPort}`,
        '--fed-port',
        String(this.fedPort),
        '--storage',
        this.storageDir,
      ],
      // stderr to a file, not /dev/null: when an invite fails there is
      // otherwise nothing to diagnose it with.
      { stdio: ['ignore', 'pipe', openSync(join(this.storageDir, 'log'), 'a')], detached: true },
    );
    this.proc = proc;
    this.serverName = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`node ${this.index} never reported a server name`)),
        timeoutMs,
      );
      // The medium's tracing output goes to stdout, which this listener owns.
      // Tee it to the node's log file or a failed run has no diagnosis — the
      // discovery lines that explain an unreachable peer live here.
      const logFd = openSync(join(this.storageDir, 'log'), 'a');
      let buf = '';
      proc.stdout?.on('data', (chunk: Buffer) => {
        writeSync(logFd, chunk);
        buf += chunk.toString();
        // The medium logs to stdout too; the server name is the one bare
        // 64-hex line, so match it rather than assuming line ordering.
        const hex = buf.split('\n').find((l) => /^[0-9a-f]{64}$/.test(l.trim()));
        if (hex) {
          clearTimeout(timer);
          resolve(hex.trim());
        }
      });
      proc.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`node ${this.index} exited early (${code})`));
      });
    });
  }

  stop(): void {
    const proc = this.proc;
    this.proc = null;
    if (!proc?.pid) return;
    try {
      process.kill(-proc.pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }

  async api(
    method: string,
    path: string,
    body?: unknown,
    token?: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${this.url}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: res.status,
      body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    };
  }

  async register(): Promise<{ token: string; userId: string }> {
    const r = await this.api('POST', '/_matrix/client/v3/register', {
      username: 'u',
      password: 'probe-password',
      auth: { type: 'm.login.dummy' },
    });
    if (r.status !== 200) throw new Error(`register ${this.index}: ${JSON.stringify(r.body)}`);
    return { token: String(r.body.access_token), userId: String(r.body.user_id) };
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

export interface MeshResult {
  size: number;
  startupMs: number;
  /**
   * Nodes answering their client-server API before the room was made.
   *
   * Deliberately NOT called "discovered": the discovery registry is not exposed
   * over the CS API, so this is liveness, not proof that every peer knows every
   * other. What proves discovery is the invite succeeding at all — nothing is
   * seeded here, so an invite that lands did so via an mDNS-learned address.
   */
  nodesLive: number;
  settleMs: number;
  invitesOk: number;
  invitesMs: number;
  joined: number;
  joinMs: number;
  fanoutP50: number;
  fanoutP90: number;
  fanoutMax: number;
  undelivered: number;
  /** Why each rejected invite was rejected — the interesting part of a bad run. */
  inviteFailures: string[];
}

export async function runMeshSwarm(opts: {
  bin: string;
  size: number;
  csBase: number;
  fedBase: number;
  timeoutMs: number;
  root: string;
}): Promise<MeshResult> {
  rmSync(opts.root, { recursive: true, force: true });
  mkdirSync(opts.root, { recursive: true });
  const nodes = Array.from(
    { length: opts.size },
    (_, i) =>
      new MeshNode(i, opts.bin, opts.csBase + i, opts.fedBase + i, join(opts.root, `n${i}`)),
  );
  const t0 = Date.now();
  try {
    // Started in parallel: mDNS is a shared medium and a staggered start would
    // measure the stagger rather than the discovery.
    await Promise.all(nodes.map((n) => n.start()));
    const startupMs = Date.now() - t0;

    // Wait for every node to answer, then let mDNS settle. Peer knowledge
    // itself is not observable from here; the invites below are the real proof.
    const t1 = Date.now();
    const users = await Promise.all(nodes.map((n) => n.register()));
    // `/_matrix/client/versions` is the unauthenticated liveness endpoint every
    // homeserver serves. An earlier version probed `publicRooms`, which this
    // build does not answer 200 to — so the loop always ran its full deadline
    // and reported 0 live nodes while the run itself was perfectly healthy.
    const isLive = async (i: number): Promise<boolean> => {
      const r = await nodes[i]!.api('GET', '/_matrix/client/versions');
      return r.status === 200;
    };
    const liveDeadline = Date.now() + opts.timeoutMs;
    let nodesLive = 0;
    while (Date.now() < liveDeadline) {
      const ok = await Promise.all(nodes.map((_, i) => isLive(i)));
      nodesLive = ok.filter(Boolean).length;
      if (nodesLive === nodes.length) break;
      await sleep(500);
    }
    // Give mDNS a moment to converge across every pair before inviting: a peer
    // discovered after its invite is sent is the flaky case, not the interesting one.
    await sleep(3000);
    const settleMs = Date.now() - t1;

    const host = nodes[0]!;
    const hostUser = users[0]!;
    const created = await host.api(
      'POST',
      '/_matrix/client/v3/createRoom',
      { name: 'mesh', preset: 'private_chat' },
      hostUser.token,
    );
    const roomId = String(created.body.room_id);
    if (!roomId || roomId === 'undefined') {
      throw new Error(`createRoom failed: ${JSON.stringify(created.body)}`);
    }
    const enc = encodeURIComponent(roomId);

    const t2 = Date.now();
    const invited: number[] = [];
    const inviteFailures: string[] = [];
    for (let i = 1; i < nodes.length; i++) {
      const started = Date.now();
      const r = await host.api(
        'POST',
        `/_matrix/client/v3/rooms/${enc}/invite`,
        { user_id: users[i]!.userId },
        hostUser.token,
      );
      if (r.status === 200) invited.push(i);
      else {
        inviteFailures.push(
          `node ${i} (${nodes[i]!.serverName.slice(0, 12)}…) ${r.status} after ` +
            `${Date.now() - started} ms: ${JSON.stringify(r.body).slice(0, 160)}`,
        );
      }
    }
    const invitesMs = Date.now() - t2;

    const delivered: number[] = [];
    await Promise.all(
      invited.map(async (i) => {
        const end = Date.now() + opts.timeoutMs;
        while (Date.now() < end) {
          const s = await nodes[i]!.api(
            'GET',
            '/_matrix/client/v3/sync?timeout=0',
            undefined,
            users[i]!.token,
          );
          const inv = (s.body.rooms as Record<string, Record<string, unknown>> | undefined)?.invite;
          if (inv?.[roomId]) {
            delivered.push(i);
            return;
          }
          await sleep(200);
        }
      }),
    );

    const t3 = Date.now();
    const joined: number[] = [];
    await Promise.all(
      delivered.map(async (i) => {
        const r = await nodes[i]!.api(
          'POST',
          `/_matrix/client/v3/join/${enc}`,
          {},
          users[i]!.token,
        );
        if (r.status === 200) joined.push(i);
      }),
    );
    const joinMs = Date.now() - t3;

    const t4 = Date.now();
    const sent = await host.api(
      'PUT',
      `/_matrix/client/v3/rooms/${enc}/send/m.room.message/mesh-1`,
      { msgtype: 'm.text', body: 'hello over the real mesh' },
      hostUser.token,
    );
    const eventId = String(sent.body.event_id);
    const arrivals: number[] = [];
    await Promise.all(
      joined.map(async (i) => {
        const end = Date.now() + opts.timeoutMs;
        while (Date.now() < end) {
          const m = await nodes[i]!.api(
            'GET',
            `/_matrix/client/v3/rooms/${enc}/messages?dir=b&limit=10`,
            undefined,
            users[i]!.token,
          );
          const chunk = (m.body.chunk ?? []) as { event_id?: string }[];
          if (chunk.some((e) => e.event_id === eventId)) {
            arrivals.push(Date.now() - t4);
            return;
          }
          await sleep(200);
        }
        arrivals.push(Infinity);
      }),
    );
    const ok = arrivals.filter(Number.isFinite).sort((a, b) => a - b);

    return {
      size: opts.size,
      startupMs,
      nodesLive,
      settleMs,
      invitesOk: invited.length,
      invitesMs,
      joined: joined.length,
      joinMs,
      fanoutP50: pct(ok, 0.5),
      fanoutP90: pct(ok, 0.9),
      fanoutMax: ok.at(-1) ?? NaN,
      undelivered: arrivals.filter((a) => !Number.isFinite(a)).length,
      inviteFailures,
    };
  } finally {
    for (const n of nodes) n.stop();
  }
}

export function formatMesh(r: MeshResult): string {
  const ms = (v: number): string => (Number.isFinite(v) ? `${v} ms` : '—');
  const peers = r.size - 1;
  return [
    `${r.size} nodes on the real iroh medium (mDNS discovery, nothing seeded)`,
    `  startup            ${r.startupMs} ms`,
    `  nodes live         ${r.nodesLive}/${r.size} after ${r.settleMs} ms`,
    `  invites accepted   ${r.invitesOk}/${peers} in ${r.invitesMs} ms`,
    `  joined             ${r.joined}/${peers} in ${r.joinMs} ms`,
    `  fan-out p50/p90    ${ms(r.fanoutP50)} / ${ms(r.fanoutP90)}`,
    `  fan-out max        ${ms(r.fanoutMax)}`,
    `  undelivered        ${r.undelivered}/${r.joined} joined members`,
    ...r.inviteFailures.map((f) => `  ! invite failed     ${f}`),
  ].join('\n');
}

export async function main(argv: string[]): Promise<void> {
  const get = (n: string): string | undefined => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const bin = get('bin') ?? process.env.NEUTRINO_LAN_BIN;
  if (!bin) throw new Error('set NEUTRINO_LAN_BIN or pass --bin <path to neutrino-lan>');
  const r = await runMeshSwarm({
    bin,
    size: Number(get('size') ?? 8),
    csBase: Number(get('cs-base') ?? 8300),
    fedBase: Number(get('fed-base') ?? 8500),
    timeoutMs: Number(get('timeout') ?? 60_000),
    root: get('root') ?? join(tmpdir(), 'mesh-swarm'),
  });
  console.log(formatMesh(r));
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
