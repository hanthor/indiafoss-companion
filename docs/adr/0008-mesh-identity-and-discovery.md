# 0008 — Mesh identity in the chat app: a code you can read, a QR you can scan, a switch to go dark

- Status: **Proposed**
- Date: 2026-09-07
- Deciders: James (maintainer)
- Related: [ADR 0003](0003-mesh-interop-by-federation-not-bridging.md) (no
  bridging), [ADR 0006](0006-one-person-two-transports.md) (one person, two
  transports), `docs/contact-sharing.md` (the companion's `/connect` vCard QR),
  `docs/forks.md`, #111 (verified MXID link, **done**), the device-verification
  question (the "encrypted by a device not verified by its owner" shield)

## Context

A mesh identity in the chat app is the embedded node's, and the node id **is**
the identity: the ed25519 public key, hex-encoded, is the Matrix server-name,
so a mesh user is `@n:<64-hex>` (`Config::user_id()`,
`neutrino-ctl/src/lib.rs:221`; the id/pubkey/server-name identity is pinned by
`relay_transport.rs:1035`). On the member's profile screen the client renders
that verbatim — `Text(text = userId.value)` at
`UserProfileHeaderSection.kt:95` — so what an attendee sees is

> `@n:845aa456078572639c1543694de69e0a03fb883bd9c1dab1a2f6df811b75897e`

Nobody reads that, nobody dictates it, and two people standing next to each
other have no in-app way to hand it over. The profile screen offers **Message,
Share, Block** and no **Verify** — confirmed on the two test phones. Three gaps,
one root:

1. **No human-facing identity.** 64 hex characters is not a handle. The
   display name (`rueh`) is user-chosen and unauthenticated — anyone can claim
   it — so it cannot be the thing you trust.
2. **No in-app way to add a specific person.** The company you keep at a
   conference is the person in front of you. Search
   (`/_matrix/client/v3/user_directory/search`) only returns peers the radio
   has already discovered, matched on ≥3 characters of a name that isn't
   unique. There is no "point your camera at their screen" path.
3. **No way to stop being discovered.** A phone with the app open advertises
   itself over BLE (`node_id ‖ display_name`) and announces over mDNS; every
   nearby stranger sees it in their people-picker. There is no toggle, and no
   choice at onboarding.

The companion PWA already solved the *sharing* half for its own surface —
`/connect` renders a signed vCard QR carrying `X-INDIAFOSS-MESH` (the node id)
and shows a 5×5 key badge as the in-person check (`docs/contact-sharing.md`).
The chat app carries none of that inward. This ADR brings the same ergonomics
into the client and aligns the two QR formats so one attendee's `/connect` code
is the same code the chat app scans.

## Decision

Three moves, phased so each lands and ships on its own. The ordering is
deliberate: the first is pure client UI and needs no Rust; the value shows the
day it merges.

### 1. The node id is the identity; a short code and a badge make it legible

The 64-hex server-name stays the real, addressed, verifiable identity — never
shortened on the wire, never trusted in an abbreviated form. On top of it the
client derives, **from the full server-name, not from the `n` localpart** (the
localpart is host-stamped and not guaranteed — `neutrino-ctl` defaults it to
`alice`, the medium stamps `n`, `neutrino-ffi-ble/src/lib.rs:32`):

- a **short code** — the last 8 hex of the server-name, grouped for the eye
  (`…f811 b758 97e` → shown as `B758·97E`), and
- a **badge** — a small deterministic identicon/colour hashed from the whole
  server-name, mirroring the companion's key-badge idea so the same person
  reads the same across both apps.

The short code is a **recognition and echo** aid, never an add-by mechanism: 32
bits is trivially collidable, so "their code shows `B758·97E`, mine says the
same" is a human sanity check on an identity you already hold in full, not a
way to establish one. The full id stays one tap away (tapping it already copies
to clipboard, `UserProfileView.kt:84`). The display name is shown, but visibly
secondary to the code+badge, because it is unauthenticated.

### 2. Add a contact by QR — and let the DM room *be* the contact

A "My code" QR on your own profile encodes a **standard user URI**
(`matrix:u/n:<server-name>` / the matrix.to permalink `permalinkForUser` already
builds, `UserProfileNodeHelper.kt:39`), and a scanner in the people-picker
reads a QR, parses it through the existing `PermalinkParser`, and opens the
profile / starts the DM. The scanner accepts three encodings so it is not an
island: the matrix.to/`matrix:` user URI, a **raw mxid**, and the companion's
**`X-INDIAFOSS-MESH` vCard line** — so a `/connect` code scans straight into the
chat app.

Two corrections over the first sketch of this, both forced by how the medium
actually reaches peers:

- **The QR does not seed reachability. It hands over identity.** A phone has no
  stable `ip:port` to put in a QR, and over BLE a peer is reached by resolving
  *its own* advertisement — so a scanned node id does not make an otherwise
  unreachable peer dialable (`relay_transport.rs:689`, `addrs` empty on device).
  The QR's job is to hand over the *exact* identity with no typing and no
  name-collision; reachability is still the radio's job. v1 therefore carries
  **no dial hints** — they would be dead weight on BLE.
- **There is no contact store, because the DM room is the contact.** A
  QR-added peer never enters the discovery registry (nothing writes it there —
  the registry is discovery-only, and the user directory is nothing but its
  projection). We do not invent a parallel address book: scan → parse →
  `startDM`, and the created DM room is the durable record of "I know this
  person." `MatrixUserRepository` already synthesises a result for any
  well-formed mxid (`MatrixUserRepository.kt:30`), so scan-to-add is very close
  to pure routing.

**What this does and does not do for the shield.** Scanning someone's code in
person pins their **server identity** — you saw it on their screen, out of
band. It does **not** clear the "encrypted by a device not verified by its
owner" shield, which is *device* cross-signing state, a different key. Naming
the convergence rather than dropping it: a later QR payload that also carries
the cross-signing **master key** — exactly what Matrix's own QR verification
encodes — makes one scan mean *add and verify* at once. That is Phase 3, and it
is how this ADR keeps the earlier device-verification request alive instead of
quietly closing it.

### 3. "Let people near you find you?" — a discovery switch, chosen at onboarding

A **discoverable / hidden** preference, defaulting to **discoverable** (a
conference companion whose point is meeting people should find them by
default), surfaced twice: as a first-run choice beside the existing
display-name step (`SetDisplayNamePresenter`, which already governs what is
advertised), and as a toggle in Advanced settings
(`AdvancedSettingsView.kt`, backed by a new `SessionPreferencesStore` flag).

Hidden means: **stop advertising over BLE and stop announcing over mDNS.**
Because the user directory is a pure projection of the discovery registry
(`user_directory_search` reads `state.discovery().search`,
`neutrino-http/src/lib.rs:2101`), hiding from discovery **also** removes you
from every other node's search — there is no second, server-side opt-out to
build. Two honest consequences stated up front:

- **Hiding costs you your name to strangers.** A hidden peer drops out of other
  nodes' registries, so its `/profile` resolves empty there — it shows up
  *nameless* to anyone who hasn't already got it in a room (in-room names
  survive via `m.room.member`).
