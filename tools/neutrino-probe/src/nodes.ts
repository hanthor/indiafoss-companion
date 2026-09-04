/**
 * Starting, stopping and wiring Neutrino nodes.
 *
 * This existed three times before it existed once: `two-nodes-restart`,
 * `two-nodes-reinstall` and `scripts/swarm.mjs` each carried their own
 * `startNode`/`stopNode`/`up` with their own hardcoded port block (8018, 8028,
 * 9100+i), so two harnesses could not run at the same time and a fix to one
 * never reached the others. This module is the single copy, and it adds the
 * thing none of them had: every node sits behind a {@link ShapedLink}, so a peer
 * dialling it pays a chosen transport's latency.
 *
 * The advertise/bind split is what makes shaping possible, and it is the same
 * trick upstream's `neutrino-testkit` uses for partitions: the node *binds* a
 * private backend port but *advertises* its proxy's port via
 * `NEUTRINO_SERVER_NAME`, so everything a peer sends arrives through the shaped
 * proxy while the harness itself can still talk to the backend directly at full
 * speed (a test's own bookkeeping should not pay BLE latency).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ShapedLink, profile, type LinkProfile, type LinkProfileName } from './link.js';

/** How long to wait for a node's client-server API to answer, in ms. */
const READY_TIMEOUT_MS = 30_000;

export interface NodeOptions {
  /** Path to the `neutrino` binary. */
  bin: string;
  /** Storage directory. Created if absent; a temp dir is used when omitted. */
  storageDir?: string;
  /** Transport peers experience when dialling this node. Default `lan`. */
  link?: LinkProfileName | LinkProfile;
  /** Extra environment for the child (e.g. `RUST_LOG`). */
  env?: Record<string, string>;
}

/**
 * One Neutrino homeserver process, plus the shaped link peers reach it through.
 *
 * `directUrl` is the backend and is what the harness drives; `advertised` is
 * what peers are told and is what pays the shaping.
 */
export class NeutrinoNode {
  private proc: ChildProcess | null = null;
  private readonly ownsDir: boolean;
  readonly storageDir: string;
  readonly link: ShapedLink;
  /** Set once {@link start} has bound the backend. */
  private backendPort = 0;

  private constructor(
    private readonly opts: NodeOptions,
    storageDir: string,
    ownsDir: boolean,
    backendPort: number,
    link: ShapedLink,
  ) {
    this.storageDir = storageDir;
    this.ownsDir = ownsDir;
    this.backendPort = backendPort;
    this.link = link;
  }

  /**
   * Allocate ports and the shaped proxy for a node without starting it.
   *
   * Split from {@link start} because a node's advertised address has to be known
   * *before* the child runs — it is passed in as `NEUTRINO_SERVER_NAME`.
   */
  static async create(opts: NodeOptions): Promise<NeutrinoNode> {
    const ownsDir = !opts.storageDir;
    const storageDir = opts.storageDir ?? mkdtempSync(join(tmpdir(), 'neutrino-node-'));
    mkdirSync(storageDir, { recursive: true });
    const backendPort = await freePort();
    const link = new ShapedLink(backendPort, opts.link ?? 'lan');
    await link.listen();
    return new NeutrinoNode(opts, storageDir, ownsDir, backendPort, link);
  }

  /** `127.0.0.1:<proxyPort>` — the node's Matrix server name, as peers see it. */
  get advertised(): string {
    return this.link.authority;
  }

  /** Base URL for the harness's own requests: straight to the backend, unshaped. */
  get directUrl(): string {
    return `http://127.0.0.1:${this.backendPort}`;
  }

  /** Base URL through the shaped proxy — what a peer's traffic experiences. */
  get shapedUrl(): string {
    return `http://${this.link.authority}`;
  }

  /** Spawn the child and resolve once `/_matrix/client/versions` answers. */
  async start(): Promise<void> {
    if (this.proc) throw new Error('node already started');
    const log = openSync(join(this.storageDir, 'log'), 'a');
    this.proc = spawn(this.opts.bin, [], {
      env: {
        ...process.env,
        // Advertise the proxy, bind the backend: peers dial the shaped path.
        NEUTRINO_SERVER_NAME: this.advertised,
        NEUTRINO_BIND_ADDR: `127.0.0.1:${this.backendPort}`,
        NEUTRINO_STORAGE_DIR: this.storageDir,
        // A revived node should redrain its outbox at once; jitter only makes
        // convergence assertions flaky.
        NEUTRINO_STARTUP_JITTER_MS: '0',
        RUST_LOG: 'warn',
        ...this.opts.env,
      },
      stdio: ['ignore', log, log],
      detached: true,
    });
    await this.waitUp();
  }

