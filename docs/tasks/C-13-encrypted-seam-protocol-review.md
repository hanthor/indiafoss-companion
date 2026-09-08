# C-13 — Review the encrypted seam as a protocol before a line of it is written

- Status: Blocked — review before code (the protocol proposal must be written
  and accepted first)
- Repository: indiafoss-companion (the review and its proposal live here; any
  protocol work it later authorizes lands in the Rust repositories —
  [`neutrino`](https://github.com/hanthor/neutrino) and
  [`neutrino-iroh`](https://github.com/hanthor/neutrino-iroh) — **do not write
  Rust in this repository for it**)
- Tracks: [#176](https://github.com/hanthor/indiafoss-companion/issues/176)
- Size: L

> **This is a specification and review task, not an implementation task.** The
> deliverable is a written protocol proposal and an adversarial review of it.
> Nobody writes transport, relay or key-delivery code until that review is
> accepted. This ordering is the decision — see _Why the order matters_ below.

## Why this matters

An attendee in the hall sends a message to a colleague who is at home on
`matrix.org`. The mesh works; the uplink does not. For that message to arrive,
ciphertext has to cross from the venue mesh to the internet, later, through a
gateway that must not be able to read it — and the encryption keys have to make
the same journey, in a world where the two endpoints are never online at the
same time.

That is a cryptographic protocol problem, not a routing UI problem. Getting it
wrong has exactly two failure modes, and both are bad in ways an attendee cannot
see: messages that silently never arrive, or a venue gateway that can read
everybody's conversations while the app still shows a padlock. The second is
worse, and it is the one that gets built by accident when someone is trying to
make a demo work.

## Context you need

### What this seam is

Chat holds two kinds of account (ADR 0006): a _mesh account_
(`@n:<64-hex node key>`, whose homeserver is the embedded Neutrino on
loopback) and a _classic account_ on an ordinary homeserver over IP. The venue
gateway is a powered mesh node that also speaks federation
(`docs/test-gateway.md`).

The seam is the boundary between them. `docs/architecture/system.md` is explicit
that the diagrammed gateway edge is not a claim:

> The gateway edge above does not assert complete encrypted asynchronous
> delivery. Room federation, discovery, key exchange, and actual message
> decryption are separate acceptance gates.

ADR 0006 states the constraint the whole design is built around, as its first
of three determining facts:

> **Keys cannot cross the seam** (#176). A Megolm key share is a to-device EDU
> delivered origin→destination; phones never peer with the Spindle. One identity
> cannot span both worlds.

ADR 0006 then routes _around_ the problem — merging at the person layer instead
of solving key transport — and says so:

> - Relay key material across the seam (#176 stays open; this ADR routes around
>   it rather than solving it).

This task is the other path: actually solving it, starting with a proposal
nobody has written yet.

### What the architecture requires the proposal to specify

`docs/architecture/system.md`, "Rooms, federation and the encrypted seam". This
list is the specification's table of contents; every item is a required section:

> The asynchronous encrypted seam is its own protocol workstream (#176), not a
> routing UI task. Its proposal must specify authenticated origin/destination,
> encrypted durable envelopes, replay defense, bounded queues/expiry, idempotent
> forwarding, device-list changes, authorized key queries and one-time-key
> claims, and encrypted to-device delivery. Specify what a gateway can observe
> and what compromise/rotation does. Do not enroll the relay as a decrypting
> participant to make a demo work. Reuse Matrix cryptography and upstream
> mechanisms; review extensions before implementation.

Enumerated, so none can be quietly dropped:

1. authenticated origin and destination
2. encrypted durable envelopes
3. replay defense
4. bounded queues and expiry
5. idempotent forwarding
6. device-list changes
7. authorized key queries and one-time-key claims
8. encrypted to-device delivery
9. what a gateway can observe
10. what compromise or rotation does

### The required proof

Same section, and it is deliberately hard to pass:

> Required proof: a downstream phone and remote Matrix client exchange encrypted
> traffic in both directions through a gateway, with no simultaneous endpoint
> connectivity, after restart and key rotation. Direct patched gateway-to-Spindle
> success is useful but does not pass this scenario. Partitioned membership
> changes need explicit history/key-disclosure rules; revocation cannot
> retroactively erase plaintext already received.

Every clause of that sentence is load-bearing, and each one rules out a
plausible near-miss:

- **a downstream phone** — not the gateway acting on a phone's behalf;
- **and a remote Matrix client** — a real client on a real homeserver;
- **exchange encrypted traffic in both directions** — one direction working is
  half a protocol, and the harder direction is usually the other one;
- **through a gateway** — the store-and-forward hop is the point;
- **with no simultaneous endpoint connectivity** — the phone and the remote
  client are never online at the same moment. This is the entire difficulty. A
  test where both happen to be up is testing something else;
- **after restart** — the gateway is restarted mid-flight and the exchange still
  completes; durable means durable;
- **and key rotation** — keys rotate between the send and the receive.

And the explicit non-pass: **a direct patched gateway-to-Spindle success does
not pass this scenario.** It is worth doing and worth recording as evidence, but
it is not the proof. Anyone who reports it as the proof has moved the goalposts.

### The prohibition

Stated once in the architecture and repeated here because it is the thing that
will be tempting at 2am the night before a demo:

> Do not enroll the relay as a decrypting participant to make a demo work.

A gateway that joins the room as a member, or that holds Megolm keys, or that
re-encrypts on behalf of an endpoint, has solved nothing — it has built the
plaintext bridge that [ADR 0003](../adr/0003-mesh-interop-by-federation-not-bridging.md)
refused, and the review of 7 September records that refusal's ground: a
server-side bridge "would read every conversation". If the only way to make the
proof pass is to let the relay decrypt, then the answer is that the proof does
not pass, and that is the finding.

### Why the order matters

`docs/architecture/system.md` lists this among the decisions whose recommended
default is already stated: "protocol extensions reviewed before coding". The
same document's delivery table makes the sequence explicit:

> | Encrypted federation | Protocol review, then disconnected phone↔remote
> proof | Companion #176 |

Review, _then_ proof. Not a prototype that gets reviewed afterwards. Cryptographic
protocol mistakes are expensive to unwind once something depends on them, and
the review of 7 September notes that "Proposed cryptographic changes require
their own implementation and adversarial review."

### What already exists, and what it is not

- The **creation guard** shipped, and is a mitigation, not a solution. The
  review's triage for #176 records exactly this: "Retain as the cross-seam E2EE
  protocol project. Record that the creation guard is shipped; distinguish that
  mitigation from solving key delivery."
- The **cross-seam DM guard** in Chat (`StartDM.kt`, chat-android#40) refuses an
  encrypted DM from the mesh to an internet-only user. It is a stopgap that
  exists _because_ this problem is unsolved.
- The mesh E2EE work that has landed is within one world, not across the seam.
  `packages/test-fixtures/fixtures/capability-record/valid/release-evidence.json`
  records the honest current state of this capability:

  ```json
  {
    "name": "seam.encrypted.async",
    "supported": false,
    "level": "implemented",
    "limitations": "protocol review pending in #176; no disconnected-endpoint proof"
  }
  ```

  That entry must stay `"supported": false` until the required proof above
  passes. Changing it is a claim about attendees' phones (see **C-11**).

### The tooling that will eventually run the proof

Named here so the proposal can describe an executable scenario rather than an
aspiration. Do not run these as part of this task; the proposal must state which
of them the eventual proof uses and what it would have to add.

- `tools/neutrino-probe/` — `pnpm --filter @indiafoss/neutrino-probe swarm`
  (`src/swarm.ts`) and the shaped-link profiles in `src/link.ts`
  (`LINK_PROFILES`: `lan`, `wifi`, `wan`, `ble`, `bleMultiHop`). Documented in
  `docs/mesh-harness.md`.
- Existing end-to-end suites under `tools/neutrino-probe/src/`, notably
  `mesh-e2ee.e2e.test.ts`, `shaped-federation.e2e.test.ts`,
  `flaky-link.e2e.test.ts` and `two-nodes-restart.e2e.test.ts`. They self-skip
  unless `NEUTRINO_BIN` is set.
- The long-running gateway in `docs/test-gateway.md` (host `himachal`, client
  API on `:8008`, federation on `:8448` via the in-process CoAP sidecar).
- The pinned revision under review lives in `patches/neutrino/version.json`.

## What to do

The deliverable is `docs/mesh-e2ee-seam-proposal.md` (a new document) plus a
recorded review outcome on #176.

1. **State the threat model first**, before any mechanism. Who the gateway
   operator is, what they can see, what they can do if compromised, what a
   passive network observer at the venue sees, and what a malicious downstream
   phone can attempt. A protocol document whose threat model comes last was
   written backwards.

2. **Write one section per required item**, items 1–10 in the list above, in
   that order, each naming the Matrix mechanism it reuses. For each, state the
   upstream mechanism first and only then the extension, if any. The
   architecture's instruction is "Reuse Matrix cryptography and upstream
   mechanisms; review extensions before implementation" — so a section that
   proposes something new must justify why the upstream mechanism does not
   suffice.

3. **Be specific about the two hardest items.** They are:
   - **authorized key queries and one-time-key claims** (item 7). `/keys/query`
     and `/keys/claim` are synchronous request/response against a homeserver the
     phone cannot reach. Say what replaces them across a store-and-forward hop,
     how a claim is authorized, and what stops one-time-key exhaustion by an
     unauthorized claimant.
   - **encrypted to-device delivery** (item 8). Megolm key shares are to-device
     EDUs delivered origin→destination. Say precisely how a durable envelope
     carries one across a gateway without the gateway being able to open it, and
     what happens when the destination device no longer exists by the time it
     arrives.

4. **Specify what the gateway can observe** (item 9) as an explicit list, not a
   reassurance: which identifiers, which timings, which sizes, which room
   memberships. Then say which of those are acceptable and why. "Metadata" is
   not an answer; an enumeration is.

5. **Specify compromise and rotation** (item 10). What a compromised gateway can
   read retrospectively, what it can read going forward, what rotation fixes and
   what it cannot. Include the architecture's standing limit verbatim in
   substance: _revocation cannot retroactively erase plaintext already
   received._

6. **Specify partitioned membership changes.** Someone joins or leaves a room
   while the two halves of the seam are partitioned. State the history and
   key-disclosure rules for that case explicitly — the architecture flags it as
   needing explicit rules and nothing has written them.

7. **Define the proof as an executable scenario.** Write the required proof out
   as a runnable procedure: which components, which revisions, which network
   states in which order, how "no simultaneous endpoint connectivity" is
   enforced and observed rather than assumed, where the restart falls, where the
   rotation falls, and what output constitutes a pass. Name the harness pieces
   from _The tooling_ section above that it builds on, and name what does not
   exist yet and would have to be written.

8. **Write the adversarial review.** A section, not a separate document. At
   minimum: a gateway that keeps a copy of everything; a gateway that replays an
   old envelope; a gateway that drops selectively to force a downgrade; a phone
   claiming another phone's one-time keys; an envelope whose destination device
   was deleted; a rotation that races an in-flight envelope; and a queue filled
   to exhaustion by a malicious peer. For each, name the section that defeats it.
   An attack with no defeating section is an open problem and is listed as one.

9. **State plainly what you recommend not building.** If the honest conclusion is
   that the required proof cannot be passed within the September release, say so
   and say what should ship instead. The architecture already anticipates this
   answer: "Native iOS development and asynchronous relay must not block that
   release." A well-argued "not yet" is a successful outcome of this task.

10. **Record the review outcome on #176**, including the accepted proposal
    revision, the open problems, and whether implementation is authorized. Until
    that comment exists, no implementation task derives from this one.

## Acceptance

There is nothing to run; acceptance is a review.

- [ ] `docs/mesh-e2ee-seam-proposal.md` exists with a section for each of the
      ten required items, plus the threat model, partitioned membership, the
      executable proof scenario, the adversarial review, and an open-problems
      list.
- [ ] Every proposed extension to Matrix cryptography is named as an extension
      and justified against the upstream mechanism it replaces or supplements.
      A proposal that quietly invents crypto fails this check.
- [ ] The document states, in its own words, that the relay is never a
      decrypting participant, and its mechanisms are consistent with that
      throughout. If any mechanism requires the gateway to hold a room key, the
      document says so and the review rejects it.
- [ ] The proof scenario is written precisely enough that someone else could run
      it, and it explicitly rules a direct patched gateway-to-Spindle result
      insufficient.
- [ ] The maintainer has reviewed it and recorded acceptance or rejection on
      #176.

The negative case, which must hold for the whole duration of this task:

- `seam.encrypted.async` stays `"supported": false` in every capability record.
  No release note, screen, or issue comment claims cross-seam encrypted
  asynchronous delivery works.
- The cross-seam DM guard stays in place. Removing it is what Stage 1 of ADR
  0006 does on a _verified identity binding_, which is **C-12**'s subject and
  not a consequence of this task.

If the repository still typechecks and tests pass, that proves nothing about
this task — but the change should not touch code at all, so:

```bash
just typecheck
just lint
git diff --stat
```

`git diff --stat` should show documentation only.

## Out of scope

- **Writing the protocol.** No Rust, no relay code, no queue implementation.
  That work, if authorized, lands in
  [`neutrino`](https://github.com/hanthor/neutrino) /
  [`neutrino-iroh`](https://github.com/hanthor/neutrino-iroh) as a separate task
  after the review outcome is recorded on #176. `docs/tasks/README.md` rule 2
  applies: do not widen this.
- **The identity binding.** Who a person is, and whether two identities are one
  person, is **C-12** and #188. This task is about whether ciphertext can
  travel, not about whom it is addressed to.
- **Routing and fallback UI.** ADR 0006 Stage 1, and Chat #48's delivery
  contract (spec **X-02**). No routing decision may be justified by this
  proposal before its proof passes.
- **The venue gateway deployment, seeding and restart rehearsal.** That is
  **C-14** (#163/#165/#115). C-14 rehearses the gateway as infrastructure; this
  task decides what the gateway is allowed to do with the traffic.
- **The conference room directory and alias anchoring.** **C-06** (#166).
- **Federation of mesh rooms as such**, and remote Matrix participation in
  public conference rooms. Those are separable from cross-seam _encrypted_
  DMs — the review's triage for #115/#129 asks explicitly for them to be kept
  separate — and are owned by #115/#129 and C-14.
- **Changing `docs/architecture/system.md`.** If the proposal concludes that the
  required list or the required proof is wrong, say so in the proposal and on
  #176; the architecture document wins until it is deliberately amended
  (`docs/tasks/README.md` rule 4).
