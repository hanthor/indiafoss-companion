/**
 * The shaped link has to be proven on its own, against a plain HTTP server,
 * before any conclusion drawn *through* it means anything: a harness that
 * reports "BLE converges in 40 s" is worthless if the BLE profile was silently
 * a no-op. These tests are deliberately independent of Neutrino — they need no
 * binary and run in the default `pnpm -r test` sweep.
 */
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LINK_PROFILES, ShapedLink, profile } from './link.js';

let origin: Server;
let originPort: number;

beforeAll(async () => {
  origin = createServer((req, res) => {
    if (req.url === '/big') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.alloc(64_000, 0x61));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  origin.listen(0, '127.0.0.1');
  await once(origin, 'listening');
  const addr = origin.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  originPort = addr.port;
});

afterAll(async () => {
  await new Promise<void>((r) => origin.close(() => r()));
});

/** Wall-clock cost of one round trip through a link. */
async function timeGet(port: number, path = '/'): Promise<number> {
  const t0 = Date.now();
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  await res.arrayBuffer();
  return Date.now() - t0;
}

describe('shaped links', () => {
  it('passes traffic through untouched on a lan profile', async () => {
    const link = new ShapedLink(originPort, 'lan');
    await link.listen();
    try {
      const res = await fetch(`http://127.0.0.1:${link.port}/`);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
    } finally {
      await link.close();
    }
  });

  it('adds the profile delay to a round trip', async () => {
    // 120 ms each way, so a request+response pays it at least twice. Asserting a
    // floor (not a window) keeps this stable on a loaded CI box.
    const link = new ShapedLink(originPort, {
      delayMs: 120,
      jitterMs: 0,
      loss: 0,
      bytesPerSecond: Infinity,
    });
    await link.listen();
    try {
      const elapsed = await timeGet(link.port);
      expect(elapsed).toBeGreaterThanOrEqual(200);
    } finally {
      await link.close();
    }
  });

  // A BLE round trip is ~1 s of shaping before the runner's own overhead, so
  // these two cases raise vitest's 5 s default rather than racing it on CI.
  const BLE_TIMEOUT_MS = 30_000;

  it(
    'is measurably slower on ble than on lan',
    async () => {
      const lan = new ShapedLink(originPort, 'lan');
      // The real ble profile drops 2% of connections, which would flake a
      // single-request timing assertion. Loss is covered by its own test; this
      // one isolates latency and bandwidth.
      const ble = new ShapedLink(originPort, { ...LINK_PROFILES.ble, loss: 0 });
      await lan.listen();
      await ble.listen();
      try {
        const fast = await timeGet(lan.port);
        const slow = await timeGet(ble.port);
        // The point of the whole module: the transport the docs call the
        // fallback must actually cost something.
        expect(slow).toBeGreaterThan(fast + 100);
      } finally {
        await lan.close();
        await ble.close();
      }
    },
    BLE_TIMEOUT_MS,
  );

  it('never strands a request: every accepted connection completes or fails fast', async () => {
    // The regression this guards. Loss used to be applied per chunk, which
    // above TCP means the sender's kernel was already ACKed — the bytes were
    // simply gone, no retransmit, and the request hung until an outer timeout.
    // On a 2% profile that stalled ~1 request in 50 and silently poisoned
    // every measurement taken through the link. Loss is now connection-level,
    // so a request either completes or is refused promptly; neither hangs.
    const link = new ShapedLink(originPort, {
      delayMs: 0,
      jitterMs: 0,
      loss: 0.5,
      bytesPerSecond: Infinity,
    });
    await link.listen();
    try {
      let completed = 0;
      let refused = 0;
      for (let i = 0; i < 40; i++) {
        try {
          // `Connection: close` forces a fresh TCP connection per request.
          // Without it undici pools keep-alive sockets, so connection-level
          // loss would only ever be sampled on the very first dial.
          const res = await fetch(`http://127.0.0.1:${link.port}/`, {
            headers: { connection: 'close' },
            signal: AbortSignal.timeout(2000),
          });
          await res.arrayBuffer();
          completed++;
        } catch {
          refused++;
        }
      }
      // Every attempt resolved one way or the other inside 2 s.
      expect(completed + refused).toBe(40);
      // And the loss is real: at p=0.5 some got through and some did not.
      expect(completed).toBeGreaterThan(0);
      expect(refused).toBeGreaterThan(0);
    } finally {
      await link.close();
    }
  }, 60_000);

  it('enforces a bandwidth ceiling on a large body', async () => {
    // 64 KB at 64 KB/s is ~1 s of transmit time no matter how fast loopback is.
    const link = new ShapedLink(originPort, {
      delayMs: 0,
      jitterMs: 0,
      loss: 0,
      bytesPerSecond: 64_000,
    });
    await link.listen();
    try {
      const elapsed = await timeGet(link.port, '/big');
      expect(elapsed).toBeGreaterThanOrEqual(500);
    } finally {
      await link.close();
    }
  });

  it('refuses connections while cut, and recovers when healed', async () => {
    const link = new ShapedLink(originPort, 'lan');
    await link.listen();
    try {
      link.cut = true;
      await expect(fetch(`http://127.0.0.1:${link.port}/`)).rejects.toThrow();
      link.cut = false;
      const res = await fetch(`http://127.0.0.1:${link.port}/`);
      expect(res.status).toBe(200);
    } finally {
      await link.close();
    }
  });

  it(
    'changes cost when the profile is swapped at runtime',
    async () => {
      const link = new ShapedLink(originPort, 'lan');
      await link.listen();
      try {
        const fast = await timeGet(link.port);
        link.profile = { ...profile('ble'), loss: 0 };
        const slow = await timeGet(link.port);
        expect(slow).toBeGreaterThan(fast + 100);
      } finally {
        await link.close();
      }
    },
    BLE_TIMEOUT_MS,
  );

  it('names every transport the mesh-protocol doc describes', () => {
    // A scenario refers to profiles by name; a missing one should fail here,
    // not with `undefined` shaping deep inside a swarm run.
    expect(Object.keys(LINK_PROFILES).sort()).toEqual(
      ['ble', 'bleMultiHop', 'lan', 'wan', 'wifi'].sort(),
    );
    for (const [name, p] of Object.entries(LINK_PROFILES)) {
      expect(p.delayMs, name).toBeGreaterThanOrEqual(0);
      expect(p.loss, name).toBeGreaterThanOrEqual(0);
      expect(p.loss, name).toBeLessThanOrEqual(1);
      expect(p.bytesPerSecond, name).toBeGreaterThan(0);
    }
  });
});
