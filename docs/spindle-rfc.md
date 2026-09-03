# RFC: federating a Bluetooth-mesh Matrix (Neutrino) with Spindle for a conference

_To: the Spindle maintainers (`tuna-os/spindle`). From: the IndiaFOSS Companion
project (`hanthor/indiafoss-companion`). Status: request for comments._

## Summary

We run Matrix rooms on phones with no internet: Neutrino (Element's P2P
homeserver) over iroh over Bluetooth LE, one homeserver per phone, federating
phone to phone. We would like those rooms to reach the rest of Matrix through a
Spindle that we host for the conference, so that people at home take part in
the same rooms as people at the venue, and so that a phone that comes back
online catches up from the Spindle rather than from whichever phones happen to
be near.

We have decided against a portal bridge (an appservice that copies events
between the two worlds), because a bridge has to decrypt on one side to
re-encrypt on the other and becomes a party to every conversation. We want
plain federation: the Spindle relays ciphertext and key material, and the
plaintext exists only on the participants' devices. Spindle already has the
whole federation surface that needs; the gaps are on the Neutrino side, and
this RFC asks which way you would rather we close them.

## Where the two sides stand

Measured from Spindle's `SPEC.md` and by probing Neutrino builds on loopback
(stock, and with our patches):

| Capability                                                         | Spindle (per `SPEC.md`)                                                                  | Neutrino stock                              | Neutrino with our patches                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| Client-server E2EE endpoints                                       | full                                                                                     | `/keys/claim`, `/sendToDevice` are 404      | full, incl. per-device to-device delivery |
| Federation `/user/keys/query`, `/user/keys/claim`, `/user/devices` | full                                                                                     | none                                        | full                                      |
| `m.direct_to_device`, `m.device_list_update` EDUs                  | full                                                                                     | none                                        | full                                      |
| Event signatures                                                   | signed and verified                                                                      | neither (`sign_messages: false` at startup) | neither                                   |
| Room versions                                                      | 11 and 12 per the README; `SPEC.md` also lists Linearized Matrix `org.matrix.msc3995.v1` | `org.matrix.msc4242.12` only (state DAGs)   | `org.matrix.msc4242.12` only              |
| Media                                                              | full                                                                                     | none                                        | full, capped at 256 KiB, federated        |

Our patches are eleven commits on a Neutrino fork
(`patches/neutrino/` in our repository), each verified with two phones-worth
of nodes on loopback and with the Matrix Complement suite (59 allowlisted
tests green). They are all client-server and federation surface; none of them
touches room versions or signing.

So two blockers remain, and both are structural rather than missing endpoints:

1. **Room version.** Neutrino only creates and joins
   `org.matrix.msc4242.12` rooms (Project Hydra phase 2, state DAGs). Spindle
   speaks 11 and 12, and its spec names Linearized Matrix. Nothing in common.
2. **Signatures.** Neutrino neither signs nor verifies events or federation
   requests; trust on the mesh is transport-attested (the iroh connection is
   authenticated by the node key). Spindle rightly verifies everything.

## What we are asking

**Which convergence would you accept?** Three shapes we can see, in our order
of preference:

1. **Linearized Matrix (MSC3995) on the Neutrino side.** Spindle's spec
   names it, and its native rooms are already chains ("a chain is a valid
   DAG", per the README), which is the same shape. A Neutrino room federated with a Spindle would be a linearized room
   whose hub is the Spindle; phone-to-phone rooms stay MSC4242. Neutrino would
   gain a second room version, signing of the events it originates, and
   verification of what it receives. This is the largest change on our side
   and needs nothing from you beyond confirming that a conforming linearized
   participant that is intermittently reachable is welcome.

2. **Room version 12 on the Neutrino side**, with signing added. Neutrino's
   MSC4242 implementation is built on v12 and shares its auth rules, so a v12
   room with full state resolution is closer than it looks; but it puts state
   resolution back on the phone, which is what MSC4242 exists to avoid. Also
   nothing needed from you.

3. **MSC4242 on the Spindle side.** We are _not_ proposing this. Importing an
   experimental state-DAG room version into a server built to keep state
   resolution off the hot path is backwards, and MSC4242 is still moving.

Whichever you would accept, the questions that decide our design are:

- **Signature policy.** Would you federate with a server whose _older_ events
  in a room are unsigned (everything that happened on the mesh before the
  Spindle was reachable), provided every event it sends _to you_ is signed and
  every event you send it is verified? Or must the room's whole history verify,
  which means the mesh must sign from the first event?
- **Reachability.** A phone's homeserver is reachable only when the phone
  chooses to be, over whichever transport it has. Do you have, or want, a
  notion of a federation peer that is expected to be offline for hours and
  whose outbound transactions you should hold rather than fail? (Neutrino
  itself has an outbox with backoff for exactly this; we would like the
  Spindle side to be as forgiving.)
- **Server names and keys.** Neutrino server names are the node's public key
  (64 hex characters) or a configured name; there is no DNS. Would you accept
  a peer whose server name does not resolve, given a well-known or an explicit
  peer entry, and whose signing key is its node key?
- **Media.** Neutrino serves the federation media download
  (`multipart/mixed`) and caps content at 256 KiB. Is a per-peer size limit on
  what you fetch from us acceptable, and would you honour `M_TOO_LARGE` from
  us for anything above that?

## What we would host

A single Spindle for the conference, on the internet:

- The conference rooms live there: one room per session, booth and venue
  room, plus an announcements room the organisers own. Remote attendees join
  with their own Matrix account over ordinary federation, or with an account
  on the conference Spindle.
- Venue attendees use the same rooms on the mesh. Until the convergence above
  exists, the mesh and the Spindle are two worlds joined by people, not by
  federation, and our client shows which is which. Once it exists, the mesh
  becomes the offline copy of the Spindle's rooms, and the Spindle is the
  catch-up point for a phone that comes back online.
- We would run Spindle's federation against our patched Neutrino in CI, next
  to the Complement job we already run, so a change on either side shows up
  before the conference does.

## What we can offer

- A reproducible two-node Neutrino rig (loopback, patched) and the Complement
  configuration we use, so any convergence can be tested end to end without
  phones.
- The Neutrino-side implementation of whichever convergence you would accept,
  as patches we carry until Element takes them upstream.
- The conference itself as the field test: several hundred attendees on the
  mesh with a Spindle on the internet, for two days, with a client whose
  entire privacy story is that nothing leaves the phone in the clear.

## Timeline

We would like to know which shape you would accept before we start on the
Neutrino side, since the two options differ by a lot of work. The conference
Spindle for remote participation does not wait on any of this and we will
host it either way.

_Background in our repository: `docs/adr/0003-mesh-interop-by-federation-not-bridging.md`
(the decision and the capability table), `docs/p2p-matrix-state-of-the-art.md`
(Hydra, MSC4242, ERA), `patches/neutrino/README.md` (what each patch adds)._
