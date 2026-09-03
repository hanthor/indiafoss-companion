# 0003 — Mesh ↔ internet interop is native federation, not a bridge

- Status: **Accepted**
- Date: 2026-09-02
- Deciders: James (maintainer)
- Related: [ADR 0001](0001-native-android-client-standalone-vs-neutrino-fork.md),
  [neutrino-capabilities.md](../neutrino-capabilities.md),
  [p2p-matrix-state-of-the-art.md](../p2p-matrix-state-of-the-art.md), issue #11

## Context

Mesh rooms run on phones: Neutrino over iroh over Bluetooth LE, with no
internet. Everyone else — PWA users, laptops, anyone who has gone home — is
structurally excluded, because a browser cannot open a BLE socket or an iroh
QUIC endpoint. Bridging that gap needs a resident node that is in the mesh and
on the internet at once; [`tuna-os/spindle`](https://github.com/tuna-os/spindle),
a Rust homeserver whose storage model suits constrained links, is the candidate
we approached.

Two shapes were on the table.

**A portal bridge as a Matrix appservice.** Cheap: Spindle already supports
appservices, so it needs no changes at all, and an out-of-process bridge keeps
Neutrino's AGPL code out of an MIT/Apache binary. This was the previous
recommendation.

**Native federation.** Expensive: it needs room-version convergence, event
signatures Neutrino does not yet produce, and device-key and to-device
federation Neutrino does not yet expose.

## Decision

**Mesh rooms reach the wider Matrix world by federation. We will not build a
portal bridge.**

The deciding argument is encryption, not cost. **A portal bridge is where
end-to-end encryption ends**: it must decrypt on one side to re-encrypt on the
other, making the bridge a party to every conversation it carries. For a
conference companion whose entire privacy story is "nothing leaves your phone",
shipping a component that reads every mesh message is the wrong trade — and no
amount of careful operation makes it not-a-party.

Federation does not have this property. Servers relay key material and
ciphertext; the plaintext exists only on the participants' devices.

## Consequences

### The work, and who owns it

Measured from Spindle's `SPEC.md` and by probing a locally built Neutrino:

| Capability                                                         | Spindle     | Neutrino                           |
| ------------------------------------------------------------------ | ----------- | ---------------------------------- |
| C-S E2EE endpoints                                                 | full        | `claim` and `sendToDevice` are 404 |
| Federation `/user/keys/query`, `/user/keys/claim`, `/user/devices` | full (§740) | none registered                    |
| `m.direct_to_device` / `m.device_list_update` EDUs                 | full (§743) | none                               |

Every Neutrino row above is now written, as three patches in
[`patches/neutrino/`](../../patches/neutrino/README.md) — `m.device_list_update`
excepted — and verified against two servers on loopback. The table describes
stock Neutrino, which is what a peer meets until a build carries the patches.
| Event signatures | signed and verified | neither |
| Room versions | 6–12, plus `org.matrix.msc3995.v1` | `org.matrix.msc4242.12` only |

**For E2EE specifically, Spindle already has everything and the work is
entirely Neutrino's.** That is the finding that makes this decision affordable
at all: we are not asking anyone to build an encryption path, only to relay one.

### Negative

- **Much further off than a bridge.** Three blockers stand between here and a
  working federation: room-version convergence, event signing, and the
  federation key/to-device surface. Two of the three are upstream's.
- **It depends on two projects we do not control** — Element for Neutrino,
  tuna-os for Spindle. The RFC asks Spindle which convergence they would
  accept rather than presenting one.
- **No interim interop.** Until this lands, mesh conversations stay on the
  mesh, and people not physically present use the ordinary Matrix rooms on
  `reilly.asia` instead. That is a real gap we are choosing to leave open.

### Positive

- Mesh conversations can be end-to-end encrypted for real, not
  encrypted-except-at-one-hop.
- No always-on component of ours reads conference chat.
- Nothing puts AGPL Neutrino code into an MIT/Apache codebase: federation is a
  wire protocol, not a link-time dependency.

## Alternatives considered

**Portal bridge (rejected).** Cheapest and needs nothing from Spindle, but
terminates E2EE at the bridge. Rejected on that ground alone; every other
property was favourable.

**Spindle implements MSC4242 (not proposed).** Importing an experimental
state-DAG room version into a server built to keep state resolution off the hot
path is backwards, and MSC4242 is a moving target while Hydra phase 3 is active
research.

**Do nothing; keep the mesh isolated (the current state).** Remains the
fallback if the RFC is declined. The ordinary Matrix rooms already serve people
who are not in BLE range, so nobody is left with nothing.

## Follow-ups

- RFC filed with `tuna-os/spindle` asking which convergence they would accept —
  Linearized Matrix (MSC3995), which both projects already touch, is our
  preferred candidate.
- ~~Neutrino work is gated on a fork we can push to.~~ Written as patches
  instead (`patches/neutrino/`): the device directory keyed on the real
  `device_id`, one-time key storage with `/keys/claim`, `/sendToDevice` with
  `to_device` delivery in sync, and the federation key + to-device surface.
  They are carried on the `hanthor/neutrino` fork for our own builds and
  deliberately **not** offered upstream: Element's policy on AI-assisted
  contributions is unknown, and a research project should not have to field a
  conference app's experiments.
- Neutrino's `/capabilities` mismatch (it claims plain room version 12 while
  creating `org.matrix.msc4242.12`) is recorded in `neutrino-capabilities.md`
  and, for the same reason, not reported upstream.
