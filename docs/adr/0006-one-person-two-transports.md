# 0006 — One person, two transports: seamless mesh ↔ Matrix in one app

- Status: **Proposed**
- Date: 2026-09-06
- Deciders: James (maintainer)
- Related: [ADR 0003](0003-mesh-interop-by-federation-not-bridging.md) (no
  bridging), [ADR 0005](0005-ios-mesh-chat.md), `docs/conference-spindle.md`,
  `docs/contact-sharing.md`, #111 (verified MXID link, **done**), #176 (the
  E2EE seam), hanthor/indiafoss-chat-android#40 (the cross-seam DM guard)

## Context

The chat app holds exactly one identity: the embedded mesh node's, forced at
login (`LoginFlowNode` replaces onboarding with an auto-submitting
`LoginPassword("n")`). `docs/messaging.md` still tells attendees to use "the
chat app for mesh identities, Element or similar for the public account" —
two apps for one person. That is the seam showing up in the product.

The attendee's day crosses it constantly:

- In the hall, uplink saturated: the mesh works, the internet does not.
- In the corridor, or on the train home: mesh peers are gone, the internet is
  back, and yesterday's mesh conversation is unreachable — and was only ever
  on one phone.
- A speaker who already has `@alice:matrix.org` wants to be reachable as
  themselves, and also reachable offline in the venue.

Three facts constrain any answer, and together they determine it:

