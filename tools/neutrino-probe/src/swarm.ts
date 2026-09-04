/**
 * Swarm scenarios: what a conference room does when the network is not loopback.
 *
 * `scripts/swarm.mjs` measured fan-out for N nodes on raw loopback and produced
 * the numbers in `docs/neutrino-scale.md`. Those numbers answer "can the process
 * handle N homeservers", which is a real question, but not the one a venue asks.
 * A venue asks what happens when half the room is two BLE hops from the sender.
 * This runner is the same measurement over a chosen {@link LINK_PROFILES}
 * transport, with an optional gateway tier.
 *
 * Usage:
 *   pnpm --filter @indiafoss/neutrino-probe swarm -- --size 20 --profile ble
 *   pnpm --filter @indiafoss/neutrino-probe swarm -- --size 50 --profile wifi --gateways 3 --stagger 250
 *
 * `NEUTRINO_BIN` (or `--bin`) points at the binary. Everything is torn down on
 * exit, including on failure.
 */
import { LINK_PROFILES, type LinkProfileName } from './link.js';
import { Swarm } from './nodes.js';

interface Args {
  size: number;
  profile: LinkProfileName;
  gatewayProfile: LinkProfileName;
  gateways: number;
  staggerMs: number;
  bin: string;
  timeoutMs: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const profileName = (v: string | undefined, fallback: LinkProfileName): LinkProfileName => {
    if (!v) return fallback;
    if (!(v in LINK_PROFILES)) {
      throw new Error(`unknown profile ${v}; known: ${Object.keys(LINK_PROFILES).join(', ')}`);
    }
    return v as LinkProfileName;
  };
  const bin = get('bin') ?? process.env.NEUTRINO_BIN;
  if (!bin) throw new Error('set NEUTRINO_BIN or pass --bin <path to neutrino>');
  return {
    size: Number(get('size') ?? 10),
    profile: profileName(get('profile'), 'lan'),
    gatewayProfile: profileName(get('gateway-profile'), 'wifi'),
    gateways: Number(get('gateways') ?? 0),
    staggerMs: Number(get('stagger') ?? 0),
    timeoutMs: Number(get('timeout') ?? 120_000),
    bin,
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** p-th percentile of an already-sorted array. */
function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

export interface SwarmResult {
  size: number;
  profile: string;
  gateways: number;
  startupMs: number;
  invitesMs: number;
  /** Invites the host could not even send — the peer's server was unreachable. */
  invitesFailed: number;
  /** Invites that arrived at the invitee within the deadline. */
  invitesDelivered: number;
  joined: number;
  joinMs: number;
  membersSeen: number;
  fanoutP50: number;
  fanoutP90: number;
  fanoutMax: number;
  undelivered: number;
}

/** Run one scenario and return its measurements. */
export async function runSwarm(args: Args): Promise<SwarmResult> {
  const t0 = Date.now();
  const swarm = await Swarm.start({
    bin: args.bin,
    size: args.size,
    link: args.profile,
    gatewayLink: args.gatewayProfile,
    gateways: args.gateways,
    staggerMs: args.staggerMs,
  });
  const startupMs = Date.now() - t0;
  try {
    const nodes = swarm.nodes;
    const users = await Promise.all(nodes.map((n) => n.register('u')));

    // The host is a gateway when there is one: that is the venue shape, where a
    // room is created on a machine with the uplink rather than on a handset.
    const host = nodes[0]!;
    const hostUser = users[0]!;
    const created = await host.api(
      'POST',
      '/_matrix/client/v3/createRoom',
      { name: 'swarm', preset: 'private_chat' },
      hostUser.token,
    );
    const roomId = String(created.body.room_id);
    if (!roomId || roomId === 'undefined') {
      throw new Error(`createRoom failed: ${JSON.stringify(created.body)}`);
    }

    // An invite that fails on a degraded link is a *result*, not a crash. On BLE
    // the origin's federation request to a peer can genuinely time out
    // ("could not reach the invitee's server"), and a harness that throws there
    // measures nothing — the whole point is to quantify how far the room gets.
    const t1 = Date.now();
    const invited: number[] = [];
    let invitesFailed = 0;
    for (let i = 1; i < nodes.length; i++) {
      const inv = await host.api(
        'POST',
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
        { user_id: users[i]!.userId },
        hostUser.token,
      );
      if (inv.status === 200) invited.push(i);
      else invitesFailed++;
    }
    const invitesMs = Date.now() - t1;

    // Only nodes whose invite was accepted can be expected to see one.
    const invitesDelivered: number[] = [];
    const waitInvite = async (i: number): Promise<void> => {
      const end = Date.now() + args.timeoutMs;
      while (Date.now() < end) {
        const s = await nodes[i]!.api(
          'GET',
          '/_matrix/client/v3/sync?timeout=0',
          undefined,
          users[i]!.token,
        );
        const invite = (s.body.rooms as Record<string, Record<string, unknown>> | undefined)
          ?.invite;
        if (invite?.[roomId]) {
          invitesDelivered.push(i);
          return;
        }
        await sleep(150);
      }
    };
    await Promise.all(invited.map((i) => waitInvite(i)));

    // Joins are the part that falls over at scale: the documented fix is a
    // client-side stagger, not a longer server deadline.
    const t3 = Date.now();
    const joinedNodes: number[] = [];
    await Promise.all(
      invitesDelivered.map(async (i, k) => {
        if (args.staggerMs) await sleep(k * args.staggerMs);
        const j = await nodes[i]!.api(
          'POST',
          `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`,
          {},
          users[i]!.token,
        );
        if (j.status === 200) joinedNodes.push(i);
      }),
    );
    const joined = joinedNodes.length;
    const joinMs = Date.now() - t3;

    const countMembers = async (): Promise<number> => {
      const m = await host.api(
        'GET',
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/members`,
        undefined,
        hostUser.token,
      );
      const chunk = (m.body.chunk ?? []) as { content?: { membership?: string } }[];
      return chunk.filter((e) => e.content?.membership === 'join').length;
    };
    const memberDeadline = Date.now() + args.timeoutMs;
    let membersSeen = 0;
    while (Date.now() < memberDeadline) {
      membersSeen = await countMembers();
      if (membersSeen >= nodes.length) break;
      await sleep(250);
    }

    const t4 = Date.now();
    const sent = await host.api(
      'PUT',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/swarm-1`,
      { msgtype: 'm.text', body: 'hello swarm' },
      hostUser.token,
    );
    const eventId = String(sent.body.event_id);
    const arrivals: number[] = [];
    const waitMsg = async (i: number): Promise<void> => {
      const end = Date.now() + args.timeoutMs;
      while (Date.now() < end) {
        const m = await nodes[i]!.api(
          'GET',
          `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=5`,
          undefined,
          users[i]!.token,
        );
        const chunk = (m.body.chunk ?? []) as { event_id?: string }[];
        if (chunk.some((e) => e.event_id === eventId)) {
          arrivals.push(Date.now() - t4);
          return;
        }
        await sleep(150);
      }
      arrivals.push(Infinity);
    };
    // Only members that actually joined can receive the message; counting
    // never-joined nodes as "undelivered" would double-count an earlier failure.
    await Promise.all(joinedNodes.map((i) => waitMsg(i)));
    const delivered = arrivals.filter((a) => Number.isFinite(a)).sort((a, b) => a - b);

    return {
      size: args.size,
      profile: args.profile,
      gateways: args.gateways,
      startupMs,
      invitesMs,
      invitesFailed,
      invitesDelivered: invitesDelivered.length,
      joined,
      joinMs,
      membersSeen,
      fanoutP50: pct(delivered, 0.5),
      fanoutP90: pct(delivered, 0.9),
      fanoutMax: delivered.at(-1) ?? NaN,
      undelivered: arrivals.filter((a) => !Number.isFinite(a)).length,
    };
  } finally {
    await swarm.destroy();
  }
}

/** Human-readable one-run report. */
export function formatResult(r: SwarmResult): string {
  const gw = r.gateways > 0 ? `, ${r.gateways} gateway(s)` : '';
  const peers = r.size - 1;
  // `NaN` for a percentile means nothing arrived at all; say so rather than
  // printing a number-shaped non-answer.
  const ms = (v: number): string => (Number.isFinite(v) ? `${v} ms` : '—');
  return [
    `${r.size} nodes on "${r.profile}"${gw}`,
    `  startup            ${r.startupMs} ms`,
    `  invites sent       ${peers - r.invitesFailed}/${peers} in ${r.invitesMs} ms` +
      (r.invitesFailed ? ` (${r.invitesFailed} unreachable)` : ''),
    `  invites delivered  ${r.invitesDelivered}/${peers}`,
    `  joined             ${r.joined}/${peers} in ${r.joinMs} ms`,
    `  members on host    ${r.membersSeen}/${r.size}`,
    `  fan-out p50/p90    ${ms(r.fanoutP50)} / ${ms(r.fanoutP90)}`,
    `  fan-out max        ${ms(r.fanoutMax)}`,
    `  undelivered        ${r.undelivered}/${r.joined} joined members`,
  ].join('\n');
}

/** Entry point, exported so a test can drive it without spawning a process. */
export async function main(argv: string[]): Promise<void> {
  const r = await runSwarm(parseArgs(argv));
  console.log(formatResult(r));
}

// Run as a CLI when this file is the entry module (tsx sets argv[1] to it).
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
