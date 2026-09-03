# Roadmap

Mirror of the GitHub tracking issue
[#34](https://github.com/hanthor/indiafoss-companion/issues/34). When scope
changes, update the issue first, then this file, so neither drifts.

## Shipped

- Phases 0 to 8 of the original specification (schedule, ranking, itinerary,
  venue routing, booths, event sync); see `phases.md`.
- PR #15: profile and vCard sharing (#5), QR scanning (#8), calendar export
  (#14), editable itinerary (#4).
- PR #24: Matrix messaging with Megolm E2EE, per-session/booth/venue chats,
  handshake contact cards, messenger and social deep links, IndiaFOSS 2026
  design language, Material 3 Android shell, Element X fork alignment.
- Design handoff (2026-09-02): amber Scan CTA with the camera on load (#46),
  Connect as one live signed QR card (#47), Rank as stacked tap-to-pick cards
  (#48), Map as the NIMHANS floor plan with live rooms, a room sheet and the
  leave-by banner on every tab (`docs/venue-map.md`).
- #50: Must attend tier: extra reminders, pinned list on Plan, first in the
  leave-by banner; reminders only for bookmarked / must-attend sessions
  (`reminders.md`).
- #51 (closes #29): FOSDEM-style rooms on `reilly.asia`, `tools/matrix-rooms`,
  "Open room in Element" links, `/chat` room list; halls labelled Audi 1/2/3.
  Server step pending: run the tool once with an organiser token (see #29).
- Device feedback from the nightly APK (#52–#55, PRs #57 and #58): app bar
  below the Android 15 status bar, camera permission for scanning, Scan icon,
  manual entry behind a disclosure; map pinch/drag/wheel zoom with compact
  labels; XMPP (Prav) and Delta Chat on cards; FOSS United by username.

## Open, ordered by conference impact

| Rank | Issue                                                                                 | Why it matters                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | [#35](https://github.com/hanthor/indiafoss-companion/issues/35) One Android app       | Device verification of the Neutrino plugin, foreground service, working Packages token                                                                            |
| 1    | [#28](https://github.com/hanthor/indiafoss-companion/issues/28) P2P chat at the venue | Architecture decided and shipped; two-phone verification is the only step left                                                                                    |
| 2    | [#31](https://github.com/hanthor/indiafoss-companion/issues/31) Handshake v2          | Remaining: NFC (needs a native plugin), end-of-conference summary image                                                                                           |
| 3    | [#30](https://github.com/hanthor/indiafoss-companion/issues/30) Chat UX               | Remaining: device verification, which waits on #27                                                                                                                |
| 4    | [#33](https://github.com/hanthor/indiafoss-companion/issues/33) Design finish         | Remaining: visual regression snapshots, empty states                                                                                                              |
| 5    | [#12](https://github.com/hanthor/indiafoss-companion/issues/12) Notifications         | Remaining: a push while the _web_ app is closed, which the no-push policy rules out                                                                               |
| 6    | [#27](https://github.com/hanthor/indiafoss-companion/issues/27) Neutrino mesh E2EE    | Written: `patches/neutrino/` carries the client-server and federation halves, verified on loopback; carried on the `hanthor/neutrino` fork, not offered upstream. |
| 7    | [#10](https://github.com/hanthor/indiafoss-companion/issues/10) Native M3 client      | In progress: `apps/android/native` builds in CI; Now/Schedule/Plan/Map render natively                                                                            |

Closed as done: #2 (2025 data), #7 (revision handling), #29 (organiser rooms),
#32 (socials), #52–#55 and #60 (device and UX feedback).

## Sibling repository

`hanthor/indiafoss-chat-android` (Element X Neutrino fork): PR #2 IndiaFOSS
alignment, #3 CI packages token, #4 fork roadmap.

## Decisions log

- 2026-09-01: Matrix chat is optional and lives in the companion
  (`packages/matrix`). Superseded on 2026-09-02 for Android, see below.
- 2026-09-02: **One Android app, companion first.** The Android release is
  this repo's Capacitor build. P2P/Matrix chat is an optional feature inside
  it, using the existing `/chat` screens plus a Capacitor plugin that embeds
  the Neutrino node. The Element X fork (`hanthor/indiafoss-chat-android`) is
  parked as a reference (#35).
- 2026-09-01: Handshake cards are signed with a per-device WebCrypto key;
  nothing is verified server-side; GitHub and LinkedIn are shared by default,
  email, phone and messengers are opt-in.
- 2026-09-03: **P2P build-out roadmap** filed as #74 with nine sequential
  sub-issues (#75–#83), worked in order, stopping at the first thing that
  does not work. Step 1 (#75) is done: Neutrino's sliding sync now carries
  real `to_device` events and key counts and wakes a long-poll on a room key,
  and a two-node test proves an encrypted message from one of our client
  sessions decrypts on the other node. It also caught a real client bug: our
  sliding-sync `conn_id` was 19 characters against MSC4186's cap of 16, and
  Neutrino rejects that, so every mesh sync had been failing silently.
- 2026-09-03: **P2P step 6** (#79): typing notices and read receipts cross
  the mesh. The fork accepts `/typing` and `/receipt`, sends `m.typing` and
  `m.receipt` EDUs to every server in the room through the durable outbox,
  applies the inbound ones, and surfaces both through the sliding-sync
  extensions — a typing notice wakes a waiting long-poll, which is the whole
  point of one. The client enables the typing extension and folds it into the
  ephemeral events it already reads.
- 2026-09-03: **P2P step 5** (#78): redaction on the mesh. Server side (patch
  `0006`) an `m.room.redaction` is an ordinary event and is applied on read —
  sync and `/messages` prune the target when the redaction is allowed, with
  `unsigned.redacted_because` alongside. Client side the reducer blanks a
  redacted message, drops a redacted reaction's relation so it stops counting,
  and blanks cached copies when a redaction arrives later. Un-react and delete
  now work between two nodes.
- 2026-09-03: **P2P step 4** (#77): mesh direct messages are created
  encrypted when the server carries key material — asked for at creation and
  set as a state event, since Neutrino ignores `initial_state` — and the room
  record says what actually happened, so the padlock means it. Conference
  rooms stay unencrypted on purpose: Megolm history is unreadable to whoever
  joins later, and a hall room at a conference is mostly people joining later.
  The `Neutrino e2e` workflow now builds the fork at the pinned rev on every
  PR touching the chat packages, starts two nodes, and runs the two-node
  proofs; the stock upstream run stays weekly with the tripwires armed.
- 2026-09-03: **P2P step 3** (#83): the phone bindings build against the fork.
  `neutrino-iroh v0.8.2` pins upstream Neutrino at `v0.7.1`, which is commit
  `90bc1b1` — exactly the base of our fork branch — so a cargo `[patch]` in
  the bindings workflow swaps in `hanthor/neutrino` at the rev pinned in
  `version.json` and the seam is identical by construction; `cargo check` of
  `neutrino-ffi-ble` against the fork passes. The `.aar` is published under a
  version that names both pins (`0.8.2-e2ee.<rev>`) so it cannot be mistaken
  for upstream's.
- 2026-09-03: **P2P step 2 done** (#76): device keys, one-time keys and the
  to-device inbox persist in sqlite, written through in order and reloaded
  at start. Proven by a test that kills node B mid-conversation, restarts it
  on the same data, and still decrypts both ways. That test caught a second
  real client bug: on `M_UNKNOWN_POS` our client retried the same stale
  sliding-sync `pos` forever instead of starting a fresh connection, so a
  restarted mesh node was never synced again.
- 2026-09-02: Neutrino mesh E2EE is **written but not upstream**. Both halves —
  the client-server key surface and the federation one — live in
  `patches/neutrino/`, verified against two servers on loopback. Mesh rooms stay
  unencrypted, and the UI says so, until a Neutrino carrying them ships: a patch
  in this repository encrypts nothing on anyone's phone.
- 2026-09-02: FFF Forward is not redistributable; Press Start 2P is the bundled
  display fallback pending a licence decision (#33).
- 2026-09-02: **The native client renders natively, neutral M3.** `apps/android/native`
  is a real Compose app over a pure-Kotlin port of the schedule and Elo engines,
  themed by dynamic colour with mint only as the fallback seed and no IndiaFOSS
  wordmark or pixel font. The Capacitor build stays the shipping Android app.
  See [ADR 0002](adr/0002-native-compose-client-rendered-natively.md).
- 2026-09-02: **In-app chat is P2P only.** No public-homeserver sign-in in the
  app; Matrix ids on profiles open in Element. Reason: Neutrino nodes do not
  federate with public Matrix and identities cannot be linked, so mixing both
  would split conversations (#35).
- 2026-09-02: Public rooms live on the organiser's homeserver, FOSDEM-style
  (owner): rooms on matrix.reilly.asia joined from attendees' existing Matrix
  accounts via Element links; no accounts handed out (#29). Raw iroh was
  rejected: no BLE transport, and it would rebuild what Neutrino provides.
- 2026-09-02: Map v1 highlights the destination room rather than drawing a
  path; the 2025 programme is shown on the 2026 NIMHANS plan through room
  aliases (`venue-map.md`).
- 2026-09-02: The halls are Audi 1, 2 and 3 (owner); plan ids stay
  `hall-1..3` from the drawing. Reminders are tiered: must-attend >
  bookmarked > silent; the programme as a whole never notifies.
- 2026-09-02: **No walk estimates** (owner): the Now screen, the banner and the
  map sheet no longer show walking times, leave-by or routing steps; the
  routing profile setting is gone. The map keeps the Google I/O-style peeking
  sheet and highlights the destination instead (#60).
- 2026-09-02: Event revisions publish immutable hash-addressed assets and the
  client downloads the named asset in full before replacing anything; the
  committed normalized bundle is rewritten by the same sync so the two cannot
  drift (`phases.md`).
- 2026-09-02: Display font decided: Press Start 2P (OFL) ships as the display
  face, FFF Forward is referenced but never bundled (#33).
- 2026-09-02: The a11y suite runs every core screen in light **and** dark; a
  `--on-strong` token keeps text readable on mint and danger fills.
