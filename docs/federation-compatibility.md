# Federation compatibility: phone, gateway and Spindle

What actually federates today, read out of the three code bases rather than
inferred from shared version labels. Every row cites the file and line it was
read from, at the revision named in the header below.

This table answers the first acceptance item of #129. It does not implement the
remaining ones: nothing here changes advertised capabilities, adds signing, or
runs a test against a real Spindle. Where a row states a gap, that gap is
recorded, not fixed.

## Revisions read

| Component | Revision | How it is pinned |
| --- | --- | --- |
| Neutrino (the embedded homeserver) | `hanthor/neutrino@2d85348` on `e2ee-key-transport` | `patches/neutrino/version.json` → `neutrino.rev` |
| Federation medium | `hanthor/neutrino-iroh@15117e9`, tag `neutrino-kit-15117e9` | `patches/neutrino/version.json` → `commit` |
| Spindle | `tuna-os/spindle@f6925d2` on `spindle-hub-p2p` | not pinned by us; see the caveat below |

Two caveats on provenance, stated because they bound what the table proves.

The Neutrino rows were verified at `2d85348`, the revision the bindings are
built from. An earlier read of the same repository at its `main` branch
(`90bc1b1`, upstream v0.7.1) shows a much smaller surface: no federation key
endpoints, no media, no aliases. Rows below describe the pinned branch, which
is 24 commits ahead of that base.

`docs/forks.md` says we consume Spindle's `venue-gateway` branch, but the
federation design document the RFC was answered with lives on
`spindle-hub-p2p`, and that is the branch read here. The two may differ. No row
in the Spindle column has been checked against a build of `venue-gateway`.

## Room versions and advertised capabilities

| | Neutrino | Spindle |
| --- | --- | --- |
| Room version created | `org.matrix.msc4242.12` only | `11` by default, `12` selectable |
| Room versions accepted on join | `org.matrix.msc4242.12` only | `11` and `12` |
| `/_matrix/client/v3/capabilities` says | default `12`, available `{"12": "stable"}` | default `11`, available `{"11": "stable", "12": "stable"}` |
| `/_matrix/client/versions` | `["v1.16"]` | `["v1.1", "v1.3"]` |

Citations: `crates/neutrino-event/src/lib.rs:39`, `crates/neutrino-http/src/lib.rs:3114-3117`;
`crates/spindle-server/src/surface.rs:88` and `:91`, `crates/spindle-server/src/routes.rs:1176-1189`.

**Neutrino advertises a room version it cannot resolve.** Capabilities reports
`12`, but the version registry only knows `org.matrix.msc4242.12`, so a lookup
of the bare string `12` returns nothing. The `?ver=` list Neutrino offers during
`make_join` is built from the same registry and likewise never contains `12`.
Three lists that should agree do not.

Nothing breaks today only because `createRoom` never reads the client's
requested version: a client asking for `12` is silently given
`org.matrix.msc4242.12` instead. That silent substitution is exactly what the
second acceptance item of #129 asks to make visible.

**The two servers share no room version.** Spindle speaks `11` and `12`.
Neutrino speaks `org.matrix.msc4242.12`. A `make_join` between them fails
version negotiation before anything else is tried, so none of the rows below
about join, state or history are reachable between a phone and a Spindle as
these revisions stand.

## Event format and authorisation

| | Neutrino | Spindle |
| --- | --- | --- |
| `auth_events` on the wire | rejected outright | required, spec-standard |
| `prev_state_events` on the wire | required on every non-create event | not read |
| Auth rules | hand-written, v12 only, not version-parameterised | ruma's `check_state_dependent_auth_rules` |
| State resolution | hand-written v2.1 variant, first pass starts from empty state | none implemented; contested forks are set aside |

Citations: `crates/neutrino-event/src/validate.rs:282-284` and `:344-348`,
`crates/neutrino-room/src/auth_rules.rs:68-72`, `crates/neutrino-room/src/state_res.rs:345-347`;
`crates/spindle-server/src/authorize.rs:16`, `crates/spindle-server/src/rooms/mod.rs:3707`.

These are different event formats, not two dialects of one. Neutrino refuses an
event carrying `auth_events` and refuses an event lacking `prev_state_events`;
a spec-standard PDU has the first and not the second. The MSC4242 state DAG is
the difference, and it is the reason the RFC's answer was to run standard v12
on the Neutrino side rather than to teach Spindle the state DAG.

