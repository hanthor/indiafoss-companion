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

| Rank | Issue                                                                                                                                            | Why it matters                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 0    | [#35](https://github.com/hanthor/indiafoss-companion/issues/35) One Android app                                                                  | Companion first, P2P chat add-on; remaining: plugin device check, foreground service, Packages token |
| 2    | [#2](https://github.com/hanthor/indiafoss-companion/issues/2) 2025 data, [#32](https://github.com/hanthor/indiafoss-companion/issues/32) socials | Real speakers, booths and LinkedIn/GitHub links                                                      |
| 3    | [#31](https://github.com/hanthor/indiafoss-companion/issues/31) Handshake v2                                                                     | In-person verification, NFC; signed vCard and "who I met" shipped                                    |
| 4    | [#12](https://github.com/hanthor/indiafoss-companion/issues/12) Notifications                                                                    | Tiers shipped (#50); leave-by push while the app is closed                                           |
| 5    | [#7](https://github.com/hanthor/indiafoss-companion/issues/7) Revision handling                                                                  | Safe schedule updates during the event                                                               |
| 6    | [#33](https://github.com/hanthor/indiafoss-companion/issues/33) Design finish                                                                    | Four handoff screens shipped; dark audit, display font decision                                      |
| 7    | [#28](https://github.com/hanthor/indiafoss-companion/issues/28) P2P chat at the venue                                                            | Mesh behaviour: discovery, outbox flush, offline tests                                               |
| 8    | [#30](https://github.com/hanthor/indiafoss-companion/issues/30) Chat UX                                                                          | Receipts, replies, reactions, member list                                                            |
| 9    | [#27](https://github.com/hanthor/indiafoss-companion/issues/27) Neutrino mesh E2EE                                                               | Upstream Rust work; unencrypted mesh ships first                                                     |
| 10   | [#10](https://github.com/hanthor/indiafoss-companion/issues/10) Native M3 client                                                                 | Optional later optimisation of the companion surfaces                                                |
| 11   | [#11](https://github.com/hanthor/indiafoss-companion/issues/11) Neutrino/Matrix                                                                  | Parent issue for the chat add-on                                                                     |

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
- 2026-09-02: Neutrino mesh E2EE is scoped in `neutrino-e2ee.md` but not
  implemented; mesh rooms are unencrypted and the UI says so.
- 2026-09-02: FFF Forward is not redistributable; Press Start 2P is the bundled
  display fallback pending a licence decision (#33).
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
