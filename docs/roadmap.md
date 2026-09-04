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

## Queue, as of 2026-09-03 (end of the batch)

Everything queued in [#34](https://github.com/hanthor/indiafoss-companion/issues/34)
that could be built and tested here is shipped. What is left is listed with the
reason it is left, so nobody picks it up expecting it to be a small job.

| #   | Issue                                                                                                                                     | State                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [#108](https://github.com/hanthor/indiafoss-companion/issues/108) Ranker step one simpler                                                 | Done, closed. Three steps: devrooms, swipe cards, then overlaps within a slot. Both apps.                                                                                       |
| 2   | [#107](https://github.com/hanthor/indiafoss-companion/issues/107) Onboarding wizard                                                       | Done, closed. Notifications, ticket, socials, then rank. Both apps.                                                                                                             |
| 3   | [#105](https://github.com/hanthor/indiafoss-companion/issues/105) Social links take a handle or a URL                                     | Done, closed.                                                                                                                                                                   |
| 4   | [#106](https://github.com/hanthor/indiafoss-companion/issues/106) First-class Prav                                                        | Done, closed. XMPP on cards and contacts.                                                                                                                                       |
| 5   | [#33](https://github.com/hanthor/indiafoss-companion/issues/33) Design finish                                                             | Tokens with one role each, a raw-colour guard, a real loading state, a dark-mode audit and a themed splash. Chat empty states belong with the messaging work and are left open. |
| 6   | [#7](https://github.com/hanthor/indiafoss-companion/issues/7) Production event revision handling                                          | The client guarantees are tested end to end. Hash-addressing the venue, graph and change assets is a publishing-pipeline change, not a client one, and is left open.            |
| 7   | [#31](https://github.com/hanthor/indiafoss-companion/issues/31) Handshake v2 leftovers                                                    | "Who I met" and the shareable summary card shipped. NFC tap-to-share and the mutual "verified in person" badge need two real phones and are left open.                          |
| 8   | [#110](https://github.com/hanthor/indiafoss-companion/issues/110) Native app parity leftovers                                             | Device verification needs a second real device to develop against and is left open. The rest of parity is tracked there.                                                        |
| 9   | [#35](https://github.com/hanthor/indiafoss-companion/issues/35), [#74](https://github.com/hanthor/indiafoss-companion/issues/74) P2P chat | Worked separately.                                                                                                                                                              |

Closed as done: #2, #10 (native client), #12 (notifications), #29, #32 (socials), #52–#55,
#60, #90 (ranking speed), #92 (dup of #93), #93 (simulator), #94 (contacts
import), #95 (photo), #96 (FOSS United as a link), #105 (social handles),
#106 (Prav), #107 (welcome wizard), #108 (three-step ranker).

Since then: reminders name the room and the walk and open the session when
tapped (`reminders.md`); Accrescent is documented as the Android channel we
are heading for (`accrescent.md`); the design tokens have one role each with a
guard against raw colours (#33); the revision-handling guarantees are tested
(#7, `release.md`); and the conference reads back as "who I met" with a card
you can share (#31, `contact-sharing.md`).

## Sibling repository

`hanthor/indiafoss-chat-android` (Element X Neutrino fork): PR #2 IndiaFOSS
alignment, #3 CI packages token, #4 fork roadmap.

## Decisions log

- 2026-09-04: **Three apps, not four; the Capacitor shell is retired.** PWA
  (Web/iOS), native Compose (Android), P2P chat as its own dedicated app
  (`hanthor/indiafoss-chat-android`), carrying everything from the
  `hanthor/neutrino` fork. Supersedes 2026-09-03's "Capacitor keeps shipping
  until [native reaches] parity" and 2026-09-02's "one Android app, companion
  first" choice of the Capacitor build for in-app P2P chat — chat is not
  embedded in either remaining companion app. See
  [ADR 0004](adr/0004-retire-the-capacitor-shell.md). The companion apps keep
  deep-linking to chat rooms (handoff, not embedding, per ADR 0001) and gain
  livestream support as a new surface — both tracked as follow-up work, not
  done in the same change as the retirement itself.
- 2026-09-03: **The Android app is the native Compose app.** Owner's
  direction: Material, Jetpack Compose, fully native feeling. `apps/android/native`
  is built out towards parity screen by screen (Rank, Plan itinerary,
  Settings and alarm reminders landed first); the Capacitor build keeps
  shipping only until then. Supersedes the 2026-09-02 "one Android app,
  companion first" decision's choice of the Capacitor build.

- 2026-09-03: **Ranking asks only what matters** (#90). A quick yes/no pass
  first, then head to head only for overlapping pairs not already settled by
  a direct answer or a wide rating gap; answered pairs are hydrated so a
  reload never re-asks; a taste per track, type and tag is learnt from the
  answers and blended into unranked sessions as a fading prior
  (`docs/ranking.md`).
- 2026-09-03: **Day simulator** (#93, dup #92). The app runs on a
  `RunningClock` at 10–600× from Settings or `?now=&speed=`, reminders fire
  on the simulated clock, everything is logged for the strip and for
  `window.__indiafossSim`; `scripts/simulate.mjs` walks a whole day and
  `tests/simulate.spec.ts` is a CI gate (`docs/simulator.md`).
- 2026-09-03: **Card: contacts import, photo, FOSS United as a link**
  (#94, #95, #96). The card fills from the phone's own contact (Contact
  Picker API or a `.vcf`), from every linked public profile at once (FOSS
  United page, GitHub API), carries a `PHOTO` link only when it reveals
  nothing new (stated picture, GitHub avatar with the GitHub link, Gravatar
  with the email), and lists the FOSS United profile among the other
  profiles rather than as identity.

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
- 2026-09-03: **Neutrino at conference scale** (`docs/neutrino-scale.md`). A
  loopback swarm harness (`tools/neutrino-probe/scripts/swarm.mjs`) ran 20,
  50 and 100 fork nodes in one room. Finding: a join storm is the failure
  mode (50 simultaneous joins leave a room undelivered for minutes; the same
  joins spread over seconds all land and a message reaches 99 peers in under
  0.8 s at about 28 MB per node). Rooms stay small on the mesh; the big room
  is the conference Spindle's job, which is the RFC's hub-based convergence.
- 2026-09-03: **Socials the easy way.** One paste box sorts any profile link
  or handle onto the right network, and "Fill from GitHub" reads the public
  social accounts list too.
- 2026-09-03: **Conference communications batch** (#111, #113, #114, #115).
  Bring your own Matrix ID: a mesh identity link published on the attendee's
  own account profile and verified by peers from the card, with "Continue on
  Matrix" on mesh DMs; an organiser-owned announcements room pinned first;
  session Q&A with upvotes in the per-session rooms; the RFC to the Spindle
  maintainers written out (`docs/spindle-rfc.md`) and a hosting note for the
  conference Spindle. Conversation export was dropped as clunky.
- 2026-09-03: **P2P step 9 (#82): media over the mesh with a size cap.**
  Patch `0011`: a content repository capped at 256 KiB, the authenticated
  and legacy download paths, `m.upload.size` advertised, and a federation
  download so a photo uploaded on one node opens on the next (fetched
  once, cached). The client learns the cap and refuses an oversized file
  before a byte leaves the phone, shrinking images first when the host can.
  Proofs: the two-node photo proof (encrypted attachment sent on A, opened
  on B), the cap refused client-side and server-side, Complement
  `TestMediaConfig`. The roadmap's last step: nothing stopped us.
- 2026-09-03: **P2P step 8 (#81): identity, whoami and account data.**
  Patch `0010`: the dev binary is multi-user by default (every login its
  own user, token and device), the to-device inbox is keyed per device so
  two devices of one user each get only their own room keys, `/account/whoami`,
  and persisted global and per-room account data served by both syncs —
  where the client's DM list lives, so it survives a reinstall. Proofs: two
  devices of one user each receive only their own to-device messages (fork
  test and probe contract); account data survives a node restart; Complement
  `TestAddAccountData`.
- 2026-09-03: **P2P step 7, device-list updates (#80).** Patch `0009`:
  `m.device_list_update` over the outbox on every device change, a
  persisted per-user stream, `device_lists.changed` through sliding and
  legacy sync, `/keys/changes`, and a fresh device id per sign-in on the
  client. Proof: the two-node reinstall test.
- 2026-09-03: **Complement for P2P** (owner ask). The fork now runs
  matrix-org/complement's client-server suite through Neutrino's own
  harness, in the companion's CI against the pinned rev
  (`neutrino-complement.yml`). Stock allowlist green; ten upstream tests
  added for the surface our patches built (typing, receipts, redaction,
  to-device, key upload/query/claim). Getting there took patch `0008`: a
  typing stop reported as an empty notice, ephemeral events in legacy
  `/sync`, `GET /rooms/{room}/event/{id}`, and a stricter, upload-ordered
  key directory. Left out and why is recorded in the fork's allowlist.
- 2026-09-02: The a11y suite runs every core screen in light **and** dark; a
  `--on-strong` token keeps text readable on mint and danger fills.
