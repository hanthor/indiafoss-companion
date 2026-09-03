/**
 * End-to-end tests against a real Neutrino homeserver.
 *
 * Two kinds of test live here, and the second kind is the interesting one:
 *
 *   1. **Contracts** — behaviour the companion's chat depends on. If one of
 *      these breaks, mesh chat is broken and we want to know before a phone
 *      tells us.
 *   2. **Tripwires** — features Neutrino does not have yet. They assert the
 *      gap still exists, so when upstream implements one the test *fails* and
 *      we go and turn the feature on. A gap that closes silently is a feature
 *      we never ship.
 *
 * Start a server first; without one the whole file skips, so `pnpm -r test`
 * stays green for contributors who have no Rust toolchain:
 *
 *   git clone https://github.com/element-hq/neutrino && cd neutrino
 *   cargo run --bin neutrino          # serves on :8008
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BASE = process.env.NEUTRINO_URL ?? 'http://localhost:8008';
// Against our fork (patches/neutrino/), gaps are closed one by one and the
// matching tripwires flip into contracts. NEUTRINO_FORK=1 says which server is
// under test; guessing from behaviour would defeat the point of a tripwire.
const fork = process.env.NEUTRINO_FORK === '1';

let token = '';
let userId = '';
let roomId = '';
let messageId = '';

interface Call {
  status: number;
  body: Record<string, unknown>;
}

async function call(method: string, path: string, body?: unknown): Promise<Call> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return {
    status: response.status,
    body: (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>,
  };
}

const room = () => encodeURIComponent(roomId);

// Resolved at module scope, not in beforeAll: `describe.skipIf` is evaluated
// while the file is being collected, long before any hook runs.
const reachable = await (async () => {
  try {
    const versions = await fetch(`${BASE}/_matrix/client/versions`, {
      signal: AbortSignal.timeout(2000),
    });
    return versions.ok;
  } catch {
    return false;
  }
})();

beforeAll(async () => {
  if (!reachable) return;

  const registered = await call('POST', '/_matrix/client/v3/register', {
    username: `e2e-${Date.now()}`,
    password: 'e2e-password',
    auth: { type: 'm.login.dummy' },
  });
  token = String(registered.body.access_token ?? '');
  userId = String(registered.body.user_id ?? '');

  const created = await call('POST', '/_matrix/client/v3/createRoom', { name: 'e2e' });
  roomId = String(created.body.room_id ?? '');
});

afterAll(() => {
  if (!reachable) {
    console.warn(`neutrino e2e: no server at ${BASE} — skipped. Run \`cargo run --bin neutrino\`.`);
  }
});

describe.skipIf(!reachable)('neutrino contracts the companion depends on', () => {
  it('registers a user and creates a room', () => {
    expect(token).not.toBe('');
    expect(userId).toMatch(/^@/);
    expect(roomId).toMatch(/^!/);
  });

  it('sends a message and reads it back from history', async () => {
    const sent = await call(
      'PUT',
      `/_matrix/client/v3/rooms/${room()}/send/m.room.message/e2e-${Date.now()}`,
      { msgtype: 'm.text', body: 'hello from the mesh' },
    );
    expect(sent.status).toBe(200);
    messageId = String(sent.body.event_id ?? '');
    expect(messageId).toMatch(/^\$/);

    const history = await call('GET', `/_matrix/client/v3/rooms/${room()}/messages?dir=b&limit=20`);
    expect(history.status).toBe(200);
    const chunk = history.body.chunk as { type?: string; content?: { body?: string } }[];
    const bodies = chunk.filter((e) => e.type === 'm.room.message').map((e) => e.content?.body);
    expect(bodies).toContain('hello from the mesh');
  });

  it('keeps a reply relation intact through the round trip', async () => {
    // Replies are entirely client-side — a relation in the content plus the
    // quoted fallback body — so all the server has to do is not mangle them.
    const sent = await call(
      'PUT',
      `/_matrix/client/v3/rooms/${room()}/send/m.room.message/e2e-reply-${Date.now()}`,
      {
        msgtype: 'm.text',
        body: '> <@someone> hello from the mesh\n\nreplying',
        'm.relates_to': { 'm.in_reply_to': { event_id: messageId } },
      },
    );
    expect(sent.status).toBe(200);

    const history = await call('GET', `/_matrix/client/v3/rooms/${room()}/messages?dir=b&limit=20`);
    const chunk = history.body.chunk as {
      content?: { 'm.relates_to'?: { 'm.in_reply_to'?: { event_id?: string } } };
    }[];
    const relations = chunk.map((e) => e.content?.['m.relates_to']?.['m.in_reply_to']?.event_id);
    expect(relations).toContain(messageId);
  });

  it('stores a reaction and returns it with its key', async () => {
    const sent = await call(
      'PUT',
      `/_matrix/client/v3/rooms/${room()}/send/m.reaction/e2e-react-${Date.now()}`,
      {
        'm.relates_to': { rel_type: 'm.annotation', event_id: messageId, key: '👍' },
      },
    );
    expect(sent.status).toBe(200);

    const history = await call('GET', `/_matrix/client/v3/rooms/${room()}/messages?dir=b&limit=20`);
    const chunk = history.body.chunk as {
      type?: string;
      content?: { 'm.relates_to'?: { key?: string; event_id?: string } };
    }[];
    const reaction = chunk.find((e) => e.type === 'm.reaction');
    expect(reaction?.content?.['m.relates_to']?.key).toBe('👍');
    expect(reaction?.content?.['m.relates_to']?.event_id).toBe(messageId);
  });

  it('lists room members through /members', async () => {
    // Not /joined_members, which Neutrino does not implement — the client
    // falls back to this endpoint, so it has to keep working.
    const members = await call('GET', `/_matrix/client/v3/rooms/${room()}/members`);
    expect(members.status).toBe(200);
    const chunk = members.body.chunk as { content?: { membership?: string } }[];
    expect(chunk.some((e) => e.content?.membership === 'join')).toBe(true);
  });

  it('speaks Simplified Sliding Sync, and it agrees with legacy /sync', async () => {
    // MSC4186. Neutrino advertises it, and it is the sync that belongs on a
    // BLE mesh: a legacy first sync ships every room's state, this asks for a
    // bounded timeline and named state. The client prefers it when offered.
    const versions = await call('GET', '/_matrix/client/versions');
    const features = versions.body.unstable_features as Record<string, boolean>;
    expect(features?.['org.matrix.simplified_msc3575']).toBe(true);

    const sliding = await call(
      'POST',
      '/_matrix/client/unstable/org.matrix.simplified_msc3575/sync',
      {
        conn_id: 'e2e',
        lists: {
          rooms: {
            ranges: [[0, 99]],
            required_state: [['m.room.name', '']],
            timeline_limit: 5,
          },
        },
      },
    );
    expect(sliding.status).toBe(200);
    expect(sliding.body.pos).toBeDefined();

    // The room we created must appear in both syncs, or the two paths would
    // show the attendee different conversations.
    const slidingRooms = Object.keys((sliding.body.rooms as Record<string, unknown>) ?? {});
    expect(slidingRooms).toContain(roomId);

    const legacy = await call('GET', '/_matrix/client/v3/sync?timeout=0');
    const legacyJoin = ((legacy.body.rooms as { join?: Record<string, unknown> })?.join ??
      {}) as Record<string, unknown>;
    expect(Object.keys(legacyJoin)).toContain(roomId);
  });

  it('syncs the room', async () => {
    const sync = await call('GET', '/_matrix/client/v3/sync?timeout=0');
    expect(sync.status).toBe(200);
  });
});

describe.skipIf(!reachable)('gaps — these fail when upstream closes them', () => {
  const missing = async (method: string, path: string, body?: unknown) => {
    const response = await call(method, path, body);
    return response.status;
  };

  it.skipIf(fork)('has no redaction, so un-reacting and deleting cannot work', async () => {
    expect(
      await missing(
        'PUT',
        `/_matrix/client/v3/rooms/${room()}/redact/${encodeURIComponent(messageId)}/e2e-redact`,
        {},
      ),
    ).toBe(404);
  });

  it.skipIf(!fork)('fork: redacts a message and a reaction, and serves them pruned', async () => {
    const sent = await call(
      'PUT',
      `/_matrix/client/v3/rooms/${room()}/send/m.room.message/e2e-rd-1`,
      {
        msgtype: 'm.text',
        body: 'regrettable',
      },
    );
    const target = sent.body.event_id as string;
    const reacted = await call(
      'PUT',
      `/_matrix/client/v3/rooms/${room()}/send/m.reaction/e2e-rd-2`,
      {
        'm.relates_to': { rel_type: 'm.annotation', event_id: target, key: '👍' },
      },
    );
    const reaction = reacted.body.event_id as string;

    const unreact = await call(
      'PUT',
      `/_matrix/client/v3/rooms/${room()}/redact/${encodeURIComponent(reaction)}/e2e-rd-3`,
      {},
    );
    expect(unreact.status).toBe(200);
    const deleted = await call(
      'PUT',
      `/_matrix/client/v3/rooms/${room()}/redact/${encodeURIComponent(target)}/e2e-rd-4`,
      { reason: 'typo' },
    );
    expect(deleted.status).toBe(200);

    const history = await call('GET', `/_matrix/client/v3/rooms/${room()}/messages?dir=b&limit=20`);
    const chunk = history.body.chunk as Record<string, unknown>[];
    const message = chunk.find((e) => e.event_id === target)!;
    expect(message.content).toEqual({});
    expect(
      (message.unsigned as { redacted_because: { content: { reason: string } } }).redacted_because
        .content.reason,
    ).toBe('typo');
    expect(chunk.find((e) => e.event_id === reaction)!.content).toEqual({});
  });

  it.skipIf(fork)('has no typing notifications', async () => {
    expect(
      await missing(
        'PUT',
        `/_matrix/client/v3/rooms/${room()}/typing/${encodeURIComponent(userId)}`,
        {
          typing: true,
          timeout: 3000,
        },
      ),
    ).toBe(404);
  });

  it.skipIf(!fork)('fork: accepts typing notices and read receipts', async () => {
    const typing = await call(
      'PUT',
      `/_matrix/client/v3/rooms/${room()}/typing/${encodeURIComponent(userId)}`,
      { typing: true, timeout: 5000 },
    );
    expect(typing.status).toBe(200);
    const receipt = await call(
      'POST',
      `/_matrix/client/v3/rooms/${room()}/receipt/m.read/${encodeURIComponent(messageId)}`,
      {},
    );
    expect(receipt.status).toBe(200);
  });

  it.skipIf(fork)('has no read receipts', async () => {
    expect(
      await missing(
        'POST',
        `/_matrix/client/v3/rooms/${room()}/receipt/m.read/${encodeURIComponent(messageId)}`,
        {},
      ),
    ).toBe(404);
  });

  it('has no media repository, so files and photos cannot be sent', async () => {
    expect(await missing('POST', '/_matrix/media/v3/upload', {})).toBe(404);
  });

  it.skipIf(fork)('stores device keys but files every device under one hardcoded id', async () => {
    // The device-key directory is real: an upload comes back from /keys/query
    // intact. Two flaws make it unusable for a mesh, and both are stable
    // regardless of what the server has seen before:
    //   - every device is filed under the literal id "DEVICEID", whatever
    //     device_id was sent, and
    //   - only the first upload is kept; later devices are accepted with 200
    //     and discarded.
    const upload = await call('POST', '/_matrix/client/v3/keys/upload', {
      device_keys: {
        user_id: userId,
        device_id: 'E2E-SENT-ID',
        algorithms: ['m.olm.v1.curve25519-aes-sha2'],
        keys: { 'curve25519:E2E-SENT-ID': 'e2e-test-key' },
        signatures: {},
      },
    });
    expect(upload.status).toBe(200);

    const query = await call('POST', '/_matrix/client/v3/keys/query', {
      device_keys: { [userId]: [] },
    });
    expect(query.status).toBe(200);
    const devices = (query.body.device_keys as Record<string, Record<string, unknown>>)[userId];
    expect(Object.keys(devices ?? {})).toContain('DEVICEID');
    expect(Object.keys(devices ?? {})).not.toContain('E2E-SENT-ID');
  });

  it.skipIf(!fork)(
    'fork: files each device under its own id and hands one-time keys out once',
    async () => {
      const upload = await call('POST', '/_matrix/client/v3/keys/upload', {
        device_keys: {
          user_id: userId,
          device_id: 'E2E-FORK-ID',
          algorithms: ['m.olm.v1.curve25519-aes-sha2'],
          keys: { 'curve25519:E2E-FORK-ID': 'e2e-test-key' },
          signatures: {},
        },
        one_time_keys: { 'signed_curve25519:E2E-1': { key: 'one' } },
      });
      expect(upload.status).toBe(200);
      expect(upload.body.one_time_key_counts).toEqual({ signed_curve25519: 1 });

      const query = await call('POST', '/_matrix/client/v3/keys/query', {
        device_keys: { [userId]: [] },
      });
      const devices = (query.body.device_keys as Record<string, Record<string, unknown>>)[userId];
      expect(Object.keys(devices ?? {})).toContain('E2E-FORK-ID');

      const claim = () =>
        call('POST', '/_matrix/client/v3/keys/claim', {
          one_time_keys: { [userId]: { 'E2E-FORK-ID': 'signed_curve25519' } },
        });
      const first = await claim();
      expect(first.status).toBe(200);
      expect(
        (first.body.one_time_keys as Record<string, Record<string, unknown>>)[userId]?.[
          'E2E-FORK-ID'
        ],
      ).toEqual({ 'signed_curve25519:E2E-1': { key: 'one' } });
      const second = await claim();
      expect(second.body.one_time_keys).toEqual({});

      const td = await call('PUT', '/_matrix/client/v3/sendToDevice/m.room_key/e2e-fork-td', {
        messages: { [userId]: { '*': { session_id: 'S1' } } },
      });
      expect(td.status).toBe(200);
    },
  );

  it.skipIf(fork)(
    'cannot establish an Olm session: no one-time key claim, no to-device',
    async () => {
      // These two are what actually block E2EE. Encrypting to someone requires
      // claiming one of their one-time keys and sending them an encrypted
      // to-device message; neither endpoint exists, so no session can start
      // however good the client's crypto is.
      expect(await missing('POST', '/_matrix/client/v3/keys/claim', { one_time_keys: {} })).toBe(
        404,
      );
      expect(
        await missing('PUT', '/_matrix/client/v3/sendToDevice/m.room.encrypted/e2e-td', {
          messages: {},
        }),
      ).toBe(404);

      // One-time keys are accepted and answered with a canned count of 100,
      // which no claim endpoint can ever hand out.
      const otk = await call('POST', '/_matrix/client/v3/keys/upload', {
        one_time_keys: { 'signed_curve25519:E2E': { key: 'e2e-otk' } },
      });
      expect(otk.status).toBe(200);
      expect(otk.body.one_time_key_counts).toEqual({ signed_curve25519: 100 });
    },
  );

  it.skipIf(fork)(
    'issues the same identity to everyone, so two users cannot be told apart',
    async () => {
      // Until this fails, no multi-user behaviour can be tested against the dev
      // binary: every registration is the same person.
      const a = await call('POST', '/_matrix/client/v3/register', {
        username: `alpha-${Date.now()}`,
        password: 'x',
        auth: { type: 'm.login.dummy' },
      });
      const b = await call('POST', '/_matrix/client/v3/register', {
        username: `beta-${Date.now()}`,
        password: 'x',
        auth: { type: 'm.login.dummy' },
      });
      expect(a.body.user_id).toBe(b.body.user_id);
      expect(a.body.access_token).toBe(b.body.access_token);
    },
  );

  // ---- fork: identity, whoami, account data, per-device inbox ---------------

  async function callAs(tok: string, method: string, path: string, body?: unknown): Promise<Call> {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    return { status: response.status, body: parsed as Record<string, unknown> };
  }

  async function registerAs(localpart: string, deviceId?: string) {
    const r = await call('POST', '/_matrix/client/v3/register', {
      username: localpart,
      password: 'x',
      auth: { type: 'm.login.dummy' },
      ...(deviceId ? { device_id: deviceId } : {}),
    });
    expect(r.status).toBe(200);
    return {
      token: String(r.body.access_token),
      userId: String(r.body.user_id),
      deviceId: String(r.body.device_id),
    };
  }

  it.skipIf(!fork)('fork: two registrations are two users, and whoami says which', async () => {
    const stamp = Date.now();
    const a = await registerAs(`alpha-${stamp}`, 'PHONE-A');
    const b = await registerAs(`beta-${stamp}`);
    expect(a.userId).not.toBe(b.userId);
    expect(a.token).not.toBe(b.token);
    expect(a.deviceId).toBe('PHONE-A');
    expect(b.deviceId).not.toBe('');

    const who = await callAs(a.token, 'GET', '/_matrix/client/v3/account/whoami');
    expect(who.status).toBe(200);
    expect(who.body).toMatchObject({ user_id: a.userId, device_id: 'PHONE-A' });
  });

  it.skipIf(!fork)('fork: account data round-trips, is private, and rides sync', async () => {
    const me = encodeURIComponent(userId);
    const direct = { '@someone:example.org': [roomId] };
    const put = await call('PUT', `/_matrix/client/v3/user/${me}/account_data/m.direct`, direct);
    expect(put.status).toBe(200);
    const got = await call('GET', `/_matrix/client/v3/user/${me}/account_data/m.direct`);
    expect(got.status).toBe(200);
    expect(got.body).toEqual(direct);

    const tagged = await call(
      'PUT',
      `/_matrix/client/v3/user/${me}/rooms/${room()}/account_data/m.tag`,
      { tags: { 'm.favourite': {} } },
    );
    expect(tagged.status).toBe(200);

    // Someone else cannot read or write it.
    const other = await registerAs(`nosy-${Date.now()}`);
    const nosy = await callAs(
      other.token,
      'GET',
      `/_matrix/client/v3/user/${me}/account_data/m.direct`,
    );
    expect(nosy.status).toBe(403);

    // A sync carries it: the DM list is there before the client asks.
    const sync = await call('GET', '/_matrix/client/v3/sync?timeout=0');
    expect(sync.status).toBe(200);
    const global = (sync.body.account_data as { events: { type: string; content: unknown }[] })
      .events;
    expect(global.some((e) => e.type === 'm.direct')).toBe(true);
  });

  it.skipIf(!fork)('fork: each device of a user gets only its own to-device messages', async () => {
    const stamp = Date.now();
    const phone = await registerAs(`dev-${stamp}`, 'PHONE');
    const laptop = await callAs('', 'POST', '/_matrix/client/v3/login', {
      type: 'm.login.password',
      user: `dev-${stamp}`,
      password: 'x',
      device_id: 'LAPTOP',
    });
    expect(laptop.status).toBe(200);
    const laptopToken = String(laptop.body.access_token);
    // Both devices sync once so their inboxes start empty.
    await callAs(phone.token, 'GET', '/_matrix/client/v3/sync?timeout=0');
    await callAs(laptopToken, 'GET', '/_matrix/client/v3/sync?timeout=0');

    const sent = await call('PUT', `/_matrix/client/v3/sendToDevice/probe.test/${stamp}`, {
      messages: {
        [phone.userId]: {
          PHONE: { for: 'phone' },
          LAPTOP: { for: 'laptop' },
        },
      },
    });
    expect(sent.status).toBe(200);

    const events = (sync: Call) =>
      ((sync.body.to_device as { events: { content: { for: string } }[] })?.events ?? []).map(
        (e) => e.content.for,
      );
    const onPhone = await callAs(phone.token, 'GET', '/_matrix/client/v3/sync?timeout=0');
    expect(events(onPhone)).toEqual(['phone']);
    const onLaptop = await callAs(laptopToken, 'GET', '/_matrix/client/v3/sync?timeout=0');
    expect(events(onLaptop)).toEqual(['laptop']);
  });
});
