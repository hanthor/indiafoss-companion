# E2EE patches for `element-hq/neutrino`

Eight patches that give Neutrino enough of the Matrix key surface for the
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

## 0006 — redaction

`PUT /rooms/{room}/redact/{eventId}/{txnId}` builds an `m.room.redaction`
(room v11+ carries `redacts` in content) and sends it through the room actor
like any other event, so it is persisted, DAG-linked and federated with no
special path. What makes it a redaction is what the read paths do with it:
sliding sync and `/messages` ask the store which accepted redactions target
the events they are about to return (`json_extract` on the stored row — no
new table), decide whether each is allowed (the redaction's sender is the
target's sender, or holds the room's `redact` level), and prune the target per
the room version's rules with the redaction alongside as
`unsigned.redacted_because`. A redaction that is not allowed is served as an
event and changes nothing. Applying on read keeps the DAG's bytes intact and
copes with a redaction arriving before its target over federation.

Un-react and delete now work on the mesh; the probe's redaction tripwire
flips to a contract in fork mode.

## 0007 — typing and read receipts

`PUT /rooms/{room}/typing/{user}` and `POST /rooms/{room}/receipt/{type}/{event}`
are accepted; each produces an `m.typing` / `m.receipt` EDU addressed to every
server with a member in the room, through the same durable outbox as to-device
messages (a stale typing notice expires on the receiving side; a receipt that
waits for the link is still a receipt). Inbound EDUs land in an ephemeral
state shared with the sync path — typing with expiry, one read position per
user that only moves forward — and the sliding-sync `typing` and `receipts`
extensions carry them, waking a waiting long-poll when they change. The
`receipts` extension merges real `m.read` receipts over the delivery-mark
synthesis that was already there.

## 0008 — what Complement asked for

Running matrix-org/complement against the fork (see
[`neutrino-complement.yml`](../../.github/workflows/neutrino-complement.yml))
turned four spec behaviours our client had not needed into server changes:

- **A typing stop is news.** The sliding-sync `typing` extension reported only
  rooms with someone typing, so a client learnt that typing had stopped by
  the room going missing — which a delta cannot express. Each connection now
  remembers the ephemeral version it last served and is told every room whose
  typing set changed since, empty ones included.
- **Legacy `/sync` carries ephemeral events.** The MSC4186 translator enables
  the `typing` and `receipts` extensions and folds them into each joined
  room's `ephemeral.events`, creating the room entry when the notice is the
  only news. Our client uses sliding sync; Complement and ordinary Matrix
  clients use this.
- **`GET /rooms/{room}/event/{id}`**, the same redaction-aware view
  `/messages` gives, one event at a time; `404 M_NOT_FOUND` for a non-member
  or an event of another room.
- **The key directory is stricter and ordered.** `/keys/upload` rejects a
  device key object that is malformed or names another user (`M_BAD_JSON`);
  `/keys/query` answers an empty map for a user with no devices and rejects a
  device list that is not a list; `/keys/claim` hands out one-time keys in
  upload order (MSC4225), which took a sequence column — schema v5, so an
  older store is refused at open, as before.

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
