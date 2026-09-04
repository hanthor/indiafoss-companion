/**
 * Shaped links between mesh nodes.
 *
 * The mesh is not one network. `docs/mesh-protocol.md` §2.1 describes three
 * transports that differ "by orders of magnitude": a shared Wi-Fi LAN, the
 * venue's (spotty) internet, and BLE as the genuine fallback. Every harness we
 * had ran nodes on raw loopback, which models only the first and flatters the
 * protocol: convergence numbers measured at 0.1 ms RTT say nothing about a room
 * whose members are two BLE hops apart.
 *
 * A {@link ShapedLink} is a TCP proxy that sits in front of one node and adds
 * the delay, jitter, loss and bandwidth ceiling of a chosen {@link LinkProfile}
 * — plus `cut`, the binary partition the upstream `neutrino-testkit` proxy
 * already models. It is userspace and unprivileged, so it runs identically on a
 * laptop and in CI; the container-backed `tc netem` mode (see
 * `docs/mesh-harness.md`) is the higher-fidelity opt-in for bandwidth and
 * kernel-level loss, not the default.
 *
 * Shaping is applied per direction and per chunk, so a large federation
 * transaction pays the bandwidth ceiling repeatedly, the way it would on a real
 * slow link, rather than once for the whole body.
 */
import { createServer, connect, type Server, type Socket } from 'node:net';
import { once } from 'node:events';

/** How a link behaves: latency, its variance, connection failure, and a bandwidth ceiling. */
export interface LinkProfile {
  /** One-way delay in milliseconds, before jitter. */
  delayMs: number;
  /** Uniform +/- jitter applied to each chunk's delay; never pushes it below 0. */
  jitterMs: number;
  /**
   * Chance in [0, 1] that a *connection* fails, checked when it is opened.
   *
   * Deliberately not per-chunk. A userspace proxy sits above TCP: by the time a
   * chunk reaches it the sender's kernel has already been ACKed, so silently
   * discarding those bytes does not cause a retransmit — it strands the stream
   * forever, and every request that hits it hangs until some outer timeout. That
   * is not a lossy link, it is a broken proxy, and it quietly poisons any
   * measurement taken through it.
   *
   * A severed connection is the honest analogue at this layer: the peer sees a
   * reset, its federation retry/backoff does what it would really do, and
   * nothing hangs. Packet-level loss needs the `tc netem` mode (see
   * `docs/mesh-harness.md`).
   */
  loss: number;
  /** Bandwidth ceiling in bytes per second. `Infinity` disables the ceiling. */
  bytesPerSecond: number;
}

/**
 * The transports `docs/mesh-protocol.md` names, as numbers a harness can run.
 *
 * `lan` and `wifi` are ordinary local networking. `ble` is the one that matters:
 * BLE's practical throughput is tens of KB/s with round trips in the hundreds of
 * milliseconds, which is why a room that converges instantly on loopback can
 * miss a 90-second deadline on the real mesh.
 */
export const LINK_PROFILES = {
  /** Same switch: effectively free. The old raw-loopback behaviour. */
  lan: { delayMs: 1, jitterMs: 1, loss: 0, bytesPerSecond: Infinity },
  /** A shared venue Wi-Fi with other people on it. */
  wifi: { delayMs: 15, jitterMs: 10, loss: 0.001, bytesPerSecond: 4_000_000 },
  /** The venue uplink to a hosted Spindle. */
  wan: { delayMs: 60, jitterMs: 25, loss: 0.005, bytesPerSecond: 1_000_000 },
  /** Bluetooth LE: the fallback the mesh actually degrades to. */
  ble: { delayMs: 250, jitterMs: 120, loss: 0.02, bytesPerSecond: 20_000 },
  /** Two BLE hops — a phone reachable only via someone else's handset. */
  bleMultiHop: { delayMs: 600, jitterMs: 300, loss: 0.05, bytesPerSecond: 12_000 },
} as const satisfies Record<string, LinkProfile>;

export type LinkProfileName = keyof typeof LINK_PROFILES;