1. **Keys cannot cross the seam** (#176). A Megolm key share is a to-device
   EDU delivered origin→destination; phones never peer with the Spindle. One
   identity cannot span both worlds.
2. **A server-side bridge is refused** (ADR 0003): it "would read every
   conversation". The mesh and the Spindle are "two worlds joined by people,
   not by federation".
3. **The binding between a person's two identities already exists.** #111
   shipped it: the app, signed into the real account, signs a statement over
   (mesh user id, mesh node key, real MXID, issued at) with that account's
   device key; a peer verifies it against the real homeserver's
   `/keys/query`. The companion's contact card already carries both ids
   (`X-INDIAFOSS-MESH`, `X-INDIAFOSS-MATRIX`) plus `X-INDIAFOSS-KEY` /
   `-SIG`, checked in person by the pixel key badge.

So the join belongs in the client, at the **person** layer, on a
cryptographic claim the person themselves made. Not in a server, not in the
protocol, and not by pretending one identity reaches both worlds.

## The analogy, and exactly where it stops

iMessage/SMS is the right mental model, and naming where it breaks is what
keeps this honest.

| iMessage / SMS                                                                     | Ours                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| One identifier (a phone number) addresses both transports                          | **Two identities**: `@n:<node key>` and `@alice:server`, different keys, different servers                                                        |
| Apple's server answers "is this number on iMessage?"                               | **The contact card is the directory** — exchanged in person, signed; there is no central lookup and no server to ask                              |
| Transport chosen per message; blue/green shows which                               | Same, and provenance shown per message                                                                                                            |
| "Send as SMS when iMessage is unavailable"                                         | Fallback in **both** directions, by live reachability — no fixed primary, because which transport works depends on where the attendee is standing |
| The recipient sees one thread, because it is one number                            | The recipient sees **two senders** unless they run this app and have verified your link                                                           |
| SMS is plaintext; Apple quietly hides the downgrade                                | Both transports are E2EE, but under **different trust roots**. We must never hide that, and never imply verification transfers                    |
| Text Message Forwarding relays SMS to your other devices over Apple's E2EE channel | The same shape is the only ADR-0003-safe way to get mesh history onto your other devices (Stage 4)                                                |

The deepest difference: **iMessage merges because the identifier is shared;
we merge because a person cryptographically asserted that two identifiers are
theirs.** Everything downstream — how much we trust the merge, when we route
automatically, what we show — follows from the verification state of that
claim.

## Decision

Merge at the **person** layer, in the client, gated on a verified #111 link.
Ship it in five stages, each independently useful and independently
shippable. Do not merge identities, do not merge crypto, do not bridge.

## Vocabulary

- **Account** — a Matrix session plus a transport class.
  - _Mesh account_: `@n:<node key>`, homeserver = the embedded Neutrino on
    loopback. **Exactly one per device** (one node, one identity), and its
    identity is the device's; losing the phone loses it.
  - _Classic account_: an ordinary homeserver over IP. Zero or more.
- **Reachability** — per account, observed and cheap: the mesh account is
  reachable when the node has ≥1 live peer or gateway link
  (`NeutrinoService` already exposes discovered peers); a classic account is
  reachable when the network is up and its homeserver answers.
- **Person** — a contact card, optionally binding `{meshId, matrixId}`.
- **Link state** — `verified` (the #111 claim checked against the real
  homeserver's keys, or the card's key badge checked in person), `claimed`
  (signature present, not yet checked — the offline state), or `invalid`.

## Stage 0 — Coexistence

Make the mesh account _an_ account rather than _the_ account.

- Unforce login: the first run still lands the attendee on the mesh in one
  tap (the venue happy path must not regress), but "Add account" offers _the
  venue mesh_ or _a Matrix account_, and the Spindle takes ordinary
  registration already (`docs/conference-spindle.md`).
- Start the node lazily: an attendee who only wants their classic account
  should not wait behind "Starting Neutrino…", and should not run a mesh node
  they never use.
- Everything else is upstream's: **Element X 26.09.1 already ships
  multi-session** — `matrixSessionCache` keyed by `SessionId`,
  `switchToLoggedInFlow(sessionId, cacheIndex)`, and an `AccountSelect` nav
  target in `RootFlowNode`. We adopt it rather than invent it, which is one
  more reason to land the 26.09.1 forward-port (`ex-2609`).
- Deep links become account-aware: `RootFlowNode.navigateTo(permalinkData)`
  must first choose _which_ account resolves a `matrix:` or
  `indiafoss://friend` link.

**Ships:** hold both identities, switch between them. This alone answers
"seamless switching" and removes the two-apps instruction from the docs.

## Stage 1 — Routing and fallback

Replace the refusal with a router. Today `dmWouldBeKeyDead()` blocks an
encrypted DM from the mesh to an internet-only user (chat-android#40) — the
right call when there was one identity. With two, the answer is not "no", it
is "not as this identity".

"Message _person_" resolves to an (account, target id) pair:

1. If the person's mesh id is present **and** mesh-reachable → mesh account.
2. Else if a **verified** MXID link is present and a classic account is
   reachable → classic account.
3. Else, the last transport that worked, queued, with the state shown.

Rules that keep it honest:

- **Never route outbound over an unverified binding.** A `claimed` link is a
  suggestion ("also reachable as `@alice:server` — verify?"), never an
  automatic destination. This is the whole security of the feature (see
  below).
- Optimistic send with fallback on failure, not a blocking reachability
  probe — the composer must never wait on the network.
- The composer always says which identity is speaking.

**Ships:** "Continue on Matrix" (today a manual action on mesh DMs) stops
being a manual action.

## Stage 2 — Unified inbox

One row per **person**, not per room, collapsing that person's mesh DM and
classic DM into a single entry with a merged unread count and a transport
chip. Rooms with no verified link stay separate rows, labelled by account.

Mechanics that must be got right:

- **Aggregation**: the room list is bound to one `MatrixClient` today; the
  merge is a client-side join across sessions, sorted by latest activity.
- **Dedupe by `room_id`, separately from the person merge.** Once the Spindle
  RFC lands and mesh rooms federate, the _same_ room can be joined by both of
  your accounts. Same `room_id` in two sessions is a true duplicate: show it
  once, pick a primary session deterministically.
- **Do not join the same room with both accounts.** Otherwise other members
  see two of you. Auto-join with one identity; offer to leave with the other.
- **Per-account reachability is a display state, not an error.** An
  unreachable account's rooms grey out with "not reachable here"; they never
  show as failures and never disappear.

**Groups are out of scope for the merge.** A mesh room and a Spindle room
have different membership; collapsing them would assert a bridge that does
not exist and that ADR 0003 refuses. Group rooms keep an account chip.

## Stage 3 — Merged thread

One conversation per person, messages from both transports interleaved by
original timestamp, each carrying its provenance (the blue/green equivalent).

- Sending continues in the transport of the last message while it is
  reachable — conversational continuity, as iMessage does — and otherwise
  switches, with a client-side separator: _"Switched to Matrix — they will
  see this from `@alice:server`."_ A separator, not a room event.
- Manual override in the composer.
- **What the other end sees, stated plainly in the UI**: if they run this app
  with your verified link, they see one thread too. If they run stock
  Element, they see two rooms from two users, and we never claim otherwise.
- The merged view never implies merged crypto: two trust roots, two
  verification states, shown per message.

## Stage 4 — History forwarding to your other devices

The ask: mesh messages should reach your laptop once you are online again.
The ADR-0003-safe shape is precisely iMessage's **Text Message Forwarding** —
the device that has the plaintext relays it to your own devices over a
channel only you can read. Not a bridge.

- The phone mirrors mesh conversations into a **private, encrypted archive
  room on your classic homeserver whose only member is you**. The server
  stores ciphertext it cannot read; no other participant's server is
  involved; nobody else joins.
- **Read-only, and labelled as such.** Your laptop has no mesh transport, so
  replying there cannot reach the mesh. The archive is history, not a
  conversation. Pretending otherwise would be the bridge ADR 0003 refuses.
- Each mirrored message carries the original sender, original
  `origin_server_ts` and mesh `event_id` in its content — the event id makes
  the mirror idempotent, with a per-room high-water mark so a reconnect does
  not duplicate. (Known cosmetic limit: Matrix clients sort by arrival, so a
  bulk backfill reads in archive order, not original order.)
- **Text first.** Media would mean re-uploading someone else's attachments to
  your homeserver: v1 mirrors a placeholder pointing at the phone that
  received it.
- Batch on reconnect, not per message.
- **Opt-in, off by default, and disclosed.** The plaintext never leaves the
  attendee's control and they already hold these messages — but the metadata
  (that a conversation happened, its size and timing) reaches their
  homeserver, and the words are someone else's. For a project that refused a
  bridge on exactly these grounds, the default must be off and the mesh room
  should say when a participant is archiving.
- Second payoff: it is the only backup of a mesh identity's history, which is
  otherwise per-device and unrecoverable.
- **Endgame**: once the Spindle RFC lands (ADR 0003's federation path), mesh
  rooms _are_ Matrix rooms and history converges natively — the archive
  becomes unnecessary rather than load-bearing. Build it so it can be
  deleted.

## Security and privacy

- **Mis-binding is the sharpest threat.** An attacker publishing "my mesh id
  is bound to `@someone-important:matrix.org`" would receive messages meant
  for them. Mitigation is absolute: merge and auto-route **only** on a
  `verified` link — the #111 check against the real homeserver's keys, or an
  in-person card badge check. `claimed` never routes.
- **Verification does not transfer.** Two accounts are two crypto identities;
  cross-signing one does not vouch for the other. Verification UX doubles,
  and the merged surfaces must show per-identity state rather than one
  padlock.
- **Logging out the mesh account destroys a mesh identity** (it is the node's
  key). It must be a visibly different, heavier action than signing out of a
  classic account.
- **Sync cost**: the mesh session syncs in-process; classic sessions sync
  over the network. Only foreground/active classic sessions should sync
  aggressively; the mesh account has no push and does not need it.

## What we explicitly do not do

- Relay key material across the seam (#176 stays open; this ADR routes around
  it rather than solving it).
- Bridge, mirror, or server-side link identities — ADR 0003.
- Merge group rooms, or merge threads on an unverified link.
- Publish the identity binding anywhere the attendee did not choose to.

## Consequences

- The 26.09.1 forward-port stops being housekeeping and becomes the
  dependency for Stage 0 — multi-session is upstream's, already written.
- `docs/messaging.md`'s "chat app for mesh, Element for public" instruction
  is superseded once Stage 0 lands; both belong in one app.
- The cross-seam DM guard (chat-android#40) is temporary by design: Stage 1
  turns it from a refusal into a route. Its pure-function shape was chosen so
  it can be replaced cleanly.
- #111's signed link graduates from a contact-card nicety to the trust root
  of the whole feature — and minting it requires being signed into both
  accounts, which only Stage 0 makes possible.

## Open questions for the maintainer

1. **Does the conference issue attendees Spindle accounts by default?** If
   yes, nearly every attendee has a second account and Stages 1–4 become the
   main experience rather than a power-user path. If no, the mesh stays
   primary and Stage 4's archive needs somewhere to live.
2. **Unified inbox default-on or opt-in?** Default-on is the better product
   and the riskier privacy story (it makes the identity link visible in the
   main list).
3. **Is Stage 4 wanted before the RFC?** It is deletable work by
   construction; the question is whether "my mesh history on my laptop" is
   worth shipping an archive we intend to remove.
