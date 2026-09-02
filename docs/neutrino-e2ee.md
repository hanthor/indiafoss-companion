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

## What the IndiaFOSS fork does meanwhile

- Keeps Element X's E2EE for public-homeserver accounts.
- On the mesh, rooms stay unencrypted (Neutrino's current contract) and the
  UI does not pretend otherwise.
- Handoff links and friend cards work identically on both.
