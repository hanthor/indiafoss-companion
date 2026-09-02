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

## Open, ordered by conference impact

| Rank | Issue                                                                                                                                            | Why it matters                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 0    | [#35](https://github.com/hanthor/indiafoss-companion/issues/35) One Android app                                                                  | Companion and chat ship as a single APK built from the chat fork |
| 1    | [#28](https://github.com/hanthor/indiafoss-companion/issues/28) P2P chat at the venue                                                            | Bad Wi-Fi/cellular at NIMHANS is the reason for the mesh         |
| 2    | [#29](https://github.com/hanthor/indiafoss-companion/issues/29) Chat provisioning                                                                | Organisers own the rooms; attendees find them without creating   |
| 3    | [#2](https://github.com/hanthor/indiafoss-companion/issues/2) 2025 data, [#32](https://github.com/hanthor/indiafoss-companion/issues/32) socials | Real speakers, booths and LinkedIn/GitHub links                  |
| 4    | [#31](https://github.com/hanthor/indiafoss-companion/issues/31) Handshake v2                                                                     | In-person verification, NFC, "who I met" recap                   |
| 5    | [#30](https://github.com/hanthor/indiafoss-companion/issues/30) Chat UX                                                                          | Receipts, replies, reactions, verification, DM notifications     |
| 6    | [#12](https://github.com/hanthor/indiafoss-companion/issues/12) Notifications                                                                    | Local reminders without push services                            |
| 7    | [#7](https://github.com/hanthor/indiafoss-companion/issues/7) Revision handling                                                                  | Safe schedule updates during the event                           |
| 8    | [#33](https://github.com/hanthor/indiafoss-companion/issues/33) Design finish                                                                    | Remaining screens, dark audit, display font decision             |
| 9    | [#27](https://github.com/hanthor/indiafoss-companion/issues/27) Neutrino mesh E2EE                                                               | Upstream Rust work; unencrypted mesh ships first                 |
| 10   | [#10](https://github.com/hanthor/indiafoss-companion/issues/10) Native M3 client                                                                 | Optional; WebView inside the chat fork is the interim answer     |
| 11   | [#11](https://github.com/hanthor/indiafoss-companion/issues/11) Neutrino/Matrix                                                                  | Parent issue; one item left (tested Android prototype)           |

## Sibling repository

`hanthor/indiafoss-chat-android` (Element X Neutrino fork): PR #2 IndiaFOSS
alignment, #3 CI packages token, #4 fork roadmap.

## Decisions log

- 2026-09-01: Matrix chat is optional and lives in the companion
  (`packages/matrix`). Superseded on 2026-09-02 for Android, see below.
- 2026-09-02: **One Android app.** The Android release is a single APK built
  from `hanthor/indiafoss-chat-android` (Element X + embedded Neutrino) with
  the companion web UI bundled inside it (#35). The Capacitor wrapper in this
  repo is a dev build only. Web and iOS keep the PWA.
- 2026-09-01: Handshake cards are signed with a per-device WebCrypto key;
  nothing is verified server-side; GitHub and LinkedIn are shared by default,
  email, phone and messengers are opt-in.
- 2026-09-02: Neutrino mesh E2EE is scoped in `neutrino-e2ee.md` but not
  implemented; mesh rooms are unencrypted and the UI says so.
- 2026-09-02: FFF Forward is not redistributable; Press Start 2P is the bundled
  display fallback pending a licence decision (#33).
