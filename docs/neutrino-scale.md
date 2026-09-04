# Neutrino at conference scale: what a loopback swarm says about 3,000 attendees

The question was whether the mesh can be scale-tested before the conference,
and what 3,000 attendees would do to it. The radio cannot be simulated on a
server, but the homeserver can: the dev binary runs as many nodes as a
machine has memory for, federating over loopback. That measures the server's
own cost per node, the join and fan-out behaviour of one room, and the
shape of the failure when a crowd arrives at once. It says nothing about
Bluetooth throughput, which is the other half; see the end.

Harness: `node tools/neutrino-probe/scripts/swarm.mjs <N> <neutrino binary>
[join stagger ms]`. N nodes on loopback, one user each, one room created on
node 0, everyone invited from node 0, everyone joins (all at once, or one
every _stagger_ milliseconds), then node 0 sends one message and every
other node is polled until it arrives. Run on a 4-core, 15 GB machine with
the release build of the fork at patch 0011.

## Numbers

| Nodes | Joins         | Joined within timeout | Room converged on node 0 | Message reached every node     | Resident memory per node |
| ----- | ------------- | --------------------- | ------------------------ | ------------------------------ | ------------------------ |
| 20    | all at once   | 18 of 19              | 20 s                     | p50 161 ms, one node never     | 21 MB                    |
| 50    | all at once   | 29 of 49              | not within 2 min         | none within 2 min              | 27 MB (peak 34)          |
| 100   | all at once   | 47 of 99              | 132 s                    | none within 2 min              | 85 MB (peak 111)         |
| 50    | one per 0.5s  | 49 of 49              | 24 s (the stagger)       | p50 162 ms, p90 192 ms, all 49 | 19 MB                    |
| 100   | one per 0.25s | 99 of 99              | 44 s (the stagger)       | p50 573 ms, p90 678 ms, all 99 | 28 MB (peak 50)          |

Invites are cheap in every run: 99 invites reach 99 nodes over federation
in under 100 ms. Disk is about 2 to 4 MB per node.

## What it means

**A join storm is the failure mode, not steady state.** A join is a state
event that node 0 must apply and then fan out to every member, and every
member must apply; a burst of N joins is N² work across the mesh in a few
seconds. Neutrino's federation join has a 20 s ingest deadline
(`JOIN_INGEST_TIMEOUT`); past it the joiner sees `504 M_UNKNOWN: timed out
applying room state; the join is still being processed`, and node 0 keeps
digesting for minutes while nothing else in the room moves. Spread the
same joins over seconds and everything is fine: at 50 nodes joining one
every half second, every join lands and a message reaches all 49 others in
under 200 ms.

**Steady state is small.** Per node, the homeserver is about 20 MB resident
and a few MB on disk, and a message fans out to 49 peers in a fifth of a
second on loopback. The phone is not the bottleneck; the radio and the
crowd's arrival pattern are.

**Rooms must stay small on the mesh.** Fan-out is per destination: a room
of M members costs the sender M transactions per message, and every member
holds the room's state. A room with all 3,000 attendees is out of the
question over Bluetooth, whatever the server does. The shapes that fit:

- direct messages (two nodes);
- per-session rooms of tens to low hundreds, which the app already derives
  per talk, booth and venue room;
- the announcements room as a hub-and-spoke problem for the conference
  Spindle, not a mesh room, until mesh ↔ Spindle federation exists.

**The conference Spindle is the answer to the big room.** Linearized Matrix,
the convergence the RFC asks Spindle for first, is hub-based: a phone sends
to the hub, and the hub fans out. That turns the M-transactions-per-message
cost on the phone into one, which is exactly what a 3,000-person
announcements room needs. This is the strongest argument in the RFC and it
comes from these numbers.

## What to do before the conference

1. **Rate-limit joins in the app, not the server.** When a session room is
   opened by a crowd (a talk starting), join with a random delay of up to a
   few seconds rather than immediately. Cheap, client-only, and it turns the
   storm into the staggered case above.
2. **Keep session rooms per session, not per track.** A hundred members is
   the working ceiling to design for on the mesh; the harness shows a
   hundred converging when joins are spread, and failing when they are not.
3. **Measure the radio with real phones.** Ten to twenty phones in one room
   at the venue, the app's mesh peers list, one message per second from one
   phone: that gives bytes per second per BLE link and the hop latency, the
   two numbers this note cannot produce. The harness gives the server side;
   the phones give the rest.
4. **Raise the join ingest deadline on the fork, or make the joiner retry.**
   The 20 s deadline is fine for a phone joining one room; under a crowd it
   turns a slow join into a failed one that the client then has to repeat.
   A retry with backoff on `504` in `joinOrCreateRoom` costs nothing.

## The venue topology, confirmed from the other side

Spindle's answer to our RFC (`docs/spindle-rfc.md`) reaches the same
conclusion from the server end, and states it more sharply: a homeserver
fans every event out to every server with a member in the room, so one
message in a venue room of 3,000 phones is 3,000 transactions, most of them
to phones that are out of range at that moment. "Three thousand outboxes
backing off is not a homeserver, it is a port scanner."

So the shape for the conference is **a handful of venue gateways**: three to
five Neutrino nodes carrying the venue's uplink (a laptop or a small machine
at the registration desk), which are the conference Spindle's only
federation peers. Phones federate over the mesh with each other and with the
gateways; the gateways federate with the Spindle. The Spindle then waits on
three to five peers it can be patient with, rather than thousands.

That leaves the honest open question exactly where our own measurements put
it: whether Bluetooth gossip carries 3,000 nodes at all. Nothing in this
harness answers that, and only a real crowd will.

## Re-running

```bash
# In the neutrino checkout: a release binary of the fork.
cargo build --release --bin neutrino
# 50 nodes, joins half a second apart.
node tools/neutrino-probe/scripts/swarm.mjs 50 ../neutrino/target/release/neutrino 500
```

Each node listens on `127.0.0.1:9100+i`; the run leaves nothing behind but
`/tmp/swarm` (or `SWARM_ROOT`). A hundred nodes need about 2 GB of memory
during a burst and a fraction of that once settled.
