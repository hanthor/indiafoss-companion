# Federation compatibility: phone, gateway and Spindle

What actually federates today, read out of the code rather than inferred from
shared version labels. Every row cites the file and line it was read from, at
the revision named below.

This answers the first acceptance item of #129. It does not implement the
others: nothing here changes advertised capabilities, adds signing, or runs a
test against a real Spindle.

The short version: the two servers are far closer than the original framing
assumed. Spindle already speaks the room version Neutrino creates, already
answers `send_join` in Neutrino's shape for those rooms, and already serves the
federation key and to-device endpoints. One thing blocks the seam, signing, and
the patch that fixes it already exists upstream and is not applied to our fork.

## Revisions read

| Component | Revision | How it is pinned |
| --- | --- | --- |
| Neutrino (the embedded homeserver) | `hanthor/neutrino@2d85348`, branch `e2ee-key-transport` | `patches/neutrino/version.json` → `neutrino.rev` |
| Federation medium | `hanthor/neutrino-iroh@15117e9`, tag `neutrino-kit-15117e9` | `patches/neutrino/version.json` → `commit` |
| Spindle | `tuna-os/spindle@ad2283d`, branch `venue-gateway` | `docs/forks.md`; not pinned mechanically |

Spindle's `venue-gateway` and `spindle-hub-p2p` differ in only one area that
matters here, E2EE over federation, plus operator docs. The state-DAG support,
room version list, peer configuration and per-room version resolution are
identical blobs on both branches. Do not attribute those to `venue-gateway`.

## Room versions and advertised capabilities

| | Neutrino | Spindle |
| --- | --- | --- |
| Room versions supported | `org.matrix.msc4242.12` only | `11`, `12`, and `org.matrix.msc4242.12` |
| Created by default | `org.matrix.msc4242.12` | `11` |
| `/_matrix/client/v3/capabilities` | default `12`, available `{"12": "stable"}` | default `11`, all three listed, the state-DAG version marked `unstable` |
| `/_matrix/client/versions` | `["v1.16"]` | `["v1.1", "v1.3"]` |
| Client-requested room version | never read | honoured if supported, silently substituted if not |

Citations: `crates/neutrino-event/src/lib.rs:39`, `crates/neutrino-http/src/lib.rs:3114-3117`;
`crates/spindle-server/src/surface.rs:88` and `:91`, `crates/spindle-core/src/version.rs:24`,
`crates/spindle-server/src/routes.rs:1188-1208`, `crates/spindle-server/src/rooms/mod.rs:406`.

**The two servers share a room version.** Spindle's supported list includes
`spindle_core::STATE_DAG_V12`, which is the string `org.matrix.msc4242.12`,
exactly what Neutrino creates. Version negotiation at `make_join` succeeds.

**Both servers silently substitute an unsupported requested version**, and this
is worth fixing on both sides. Neutrino never reads the client's `room_version`
at all. Spindle filters the request through its supported list and falls back to
`11` when the filter rejects it, deliberately, because allowlisted Complement
tests depend on it. Spindle's `room_upgrade` path does refuse an unsupported
version with `M_UNSUPPORTED_ROOM_VERSION`, and its remote join and knock
negotiation refuses a peer's unsupported version, so only `createRoom` is
silent. This is the case the second acceptance item of #129 asks to make
visible.

**Neutrino advertises a version it cannot resolve.** Capabilities reports
default `12` and available `{"12": "stable"}`, but the registry only knows
`org.matrix.msc4242.12`, so resolving the bare `12` returns nothing, and the
`?ver=` list offered at `make_join` never contains it. Spindle by contrast
advertises all three and marks the state-DAG one `unstable`, which is the
honest shape to copy.

## Event format and authorisation

| | Neutrino | Spindle, state-DAG room | Spindle, v11 or v12 room |
| --- | --- | --- | --- |
| `auth_events` on the wire | rejected | rejected | required |
| `prev_state_events` on the wire | required except on create | required except on create, capped at 20 | not read |
| `depth` | not required | optional | required |
| Auth rules | hand-written v12 | ruma's v12 rules | ruma's rules for the version |

Citations: `crates/neutrino-event/src/validate.rs:282-284` and `:344-348`;
`crates/spindle-core/src/pdu.rs:96-120`, `crates/spindle-core/src/version.rs:43-48`,
`crates/spindle-server/src/authorize.rs:115-121`.

**The event formats match for state-DAG rooms.** Spindle enforces the same
wire shape Neutrino does: `auth_events` refused, `prev_state_events` required,
and the same v12 auth rules underneath. This is not a coincidence; Spindle
implemented MSC4242 to meet the fork.

Neither server implements a state-DAG-specific state resolution algorithm.
Spindle resolves forks over `prev_events` in a version-agnostic window and uses
`prev_state_events` for head tracking, parent checks and a topological seed
ordering. Neutrino runs a hand-written v2.1 variant whose first pass starts from
the empty state. This is the part of the RFC's bargain that remains real work,
but it is not a wire incompatibility.

