// A BLE-grade UDP impairment proxy: every datagram between two mesh nodes
// crosses it, and it misbehaves on demand — base delay, jitter, loss, and
// whole-link down-windows (the flap). Userspace on purpose: tc-netem needs a
// kernel module the host may not ship (Silverblue after a kernel update, most
// containers), while this runs anywhere Node does, and a flap becomes a
// deterministic in-process switch instead of a sudo race.
//
// One instance carries one direction of a node pair: it listens where the
// dialing node believes its peer lives, forwards to where the peer actually
// is, and NATs replies back per source. QUIC rides on top untouched — the
// nodes authenticate each other by key, so the address indirection is
// invisible to them, exactly like a radio path.
import dgram from 'node:dgram';

export interface FlakyOptions {
  /** Base one-way delay added to every datagram, ms. */
  delayMs: number;
  /** Uniform jitter, ms: actual delay is delayMs ± jitterMs. */
  jitterMs: number;
  /** Per-datagram drop probability, 0..1. */
  loss: number;
}

/** BLE-ish defaults: slow, jittery, lossy — but a working link. */
export const BLE_FLAKY: FlakyOptions = { delayMs: 120, jitterMs: 80, loss: 0.05 };

export class UdpFlakyProxy {
  private readonly socket = dgram.createSocket('udp4');
  private readonly returns = new Map<string, dgram.Socket>();
  private linkUp = true;
  private closed = false;

  private constructor(
    private readonly targetHost: string,
    private readonly targetPort: number,
    private readonly options: FlakyOptions,
  ) {}

  /** Bind on `listenHost:listenPort`, forwarding to `targetHost:targetPort`. */
  static async listen(
    listenHost: string,
    listenPort: number,
    targetHost: string,
    targetPort: number,
    options: FlakyOptions = BLE_FLAKY,
  ): Promise<UdpFlakyProxy> {
    const proxy = new UdpFlakyProxy(targetHost, targetPort, options);
    proxy.socket.on('message', (data, rinfo) => proxy.onInbound(data, rinfo));
    await new Promise<void>((resolve, reject) => {
      proxy.socket.once('error', reject);
      proxy.socket.bind(listenPort, listenHost, resolve);
    });
    return proxy;
  }

  /** Take the link down; datagrams in both directions vanish until `up()`. */
  down(): void {
    this.linkUp = false;
  }

  up(): void {
    this.linkUp = true;
  }

  /** A flap: down now, back up after `ms`. */
  async flap(ms: number): Promise<void> {
    this.down();
    await new Promise((r) => setTimeout(r, ms));
    this.up();
  }

  close(): void {
    this.closed = true;
    this.socket.close();
    for (const s of this.returns.values()) s.close();
    this.returns.clear();
  }

  /** Impair one datagram: maybe drop, else deliver after delay ± jitter. */
  private impair(deliver: () => void): void {
    if (!this.linkUp || Math.random() < this.options.loss) return;
    const { delayMs, jitterMs } = this.options;
    const wait = Math.max(0, delayMs + (Math.random() * 2 - 1) * jitterMs);
    setTimeout(() => {
      // Re-check at delivery time: a datagram in flight when the link drops
      // is lost with it, like a radio.
      if (!this.closed && this.linkUp) deliver();
    }, wait);
  }

  private onInbound(data: Buffer, rinfo: dgram.RemoteInfo): void {
    const key = `${rinfo.address}:${rinfo.port}`;
    let back = this.returns.get(key);
    if (!back) {
      // One return socket per dialer, so the peer's replies find their way
      // back to the exact source address the dialer used.
      back = dgram.createSocket('udp4');
      back.on('message', (reply) =>
        this.impair(() => this.socket.send(reply, rinfo.port, rinfo.address)),
      );
      this.returns.set(key, back);
    }
    const out = back;
    this.impair(() => out.send(data, this.targetPort, this.targetHost));
  }
}
