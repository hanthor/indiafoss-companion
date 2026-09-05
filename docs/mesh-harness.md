# The mesh harness: many nodes, on a network that is not loopback

`docs/neutrino-scale.md` answers "can one machine run N Neutrino homeservers".
It can: 100 nodes, staggered, all join, p50 fan-out 573 ms. That is a real
question and the answer is encouraging, but it is measured on **raw loopback**,
where a round trip costs about 0.1 ms. A conference room does not run on
loopback. `docs/mesh-protocol.md` §2.1 describes three transports that differ
"by orders of magnitude", and names Bluetooth LE as the genuine fallback.

This harness runs the same swarm over a **chosen transport**, so the number that
comes out is about the venue rather than about the loopback interface. The
answer it gives is much less encouraging, which is the point.

## What it is

| Piece           | File                                     | What it does                                                                                                                       |
| --------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `mesh-swarm`    | `tools/neutrino-probe/src/mesh-swarm.ts` | The same measurement over the **real** iroh medium (`neutrino-lan`), with mDNS discovery and nothing seeded.                       |
| `ShapedLink`    | `tools/neutrino-probe/src/link.ts`       | A TCP proxy that adds delay, jitter, loss and a bandwidth ceiling to everything crossing it, and can be cut and healed at runtime. |
| `LINK_PROFILES` | same                                     | `lan`, `wifi`, `wan`, `ble`, `bleMultiHop` — the transports the mesh-protocol doc names, as numbers.                               |
| `NeutrinoNode`  | `tools/neutrino-probe/src/nodes.ts`      | One homeserver process plus its shaped link. Start, stop (crash), restart on the same storage, register a user, drive the CS API.  |
| `Swarm`         | same                                     | N nodes with an optional gateway tier.                                                                                             |
| `runSwarm`      | `tools/neutrino-probe/src/swarm.ts`      | One scenario end to end: create, invite, join, fan out, measure.                                                                   |

It replaces three copies of the same code: `two-nodes-restart.e2e.test.ts`,
`two-nodes-reinstall.e2e.test.ts` and `scripts/swarm.mjs` each carried their own
`startNode`/`stopNode`/`up` with their own hardcoded port block (8018, 8028,
9100+i), so two harnesses could not run concurrently and a fix to one never
reached the others. Ports are now allocated from the OS.

### How shaping reaches federation traffic