## Signing and key distribution

| | Neutrino | Spindle |
| --- | --- | --- |
| `X-Matrix` sent | `origin` and `destination` only, no `key`, no `sig` | `origin`, `key`, `sig` |
| `X-Matrix` verified on receipt | `origin` parsed, `key` and `sig` discarded | all three required, signature verified, no lenient mode |
| Inbound PDU signatures | not checked on `/send` | verified; bad content hash redacts, bad signature refuses |
| Room version used to verify a PDU | per-room | per-room, falling back to `11` for an unknown room |
| `/_matrix/key/v2/server` | served, 404 on a trusted-network deployment | served, self-signed |
| Peer key documents fetched | never; no key-fetch client exists | fetched over HTTP, self-signature and server name checked |
| A 64-hex node id as a server name | is the signing key, decoded directly | treated as an ordinary hostname, key fetched over HTTP |

Citations: `crates/neutrino-http/src/federation/client.rs:173`,
`crates/neutrino-http/src/federation/auth.rs:4-20`,
`crates/neutrino-http/src/federation/send.rs:268`,
`crates/neutrino-event/src/sign.rs:427-429`;
`crates/spindle-server/src/federation.rs:1618-1647`, `:339-388`, `:478-499`,
`crates/spindle-server/src/inbound.rs:104-139` and `:158-182`,
`crates/spindle-server/src/routes.rs:2356-2371`.

**This is the whole blocker.** Spindle refuses a request whose `X-Matrix`
carries no `key` and no `sig`, and refuses a PDU that does not verify. Neutrino
sends neither and checks neither.

There is no way around it from Spindle's side, and this was checked rather than
assumed. Every federation route is authenticated except `/v1/version` and the
key document. A `[federation] peers` entry changes only the URL and the backoff
cap. Both config structs deny unknown fields, so an undocumented relaxation
could not even parse. Searches for a trusted, insecure, unsigned or skip-verify
mode return only `insecure_http`, which selects a URL scheme and still verifies
the signature on whatever key document comes back.

Neutrino's signing primitives all exist: an event signer, a resolver that
derives a verifying key from a node id, and a policy whose signed variant runs
verification. What is missing is wiring. The router constructor hardcodes the
trusted-network policy, and the signed path is constructed nowhere outside a
test. The `SecurityConfig.sign_messages` and `authenticate_connections` flags
named in #129 do not exist under those names; the only knob is
`Config::trusted_network`, defaulting to true, which the router does not
consult.

One consequence before anyone flips that switch. Neutrino omits `hashes` when
there is no signer, and `hashes` feed the event id, so the same event built
signed and unsigned gets two different ids. A room cannot be migrated from
unsigned to signed and keep its history addressable, which is why a room that
will ever federate must be signed from its create event.

## The patch that closes the seam, and is not applied

Spindle ships `contrib/neutrino/0001-gateway-federation.patch`, 973 lines
against 11 Neutrino files. It does four things:

- dials a destination that is not a 64-hex node id straight over HTTP rather than through the datagram proxy, via a new `federation_direct_names` config;
- signs every outbound federation request with a real `X-Matrix` under `ed25519:1`;
- adds `crates/neutrino-main/src/keys.rs`, a resolver that fetches and self-signature-checks a named peer's key document;
- forwards `/_matrix/key/` through the `neutrino-lb` ingress.

It is not applied to our fork. At `hanthor/neutrino@2d85348` there is no
`crates/neutrino-main/src/keys.rs` and no occurrence of
`federation_direct_names`. Spindle needs nothing for it; its own
`contrib/neutrino/README.md` says so.

What the patch still does not do, by its own README: verify inbound request
signatures, resolve delegation, or speak TLS. So applying it makes Neutrino
acceptable to Spindle without making Neutrino itself verify what it receives.

## Federation endpoints

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
| `GET /v1/event/{id}` | absent | yes |
| `GET /v1/event_auth` | absent | absent |
| `GET /v1/version` | absent | yes |
| `GET /v1/query/directory` | yes | yes |
| `GET /v1/query/profile` | absent | yes |
| `GET /v1/media/download/{id}` | yes | yes |
| `GET /v1/media/thumbnail/{id}` | absent | absent |
| `/_matrix/key/v2/query` (notary) | absent | absent |

Citations: `crates/neutrino-http/src/lib.rs:716-909`;
`crates/spindle-server/src/routes.rs:1070-1153`.

Neutrino has no `/state` or `/state_ids` because its `send_join` ships the whole
state DAG instead.

## send_join, and why the shapes agree

Spindle returns two different shapes depending on the room.

| Room | Spindle returns |
| --- | --- |
| state-DAG | `{origin, event, state_dag, timeline}` |
| v11 or v12 | `{origin, event, state, auth_chain}` |

