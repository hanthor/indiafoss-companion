# P2P Matrix: where the work is, September 2026

Notes from reading the current primary sources, kept because the companion's
mesh mode rides on this work and it moves fast. Everything below is dated and
sourced; nothing is inferred from memory.

## The short version

P2P Matrix restarted in 2026 after the Dutch Government funded Element to
resume it ([TWIM 2026-07-10](https://matrix.org/blog/2026/07/10/this-week-in-matrix-2026-07-10/)).
The current stack is the one we already build against: **Element X Android →
embedded Neutrino → CoAP over iroh over Bluetooth LE**. Matthew's framing is
worth quoting because it sets expectations:

> "P2P Matrix is back. It's early days … explicitly not yet secure and ready
> for use on untrusted networks."

The live tracker is [arewep2pyet.com](https://arewep2pyet.com/).

## What the tracker says is missing

As of its June 2026 state:

- event signature signing and verification in Neutrino;
- a complete Power DAG, so authorisation needs no API calls;
- **P2P ↔ normal Matrix bridging infrastructure**;
- push notification delivery to P2P devices;
- better federation routing for large rooms.

Two of those matter directly to us. The bridging gap is exactly what the
Spindle RFC proposes to fill, which is reassuring: it is a known hole in the
official picture rather than an idea of our own. And "not secure / no
signatures" is the same thing our probe sees at startup
(`sign_messages: false`) — see [neutrino-capabilities.md](neutrino-capabilities.md).

## Project Hydra, and why Neutrino's room version is odd

[Hydra](https://matrix.org/blog/2025/08/project-hydra-improving-state-res/) is
the effort to make federation harder to corrupt. Phase 1 shipped in **room
version 12**:

- **MSC4297** — state resolution v2.1, replaying the conflicted state subgraph
  to stop state resets;
- **MSC4289** — formalised creator power, adding an `owner` power level (150);
- **MSC4291** — room ids cryptographically bound to the create event, so a room
  cannot be hijacked by a second create.

Phase 2 is **state DAGs (MSC4242)**, which is what Neutrino implements and
announces at startup as `org.matrix.msc4242.12`. That is why a Neutrino room
cannot simply federate with an ordinary homeserver: Spindle, for instance, does
room versions 11 and 12.

Phase 3 is research, and the paper is out.

## ERA: the newest idea, and it is about our exact problem

[ERA: Epoch-Resolved Arbitration for Duelling Admins in Group Management
CRDTs](https://arxiv.org/pdf/2601.22963) (PaPoC '26,
[ACM](https://dl.acm.org/doi/10.1145/3806077.3806691)) tackles what happens
when two admins issue contradictory membership or power changes **while
partitioned** — the merge can make the materialised view appear to roll back
changes that were already applied.

Partition is not an edge case at a conference: it is the normal state of a BLE
mesh, where people walk out of range mid-conversation and rejoin later. ERA
divides changes into **epochs**, requires agreement before an epoch advances,
and treats contradictions inside one epoch as genuine conflicts to arbitrate
rather than silently merge.

This is server-side state-resolution work — not something the companion can
implement — but it is the reason to expect Neutrino's room model to keep
moving, and an argument against us building anything that assumes today's
state semantics are final.

## What we could actually implement, and what we did

Most of the above is upstream Rust. Exactly one item was ours to take, and it
is the one that matters most on a mesh:

**Simplified Sliding Sync (MSC4186).** Neutrino advertises
`org.matrix.simplified_msc3575` in `/versions` and serves
`/_matrix/client/unstable/org.matrix.simplified_msc3575/sync`; Synapse has
supported it natively since 1.114, and Element X uses it. Our client was on
legacy `/sync`, which ships **every room's state on the first sync** — the
worst possible shape for a link measured in kilobytes per second.

`packages/matrix` now prefers sliding sync wherever a server offers it and
folds the response into the `/sync` shape the session layer already reads, so
only `http.ts` knows which sync a server speaks. A server that advertises the
flag and then refuses the call drops back to legacy once, permanently, rather
than failing every sync. Covered by unit tests for the fold and an e2e test
that both paths report the same room.

## Not worth doing yet

- **Chasing MSC4242 / state DAGs in our client.** We do not implement room
  versions; the server does. Nothing to do.
- **Anything assuming Neutrino's federation is stable.** Phase 3 is an active
  research programme; the wire format will move.
- **Building on unsigned events as if they were authentic.** Until signing
  lands, mesh content is trustworthy only because everyone in the room scanned
  each other's QR codes in person. That is a real property, but it is a social
  one, not a cryptographic one.

## Sources

- [arewep2pyet.com](https://arewep2pyet.com/) — the P2P tracker
- [TWIM 2026-07-10](https://matrix.org/blog/2026/07/10/this-week-in-matrix-2026-07-10/) — P2P is back
- [TWIM 2026-08-07](https://matrix.org/blog/2026/08/07/this-week-in-matrix-2026-08-07/) — local-first talk, ERA
- [Project Hydra](https://matrix.org/blog/2025/08/project-hydra-improving-state-res/) — phases 1–3
- [ERA paper](https://arxiv.org/pdf/2601.22963) — epoch-resolved arbitration
- [MSC4186](https://github.com/matrix-org/matrix-spec-proposals/pull/4186) — Simplified Sliding Sync
- [element-hq/neutrino](https://github.com/element-hq/neutrino) · [neutrino-iroh](https://github.com/element-hq/neutrino-iroh)