- **Hidden is asymmetric, and that asymmetry is the design.** A hidden node can
  still **dial out** (egress resolves the *other* peer's advert, which is
  unaffected by whether you advertise), so after any contact is made, whoever
  can dial, dials, and traffic rides that connection. But a hidden node cannot
  be *found* over BLE, and on a phone it cannot be seeded by address either. So
  a hidden user stays reachable by **reaching out first** — the honest
  mitigation, deferred to a later phase, is a hidden-mode heartbeat that
  periodically re-dials **known DM partners** so a hidden attendee still
  receives after a link flap. (`set_display_name(None)` is **not** a hide — it
  only clears the name from an advert that still carries the node's UUID and
  stays connectable; the real lever is `stop_advertising`, `driver.rs:618`,
  which has no runtime caller yet and must be wired.)

## Phasing

1. **Phase 1 — chat-android only, no Rust.** Mesh-aware identity formatter
   (short code + badge, keyed off the server-name) at the profile header and
   member rows; "My code" QR via `QrCodeImage(permalinkForUser(me))` beside the
   existing Share; a scan entry point in the people-picker
   (`QrCodeCameraView` → `PermalinkParser` → profile/`startDM`) accepting
   matrix.to, `matrix:`, raw mxid, and `X-INDIAFOSS-MESH`. Ships value on merge.
2. **Phase 2 — the hide switch.** Wire `stop_advertising` through the FFI →
   `NeutrinoService` → a `SessionPreferencesStore` flag → a `PreferenceSwitch`
   in Advanced settings → a first-run choice adjacent to the display-name step.
3. **Phase 3 — one scan, add *and* verify.** Extend the QR payload with the
   cross-signing master key and route a scan into the verification flow, so an
   in-person scan clears the device shield.

## Open questions

- **The runtime mDNS lever.** BLE advertising has a clean per-runtime stop
  (`stop_advertising`); mDNS today is compile-time only (`--no-default-features`).
  Whether iroh 0.98.2's `MdnsAddressLookup::builder()` exposes a
  publish-vs-browse (announce-off, still-browse) option is unverified against
  iroh source. If it does, that is the small lever at
  `relay_transport.rs:561`; if not, the fallback is a runtime flag on
  `IrohTransport::bind` with a node restart on toggle — acceptable for a rare
  setting. This gates Phase 2's implementation, not this decision.
- **Default direction.** Default-discoverable is proposed on conference-context
  grounds. If the venue's threat model argues the other way, the FTUE choice is
  the place that flips cheaply.

## Consequences

- The chat app's mesh identity becomes something you can read aloud, recognise
  at a glance, hand over with a camera, and hide when you want to — without ever
  weakening the 64-hex id as the real anchor.
- One QR format spans the companion and the client: a `/connect` code scans
  into a chat DM.
- The device-verification shield is not solved here, but it is on a named path
  (Phase 3) rather than an open complaint.
- Fork surface touched: `hanthor/indiafoss-chat-android` (all three phases) and
  `hanthor/neutrino-iroh` (Phase 2's `stop_advertising` wiring). `docs/forks.md`
  is updated in the same change as each — a fork-touching feature documents its
  fork in the same PR.