Spindle has a defect of its own on this seam. Its inbound `/send` path builds
its verification rules from a hardcoded `"11"` constant rather than the room's
actual version, so a v12 PDU arriving over federation is hashed and
signature-checked under v11 rules
(`crates/spindle-server/src/inbound.rs:101-114`, `crates/spindle-server/src/rooms/mod.rs:30`).
Its `make_join` and `invite` paths do consult the real room version. This is an
upstream matter and is recorded here rather than assigned.

## Signing and key distribution

| | Neutrino | Spindle |
| --- | --- | --- |
| `X-Matrix` sent | `origin` and `destination` only, no `key`, no `sig` | `origin`, `key`, `sig`; `destination` optional |
| `X-Matrix` verified on receipt | `origin` parsed, `key` and `sig` discarded | all three required, signature verified |
| Inbound PDU signatures | not checked on `/send` | verified; bad content hash redacts, bad signature refuses |
| `/_matrix/key/v2/server` | served, but 404 on a trusted-network deployment | served, self-signed, `old_verify_keys` always empty |
| Peer key documents fetched | never; no key-fetch client exists | fetched directly, self-signature and server name checked |
| Notary (`/_matrix/key/v2/query`) | absent | absent |

Citations: `crates/neutrino-http/src/federation/client.rs:173`,
`crates/neutrino-http/src/federation/auth.rs:4-20`,
`crates/neutrino-http/src/federation/send.rs:225` and `:268`,
`crates/neutrino-http/src/lib.rs:720`;
`crates/spindle-server/src/federation.rs:1509-1545`, `:339-389`, `:477-506`,
`crates/spindle-server/src/inbound.rs:100-146`, `crates/spindle-server/src/routes.rs:2299-2337`.

**This is the hard blocker.** Spindle refuses a request whose `X-Matrix` header
carries no `key` and no `sig`, and refuses a PDU that does not verify against
the origin's published key. Neutrino sends neither, and its `/send` ingress
admits inbound PDUs without checking a signature at all. There is no
configuration on either side that bridges this: Spindle's own design document
states there is no mode in which unsigned history is accepted.

Neutrino's signing primitives exist. It has an event signer, a key resolver
that derives a verifying key from a node id, and a policy type whose signed
variant runs verification. What is missing is the wiring: the router
constructor hardcodes the trusted-network policy, so the signed path is
constructed nowhere outside a test. The deployment switch named in #129 as
`SecurityConfig.sign_messages` does not exist under that name; the only knob is
a single boolean, `Config::trusted_network`, defaulting to true, and the router
does not consult it.

One consequence worth stating before anyone flips that switch. Neutrino omits
`hashes` when there is no signer, and the hashes feed the event id, so the same
event built signed and unsigned gets two different ids. A room cannot be
migrated from unsigned to signed and keep its history addressable. This matches
Spindle's requirement that a room which will ever federate must be signed from
its create event.

## Federation endpoints

Served by each side. Absent means the request 404s.

| Endpoint | Neutrino | Spindle |
| --- | --- | --- |
| `PUT /v1/send/{txn}` | yes | yes |
| `GET /v1/backfill/{room}` | yes | yes |
| `POST /v1/get_missing_events/{room}` | yes | yes |
| `GET /v1/make_join`, `PUT /v2/send_join` | yes, v2 only | yes, v1 and v2 |
| `GET /v1/make_leave`, `PUT /v2/send_leave` | yes, v2 only | yes, v1 and v2 |
| `PUT /v2/invite` | yes, v2 only | yes, v2 only |
| `GET /v1/make_knock`, `PUT /v1/send_knock` | absent | yes |
| `GET /v1/state`, `/v1/state_ids` | absent by design | yes |
| `GET /v1/event/{id}`, `/v1/event_auth` | absent | `event` yes, `event_auth` absent |
| `GET /v1/version` | absent | yes |
| `GET /v1/query/directory`, `/query/profile` | `directory` yes, `profile` absent | both yes |
| `GET /v1/media/download/{id}` | yes | yes |
| `GET /v1/media/thumbnail/{id}` | absent | absent |

Citations: `crates/neutrino-http/src/lib.rs:716-909`;
`crates/spindle-server/src/routes.rs:1066-1157`.

Neutrino has no `/state` or `/state_ids` because its `send_join` ships the whole
state DAG instead. That response is its own shape, `{state_dag, timeline,
event}`, with no `auth_chain` and no spec envelope
(`crates/neutrino-http/src/federation/send_join.rs:41-50`). Spindle answers
`send_join` with `{origin, event, state, auth_chain}`
(`crates/spindle-server/src/inbound.rs:1276-1282`). Neither can read the
other's join response.

Neither side implements MSC3706 faster joins, and neither implements the
MSC3995 hub protocol that Spindle's own `SPEC.md` designs.

