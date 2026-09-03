// Loopback swarm: N Neutrino nodes (one user each), one room, one message.
// Measures invite+join fan-in and message fan-out latency, plus RSS per node.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, rmSync, openSync } from 'node:fs';

const N = Number(process.argv[2] ?? 20);
const BIN = process.argv[3];
const BASE = 9100;
const STAGGER = Number(process.argv[4] ?? 0);
const ROOT = `${process.env.SWARM_ROOT ?? '/tmp/swarm'}`;
rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });

const url = (i) => `http://127.0.0.1:${BASE + i}`;
const server = (i) => `127.0.0.1:${BASE + i}`;
const procs = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const dir = `${ROOT}/n${i}`;
  mkdirSync(dir);
  const log = openSync(`${dir}/log`, 'w');
  procs.push(
    spawn(BIN, [], {
      env: {
        ...process.env,
        NEUTRINO_SERVER_NAME: server(i),
        NEUTRINO_BIND_ADDR: server(i),
        NEUTRINO_STORAGE_DIR: dir,
        NEUTRINO_STARTUP_JITTER_MS: '0',
        RUST_LOG: 'warn',
      },
      stdio: ['ignore', log, log],
      detached: true,
    }),
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function up(i) {
  for (let k = 0; k < 200; k++) {
    try {
      const r = await fetch(`${url(i)}/_matrix/client/versions`);
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`node ${i} never came up`);
}
await Promise.all([...Array(N).keys()].map(up));
console.log(`nodes up: ${N} in ${Date.now() - t0} ms`);

async function api(i, token, method, path, body) {
  const r = await fetch(`${url(i)}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const users = [];
for (let i = 0; i < N; i++) {
  const r = await api(i, null, 'POST', '/_matrix/client/v3/register', {
    username: 'u',
    password: 'x',
    auth: { type: 'm.login.dummy' },
  });
  if (r.status !== 200) throw new Error(`register ${i}: ${JSON.stringify(r.body)}`);
  users.push({ token: r.body.access_token, id: r.body.user_id });
}
const t1 = Date.now();
const created = await api(0, users[0].token, 'POST', '/_matrix/client/v3/createRoom', {
  name: 'swarm',
  preset: 'private_chat',
});
const roomId = created.body.room_id;
if (!roomId) throw new Error(`createRoom: ${JSON.stringify(created.body)}`);
// Invite everyone from node 0, then each accepts from their own node.
for (let i = 1; i < N; i++) {
  const inv = await api(
    0,
    users[0].token,
    'POST',
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`,
    {
      user_id: users[i].id,
    },
  );
  if (inv.status !== 200) throw new Error(`invite ${i}: ${JSON.stringify(inv.body)}`);
}
console.log(`invites sent: ${N - 1} in ${Date.now() - t1} ms`);
async function waitInvite(i) {
  for (let k = 0; k < 600; k++) {
    const s = await api(i, users[i].token, 'GET', '/_matrix/client/v3/sync?timeout=0');
    if (s.body.rooms?.invite?.[roomId]) return;
    await sleep(100);
  }
  throw new Error(`invite never reached node ${i}`);
}
const t2 = Date.now();
await Promise.all([...Array(N - 1).keys()].map((k) => waitInvite(k + 1)));
console.log(`invites delivered over federation: ${Date.now() - t2} ms`);
const t3 = Date.now();
let joined = 0;
await Promise.all(
  [...Array(N - 1).keys()].map(async (k) => {
    const i = k + 1;
    if (STAGGER) await sleep(k * STAGGER);
    const j = await api(
      i,
      users[i].token,
      'POST',
      `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`,
      {},
    );
    if (j.status === 200) joined++;
    else console.log(`join ${i}: ${j.status} ${JSON.stringify(j.body).slice(0, 120)}`);
  }),
);
console.log(`joined: ${joined}/${N - 1} in ${Date.now() - t3} ms`);
// Wait until node 0 sees every member.
for (let k = 0; k < 3000; k++) {
  const m = await api(
    0,
    users[0].token,
    'GET',
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/members`,
  );
  const n = (m.body.chunk ?? []).filter((e) => e.content?.membership === 'join').length;
  if (n >= N) break;
  await sleep(200);
}
{
  const m = await api(
    0,
    users[0].token,
    'GET',
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/members`,
  );
  const n = (m.body.chunk ?? []).filter((e) => e.content?.membership === 'join').length;
  console.log(`membership on node 0 after ${Date.now() - t3} ms: ${n}/${N} joined`);
}
const t4 = Date.now();
const sent = await api(
  0,
  users[0].token,
  'PUT',
  `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/swarm-1`,
  {
    msgtype: 'm.text',
    body: 'hello swarm',
  },
);
const eventId = sent.body.event_id;
const arrivals = [];
async function waitMsg(i) {
  for (let k = 0; k < 1200; k++) {
    const s = await api(
      i,
      users[i].token,
      'GET',
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=5`,
    );
    if (s.status !== 200) {
      await sleep(200);
      continue;
    }
    if ((s.body.chunk ?? []).some((e) => e.event_id === eventId)) {
      arrivals.push(Date.now() - t4);
      return;
    }
    await sleep(100);
  }
  arrivals.push(Infinity);
}
await Promise.all([...Array(N - 1).keys()].map((k) => waitMsg(k + 1)));
arrivals.sort((a, b) => a - b);
const pct = (p) => arrivals[Math.min(arrivals.length - 1, Math.floor(p * arrivals.length))];
console.log(
  `message fan-out to ${N - 1} nodes: p50 ${pct(0.5)} ms, p90 ${pct(0.9)} ms, max ${arrivals[arrivals.length - 1]} ms, undelivered ${arrivals.filter((a) => a === Infinity).length}`,
);
const rss = procs.map((p) => Number(execSync(`ps -o rss= -p ${p.pid}`).toString().trim()));
rss.sort((a, b) => a - b);
console.log(
  `RSS per node (KiB): min ${rss[0]}, median ${rss[Math.floor(rss.length / 2)]}, max ${rss[rss.length - 1]}, total ${Math.round(rss.reduce((a, b) => a + b, 0) / 1024)} MiB`,
);
const du = execSync(`du -sk ${ROOT}`).toString().split('\t')[0];
console.log(`disk for ${N} nodes: ${Math.round(du / 1024)} MiB`);
for (const p of procs)
  try {
    process.kill(-p.pid, 'SIGTERM');
  } catch {}