A node **binds** a private backend port but **advertises** its proxy's port as
`NEUTRINO_SERVER_NAME`. Everything a peer sends — invites, joins, PDUs — is
dialled at the advertised address and therefore crosses the shaped proxy, while
the harness's own bookkeeping talks to the backend directly and pays nothing.
(A test's own polling should not be charged BLE latency.) This is the same
advertise/bind trick upstream's `neutrino-testkit` uses for partitions.

`shaped-federation.e2e.test.ts` is the proof that the wiring is real: it asserts
an invite and a message cross the proxy, that cutting the link stops delivery,
and that healing drains the outbox. Without that test every latency number here
could be measuring an unshaped path.

## Running it

```sh
# Build the fork once (patches/neutrino/version.json pins the rev).
git clone -b e2ee-key-transport https://github.com/hanthor/neutrino
cd neutrino && cargo build --release -p neutrino

export NEUTRINO_BIN=$PWD/target/release/neutrino

# One scenario.
pnpm --filter @indiafoss/neutrino-probe swarm -- --size 24 --profile ble

# A venue: 3 gateways on the uplink, 21 handsets on BLE.
pnpm --filter @indiafoss/neutrino-probe swarm -- \
  --size 24 --profile ble --gateways 3 --gateway-profile wifi --stagger 250
```

Flags: `--size`, `--profile`, `--gateways`, `--gateway-profile`, `--stagger`,
`--timeout`, `--bin`. Everything is torn down on exit, including on failure.

The unit tests (`link.test.ts`) need no binary and run in the ordinary
`pnpm -r test` sweep; the e2e suites skip themselves unless `NEUTRINO_BIN` is
set, so a contributor without a Rust toolchain still sees green.

## The shaped swarm measures the homeserver, not the medium

Read the next section with this in mind, because it undercuts it.

`swarm.ts` drives `neutrino`'s own binary, which federates over plain HTTP and
carries **no iroh medium at all**. The transport a phone actually uses — iroh
QUIC, CoAP block framing through the `neutrino-lb` sidecar, peers found by mDNS
rather than seeded — is not in those numbers. Neither is it in
`docs/neutrino-scale.md`.

`mesh-swarm.ts` drives the real medium (`neutrino-lan`, see
[hanthor/neutrino-iroh#1](https://github.com/hanthor/neutrino-iroh/pull/1)), and
the difference is not a rounding error:

| 8 nodes, one message                  | Fan-out p50  |
| ------------------------------------- | ------------ |
| shaped loopback, `lan` profile (HTTP) | 187 ms       |
| **real iroh medium** (release build)  | **2,786 ms** |

Roughly 15× slower, on loopback, with no radio in the picture. This is not a
debug-build artefact: a debug `neutrino-lan` measured 3,290 ms and release only
2,786 ms, so ~15% of it is optimisation and the rest is the medium. Treat every
shaped number below, and every figure in `neutrino-scale.md`, as a bound on the
homeserver rather than a prediction about the product.

## What the real medium does

`pnpm --filter @indiafoss/neutrino-probe mesh-swarm -- --size 8`, release
`neutrino-lan`, one room, one message, nothing seeded — peers find each other
over mDNS the way handsets on venue Wi-Fi would.

| Nodes | Invites accepted  | Joined | Fan-out p50 / p90 | Undelivered |
| ----- | ----------------- | ------ | ----------------- | ----------- |
| 2     | 1/1, instant      | 1/1    | sub-second        | 0           |
| 8     | **6/7**, 60.2 s   | 6/7    | 2,786 / 3,198 ms  | **0/6**     |
| 16    | **14/15**, 60.5 s | 14/15  | 2,924 / 10,089 ms | **0/14**    |

**Everything that joins, receives.** Zero undelivered at both sizes — the
shaped-BLE model predicted total fan-out failure at 24, and the real medium
shows no sign of that at 16.

**But exactly one invite fails per run, at any size.** Always
`502 M_UNKNOWN: could not reach the invitee's server` after ~60 s; the peer
varies between runs (node 5, then 3, then 1), and the count stays at one whether
there are 8 nodes or 16. Reproduced on four consecutive release runs. Discovery
is _not_ the cause — the host had already discovered the peer that later failed.
The failure is one layer down:

```
neutrino_lb::transport::coap::datagram: coap request to <peer> exceeded 60s
```

`CONNECT_TIMEOUT` is 30 s and the CoAP request timeout 60 s, so the dial failed
first and CoAP retried into its own ceiling.

**Do not yet read this as a mesh defect.** All nodes here run on one host and
advertise the _same three IPs_ (`192.168.68.56`, a tailscale address, and the
`10.88.0.1` podman bridge), differing only by port. iroh is built around one
endpoint per host with per-address path selection and holepunching; eight
endpoints behind identical addresses is not a topology a venue produces, where
every phone has its own IP. Two data points fit "rig artefact" better than
"capacity limit": a 2-node run federates instantly and cleanly, and a 16-node
_debug_ run got 15/15 invites through. A real scale problem would not skip 16.

Settling it needs two machines — which is the same thing that settles Android
path selection when BLE and IP are both live.

## What the shaped swarm found

Measured on this machine (4-core), release build at patch 0011, one room, one
message, 60 s deadline. These are the numbers **after** the connection-loss fix
below; the earlier per-chunk-loss runs are not comparable and were discarded.

| Scenario                    | Invites sent  | Joined | Fan-out p50 | Undelivered |
| --------------------------- | ------------- | ------ | ----------- | ----------- |
| 8 nodes, `lan`              | 7/7, 70 ms    | 7/7    | 187 ms      | 0/7         |
| 8 nodes, `ble`              | 7/7, 4.4 s    | 7/7    | 3,254 ms    | 0/7         |
| 16 nodes, `ble`             | 14/15, 9.2 s  | 14/15  | 2,342 ms    | 0/14        |
| 24 nodes, `ble`             | 23/23, 14.6 s | 22/23  | —           | **22/22**   |
| 24 nodes, `ble` + 3 gateway | 23/23, 13.1 s | 23/23  | —           | **23/23**   |

Four things worth keeping:

**BLE is not a constant factor, it is a cliff, and the edge is between 16 and 24
members.** At 8 and at 16 nodes the room works: everything arrives, roughly 12–17×
slower than LAN, and 16 is actually _faster_ per-message than 8 (2.3 s vs 3.3 s
p50 — the fan-out overlaps). At 24 on the same profile the message reached
**nobody** inside 60 seconds. Re-run after the loss-model fix with all 23 invites
delivered and 22 nodes joined, so it is a property of the room, not a harness
artefact. The loopback numbers in `neutrino-scale.md` would have called 24
comfortable. A conference session room is bigger than 24 people.

**Better links for a few nodes do not fix fan-out.** Giving 3 of the 24 nodes a
`wifi` profile improved everything about _membership_ — 23/23 invited, 23/23
joined, 24/24 members visible, versus 22/23 and 23/24 flat — and changed message
delivery not at all. That is the case for the gateway topology in
`conference-spindle.md` stated precisely: gateways are worth having because
traffic is _routed_ through them, not because three nodes have better radios.
Neutrino fans out peer-to-peer to every member, so the sender still pays 23 slow
deliveries either way.

**Invite fan-in degrades before message fan-out does.** Inviting 23 peers took
~15 s of wall clock on BLE because the host issues them serially and each pays a
federation round trip. That is a client-side shape and is fixable without
touching the protocol.

**Failures must be recorded, not thrown.** An early run aborted on
`M_UNKNOWN: could not reach the invitee's server` — which is not a harness bug,
it is the result. The runner now counts unreachable invites, undelivered
invites, failed joins and undelivered messages separately, so a degraded run
produces a row in the table instead of a stack trace.

## Network simulation: two modes, one of them unavailable here

The default is the **userspace proxy** above: unprivileged, portable,
CI-friendly, and faithful for per-link RTT, jitter and a bandwidth ceiling. It
shapes per chunk with backpressure, so a large federation transaction pays the
ceiling repeatedly the way it would on a real slow link, rather than once.

**Loss is modelled per connection, not per packet, and that is a deliberate
limit rather than an approximation.** A userspace proxy sits above TCP: by the
time a chunk reaches it the sender's kernel has already been ACKed, so dropping
those bytes provokes no retransmit — it strands the stream and the request hangs
until an outer timeout. The first version of this module did exactly that, and
on the 2% `ble` profile it stalled roughly one request in fifty and quietly
poisoned every measurement taken through the link (CI caught it as a timing test
timing out). Loss is now sampled once, when a connection is opened: the dial
fails, the peer sees a reset, and its federation retry does what it really
would. One consequence worth knowing: HTTP keep-alive pools connections, so a
client that reuses a socket samples the loss far less often than a packet-level
model would — connection loss is the honest thing this layer can do, not the
faithful one.

The higher-fidelity mode is **containers with real `tc netem` qdiscs**, which
models kernel-level queueing, correlated loss and true bandwidth far better than
a userspace proxy can. It is **not usable on this machine**: rootless podman does
grant `NET_ADMIN`, but the host kernel has no `sch_netem` module at all
(`modinfo sch_netem` → not found), and loading one needs root. On Fedora that is
`kernel-modules-extra`. Until then the proxy is the only mode, and its limits
should be stated plainly: it shapes at the application layer, so it cannot model
queue behaviour, and its loss is per-chunk rather than per-packet.

## What is still not covered

- **No Spindle in the loop.** `spindle-contracts.yml` builds and runs a Spindle,
  but only against the single-node contract subset; nothing runs mesh nodes and
  a Spindle together. That is blocked upstream anyway — see
  [#129](https://github.com/hanthor/indiafoss-companion/issues/129): Neutrino
  speaks only `org.matrix.msc4242.12` and signs nothing, Spindle speaks v11/12
  and verifies everything, so they cannot federate today at any latency.
- **The gateway tier is modelled but not routed.** `--gateways` gives the first
  N nodes a better transport, which is the venue's _shape_; it does not force
  handsets to reach the room _through_ a gateway, because Neutrino federates
  peer-to-peer with everyone in the room. Proving the topology in
  `conference-spindle.md` needs routing control the harness does not have yet.
- **No BLE gossip model.** Real BLE is a shared, contended medium; every link
  here is independent. The `ble` numbers are therefore optimistic.
- **Not run in CI.** The scenarios take minutes and need the Rust toolchain; the
  unit tests run everywhere, the swarm is run by hand.
