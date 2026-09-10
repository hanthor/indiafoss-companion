# 0005 — iOS and the mesh: staged, with the Spindle carrying iPhones first

- Status: **Proposed**
- Date: 2026-09-06
- Deciders: James (maintainer)
- Related: [ADR 0003](0003-mesh-interop-by-federation-not-bridging.md),
  [ADR 0004](0004-retire-the-capacitor-shell.md), `docs/forks.md`,
  companion #176 (the E2EE seam)

## Context

ADR 0004 gave iOS the PWA and no native wrapper. That covers the _companion_.
The chat app — the mesh node — exists only for Android, so an iPhone attendee
today has chat only where the internet is: the venue Spindle. The question is
what an iOS version of the mesh chat would take, and what iPhone attendees get
meanwhile.

This ADR is written against things measured on 2026-09-06, not assumptions:

- **The FFI surface ports.** `uniffi-bindgen` in library mode over
  `libneutrino_ble.so` generates the complete Swift API — both namespaces
  (`neutrino`: config, handle, capture; `neutrino_ble`: the entrypoints),
  headers and modulemaps — with no changes to any crate. 49 KB of Swift, on a
  Linux box, today.
- **The Rust core stops at exactly one place on Linux.** With the
  `aarch64-apple-ios` std installed, `cargo check` proceeds until `ring`,
  whose build script compiles C and needs Apple's clang and an iOS SDK
  sysroot. Everything before it type-checks. There is no Linux workaround —
  Apple's SDK is not redistributable — so **a Mac is the first hard gate**,
  and the only toolchain gate.

The gates after the toolchain, in the order they bite:

1. **No BLE backend.** The medium's `ble` feature is Android (`blew`/JNI)
   with a Linux dev backend (`bluer`/D-Bus). iOS needs CoreBluetooth — either
   a new Rust backend (objc2) or a Swift-side transport injected through the
   `DatagramLink` seam, which would mean promoting that seam to a uniffi
   callback interface. Design work, not typing work.
2. **mDNS needs Apple's permission.** The Wi-Fi discovery path uses UDP
   multicast, which on iOS requires the `com.apple.developer.networking.multicast`
   entitlement — granted by application to Apple, not by a checkbox.
3. **iOS backgrounds the node.** BLE advertising in background moves service
   UUIDs to the overflow area and throttles scanning; sockets are suspended
   minutes after backgrounding. An iPhone is a _worse mesh node_ than an
   Android phone by platform policy, independent of our code. A phone-class
   node that only works with the screen on is still useful in a hall, but the
   always-on relay role belongs to Android handsets and the gateways.
4. **The base app exists.** `element-x-ios` is the same product family as the
   Android fork, on the same matrix-rust-sdk. The embedding work mirrors
   `indiafoss-chat-android`: bindings module, forced-provider login, node
   lifecycle service. Known shape, second implementation.

## Decision

Stage it, and do not let the mesh app block iPhone chat at the event:

**Stage 0 — now, no new code.** iPhone attendees get chat through the venue
Spindle: the companion PWA hands off with `matrix:` URIs (matrix.to as web
fallback), and any App Store Matrix client — Element X iOS first among them —
signs into `conf.example` over venue Wi-Fi or cellular. E2EE DMs work there;
session rooms work there; the gateways carry those rooms onto the mesh for
Android. What an iPhone does not get is the offline-in-the-hall path. This is
the documented, supported iOS story for IndiaFOSS 2026 unless stage 2 lands
first.

**Stage 1 — when a Mac is available.** Fork `element-x-ios`, wire the
bindings (`uniffi` Swift output above), run the embedded node **Wi-Fi-only**:
`start_lan` composition, no BLE, mDNS behind the multicast entitlement with
`--peer`-style gateway seeding as the fallback the entitlement cannot block.
A screen-on iPhone on venue Wi-Fi becomes a real mesh participant; the
gateway remains its bridge when backgrounded. This stage needs: a Mac, an
Apple developer account, the multicast entitlement application, and a
TestFlight distribution decision.

**Stage 2 — CoreBluetooth.** The `DatagramLink` seam as a uniffi callback
interface, a Swift CoreBluetooth transport behind it, and the background
tradeoffs measured on hardware rather than asserted. Not scheduled; scoped
here so it is not rediscovered.

## Consequences

- ADR 0004's "three apps, not four" holds until stage 1 actually starts; this
  ADR is the fourth app's admission ticket, not its announcement.
- The Spindle stops being optional for iOS attendees — it _is_ the iOS story.
  That raises the priority of the venue gateway (#165) and of publishing the
  conference homeserver's name in attendee-facing material.
- `docs/forks.md` gains no entry yet: no fork diverges for iOS until stage 1.
- The multicast entitlement application should be filed as soon as an Apple
  account exists — it is the longest external lead time in stage 1.