/** Resolve a profile by name, or pass an explicit one through. */
export function profile(p: LinkProfileName | LinkProfile): LinkProfile {
  return typeof p === 'string' ? LINK_PROFILES[p] : p;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * A shaped TCP proxy in front of `upstreamPort`.
 *
 * Listens on an ephemeral port (read {@link ShapedLink.port} after
 * {@link ShapedLink.listen}) and forwards to the upstream, applying the current
 * profile to every chunk in both directions. The profile and the cut flag are
 * live: change them between requests and the next chunk pays the new cost,
 * which is what lets a scenario walk a node from `wifi` down to `ble` mid-run.
 */
export class ShapedLink {
  private server: Server | null = null;
  private readonly sockets = new Set<Socket>();
  /** The link's current shaping. Assignable at runtime. */
  profile: LinkProfile;
  /** While true the link is down: new connections are refused and in-flight chunks are dropped. */
  cut = false;

  constructor(
    private readonly upstreamPort: number,
    initial: LinkProfileName | LinkProfile = 'lan',
    private readonly upstreamHost = '127.0.0.1',
  ) {
    this.profile = profile(initial);
  }

  /** Bind the proxy and resolve once it is accepting connections. */
  async listen(): Promise<number> {
    const server = createServer((client) => this.accept(client));
    this.server = server;
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return this.port;
  }

  /** The ephemeral port the proxy is listening on. Throws before {@link listen}. */
  get port(): number {
    const addr = this.server?.address();
    if (!addr || typeof addr === 'string') throw new Error('link is not listening');
    return addr.port;
  }

  /** `127.0.0.1:<port>` — what a peer should be told to dial. */
  get authority(): string {
    return `127.0.0.1:${this.port}`;
  }

  private accept(client: Socket): void {
    if (this.cut) {
      client.destroy();
      return;
    }
    // Connection-level loss: the dial simply fails, as it would on a flaky
    // medium. See {@link LinkProfile.loss} for why this is not per-chunk.
    if (this.profile.loss > 0 && Math.random() < this.profile.loss) {
      client.destroy();
      return;
    }
    const upstream = connect(this.upstreamPort, this.upstreamHost);
    this.track(client);
    this.track(upstream);
    // A half-open socket would let one direction linger after the other closed;
    // the pump ends both sides together instead.
    const bothWays = (from: Socket, to: Socket): void => {
      from.on('data', (chunk: Buffer) => {
        void this.forward(chunk, to, from);
      });
      from.on('close', () => to.destroy());
      from.on('error', () => to.destroy());
    };
    bothWays(client, upstream);
    bothWays(upstream, client);
  }

  /**
   * Delay and rate-limit one chunk.
   *
   * Every byte accepted here is eventually written or the connection is torn
   * down — a chunk is never silently discarded, because above TCP that strands
   * the stream rather than provoking a retransmit (see {@link LinkProfile.loss}).
   *
   * Backpressure matters: without pausing the source, a fast writer on a
   * 20 KB/s link would queue the whole transaction in memory and the ceiling
   * would shape nothing but the timestamps.
   */
  private async forward(chunk: Buffer, to: Socket, from: Socket): Promise<void> {
    const { delayMs, jitterMs, bytesPerSecond } = this.profile;
    from.pause();
    try {
      const jitter = jitterMs > 0 ? (Math.random() * 2 - 1) * jitterMs : 0;
      const wait = Math.max(0, delayMs + jitter);
      const transmit = bytesPerSecond === Infinity ? 0 : (chunk.length / bytesPerSecond) * 1000;
      if (wait + transmit > 0) await sleep(wait + transmit);
      // A cut while this chunk was in flight severs the connection rather than
      // swallowing the bytes — the peer sees a reset, which is what a partition
      // looks like from the other end.
      if (this.cut) {
        to.destroy();
        from.destroy();
        return;
      }
      if (to.destroyed) return;
      to.write(chunk);
    } finally {
      if (!from.destroyed) from.resume();
    }
  }

  private track(s: Socket): void {
    this.sockets.add(s);
    s.on('close', () => this.sockets.delete(s));
  }

  /** Drop every live connection without closing the listener (a hard partition). */
  reset(): void {
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
  }

  /** Close the listener and every connection through it. */
  async close(): Promise<void> {
    this.reset();
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