  private async waitUp(): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${this.directUrl}/_matrix/client/versions`, {
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok) return;
      } catch {
        // Not listening yet.
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`node ${this.advertised} never came up; see ${this.storageDir}/log`);
  }

  /**
   * Kill the process but keep the storage directory and the proxy.
   *
   * This is the crash half of crash/revive: {@link start} against the same
   * `storageDir` brings the node back with its committed state and a full
   * outbox to redeliver.
   */
  stop(signal: NodeJS.Signals = 'SIGKILL'): void {
    const proc = this.proc;
    this.proc = null;
    if (!proc?.pid) return;
    try {
      // Negative pid: the child was spawned detached, so kill its group.
      process.kill(-proc.pid, signal);
    } catch {
      // Already gone.
    }
  }

  /** Stop the node, close its link, and remove the storage directory if we made it. */
  async destroy(): Promise<void> {
    this.stop();
    await this.link.close();
    if (this.ownsDir) rmSync(this.storageDir, { recursive: true, force: true });
  }

  /** Authenticated (or anonymous) client-server request against the backend. */
  async api(
    method: string,
    path: string,
    body?: unknown,
    token?: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${this.directUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body: parsed };
  }

  /**
   * Register a user on this node.
   *
   * The fork's dev binary carries a multi-user shim (patch 0010), so each
   * register is its own user, token and device; `m.login.dummy` is the one-step
   * path with no UIAA round trip.
   */
  async register(username: string): Promise<{ token: string; userId: string }> {
    const r = await this.api('POST', '/_matrix/client/v3/register', {
      username,
      password: 'probe-password',
      auth: { type: 'm.login.dummy' },
    });
    if (r.status !== 200) {
      throw new Error(`register on ${this.advertised}: ${JSON.stringify(r.body)}`);
    }
    return { token: String(r.body.access_token), userId: String(r.body.user_id) };
  }
}

/** Ask the OS for a free TCP port by binding and immediately releasing one. */
async function freePort(): Promise<number> {
  const { createServer } = await import('node:net');
  const srv = createServer();
  srv.listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const addr = srv.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  const { port } = addr;
  await new Promise<void>((r) => srv.close(() => r()));
  return port;
}

export interface SwarmOptions {
  bin: string;
  /** Number of nodes. */
  size: number;
  /** Transport for ordinary member nodes. Default `lan`. */
  link?: LinkProfileName | LinkProfile;
  /**
   * How many of the nodes are venue gateways.
   *
   * Both `docs/neutrino-scale.md` and Spindle's `docs/mesh-federation.md`
   * independently concluded that 3–5 gateways — nodes with the venue uplink,
   * and the only peers a Spindle federates with — is the shape a 3,000-phone
   * venue has to take ("three thousand outboxes backing off is not a
   * homeserver, it is a port scanner"). Gateways get {@link gatewayLink}
   * instead of {@link link}, so a run can model good uplinks and bad handsets.
   */
  gateways?: number;
  /** Transport for gateway nodes. Default `wifi`. */
  gatewayLink?: LinkProfileName | LinkProfile;
  /** Delay between node starts, in ms. Staggering is what makes large swarms converge. */
  staggerMs?: number;
  env?: Record<string, string>;
}

/**
 * A set of nodes started together.
 *
 * Nodes 0..`gateways-1` are the gateways; the rest are ordinary members. The
 * split is positional so a scenario can address "the gateways" without a second
 * bookkeeping structure.
 */
export class Swarm {
  private constructor(
    readonly nodes: NeutrinoNode[],
    readonly gatewayCount: number,
  ) {}

  static async start(opts: SwarmOptions): Promise<Swarm> {
    const gateways = opts.gateways ?? 0;
    if (gateways > opts.size) throw new Error('more gateways than nodes');
    const nodes: NeutrinoNode[] = [];
    for (let i = 0; i < opts.size; i++) {
      const isGateway = i < gateways;
      nodes.push(
        await NeutrinoNode.create({
          bin: opts.bin,
          link: isGateway ? (opts.gatewayLink ?? 'wifi') : (opts.link ?? 'lan'),
          env: opts.env,
        }),
      );
    }
    // Start with a stagger: 50 nodes joining at once never converges, 50
    // staggered half a second apart all land (docs/neutrino-scale.md).
    for (const [i, node] of nodes.entries()) {
      if (opts.staggerMs && i > 0) await new Promise((r) => setTimeout(r, opts.staggerMs));
      await node.start();
    }
    return new Swarm(nodes, gateways);
  }

  get gateways(): NeutrinoNode[] {
    return this.nodes.slice(0, this.gatewayCount);
  }

  get members(): NeutrinoNode[] {
    return this.nodes.slice(this.gatewayCount);
  }

  /** Re-shape every member link at once — e.g. to drop the whole venue to BLE. */
  reshape(p: LinkProfileName | LinkProfile): void {
    const next = profile(p);
    for (const n of this.members) n.link.profile = next;
  }

  async destroy(): Promise<void> {
    await Promise.all(this.nodes.map((n) => n.destroy()));
  }
}
