# What is different in our forks

Every repository this project builds on diverges from its upstream on purpose,
and each divergence is something an attendee's phone depends on. This file is
the map: what each fork carries, why, and what is upstream's to take back.
**Shipping a feature that touches a fork means updating this file in the same
change** — a fork whose differences live only in git log is a fork nobody can
reason about.

Revision pins live in `patches/neutrino/version.json`; this file explains
them.

## hanthor/neutrino — the embedded homeserver

Forked from `element-hq/neutrino` at v0.7.1 (`90bc1b1`). Branch:
`e2ee-key-transport`, 17 commits ahead. Three groups:

**End-to-end encryption transport** (the branch's namesake, also carried as
`patches/neutrino/0001…0005`). Upstream v0.7.1 stores no real device keys and
carries no to-device messages, so no client could run Olm/Megolm against it.
The fork adds: real device-key storage and one-time-key handout; device keys
and to-device messages across federation; delivery through the durable outbox
(a key share survives the node restarting); to-device and real key counts
through sliding sync; persistence for all of it. This is what makes an
encrypted DM between two phones possible at all.

**Client-server surface a real client needs** (patches 0006…0011): redaction,
typing/read receipts over federation, `/event`, device-list update EDUs,
whoami/account-data, media with a size cap, CORS, a configurable join-ingest
deadline. Each one exists because Element X or our own client hit its absence.

**The room directory** (#1–#3 on the fork): `room_aliases` storage
(first-write-wins claims), `createRoom` honouring `room_alias_name` and
returning `room_alias`/`room_alias_error`, local and federated resolution
(`GET /_matrix/federation/v1/query/directory`), aliases as join targets with
the resolving server added as a join hint. Upstream has no directory at all;
without one the deterministic conference aliases cannot resolve on the mesh.
Includes the fix for server names that carry a port, which every mesh test
missed because 64-hex node ids contain no colon.

**Not yet on the branch:** the gateway-federation patch
(`tuna-os/spindle/contrib/neutrino/0001-gateway-federation.patch`) — dial
named peers, sign outbound requests, fetch a named peer's keys over HTTP. A
venue gateway is built from the branch _plus_ this patch; a phone is built
without it.

Upstream's to take back: all of it, ideally. The e2ee transport and the
directory are not conference-specific.

## hanthor/neutrino-iroh — the federation medium

Forked from `element-hq/neutrino-iroh` at v0.8.2 (`65e4985`). Branch: `main`,
4 commits ahead.

- **mDNS LAN discovery** (#1). Upstream discovers peers over BLE only. The
  fork adds iroh's `address-lookup-mdns` (link-local, no internet service —
  deliberately not the `N0` preset, which phones home to `dns.iroh.link`),
  drained into the peer registry so a discovered peer is dialable, not just
  logged. On by default; `--no-default-features` builds a no-multicast node.
- **`neutrino-lan`** (#1): a desktop binary running the same medium
  composition as the Android `start_ble`, minus JNI. Before it existed the
  medium could only be exercised with two handsets in hand. It is also what a
  venue gateway runs.
- **`--peer <64hex>@<ip:port>` seeding** (#1): how a node crosses a routed
  network or a client-isolating AP, and the shape a gateway is configured
  with.
- **Probe on discovery** (#2). Discovering a peer is not the same as reaching
  it; the fork dials a freshly discovered peer immediately, so unreachability
  is a log line at discovery time rather than a 60-second timeout inside
  somebody's invite.

Pinned to the _fork's_ neutrino branch, so the medium's `.aar` carries the
directory and the e2ee transport.

## hanthor/indiafoss-chat-android — the phone client

Forked from Element X Android. Beyond branding and the embedded-Neutrino
wiring it inherits, ours adds:

- **A `MulticastLock`** (#29). Android's Wi-Fi driver drops multicast unless
  one is held, which silently disables the fork's mDNS discovery — the node
  announces itself, hears nothing, and falls back to BLE with no error.
  Without this the Wi-Fi mesh does not exist on a handset.
- **`matrix:` URI handling** for the companion's offline handoff links.

## tuna-os/spindle — not our fork

The conference Spindle is developed in its own repository; we consume the
`venue-gateway` branch (MSC4242 state-DAG rooms, `[federation] peers`, the
gateway patch under `contrib/`). Differences from stock Matrix servers are its
own docs' subject (`docs/venue-gateway.md` there).

## What E2EE covers today, and the seam it stops at

Proven, with the evidence in `docs/evidence/`:

- **Phone ↔ phone over the real medium** — encrypt on one node, decrypt on
  another, the Megolm key crossing the iroh link (`two-nodes.e2e.test.ts`
  against `neutrino-lan` nodes).
- **Groups across three mesh homeservers** — one sender's key share fanned to
  two distinct servers, ciphertext-only on the wire, replies proving every
  pairwise link (`mesh-e2ee.e2e.test.ts`, in CI on every push).
- **Gateway ↔ Spindle** — keys queried and claimed both ways, device-list
  changes announced, to-device delivered both ways (rung 1, 15/15).

Structurally open, and worth being honest about: **a phone cannot run E2EE
with a Spindle user.** Room events cross the seam by store-and-forward — the
gateway holds the room, and both sides converge on it — but a Megolm key share
is a to-device EDU, delivered origin→destination only, and phones never peer
with the Spindle. There is no relay for it, and `/keys/query` against the
Spindle is equally unreachable from a phone. Encrypted rooms therefore work
mesh-wide and internet-wide separately, not across. This is Element's
"dead drops" problem, named in their own P2P roadmap; fixing it means a
store-and-forward for to-device EDUs at the gateway, which does not exist in
any of these repositories yet.
