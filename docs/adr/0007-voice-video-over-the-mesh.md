# 0007 — Voice and video over the mesh: iroh media, MatrixRTC signalling

- Status: **Proposed**
- Date: 2026-09-07
- Deciders: James (maintainer)
- Related: [ADR 0003](0003-mesh-interop-by-federation-not-bridging.md) (no
  bridging), [ADR 0005](0005-ios-mesh-chat.md), [ADR 0006](0006-one-person-two-transports.md),
  `docs/mesh-protocol.md`, the transport proof
  `neutrino-iroh/neutrino-ffi-ble/tests/media_throughput.rs`

## Context

An attendee in a hall with no uplink can already message over the mesh. The
next thing they reach for is a call. The question this spike answers: can a 1:1
(and small-group) voice — and maybe low-res video — call run over the venue
BLE mesh, with **no SFU and no internet**, and can it be **MatrixRTC-conformant**
so it is not a bespoke island?

Two facts, measured this session, frame the answer:

- **The mesh already is iroh.** Neutrino federates CoAP over an iroh QUIC link;
  the BLE medium (`iroh-ble-transport`) upgrades GATT → **L2CAP CoC** for
  verified peers (`L2capPolicy::PreferL2cap`), the high-throughput BLE path.
  Confirmed live on the two test phones: `L2CA_RegisterLECoc … PSM 0x0088`,
  connection `result 1`. LE CoC on modern Android sustains hundreds of kbit/s
  to ~1 Mbit/s.
- **The transport carries media rates.** A loopback iroh probe
  (`media_throughput.rs`) sustains opus-voice (32 kbit/s, 20 ms frames) and
  low-res video (300 kbit/s, 30 fps) at **0 % loss and ~1 ms latency**, with
  frames sliced across the **1162-byte** datagram max (video = 2 datagrams per
  frame). That is a loopback upper bound, not a real-BLE figure — but it rules
  out a transport that cannot keep up, and the L2CAP budget above leaves voice
  comfortable and low-res video plausible once federation traffic is accounted
  for.

## Decision

Carry media as **unreliable iroh QUIC datagrams on a second ALPN of the same
endpoint** that carries federation — inheriting the L2CAP upgrade, QUIC
congestion control, discovery and node addressing for free — and **signal the
call through MatrixRTC** membership state, advertising a mesh/iroh _focus_
rather than a LiveKit one. Do **not** attempt to run Element/LiveKit over the
mesh.

## Why not Element / LiveKit

Element's calls are LiveKit — an SFU (a central media server every packet
transits) over WebRTC — reachable only over IP, authenticated by a JWT service,
discovered via `.well-known` foci. A BLE mesh with no internet has none of
these, so an Element call **cannot connect**, and the vendored
`EmbeddedElementCall` web bundle is inert without an SFU. There is no
SFU-free fallback to bend into shape: Element Call's original full-mesh P2P
mode was removed in the 2023 LiveKit rewrite, matrix-rust-sdk carries no
media/WebRTC at all (only RTC-membership signalling), and LiveKit has no
serverless mode. The only reusable piece is the **membership signalling**,
which is exactly what the MatrixRTC-conformance decision keeps.

## Why iroh media is the right shape

Best-effort datagrams are _correct_ for real-time media — a late frame is
worthless, so drop beats retransmit, and head-of-line blocking is the enemy.
That is the RTP-over-UDP contract, and our `DatagramLink` already provides it.
The reference implementation is Telepathy (`chanderlud/telepathy`, MIT,
first-class Android/iOS): iroh unreliable `send_datagram` for media with a
short sequence header and a receiver-side jitter buffer, reliable streams for
control. Its media plane plugs into our seam almost directly — `audio_input`
is generic over a `send(&[u8])` trait — with **one substitution**: its
SEA-codec/raw-PCM path (~768 kbit/s, far over the BLE budget) becomes **opus at
16–24 kbit/s**, which fits with headroom for federation. RTT ~200 ms over BLE
suits 1:1 and small groups with a ~50–100 ms jitter buffer; it rules out large
low-latency conferences, not a hallway call.

## Signalling — MatrixRTC conformance

MatrixRTC cleanly separates _who is in the call_ (membership state) from _how
media flows_ (the focus). We **reuse the membership layer verbatim** and
**extend the focus layer**, because there is no way around the second part:
the implemented model (what element-call, matrix-js-sdk, ruma and Element X
speak today) defines exactly one focus `type` — `livekit` — and no
peer-to-peer or full-mesh type anywhere.

