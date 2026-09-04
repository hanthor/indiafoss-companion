# The conference mesh: an interoperability specification

**Status:** draft, version 1. Descriptive of the companion at the commit that
carries this file. Everything here is implemented and test-covered in this
repository unless a paragraph says otherwise.

This document is for **people writing their own client**. It tells you what to
send and what to expect so that an attendee running your app lands in the same
rooms, reads the same questions and exchanges the same identity cards as an
attendee running this one. You do not need this repository's code, its
framework, or its licence to interoperate — only this document.

If you want to change _this app_ rather than write your own, see
[forking.md](./forking.md).

## 1. Conformance

**MUST**, **SHOULD** and **MAY** carry their [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)
meanings. A client is _conformant_ if it obeys every MUST in sections 3–7.

Two conformance levels are worth naming:

- **Reader.** Joins rooms and renders messages. Needs sections 3, 4, 5.
- **Full.** Also exchanges identity cards and participates in Q&A. Adds 6, 7.

## 2. What this mesh is, in one paragraph

There is no server. Each phone runs [Neutrino](https://github.com/element-hq/neutrino-iroh),
an embedded Rust homeserver that speaks the ordinary [Matrix](https://spec.matrix.org)
client–server API on loopback and federates with other phones over Iroh (QUIC)
and Bluetooth Low Energy. Your client is a **Matrix client talking to localhost**.
Everything below is either standard Matrix — in which case use your favourite
Matrix library and skip ahead — or one of the few conventions that make
independent clients converge on the same rooms without an organiser
provisioning anything.

The mesh is not connected to public Matrix. A room on the mesh does not exist
on matrix.org, and a matrix.org account cannot reach a mesh peer. See
[ADR 0003](./adr/0003-mesh-interop-by-federation-not-bridging.md) for why that
is federation's problem to solve and not a bridge's.

## 3. Finding the node

A client running on the same device as a node **MUST** discover it by probing
loopback for a Matrix client–server API:

```
GET http://127.0.0.1:<port>/_matrix/client/versions
```

Ports **MUST** be tried in this order: **8008**, then **3000**. The first that
answers `200` is the node's API base URL. A timeout of roughly one second per
port is sufficient; a node that is not running refuses the connection
immediately.

A client **MUST NOT** treat the absence of a node as an error state to recover
from. Web and iOS have no node at all, and a conformant client says so plainly
rather than retrying.

Everything after this point is ordinary Matrix against that base URL. There is
no login: **the node is already its own account** (§4). Use the access token
the node hands out, exactly as with any homeserver.

## 4. Identity

A node's identity is the **Ed25519 public key of its node secret**, rendered as
64 lowercase hex characters. That string is the Matrix `server_name`.

The derived Matrix user id is:

```
@n:<64-hex-server-name>
```

`n` is the default localpart. A client **MUST** accept any localpart from a
peer and **MUST NOT** assume `n` when parsing; it **SHOULD** use `n` when
constructing its own address. Server names **MUST** be compared
case-insensitively and **SHOULD** be lowercased on storage.

```
@n:3f9a...c1  ✅ a mesh identity
@alice:matrix.org  ❌ a public Matrix identity; unreachable from the mesh
```

Consequences a client author needs to have internalised:

- **One node, one account.** There is no account portability, no login on
  another device, no password.
- **Nothing is verified.** Neutrino does not currently sign or verify events
  (§8). A display name is a claim. An identity association (§7) is a claim.
  A conformant client **MUST** present peer identity as unverified and **MUST
  NOT** render any UI that implies authenticity.
- **No cross-signing, no device verification.** Do not build UI that promises
  it.

## 5. Rooms

### 5.1 Deterministic aliases

Rooms are never provisioned. Every client derives the same alias from stable
event data, so attendees converge without coordination. This is the single most
important thing to get byte-identical.

```
#<prefix>-<kind>-<id>:<server>
```

- `prefix` — the event id (e.g. `indiafoss-2026`), or the organiser's
  `messaging.aliasPrefix` override.
- `kind` — exactly one of `session`, `booth`, `room`.
- `id` — the activity, booth or location id from the event bundle.
- `server` — `messaging.aliasServer`, else the host of `messaging.homeserver`.

`prefix` and `id` **MUST** be normalised with this algorithm, in order:

1. Lowercase.
2. Replace each run of characters outside `[a-z0-9._=-]` with a single `-`.
3. Strip leading and trailing `-`.

`kind` and `server` are **not** normalised.

**Test vectors.** With `homeserver: "https://matrix.org"` and no overrides:

| kind      | id               | alias                                               |
| --------- | ---------------- | --------------------------------------------------- |
| `session` | `act-C8AK0iov2l` | `#indiafoss-2026-session-act-c8ak0iov2l:matrix.org` |
| `booth`   | `KDE India!`     | `#indiafoss-2026-booth-kde-india:matrix.org`        |
| `room`    | `Hall 3`         | `#indiafoss-2026-room-hall-3:matrix.org`            |

Note `KDE India!` → `kde-india`: the `!` and the space collapse to one `-`,
and the trailing `-` is stripped. A client that produces `kde-india-` has
split the room in two, and neither half will know.

With overrides `aliasPrefix: "IF26"` and `aliasServer: "fossunited.org"`, the
event id is ignored and `room` / `audi-1` gives
`#if26-room-audi-1:fossunited.org` — note the prefix is lowercased but the
server is not.

The announcements room is a separate alias, `#<prefix>-announcements:<server>`,
overridable by `messaging.announcementsAlias` (or disabled with `false`).

### 5.2 Joining, and creating on demand

To open a conference room a client **MUST**:

1. Join the alias.
2. On `M_NOT_FOUND`, create a **public** room with that alias.
3. On `M_ROOM_IN_USE` while creating, join instead — someone beat you to it.

That three-step dance is what makes provisioning unnecessary. Any refusal other
than those two **MUST** be surfaced, not retried.

When creating the **announcements** room, a client **MUST** set
`power_level_content_override` to `{"events_default": 50}`, so that whoever
seeds it owns it and only moderators post. A room that has sent no power levels
is open, and a client **MUST** treat it as such rather than assuming a default
it did not read.

### 5.3 Join storms — required backoff

**This section exists because a client that ignores it degrades the mesh for
everyone in the hall, not just for its own user.**

A talk starting is a join storm: every attendee in the room opens the session
room in the same second, and simultaneous joins are quadratic work across the
mesh. Measurements are in [neutrino-scale.md](./neutrino-scale.md); the summary
is that 50 nodes joining at once lands 29 of 49 within 20 s, while the same 50
spread over half a second each lands 49 of 49.

A conformant client **MUST**:

- Wait a **uniformly random delay in [0, 4000) ms** before its _first_ join
  attempt on a conference room. Not a fixed delay — a fixed delay just moves
  the storm.
- Retry while the server answers **HTTP 504**, up to **4 times**, starting at
  **1000 ms** and **doubling** (1 s, 2 s, 4 s, 8 s).

A 504 from Neutrino means `timed out applying room state; the join is still
being processed` — the server took the join and keeps draining off the request
path, so the membership lands shortly and repeating is both safe (joins are
idempotent) and the only way to find out. Any other status is a real answer and
**MUST NOT** be retried.

> A client **MAY** widen its 504 test beyond the status code — a reverse proxy
> in front of a node can emit 504 for unrelated reasons. This implementation
> currently keys on the status alone.

Direct messages and aliases the user typed **MUST NOT** be staggered. The
delay is only worth its cost where a crowd converges on one room.

A client **MUST** tell the user why it is pausing. A four-second wait with no
explanation reads as a hang.

## 6. Message conventions

Everything here rides on ordinary Matrix events, so a client that implements
none of it still shows readable messages. That is deliberate: these are
_additive_ conventions, and a plain Matrix client is a valid mesh reader.

### 6.1 Questions

A question is an ordinary `m.room.message` with one extra content key:

```jsonc
{
  "msgtype": "m.text",
  "body": "How does the scheduler handle clock skew?",
  "in.indiafoss.question": true,
}
```

- The value **MUST** be boolean `true`. Any other value is not a question.
- An **upvote** is an `m.reaction` annotation with key `👍`.
- **Answered** is an `m.reaction` annotation with key `✅`.
- Ordering **SHOULD** be: unanswered before answered, then most upvotes, then
  oldest first.

> **Known divergence.** [messaging.md](./messaging.md) describes `✅` as
> meaningful only from a sender who may moderate. The implementation accepts
> `✅` from **any** sender. Treat this specification as describing the wire, and
> do not build a client that relies on moderator-only semantics until the
> discrepancy is resolved.

The flag survives encryption and offline queueing. Other Matrix clients see an
ordinary message with reactions, which is the intended fallback.

### 6.2 Replies, reactions, receipts

Standard Matrix throughout: `m.relates_to` / `m.in_reply_to` for replies,
`m.reaction` annotations toggled by redacting your own, ordinary read receipts.
Reactions are deliberately unencrypted, as the spec requires. A client
**SHOULD** strip the `> …` fallback body on read and render the quote from its
own timeline.

### 6.3 What the mesh cannot do yet

Neutrino is pre-alpha and implements a fraction of the client–server API.
`tools/neutrino-probe` measures it rather than trusting the README; the current
matrix is in [neutrino-capabilities.md](./neutrino-capabilities.md).

As of neutrino `90bc1b1`: **sending, history, replies and reactions work.
Redaction, receipts, typing, media and E2EE do not** — and the E2EE key
endpoints answer `200` with nothing behind them, so a client that probes for
capability by status code will conclude encryption works when it does not.

A conformant client **MUST** degrade visibly rather than silently: if it cannot
encrypt, it says so. It **MUST NOT** present mesh conversations as encrypted.

## 7. Identity exchange

Two payload formats, both self-contained so they work with no network at all.
A client **MUST** preview and confirm every scanned payload before saving,
joining or sending. Nothing auto-messages.

### 7.1 vCard (the universal card)

A plain **vCard 3.0** any camera app can save, carrying extensions as `X-`
properties:

| Property             | Meaning                            |
| -------------------- | ---------------------------------- |
| `X-INDIAFOSS-MATRIX` | claimed public Matrix id           |
| `X-INDIAFOSS-MESH`   | mesh node id (64 hex)              |
| `X-INDIAFOSS-TICKET` | ticket reference                   |
| `X-INDIAFOSS-KEY`    | device public key, `alg:base64url` |
| `X-INDIAFOSS-SIG`    | signature over the canonical body  |

Readers **MUST** also accept the aliases `X-MATRIX-ID`, `IMPP` (Matrix id) and
`X-NEUTRINO-SERVER-NAME` (mesh id).

**Verifying a signature.** The signed bytes are every line of the vCard
_except_ the `X-INDIAFOSS-SIG:` line, in document order, with blank lines
dropped, joined with **CRLF**. The key line stays inside the signed body, which
binds the card to the key that signed it. `alg` is `ed25519` (Ed25519) or an
ECDSA P-256 key verified with SHA-256.

A signature proves **key continuity**, not identity: it says this card came
from the same device as last time. A client **SHOULD** warn when a known
contact's key changes and **MUST NOT** silently overwrite.

### 7.2 Friend payload (app-aware)

A versioned query string, capped at **4 KiB**:

```
indiafoss://friend?v=1
  &event_id=indiafoss-2026
  &fossunited_profile_url=https://fossunited.org/u/<name>
  &matrix_id=@you:matrix.org
  &neutrino_server_name=<64 hex>
  &ticket_ref=ticket::<id>
  &fn=…&org=…&url=…&social_github=…
```

A decoder **MUST** drop malformed identities and any URL whose scheme is not
`https` or `mailto`, rather than trusting them, and **MUST** reject payloads
over 4 KiB.

`matrix_id` and `neutrino_server_name` are **retained separately and are not
interchangeable**. One is a public Matrix account; the other is a mesh node.
Conflating them produces a client that promises delivery it cannot make.

### 7.3 Association is a claim

The canonical chain is:

```
ticket_ref → fossunited_profile_url → neutrino_server_name → derived MXID
```

Every link is user-confirmed and none is authenticated. **A ticket id is never
a Matrix id, a mesh identity, a credential, or proof of ownership.**

One association _can_ be checked, when online. An attendee publishes their mesh
node id on a public Matrix account's profile under the
[MSC4133](https://github.com/matrix-org/matrix-spec-proposals/pull/4133)
extended-profile field:

```
in.indiafoss.mesh = "<64-hex mesh id>"
```

A peer holding the card reads that account's public profile from its own
homeserver — one unauthenticated request, no account needed — and records the
result as **verified**, **mismatch**, **unlinked** or **unverifiable**. Offline,
a claim is just a claim. The related fields `org.fossunited.profile_url` and
`org.fossunited.username` work the same way.

Nothing about the mesh conversation leaves the mesh in this exchange.

## 8. Security considerations

Read this section before shipping anything to attendees.

- **Events are neither signed nor verified.** Neutrino is explicitly _not
  secure for untrusted networks_. Any peer can, in principle, forge an event.
  Treat the mesh as a demo transport until upstream says otherwise.
- **There is no E2EE on the mesh**, notwithstanding the key endpoints
  answering `200` (§6.3).
- **BLE advertising reveals presence.** A node broadcasts its identity and
  display name to everyone in radio range. That is not revocable, and a client
  **MUST** make it a deliberate choice rather than a default.
- **A QR code is a photograph.** Anything on a shared card can be copied and
  cannot be withdrawn. Identity fields **SHOULD** be off by default.
- **Room membership is disclosure.** Joining reveals your identity to the
  room. Rooms are suggested, never auto-joined.
- **Malicious payloads.** Enforce the size caps, the scheme allow-list and the
  strict id grammars in §7. Never render scanned text as HTML.

The companion's full threat table is in
[messaging.md](./messaging.md#threat-and-privacy-model).

## 9. Extending it

If you add your own conventions, use **your own reverse-DNS namespace** —
`in.indiafoss.*` and `org.fossunited.*` belong to this project's conventions,
and a third-party client writing into them will collide with a future version.

Additive content keys on ordinary events are the right shape for an extension,
because every client that does not know them still renders the message. Prefer
that over a new event type wherever the content is fundamentally a message.

## 10. Reference implementation

| Concern                      | File                                      |
| ---------------------------- | ----------------------------------------- |
| Alias derivation             | `packages/model/src/messaging.ts`         |
| Join, stagger, retry         | `packages/matrix/src/session.ts`          |
| Question flag, sync reducer  | `packages/matrix/src/sync.ts`             |
| Mesh identity verification   | `packages/matrix/src/mesh-link.ts`        |
| MSC4133 profile fields       | `packages/matrix/src/profile-fields.ts`   |
| vCard signing                | `packages/model/src/signed-vcard.ts`      |
| Friend payload, scan grammar | `packages/model/src/friend.ts`, `scan.ts` |
| Node discovery               | `apps/web/src/lib/neutrino.ts`            |
| Capability probe             | `tools/neutrino-probe`                    |

`packages/matrix` has no framework dependencies and is AGPL-3.0-or-later; you
are welcome to vendor it rather than reimplement, provided your fork honours
the licence.

## 11. Changes to this document

This specification is versioned with the repository, not separately. A change
that would break a conformant client **MUST** arrive with a version bump in the
status line and a note here saying what moved. Corrections that only sharpen
wording do not.

- **v1** — first publication. Describes the mesh as of the join-storm work
  ([#120](https://github.com/hanthor/indiafoss-companion/issues/120)).
