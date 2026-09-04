/**
 * Federation across a shaped link.
 *
 * The point is not that two nodes can federate — `two-nodes.e2e.test.ts`
 * already proves that on loopback. It is that the harness's shaping is applied
 * to *federation* traffic specifically: a node advertises its proxy as its
 * server name, so a peer's invites, joins and PDUs all cross the shaped path
 * while the test's own bookkeeping talks to the backend directly. If that wiring
 * were wrong, every latency number the swarm reports would be measuring nothing.
 *
 * Skipped without `NEUTRINO_BIN`, like the other self-starting suites, so the
 * default `pnpm -r test` sweep stays green with no Rust toolchain.
 */
import { describe, expect, it } from 'vitest';
import { NeutrinoNode } from './nodes.js';

const BIN = process.env.NEUTRINO_BIN;

/** Poll until `check` passes or the deadline expires. */
async function until<T>(
  what: string,
  deadlineMs: number,
  check: () => Promise<T | null>,
): Promise<T> {
  const end = Date.now() + deadlineMs;
  let last: unknown;
  while (Date.now() < end) {
    try {
      const got = await check();
      if (got !== null && got !== undefined) return got;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`timed out waiting for ${what}${last ? `: ${String(last)}` : ''}`);
}

describe.skipIf(!BIN)('federation over a shaped link', () => {
  it('carries an invite and a message between two nodes, and the cut stops it', async () => {
    const a = await NeutrinoNode.create({ bin: BIN!, link: 'lan' });
    const b = await NeutrinoNode.create({ bin: BIN!, link: 'lan' });
    try {
      await a.start();
      await b.start();

      const alice = await a.register('alice');
      const bob = await b.register('bob');

      // Bob's user id is minted by node B, so it already carries B's advertised
      // (proxied) server name — federation from A to B goes through the shaping.
      expect(bob.userId).toContain(b.advertised);

      const created = await a.api(
        'POST',
        '/_matrix/client/v3/createRoom',
        { name: 'shaped', preset: 'private_chat' },
        alice.token,
      );
      expect(created.status).toBe(200);
      const roomId = String(created.body.room_id);
      expect(roomId).toBeTruthy();

      const invited = await a.api(
        'POST',
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
        { user_id: bob.userId },
        alice.token,
      );
      expect(invited.status).toBe(200);

      // The invite crossing the proxy is the proof the wiring is real.
      await until('bob to see the invite', 30_000, async () => {
        const s = await b.api('GET', '/_matrix/client/v3/sync?timeout=0', undefined, bob.token);
        const invite = (s.body.rooms as Record<string, Record<string, unknown>> | undefined)
          ?.invite;
        return invite?.[roomId] ? true : null;
      });

      const joined = await b.api(
        'POST',
        `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`,
        {},
        bob.token,
      );
      expect(joined.status).toBe(200);

      const sent = await a.api(
        'PUT',
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/shaped-1`,
        { msgtype: 'm.text', body: 'over the shaped link' },
        alice.token,
      );
      const eventId = String(sent.body.event_id);
      expect(eventId).toBeTruthy();

      await until('the message to reach bob', 30_000, async () => {
        const m = await b.api(
          'GET',
          `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=10`,
          undefined,
          bob.token,
        );
        const chunk = (m.body.chunk ?? []) as { event_id?: string }[];
        return chunk.some((e) => e.event_id === eventId) ? true : null;
      });

      // Cutting B's link must stop delivery: a message sent while it is down
      // does not arrive. This is the same partition the upstream testkit models,
      // reproduced here so the swarm can use one mechanism for both.
      b.link.cut = true;
      b.link.reset();
      const duringCut = await a.api(
        'PUT',
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/shaped-2`,
        { msgtype: 'm.text', body: 'sent while partitioned' },
        alice.token,
      );
      const cutEventId = String(duringCut.body.event_id);
      await new Promise((r) => setTimeout(r, 2500));
      const whileCut = await b.api(
        'GET',
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=10`,
        undefined,
        bob.token,
      );
      const cutChunk = (whileCut.body.chunk ?? []) as { event_id?: string }[];
      expect(cutChunk.some((e) => e.event_id === cutEventId)).toBe(false);

      // Healing drains the outbox — nothing is lost, it was only delayed.
      b.link.cut = false;
      await until('the delayed message to arrive after healing', 60_000, async () => {
        const m = await b.api(
          'GET',
          `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=10`,
          undefined,
          bob.token,
        );
        const chunk = (m.body.chunk ?? []) as { event_id?: string }[];
        return chunk.some((e) => e.event_id === cutEventId) ? true : null;
      });
    } finally {
      await a.destroy();
      await b.destroy();
    }
  }, 180_000);
});