**Membership (reused, conformant).** Each device advertises one
`org.matrix.msc3401.call.member` state event (the live type still carries the
`msc3401` prefix even for the MSC4143 payload), per-device state key
`_{user}_{device}_{application}{slot}` (e.g. `_@n:<hex>_DEVICEID_m.call`),
content `SessionMembershipData`: `application: "m.call"`, `call_id: ""`,
`scope: "m.room"`, `device_id`, `foci_preferred`, `focus_active`, `expires`.
Join = non-empty content; leave = `{}`. Call discovery = read the room's
`call.member` state and enumerate non-empty, unexpired members. matrix-rust-sdk
already exposes the read side independent of LiveKit — `Room`'s
`has_active_room_call()`, `active_room_call_participants()`,
`is_device_in_active_room_call()` (matrix-sdk-base `room/call.rs`), gated only
by the ruma `unstable-msc3401` feature. There is **no** native join API in
rust-sdk (the join/leave engine lives in matrix-js-sdk); we join by sending the
state event directly (`Room::send_state_event` with a
`CallMemberEventContent::SessionContent`) and leave by sending the `Empty`
content. `isLivekitRtcSupported()` gates only the LiveKit backend, not this
machinery, so a mesh backend needs none of it.

**Focus (extended — the one place we leave the beaten path).** `focus_active`
and `foci_preferred` are ruma enums tagged by `type`, both with a single
`livekit` variant. We define a mesh focus, e.g.

```jsonc
"foci_preferred": [
  { "type": "in.indiafoss.mesh.iroh",
    "node_id": "<64-hex iroh node id>",
    "media": { "audio": "opus", "bitrate": 24000 } }
],
"focus_active": { "type": "in.indiafoss.mesh.iroh" }
```

so the negotiation data a LiveKit call puts in `livekit_service_url` (there, an
SFU URL + a separately-fetched JWT) is, for us, each peer's **iroh node id and
opus params carried in the focus content itself** — state-driven, no SFU, no
token service, no to-device SDP leg. A peer reads the other's `node_id` from
the membership state and dials it on the media ALPN.

**The interop caveat, and the choice it forces.** ruma deserializes
`CallMemberEventContent` as an _untagged_ enum (Legacy → Session → Empty), and
a single unknown focus `type` fails the Session arm, so a strict ruma client
(Element X, and the rust-sdk read helpers above) falls through to `Empty` and
reads our member as **left**. matrix-js-sdk is lenient and would still show the
member. So:

- **(a) Honest extension** — advertise `type: "in.indiafoss.mesh.iroh"`.
  Cleanest, and correct for us since only our fork can connect the mesh
  media anyway; ruma clients simply don't see the member. **Chosen.**
- **(b) Compatibility shim** (kept in reserve) — advertise
  `focus_active: { "type": "livekit", ... }` with an empty `foci_preferred`
  so _every_ client parses the event and shows "someone is in a call," and
  carry the iroh params in a namespaced sibling field. Buy signalling-layer
  interop with Element X at the cost of a white lie in `type`; adopt only if
  that interop is ever wanted.

We go with (a) and, if this graduates past a spike, write a short MSC
("MatrixRTC full-mesh / iroh transport") so the focus type is a named
extension the way MSC4195 names LiveKit. Two conformant pieces ride alongside:
**MSC4075** `m.rtc.notification` for ringing a 1:1 invite, and **MSC4140**
delayed events as the dead-man's-switch that resets a crashed peer's
membership to `{}` — which our embedded homeserver must implement, else we
lean on the `expires` field the session content still carries. The legacy
MSC3401 full-mesh mode (to-device `m.call.*` SDP, "the lower user id calls the
other") is the spirit we mirror, but it predates the focus abstraction and is
not the live event model, so we do not adopt its wire shape.

## Milestone ladder

0. **Transport proof** — _done._ `media_throughput.rs`: media rates sustain
   over iroh datagrams with frame slicing.
1. **One-way push-to-talk opus, phone A → phone B, over the sim link.** Opus
   encode of 20 ms frames → sequence-tagged datagrams on a media ALPN → decode
   into a jitter buffer → play. Triggered by an `org.matrix.msc3401.call.member`
   state event carrying A's iroh node id + opus params in an
   `in.indiafoss.mesh.iroh` focus; validated under the
   `UdpFlakyProxy` BLE profile before real BLE.
2. **Duplex 1:1** — input and output streams both directions.
3. **Small groups** — Telepathy's `DynamicConnection` fan-out (one shared
   sequence space to N peers), bounded by the BLE budget.
4. **Low-res video** — VP8/AV1 at ~300 kbit/s, frames sliced per the datagram
   max, same signalling.

## Consequences

- Media reuses the iroh endpoint and the L2CAP path the federation medium
  already brings up; no new transport, no SFU, no internet.
- The mesh has no E2EE/signing yet (`docs/mesh-protocol.md`), so a call is
  **unverified** for now, shown as such — consistent with the rest of the mesh.
- Conforming at the MatrixRTC membership layer keeps the door open to
  interoperating with other MatrixRTC clients at the signalling level even
  where only our client can connect the mesh focus's media.
- Android audio capture (cpal or `AudioRecord`/`AudioTrack`) and the opus
  encode/decode are the real build after this spike; the transport risk is
  retired.
