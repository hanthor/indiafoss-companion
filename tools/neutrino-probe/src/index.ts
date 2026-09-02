/**
 * Probe a running Neutrino homeserver for the client-server endpoints the
 * companion's chat actually calls, and print what works.
 *
 * Neutrino is pre-alpha and its README is explicit that it is "deliberately
 * very feature poor", but a README is not a test matrix: some endpoints are
 * missing, and — more dangerously — some answer 200 with a stub, so a client
 * believes a feature works when nothing happened. This tells the two apart by
 * checking the response, not just the status.
 *
 * Usage:
 *   cargo run --bin neutrino          # in an element-hq/neutrino checkout
 *   pnpm --filter @indiafoss/neutrino-probe start [http://localhost:8008]
 */

interface Probe {
  /** What this endpoint is for, in the companion's terms. */
  feature: string;
  method: string;
  path: (ctx: Context) => string;
  body?: (ctx: Context) => unknown;
  /**
   * Given a 2xx response, decide whether the server really did the thing.
   * Absent means "a 2xx is enough".
   */
  verify?: (json: unknown, ctx: Context) => string | undefined;
}

interface Context {
  base: string;
  token: string;
  userId: string;
  roomId: string;
  eventId: string;
}

type Verdict = 'works' | 'stub' | 'missing' | 'error';

interface Result {
  feature: string;
  method: string;
  path: string;
  status: number;
  verdict: Verdict;
  note?: string;
}

const json = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const PROBES: Probe[] = [
  {
    feature: 'create a room',
    method: 'POST',
    path: () => '/_matrix/client/v3/createRoom',
    body: () => ({ name: 'probe' }),
    verify: (r) => (json(r).room_id ? undefined : 'no room_id in the response'),
  },
  {
    feature: 'sync',
    method: 'GET',
    path: () => '/_matrix/client/v3/sync?timeout=0',
  },
  {
    feature: 'send a message',
    method: 'PUT',
    path: (c) => `/_matrix/client/v3/rooms/${enc(c.roomId)}/send/m.room.message/probe-1`,
    body: () => ({ msgtype: 'm.text', body: 'probe' }),
    verify: (r) => (json(r).event_id ? undefined : 'no event_id in the response'),
  },
  {
    feature: 'read history (backfill)',
    method: 'GET',
    path: (c) => `/_matrix/client/v3/rooms/${enc(c.roomId)}/messages?dir=b&limit=10`,
    verify: (r) => (Array.isArray(json(r).chunk) ? undefined : 'no chunk in the response'),
  },
  {
    feature: 'react to a message',
    method: 'PUT',
    path: (c) => `/_matrix/client/v3/rooms/${enc(c.roomId)}/send/m.reaction/probe-2`,
    body: (c) => ({
      'm.relates_to': { rel_type: 'm.annotation', event_id: c.eventId, key: '👍' },
    }),
    verify: (r) => (json(r).event_id ? undefined : 'no event_id in the response'),
  },
  {
    feature: 'un-react / delete (redaction)',
    method: 'PUT',
    path: (c) => `/_matrix/client/v3/rooms/${enc(c.roomId)}/redact/${enc(c.eventId)}/probe-3`,
    body: () => ({}),
  },
  {
    feature: 'typing indicator',
    method: 'PUT',
    path: (c) => `/_matrix/client/v3/rooms/${enc(c.roomId)}/typing/${enc(c.userId)}`,
    body: () => ({ typing: true, timeout: 3000 }),
  },
  {
    feature: 'read receipt',
    method: 'POST',
    path: (c) => `/_matrix/client/v3/rooms/${enc(c.roomId)}/receipt/m.read/${enc(c.eventId)}`,
    body: () => ({}),
  },
  {
    feature: 'member list',
    method: 'GET',
    path: (c) => `/_matrix/client/v3/rooms/${enc(c.roomId)}/joined_members`,
  },
  {
    feature: 'invite someone',
    method: 'POST',
    path: (c) => `/_matrix/client/v3/rooms/${enc(c.roomId)}/invite`,
    body: () => ({ user_id: '@probe-invitee:localhost' }),
  },
  {
    feature: 'E2EE: upload device keys',
    method: 'POST',
    path: () => '/_matrix/client/v3/keys/upload',
    body: (c) => ({
      device_keys: {
        user_id: c.userId,
        device_id: 'PROBE',
        algorithms: ['m.olm.v1.curve25519-aes-sha2'],
        keys: { 'curve25519:PROBE': 'probe-key' },
        signatures: {},
      },
    }),
    // The count is canned (always 100) and there is no claim endpoint to hand
    // those keys out, so the count proves nothing — keys/query is the real check.
  },
  {
    feature: 'E2EE: query device keys',
    method: 'POST',
    path: () => '/_matrix/client/v3/keys/query',
    body: (c) => ({ device_keys: { [c.userId]: [] } }),
    verify: (r) => {
      const devices = json(json(r).device_keys)[Object.keys(json(json(r).device_keys))[0] ?? ''];
      const ids = Object.keys(json(devices));
      if (ids.length === 0) return 'answers 200 but returns no devices';
      // Whatever device_id was uploaded, the directory files it under the
      // literal "DEVICEID", and only the first upload is ever kept.
      return ids.includes('DEVICEID') && !ids.includes('PROBE')
        ? 'stores keys, but files every device under the hardcoded id "DEVICEID"'
        : undefined;
    },
  },
  {
    feature: 'E2EE: claim one-time keys',
    method: 'POST',
    path: () => '/_matrix/client/v3/keys/claim',
    body: () => ({ one_time_keys: {} }),
  },
  {
    feature: 'E2EE: to-device messages',
    method: 'PUT',
    path: () => '/_matrix/client/v3/sendToDevice/m.room.encrypted/probe-4',
    body: () => ({ messages: {} }),
  },
  {
    feature: 'files and photos (media upload)',
    method: 'POST',
    path: () => '/_matrix/media/v3/upload',
    body: () => ({}),
  },
  {
    feature: 'public room directory',
    method: 'GET',
    path: () => '/_matrix/client/v3/publicRooms',
  },
  {
    feature: 'whoami',
    method: 'GET',
    path: () => '/_matrix/client/v3/account/whoami',
  },
  {
    feature: 'display name',
    method: 'GET',
    path: (c) => `/_matrix/client/v3/profile/${enc(c.userId)}/displayname`,
  },
  {
    feature: 'account data (DM list)',
    method: 'PUT',
    path: (c) => `/_matrix/client/v3/user/${enc(c.userId)}/account_data/m.direct`,
    body: () => ({}),
  },
];