Neutrino returns `{state_dag, timeline, event}`
(`crates/neutrino-http/src/federation/send_join.rs:41-50`). Spindle's state-DAG
branch is at `crates/spindle-server/src/inbound.rs:1304-1314`, its stock branch
at `:1326-1331`.

**The shapes agree for the rooms that matter**, differing only by Spindle's
extra `origin`. On the consuming side Spindle merges both shapes before seeding,
taking `state` union `state_dag` as the state set and `auth_chain` union
`timeline` as the rest (`crates/spindle-server/src/routes.rs:3551-3563`). This
is a deliberate interoperability affordance, not an accident.

## Keys and to-device across federation

| | Neutrino | Spindle |
| --- | --- | --- |
| `POST /v1/user/keys/query` | yes | yes |
| `POST /v1/user/keys/claim` | yes | yes |
| `GET /v1/user/devices/{user}` | yes | yes |
| `m.direct_to_device` EDU | sent and acted on | acted on |
| `m.device_list_update` EDU | sent, with a stream id | acted on, and announced outbound |
| Other EDUs | accepted and dropped | `m.typing` applied, rest dropped |

Citations: `crates/neutrino-http/src/lib.rs:899-909`,
`crates/neutrino-http/src/federation/keys.rs`,
`crates/neutrino-http/src/federation/send.rs:411`;
`crates/spindle-server/src/routes.rs:1105-1113`,
`crates/spindle-server/src/inbound.rs:504`,
`crates/spindle-server/src/e2ee_federation.rs:193-194`.

Both sides implement this surface. Spindle's half is the `venue-gateway` delta,
covered by three tests in `crates/spindle-server/tests/e2ee_federation.rs`:
keys found and claimed across federation, to-device crossing both ways, and a
device change announced to a server sharing a room. That matches our own rung 1
evidence, which recorded the same three things against a gateway.

## Gateway mode

Neither server can be reached over an iroh link and an IP ingress at the same
time by itself.

On the Neutrino side, `neutrino_lb::serve` selects the transport by whether a
datagram link was injected and returns early into the link path before any
ingress socket is bound (`neutrino-lb/src/lib.rs:325-327`, `:391-446`).
`neutrino-lan` always injects a link, so its `--fed-port` is a switch that turns
the sidecar on rather than a port that gets bound.

Spindle has no mesh awareness at all: no occurrence of iroh, neutrino, node id
or datagram in its crates beyond two prose comments.

Dual reachability is precisely what the unapplied `contrib/` patch provides,
through `federation_direct_names` on the Neutrino side. Spindle's half is a
`[federation] peers` entry. This bounds what #165 can claim today and names the
concrete thing that would change it.

## Server names and discovery

Neutrino resolves a peer as `http://{server_name}` with no TLS, no
`.well-known` and no SRV (`crates/neutrino-http/src/federation/client.rs:7-8`).
A mesh server name is the 64-character hex of an ed25519 node id, and that one
key is the node identity, the server name and the Matrix signing key
(`crates/neutrino-event/src/sign.rs:427-429`).

Spindle also resolves a name as the host with no delegation, and adds a peer
table so a name with no DNS is still reachable:

```toml
[federation]
peers = { "a1b2…f0a1b2" = { url = "http://10.20.0.5:8008", max_backoff_ms = 3600000 } }
```

A listed peer may use plain `http` without loosening the global setting; an
internal IP literal still requires the range to be allowed
(`crates/spindle-server/src/config.rs:489-543`, `crates/spindle-server/src/federation.rs:228-244`).
Spindle does not decode a node id: it runs every name through a server-name
parser and fetches the key document over HTTP, which is exactly what the
`contrib/` patch's ingress-forwarding half exists to make possible.

## What blocks phone-to-Spindle federation today

One thing, in two directions.

1. **Neutrino does not sign.** Its `X-Matrix` carries no `key` or `sig`, and it emits PDUs without signatures. Spindle rejects both, with no relaxation available. The `contrib/` patch fixes this and is not applied.
2. **Neutrino does not verify.** Its `/send` admits inbound PDUs on faith and its `X-Matrix` parser discards `key` and `sig`. Nothing upstream rejects us for this, so it is a trust decision of ours, not a compatibility failure. The `contrib/` patch does not address it.

Everything the original framing listed as a separate blocker has already been
met on Spindle's side: the room version, the event format, the `send_join`
shape, and the key and to-device path.

## What this document does not establish

No test was run against a Spindle build. Every row is a code reading. No claim
is made about a device, a venue, or a deployed gateway. The `contrib/` patch was
read from its header and README, not applied or compiled. Spindle's own tests
run two Spindles on loopback, and its mesh interop script is not invoked by any
of its workflows, so nothing upstream currently exercises a real node-id server
name either. The `spindle-contracts` workflow is where these rows should become
tests.

Related: gateway deployment #165, remote participation #115, cross-seam keys #176.