## Keys and to-device across federation

| | Neutrino | Spindle |
| --- | --- | --- |
| `POST /v1/user/keys/query` | yes | absent |
| `POST /v1/user/keys/claim` | yes | absent |
| `GET /v1/user/devices/{user}` | yes | absent |
| `m.direct_to_device` EDU | sent and acted on | accepted and dropped |
| `m.device_list_update` EDU | device list carries a stream id | accepted and dropped |
| EDUs acted on inbound | `m.direct_to_device` | `m.typing` only |

Citations: `crates/neutrino-http/src/lib.rs:899-909`,
`crates/neutrino-http/src/federation/keys.rs`,
`crates/neutrino-http/src/federation/send.rs:411`;
`crates/spindle-server/src/inbound.rs:478`, `crates/spindle-server/src/routes.rs:3808-3817`.

The polarity here is the reverse of the signing row, and it matters for #176.
Neutrino implements the federation key and to-device surface; Spindle does not.
Spindle's `docs/mesh-federation.md` claims to serve "to-device delivery,
device-list EDUs", but on the revision read its `/send` loop skips every EDU
whose type is not `m.typing`, and it registers no federation key endpoints at
all. Two phones on opposite sides of a Spindle could not complete an Olm
session through it.

That claim is contradicted by our own rung 1 evidence, which records keys
queried and claimed both ways and to-device delivered both ways against a
gateway. The reconciliation is that rung 1 ran against the gateway patch under
Spindle's `contrib/`, on a branch this audit did not read. Until that is
re-run against a named Spindle revision, treat this row as read from
`spindle-hub-p2p` and not as a statement about what rung 1 exercised.

## Gateway mode

There is no gateway mode in the code.

A node is reachable over the iroh link or over an IP ingress, never both.
`neutrino_lb::serve` selects the transport by whether a datagram link was
injected, returning early into the link path before any ingress socket is bound
(`neutrino-lb/src/lib.rs:325-327`, `:391-446`). The link branch never passes
`ingress_bind` anywhere. The `neutrino-lan` binary always injects a link, so its
`--fed-port` flag turns the sidecar on rather than opening a port.

A real gateway needs either two serve instances sharing one ingress handler, or
one serve that runs both wire servers. Neither exists. The closest thing is
peer seeding, `--peer <64hex>@<ip:port>`, which crosses boundaries within the
iroh mesh rather than between the mesh and IP-addressed Matrix. This bounds
what #165 can claim.

## Server names and discovery

Neutrino resolves a peer as `http://{server_name}` with no TLS, no `.well-known`
and no SRV (`crates/neutrino-http/src/federation/client.rs:7-8`). A mesh server
name is the 64-character hex of an ed25519 node id, and the same key is the node
identity, the server name and the Matrix signing key
(`crates/neutrino-event/src/sign.rs:427-429`).

Spindle also resolves the name as the host with no delegation, and adds a
configured-peer table so a name with no DNS can still be reached:

```toml
[federation]
peers = { "a1b2…f0a1b2" = { url = "http://10.20.0.5:8008", max_backoff_ms = 3600000 } }
```

A listed peer may use plain `http` without loosening the global setting, and an
internal address still requires the range to be allowed
(`crates/spindle-server/src/config.rs:490-542`).

This is the one part of the seam that already fits. Spindle can name and reach
a node-key server; the identity model needs no new key material, because the
iroh node key already is an ed25519 key.

## What blocks phone-to-Spindle federation today

In the order they would be hit:

1. **No shared room version.** Version negotiation fails at `make_join`.
2. **No request signature.** Neutrino's `X-Matrix` carries no `key` or `sig`; Spindle rejects that unconditionally.
3. **No PDU signatures.** Neutrino's `/send` admits without checking, and emits events Spindle would refuse.
4. **Incompatible join responses.** The two `send_join` shapes have no field in common beyond `event`.
5. **No key or to-device path through Spindle.** Only `m.typing` survives its EDU loop, and it serves no federation key endpoints.

Items 1 to 3 are ours. Item 4 follows from the MSC4242 state DAG and is the
cost the RFC accepted. Item 5 is Spindle's, and needs re-reading against the
branch rung 1 actually ran.

## What this document does not establish

No test was run against a Spindle build for this document; every row is a code
reading. No claim is made about a device, a venue, or a deployed gateway.
Nothing here has been checked against Spindle's `venue-gateway` branch, and the
`contrib/` gateway patch was not read. The `spindle-contracts` workflow builds
a Spindle from source and is where these rows should become tests.

Related: gateway deployment #165, remote participation #115, cross-seam keys #176.
