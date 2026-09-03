# E2EE on the Neutrino mesh — scope

Element X already does Megolm end-to-end encryption against any homeserver
that implements the device-key and to-device parts of the client-server
API. Neutrino (the embedded P2P homeserver) does not, which is why the
Neutrino README lists E2EE as missing. This is what is actually there and
what is needed, from reading `element-hq/neutrino` at `crates/neutrino-http`
and the federation client (checked 2026-09-02).

## Present today

| Endpoint / behaviour                                            | State in Neutrino                                                                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `POST /keys/upload`                                             | Stores **one** device's `device_keys` in memory (`App.keys`); ignores OTKs and fallback keys; always answers 100 OTKs |
| `POST /keys/query`                                              | Returns the single stored local device; nothing for remote users                                                      |
| `POST /keys/device_signing/upload`, `/keys/signatures/upload`   | Accepted, not persisted meaningfully                                                                                  |
| `GET /room_keys/version`                                        | 404 stub (no backup)                                                                                                  |
| Sliding sync `extensions.e2ee` / `to_device`                    | Echo stubs only; `device_lists` always empty, OTK counts never change                                                 |
| Federation `PUT /send/{txn}`                                    | `edus` are parsed and **dropped** (`_edus`); the client never sends any                                               |
| Federation `user/keys/query`, `user/keys/claim`, `user/devices` | Not implemented                                                                                                       |
| Event signing                                                   | Not done (README: "NOT SECURE" on untrusted networks)                                                                 |

## Needed for Megolm between two mesh nodes

1. **Device store** (`neutrino-store` + sqlite): device keys, one-time keys
   and fallback keys per `(user, device)`; local user only needs to be
   writable, remote users are cached from federation.
2. **Client endpoints**: `/keys/upload` persisting OTKs and returning real
   counts; `/keys/claim` consuming one OTK (or the fallback) per device;
   `/keys/query` merging local devices with a federation query for remote
   users; `PUT /sendToDevice/{type}/{txn}` queuing per recipient device.
3. **Federation**: `POST /_matrix/federation/v1/user/keys/query` and
   `…/user/keys/claim`, `GET …/user/devices/{userId}` served by each node for
   its own user; `m.direct_to_device` and `m.device_list_update` EDUs sent in
   `PUT /send/{txn}` and consumed on receipt (today `_edus` is discarded).
4. **Sync**: populate `extensions.to_device.events` (with `next_batch`
   acknowledgement), `extensions.e2ee.device_lists.changed` when a remote
   device list update arrives, and real `device_one_time_keys_count`.
5. **Trust**: none of this is safe until events and EDUs are signed and
   verified (server-name = Ed25519 key already, so verification keys exist);
   the Element X client will still show sessions as unverified, which is the
   correct signal.

Rough size: 1 and 2 are a few hundred lines of Rust plus tests
(`neutrino-testkit` has the harness); 3 and 4 touch the federation client,
the send handler and the sliding-sync builder and need two-node tests
(`crates/neutrino/tests/federation.rs` shows the pattern). This is a
multi-day, upstream-worthy change, not something to land quietly in a
conference fork. The companion side needs nothing new: the same crypto
layer that talks to matrix.org will talk to a Neutrino node that implements
the above.

## What we implemented, and what is left

Items 1 to 4 above are done, as five patches kept in
[`patches/neutrino/`](../patches/neutrino/README.md) — see that README for how
to apply them and exactly what each one covers.

- **Client-server half** (`0001`): a real per-device key store, honest one-time
  key counts, `POST /keys/claim` that pops rather than reads, and
  `PUT /sendToDevice/{type}/{txn}` delivered under `to_device` in `/sync`.
- **Federation half** (`0002`): `user/keys/query`, `user/keys/claim`,
  `user/devices`, and `m.direct_to_device` EDUs in both directions, with the
  client-server handlers fanning out to whichever server owns each user. This
  is the half that matters on a mesh, where every phone is its own homeserver
  and therefore every peer is a remote user.

Verified against two servers on loopback: a remote device queried, its one-time
keys claimed exactly once each, and a room key delivered to the other server's
`/sync`. Twelve tests cover the routes, the ownership scoping, claim
exhaustion, EDU dedup and the auth gate.

- **Durable delivery** (`0003`): to-device EDUs ride the federation outbox like
  PDUs, so a room key shared while the peer is out of BLE range is delivered
  when the peer comes back rather than dropped.

- **Sliding sync** (`0004`, item 4): `extensions.to_device` drains the real
  inbox, `extensions.e2ee.device_one_time_keys_count` is the real count, and a
  room key wakes a waiting long-poll. Before this the extensions were echo
  stubs, so a room key never reached a client using sliding sync — which is
  the sync ours uses.

**Proven end to end**: `tools/neutrino-probe/src/two-nodes.e2e.test.ts` runs
one of our client sessions against each of two Neutrino nodes, creates an
encrypted room on one, invites and joins over federation, and decrypts on the
other — in both directions. It skips without two servers and fails against
stock Neutrino, which is the point.

- **Persistence** (`0005`, item 1): device keys, one-time keys, cross-signing
  blobs and the to-device inbox live in sqlite. Memory stays the runtime copy;
  every mutation is journaled through to the store in order and reloaded at
  start, so a phone killing the app forgets no device and drops no room key.

Still open: `m.device_list_update` is not sent, and item 5 — signing — is
unchanged and is what still makes this "private, not authenticated".

## What the IndiaFOSS fork does meanwhile

- Keeps Element X's E2EE for public-homeserver accounts.
- On the mesh, rooms stay unencrypted (Neutrino's current contract) and the
  UI does not pretend otherwise.
- Handoff links and friend cards work identically on both.
