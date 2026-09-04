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

| Piece           | File                                | What it does                                                                                                                       |
| --------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ShapedLink`    | `tools/neutrino-probe/src/link.ts`  | A TCP proxy that adds delay, jitter, loss and a bandwidth ceiling to everything crossing it, and can be cut and healed at runtime. |
| `LINK_PROFILES` | same                                | `lan`, `wifi`, `wan`, `ble`, `bleMultiHop` — the transports the mesh-protocol doc names, as numbers.                               |
| `NeutrinoNode`  | `tools/neutrino-probe/src/nodes.ts` | One homeserver process plus its shaped link. Start, stop (crash), restart on the same storage, register a user, drive the CS API.  |
| `Swarm`         | same                                | N nodes with an optional gateway tier.                                                                                             |
| `runSwarm`      | `tools/neutrino-probe/src/swarm.ts` | One scenario end to end: create, invite, join, fan out, measure.                                                                   |

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

## What it found

Measured on this machine (4-core), release build at patch 0011, one room, one
message, 60–90 s deadlines.

| Scenario        | Invites   | Joined | Fan-out p50 | Undelivered |
| --------------- | --------- | ------ | ----------- | ----------- |
| 8 nodes, `lan`  | 70 ms     | 7/7    | 187 ms      | 0           |
| 8 nodes, `ble`  | 4,108 ms  | 7/7    | 2,864 ms    | 0           |
| 24 nodes, `ble` | 13,932 ms | 21/23  | —           | **23/21**   |

Three things worth keeping:

**BLE is not a constant factor, it is a cliff.** At 8 nodes the room still works
— everything arrives, just 15× slower. At 24 nodes on the same profile the
message reached **nobody** inside 90 seconds, and two joins failed outright. The
loopback numbers in `neutrino-scale.md` would have predicted 24 nodes to be
comfortable; on the transport the venue will actually use, it is past the cliff.

**Invite fan-in degrades before message fan-out does.** Inviting 23 peers took
14 seconds of wall clock on BLE because the host issues them serially and each
one pays a federation round trip. That is a client-side shape, and it is fixable
without touching the protocol.

**Failures must be recorded, not thrown.** The first gateway run aborted on
`M_UNKNOWN: could not reach the invitee's server` — which is not a harness bug,
it is the result. The runner now counts unreachable invites, undelivered
invites, failed joins and undelivered messages separately, so a degraded run
produces a row in the table instead of a stack trace.

## Network simulation: two modes, one of them unavailable here

The default is the **userspace proxy** above: unprivileged, portable,
CI-friendly, and faithful enough for per-link RTT, jitter, loss and a bandwidth
ceiling. It shapes per chunk with backpressure, so a large federation
transaction pays the ceiling repeatedly the way it would on a real slow link,
rather than once.

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
