# E2EE patches for `element-hq/neutrino`

Two patches that give Neutrino enough of the Matrix key surface for the
companion's mesh rooms to be end-to-end encrypted. They apply to
`element-hq/neutrino` at `90bc1b1` (2026-09-02) and are kept here because the
work is upstream's to accept — this repository is where it was written and
measured, not where it will live.

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

## What is still missing

- **Outbound EDUs bypass the durable outbox** (which stores PDUs), so to-device
  delivery is best-effort: a peer out of BLE range when a room key is shared
  does not get it later. The client's re-share on the next send to an unknown
  device is the recovery path. Making this durable is the next patch.
- **Keys live in memory**, so they do not survive a restart. Persisting them is
  storage work, not protocol work.
- **`m.device_list_update` EDUs** are not sent; `stream_id` is a constant.
- **Identity is still a stub** in the dev binary: register and login return the
  same `@alice:localhost` / `DEVICEID` whatever you send, which is why the
  to-device inbox is keyed per user rather than per device. Two phones on a mesh
  get distinct identities from their node keys, so this is a dev-binary
  limitation — but it is the reason these patches cannot be exercised with two
  users against one server.
- **Events are still unsigned.** Neutrino is explicitly not secure on the public
  internet, and encrypting the payload does not change that: it means a mesh
  message is private, not that its sender is authenticated.