function enc(value: string): string {
  return encodeURIComponent(value);
}

async function call(
  ctx: Context,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${ctx.base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(ctx.token ? { authorization: `Bearer ${ctx.token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, json: parsed };
}

async function main(): Promise<void> {
  const base = process.argv[2] ?? 'http://localhost:8008';
  const ctx: Context = { base, token: '', userId: '', roomId: '', eventId: '' };

  const versions = await call(ctx, 'GET', '/_matrix/client/versions');
  if (versions.status !== 200) {
    console.error(`No homeserver at ${base} (HTTP ${versions.status}).`);
    console.error('Start one with `cargo run --bin neutrino` in an element-hq/neutrino checkout.');
    process.exitCode = 1;
    return;
  }
  console.log(`server: ${base}`);
  console.log(`versions: ${JSON.stringify(json(versions.json).versions)}`);

  const login = await call(ctx, 'POST', '/_matrix/client/v3/register', {
    username: `probe-${Date.now()}`,
    password: 'probe-password',
    auth: { type: 'm.login.dummy' },
  });
  ctx.token = String(json(login.json).access_token ?? '');
  ctx.userId = String(json(login.json).user_id ?? '');
  console.log(`registered: ${ctx.userId || '(none)'}\n`);

  const results: Result[] = [];
  for (const probe of PROBES) {
    const path = probe.path(ctx);
    let status = 0;
    let verdict: Verdict = 'error';
    let note: string | undefined;
    try {
      const response = await call(ctx, probe.method, path, probe.body?.(ctx));
      status = response.status;
      if (status >= 200 && status < 300) {
        note = probe.verify?.(response.json, ctx);
        verdict = note ? 'stub' : 'works';
      } else if (status === 404 || status === 405) {
        verdict = 'missing';
      } else {
        verdict = 'error';
        note = String(json(response.json).error ?? '').slice(0, 60) || undefined;
      }
      // Later probes need a room and an event to act on.
      if (probe.feature === 'create a room') ctx.roomId = String(json(response.json).room_id ?? '');
      if (probe.feature === 'send a message') {
        ctx.eventId = String(json(response.json).event_id ?? '');
      }
    } catch (error) {
      note = error instanceof Error ? error.message : String(error);
    }
    results.push({ feature: probe.feature, method: probe.method, path, status, verdict, note });
  }

  const mark = { works: '  ok  ', stub: ' STUB ', missing: 'MISSING', error: ' ERR  ' };
  for (const r of results) {
    console.log(
      `${mark[r.verdict]} ${String(r.status).padEnd(4)} ${r.feature}${r.note ? ` — ${r.note}` : ''}`,
    );
  }

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `\n${counts.works ?? 0} working, ${counts.stub ?? 0} stubbed, ${counts.missing ?? 0} missing, ${counts.error ?? 0} errored`,
  );
}

await main();

export {};
