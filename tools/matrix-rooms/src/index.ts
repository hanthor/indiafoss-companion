import { collectBundleIssues } from '@indiafoss/model';
import type { EventBundle } from '@indiafoss/model';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { aliasServer, planRooms } from './plan.js';
import type { RoomPlan } from './plan.js';

const usage = `matrix-rooms — FOSDEM-style conference rooms on the organiser's homeserver

Usage:
  MATRIX_ACCESS_TOKEN=... matrix-rooms <event-bundle.json> [--dry-run] [--booths] [--sessions]
      [--no-locations] [--homeserver https://matrix.example]

Creates (idempotently) the Space and rooms the bundle's "messaging" block asks
for: the listed rooms, plus one public, world-readable room per venue location
(--booths / --sessions add one per booth / session). Existing rooms are left
alone apart from being linked into the space. The token belongs to an
organiser account on that server; attendees join from their own accounts.
`;

interface Args {
  bundlePath: string;
  dryRun: boolean;
  booths: boolean;
  sessions: boolean;
  locations: boolean;
  homeserver?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    bundlePath: '',
    dryRun: false,
    booths: false,
    sessions: false,
    locations: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--booths') args.booths = true;
    else if (a === '--sessions') args.sessions = true;
    else if (a === '--no-locations') args.locations = false;
    else if (a === '--homeserver') args.homeserver = argv[++i];
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else args.bundlePath = a;
  }
  if (!args.bundlePath) throw new Error(usage);
  return args;
}

class MatrixApi {
  constructor(
    private readonly base: string,
    private readonly token: string,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}/_matrix/client/v3${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok) {
      const err = new Error(
        `${method} ${path}: ${res.status} ${json['errcode'] ?? ''} ${json['error'] ?? ''}`,
      );
      (err as Error & { status: number }).status = res.status;
      throw err;
    }
    return json as T;
  }

  async whoami(): Promise<string> {
    return (await this.call<{ user_id: string }>('GET', '/account/whoami')).user_id;
  }

  async resolveAlias(alias: string): Promise<string | null> {
    try {
      const r = await this.call<{ room_id: string }>(
        'GET',
        `/directory/room/${encodeURIComponent(alias)}`,
      );
      return r.room_id;
    } catch (error) {
      if ((error as { status?: number }).status === 404) return null;
      throw error;
    }
  }

  async createRoom(room: RoomPlan, server: string, spaceId: string | null): Promise<string> {
    const localpart = room.alias.slice(1).split(':')[0]!;
    const initialState: unknown[] = [
      {
        type: 'm.room.history_visibility',
        state_key: '',
        content: { history_visibility: 'world_readable' },
      },
      { type: 'm.room.guest_access', state_key: '', content: { guest_access: 'can_join' } },
    ];
    if (spaceId && room.kind !== 'space') {
      initialState.push({
        type: 'm.space.parent',
        state_key: spaceId,
        content: { via: [server], canonical: true },
      });
    }
    const body: Record<string, unknown> = {
      visibility: 'public',
      preset: 'public_chat',
      room_alias_name: localpart,
      name: room.name,
      topic: room.topic,
      initial_state: initialState,
    };
    if (room.kind === 'space') body['creation_content'] = { type: 'm.space' };
    return (await this.call<{ room_id: string }>('POST', '/createRoom', body)).room_id;
  }

  async linkIntoSpace(
    spaceId: string,
    roomId: string,
    server: string,
    suggested: boolean,
  ): Promise<void> {
    await this.call(
      'PUT',
      `/rooms/${encodeURIComponent(spaceId)}/state/m.space.child/${encodeURIComponent(roomId)}`,
      { via: [server], suggested },
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // pnpm --filter runs in the package directory; INIT_CWD is where the user typed the command.
  const bundlePath = resolve(process.env['INIT_CWD'] ?? process.cwd(), args.bundlePath);
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as EventBundle;
  const issues = collectBundleIssues(bundle);
  if (issues.length > 0) throw new Error(`bundle is not valid:\n  ${issues.join('\n  ')}`);
  if (!bundle.messaging) throw new Error('bundle has no "messaging" block; nothing to create');

  const plan = planRooms(bundle, {
    booths: args.booths,
    sessions: args.sessions,
    locations: args.locations,
  });
  const server = aliasServer(bundle.messaging);
  const homeserver = args.homeserver ?? bundle.messaging.homeserver;

  console.log(`${plan.length} rooms for ${bundle.name} on ${homeserver} (aliases on ${server})`);
  if (args.dryRun) {
    for (const room of plan) console.log(`  ${room.kind.padEnd(8)} ${room.alias}  ${room.name}`);
    return;
  }

  const token = process.env['MATRIX_ACCESS_TOKEN'];
  if (!token) throw new Error('MATRIX_ACCESS_TOKEN is not set (use --dry-run to only list)');
  const api = new MatrixApi(homeserver.replace(/\/$/, ''), token);
  console.log(`signed in as ${await api.whoami()}`);

  let spaceId: string | null = null;
  for (const room of plan) {
    let roomId = await api.resolveAlias(room.alias);
    if (roomId) {
      console.log(`  exists   ${room.alias}`);
    } else {
      roomId = await api.createRoom(room, server, spaceId);
      console.log(`  created  ${room.alias} -> ${roomId}`);
    }
    if (room.kind === 'space') {
      spaceId = roomId;
    } else if (spaceId) {
      await api.linkIntoSpace(spaceId, roomId, server, room.suggested);
    }
  }
  console.log('done');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
