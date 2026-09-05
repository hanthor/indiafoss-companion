/**
 * The room directory across two live Neutrino nodes.
 *
 * This is the conference-chat path and nothing else: every attendee derives
 * the same `#event-session-id:server` from the schedule, one server holds it,
 * and everyone else resolves it over federation and joins. There is no invite
 * anywhere in it, which is what makes it work for a hall full of people who
 * have never met.
 *
 * Each assertion here stands for a way that path failed in practice:
 *
 * - A server that ignores `room_alias_name` answers 200 with a perfectly good
 *   room carrying no alias. Every attendee then makes their own and sits alone
 *   in a room named after the session they wanted to be in.
 * - A claim that repointed the alias (`INSERT OR REPLACE`) would scatter
 *   attendees across as many rooms as there were racers, with the last writer
 *   winning and everyone before them stranded.
 * - Resolution that only ever worked locally would pass every single-node test
 *   and fail in the hall, where the alias is on somebody else's phone.
 *
 * All three are silent: no error, no log line, a green run. So they are
 * asserted rather than assumed.
 */
import { describe, expect, it } from 'vitest';

const A = process.env.NEUTRINO_URL ?? 'http://127.0.0.1:8008';
const B = process.env.NEUTRINO_URL_B ?? 'http://127.0.0.1:8009';
/** Aliases are a fork feature; upstream v0.7.1 has no directory at all. */
const fork = process.env.NEUTRINO_FORK === '1';

async function up(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/_matrix/client/versions`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Module scope: `describe.skipIf` runs at collection, before any hook.
const reachable = fork && (await Promise.all([up(A), up(B)])).every(Boolean);

interface Call {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  base: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<Call> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

/** Register a throwaway user and return its token and server name. */
async function user(base: string): Promise<{ token: string; server: string }> {
  const r = await call(base, 'POST', '/_matrix/client/v3/register', {
    username: `probe-${Math.random().toString(36).slice(2, 10)}`,
    password: 'probe-password',
    auth: { type: 'm.login.dummy' },
  });
  const token = String(r.body.access_token ?? '');
  const userId = String(r.body.user_id ?? '');
  if (!token || !userId) throw new Error(`register failed: ${JSON.stringify(r.body)}`);
  // `@localpart:server`, and a mesh server name is a 64-hex node id with no
  // dots in it, so splitting on the first colon is the only safe read.
  return { token, server: userId.slice(userId.indexOf(':') + 1) };
}

describe.skipIf(!reachable)('the room directory across two nodes', () => {
  it('claims an alias, refuses to repoint it, and serves it over federation', async () => {
    const alice = await user(A);
    const bob = await user(B);
    const localpart = `probe-session-${Math.random().toString(36).slice(2, 10)}`;
    const alias = `#${localpart}:${alice.server}`;
    const encoded = encodeURIComponent(alias);

    const created = await call(
      A,
      'POST',
      '/_matrix/client/v3/createRoom',
      { name: 'Probe session', preset: 'public_chat', room_alias_name: localpart },
      alice.token,
    );
    expect(created.status).toBe(200);
    const roomId = String(created.body.room_id);
    // Not `toBeDefined`: a server that drops the field returns 200 with a room,
    // and the alias has to come back complete — the localpart we sent plus the
    // server's own name — or the client has no way to know it lost it.
    expect(created.body.room_alias).toBe(alias);

    // Alice claims it again for a different room. First write wins, so the
    // second must be told it lost and the alias must still point at the first
    // room. Repointing here is what scatters a session across rooms.
    const again = await call(
      A,
      'POST',
      '/_matrix/client/v3/createRoom',
      { name: 'Probe session, again', preset: 'public_chat', room_alias_name: localpart },
      alice.token,
    );
    expect(again.body.room_alias).not.toBe(alias);
    expect(String(again.body.room_id)).not.toBe(roomId);

    const localLookup = await call(
      A,
      'GET',
      `/_matrix/client/v3/directory/room/${encoded}`,
      undefined,
      alice.token,
    );
    expect(localLookup.status).toBe(200);
    expect(localLookup.body.room_id).toBe(roomId);

    // The one that matters: Bob is on a different server and has never seen
    // this room. Resolution has to cross federation.
    const remote = await call(
      B,
      'GET',
      `/_matrix/client/v3/directory/room/${encoded}`,
      undefined,
      bob.token,
    );
    expect(remote.status).toBe(200);
    expect(remote.body.room_id).toBe(roomId);

    // And joining by the alias has to land in that same room, not a new one.
    const joined = await call(B, 'POST', `/_matrix/client/v3/join/${encoded}`, {}, bob.token);
    expect(joined.status).toBe(200);
    expect(joined.body.room_id).toBe(roomId);
  });

  it('answers a miss with a miss, rather than a room of its own', async () => {
    // An unclaimed alias in the *other* node's namespace: B has to ask A, and
    // A has to say no. A node that quietly answered with something local would
    // hand every attendee a different "right" room for the same session, which
    // is the failure mode the whole directory exists to prevent — and it would
    // look like a successful lookup from the client.
    //
    // Aimed at the live peer rather than an invented server name on purpose:
    // an unroutable name tests the dial timeout, not the directory, and costs
    // CI a minute to learn nothing.
    const alice = await user(A);
    const bob = await user(B);
    const alias = `#probe-unclaimed-${Math.random().toString(36).slice(2, 10)}:${alice.server}`;
    const r = await call(
      B,
      'GET',
      `/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`,
      undefined,
      bob.token,
    );
    expect(r.status).not.toBe(200);
    expect(r.body.room_id).toBeUndefined();
  });
});
