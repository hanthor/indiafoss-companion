# E2EE patches for `element-hq/neutrino`

Five patches that give Neutrino enough of the Matrix key surface for the
companion's mesh rooms to be end-to-end encrypted. They apply to
`element-hq/neutrino` at `90bc1b1` (2026-09-02). The same commits are on the
[`e2ee-key-transport`](https://github.com/hanthor/neutrino/tree/e2ee-key-transport)
branch of the `hanthor/neutrino` fork, which is what our own builds come from:
`.github/workflows/neutrino-bindings.yml` compiles the phone bindings against
the fork rev pinned in `apps/android/capacitor/neutrino/version.json`.

**These are not offered upstream, and should not be.** Element's policy on
AI-assisted contributions is not known to us, and a pre-alpha research
project does not need a conference app's experiments landing in its review
queue. The patches exist so our builds can carry them; if they are ever
proposed upstream, that is a decision for a person, made in the open, not a
side effect of this repository.

Why they exist: Matrix keeps the cryptography in the client, so a homeserver's
only job in E2EE is to remember which devices exist, hand out one one-time key
per device, and relay ciphertext. Neutrino did the first of those three, half.
Without the other two no client can open an Olm session, however complete its
own crypto is — which is why [ADR 0003](../../docs/adr/0003-mesh-interop-by-federation-not-bridging.md)
could rule out a bridge: the encryption path is client-side and only the relay
was missing.

## Applying them

```sh
git clone https://github.com/element-hq/neutrino
cd neutrino
git am /path/to/indiafoss-companion/patches/neutrino/*.patch
cargo test -p neutrino-http
cargo run --bin neutrino
```

Then, from this repository:

```sh
pnpm --filter @indiafoss/neutrino-probe start  # measures what the server does
pnpm --filter @indiafoss/neutrino-probe test   # contracts + tripwires
```

The two E2EE tripwires in `tools/neutrino-probe/src/e2e.test.ts` are asserted
_still missing_ against stock Neutrino, so with these patches applied they
**fail** — which is exactly their purpose: a gap that closes silently is a
feature we never ship.

## 0001 — the client-server half

- A real per-device key store: two devices of one user no longer overwrite each
  other, and uploads are no longer discarded after the first.
- Honest one-time key counts (previously a canned 100 that nothing could hand
  out), so a client knows when to top the server up.
- `POST /keys/claim`, which **pops**: a one-time key handed out twice is not
  one-time.
- `PUT /sendToDevice/{type}/{txn}`, delivered under `to_device` in `/sync` and
  drained on read.

## 0002 — the federation half

On a mesh every phone is its own homeserver, so every peer you want to encrypt
to is a _remote_ user and a purely local key directory answers every query with
an empty object. This adds:

- `POST /_matrix/federation/v1/user/keys/query`
- `POST /_matrix/federation/v1/user/keys/claim`
- `GET /_matrix/federation/v1/user/devices/{userId}`
- `m.direct_to_device` EDUs, sent and received

The client-server handlers now split each request by the server that owns each
user, answer for their own and ask (or tell) the owning server for the rest. An
unreachable peer lands in `failures` rather than failing the whole call.

Twelve tests cover the routes, ownership scoping, claim exhaustion, EDU dedup
and the auth gate; both patches were also verified against two servers on
loopback.

## 0003 — durable to-device delivery

The first cut of `0002` fired the EDU at the peer and forgot it. On a BLE mesh
that is the wrong shape: the peer you are sharing a room key with is a phone
that walks in and out of range, and a key dropped because it was out of range
for a second is a conversation that cannot be read.

This patch gives EDUs a row in the federation outbox (`outbox_edus`, stored
verbatim since an EDU has no event id to reference), and the per-destination
sender carries them in the same transaction as any pending PDUs — or one of
their own when nothing else is queued. A destination owed only a room key
gets a sender task; a peer that is unreachable is retried with the usual
backoff and kicked when connectivity returns; the rows go only on the peer's
2xx. The outbox row is keyed on the client's `/sendToDevice` transaction id,
so a client retry queues nothing new. Bumps the sqlite schema version to 3.

Tests: EDU-only delivery and drain, EDUs riding along with PDUs, and the one
that is the point — a key queued while the peer is unreachable is delivered
when the peer comes back.

## 0004 — sliding sync carries E2EE

The sliding-sync `e2ee` and `to_device` extensions were echo stubs: an
empty events array, a one-time key count hard-coded at 100, and a long-poll
that deliberately ignored both. For a client on sliding sync — Element X, and
ours — a Megolm room key therefore never arrived, however complete the rest of
the transport was.

The key directory and inbox move into a shared `E2eeState` with its own watch.
Sliding sync drains the inbox into `extensions.to_device.events` for a client
that opted in (the drained events are part of the cached response, so a retried
request gets them again), reports real one-time key counts, and wakes a waiting
long-poll when a room key lands.

Proven from outside the tree by
`tools/neutrino-probe/src/two-nodes.e2e.test.ts`: two nodes on loopback, one
of our client sessions on each, an encrypted message decrypting on the far
side, in both directions.

## 0005 — keys and the inbox survive a restart

On a phone the app is killed routinely, and a restart that forgets every
device key and every undelivered room key silently breaks every peer's Olm
session. Four tables (`device_keys`, `one_time_keys`, `cross_signing_keys`,
`to_device_inbox`) hold the server's share of E2EE as wire-verbatim JSON.
Memory stays the runtime copy; every mutation is journaled to a task that
writes it through in order, and the whole set is reloaded before serving. A
one-time key is a row, so a claim is a delete rather than a rewrite. Schema
version 4.

Tests: the store's round-trip and conflict rules, and an HTTP-level restart —
upload, claim one key, receive a room key, then a fresh application state over
the same store finds the device, exactly the unclaimed key, and the waiting
room key, delivered once.

## What is still missing

- **`m.device_list_update` EDUs** are not sent; `stream_id` is a constant.
- **Identity is a stub in the default dev binary** — register and login return
  the same `@alice:localhost` / `DEVICEID` whatever you send — which is why the
  to-device inbox is keyed per user rather than per device. Building with
  `--features multi-user-shim` gives the dev binary real per-user tokens, so two
  users against one server _can_ be exercised; two phones on a mesh get distinct
  identities from their node keys regardless.
- **Events are still unsigned.** Neutrino is explicitly not secure on the public
  internet, and encrypting the payload does not change that: it means a mesh
  message is private, not that its sender is authenticated.
