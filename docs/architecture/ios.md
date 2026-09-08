# iOS Companion and Chat architecture

8 September 2026. Proposed direction; no iOS implementation or code commits. Companion's existing [PR #179 / ADR 0005](https://github.com/hanthor/indiafoss-companion/pull/179) remains open. This document refines its staged approach and adds the independent native Companion story. Parent: [system architecture](system.md), Companion #194.

## Recommendation

Support iPhones at IndiaFOSS 2026 with the Companion PWA and a rehearsed ordinary Matrix-client journey. Design a SwiftUI Companion as an independent follow-up with native reminders and sharing. Admit a dedicated Element X iOS Chat fork only when a signed-device build, account lifecycle and Wi-Fi transport experiment justify the ongoing maintenance. Add CoreBluetooth after the LAN path; treat background mesh participation as measured capability, not an always-on guarantee.

This deliberately revises ADR 0004's permanent-sounding app-count constraint only as a proposal: retiring a Capacitor wrapper does not prevent a later useful native Companion. It does not authorize bringing that wrapper back or promise two new native apps before the conference.

## What each stage offers

| Stage                             | Companion                                                                                 | Chat                                                                                              | Exit evidence                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| I0: conference baseline           | PWA installed or browser, cached event/plan, QR and room handoff                          | Tested App Store Matrix client using existing or provisioned account                              | Physical iPhone: fresh onboarding, encrypted DM, room join, verification/recovery, cold/warm links and loss of connectivity                 |
| I1: native Companion              | SwiftUI schedule/plan/venue/contact features, bundled data, local reminders, share/import | Same standard client; native Companion adds no mesh promise                                       | Signed device build, shared fixture compatibility, offline launch, VoiceOver, Dynamic Type, reminder reconciliation and upgrade persistence |
| I2: custom Chat on classic Matrix | Same Companion                                                                            | Element X fork with branded entry points, account-aware handoff, tested server/push integration   | Reproducible signed artifact and complete account/extension/recovery tests                                                                  |
| I3: foreground LAN mesh           | Same Companion                                                                            | Embedded Rust node, seeded peers and compatible Bonjour adapter, mesh/classic lifecycle isolation | iPhone↔Android and gateway encryption, WAN absent/LAN retained, permission denial and resume recovery                                       |
| I4: BLE participation             | Same Companion                                                                            | CoreBluetooth adapter and negotiated transport, explicit discovery/session control                | Cross-platform hardware evidence for both roles, lock/background, reconnect, throughput and battery                                         |
| I5: deeper continuity             | Same Companion                                                                            | Verified continuation/person projection and encrypted seam when core protocol passes              | Shared trust/outbox contracts and asynchronous topology tests, not an iOS-only workaround                                                   |

I1 and the Chat track can proceed independently. Custom Chat I2 and I3 may share a fork but need separate acceptance evidence. Standard-client I0 is useful even if all later stages are deferred.

## Companion design

Proposed location: `apps/ios/native` in the Companion monorepo, following existing repository conventions when implementation starts. Use SwiftUI navigation and native accessibility. Keep a small domain layer for event validation, personal plan operations, contact-card parsing and handoff. Consume the shared versioned contracts/fixtures; do not embed the TypeScript runtime solely to share small algorithms, and do not rewrite the Android client into a new cross-platform stack.

Persist event revisions separately from the attendee plan, using a transactional local store with explicit migrations. Bundle a valid event snapshot. Refresh through bounded URLSession requests while active; background opportunities are supplemental. Schedule local reminders from selected sessions and replace/cancel them after data updates. Denied notifications leave the plan fully usable. Calendar export should explain that a static exported calendar may not update automatically.

Use the camera for QR scanning only when requested, offer file/share import, and validate untrusted payload sizes and schemas before applying them. Preserve the distinction between meeting someone, verifying a card signature and verifying a Matrix account. Keep contact data private by default; do not request system Contacts access for the core app flow. Use native share sheets and export a portable versioned file as a recovery path.

The native Companion owns its own personal state. PWA storage does not automatically migrate into it; provide a deliberate export/import journey with preview and duplicate handling. Do not require the companion and Chat to share an App Group, signing team or keychain to function. Public handoff is enough.

On iOS, the PWA remains a valuable broad-access baseline, but caching is not the same as guaranteed durable native storage. Rehearse storage loss and export recovery. Home Screen web apps can request Web Push from user interaction on iOS/iPadOS 16.4+, using APNs; this requires connectivity and is not an offline alarm mechanism. ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/))

## Chat base and maintenance cost

Upstream inspected at [1af16e92](https://github.com/element-hq/element-x-ios/commit/1af16e92db95fa88907b4dc09a2a3a9a848c1527). Its develop [project.yml](https://github.com/element-hq/element-x-ios/blob/1af16e92db95fa88907b4dc09a2a3a9a848c1527/project.yml) sets iOS 18.5 and MatrixRustSDK 26.09.07. The latest listed release at review time is [26.08.4](https://github.com/element-hq/element-x-ios/releases/tag/release/26.08.4), published 25 August. These are different snapshots; do not infer the released app's minimum OS from develop or copy the Android SDK pin into Swift.

Choose the fork base by tested compatibility and device coverage. Proposed native Companion OS floor is independent of Chat's; decide it from attendee coverage and the chosen APIs rather than inheriting 18.5 automatically. Preserve PWA access for excluded devices. Record Xcode, Swift, Rust targets and Swift SDK package together. Keep the fork small: application configuration, account coordination, public handoff, embedded-node lifecycle and transport adapter; upstream general fixes where practical.

The current [UserSessionStore](https://github.com/element-hq/element-x-ios/blob/1af16e92db95fa88907b4dc09a2a3a9a848c1527/ElementX/Sources/Services/UserSession/UserSessionStore.swift) enumerates stored IDs but restores the first credential into one session. It also has an all-account reset path. This is not evidence of a complete concurrent-account product. Design an explicit coordinator with separate stores, active-account selection and account-scoped reset/logout. Audit transient restoration errors so unavailable mesh transport cannot cause credential/database deletion. Do not transplant Android's foreground-service lifecycle to iOS.

The [notification extension](https://github.com/element-hq/element-x-ios/blob/1af16e92db95fa88907b4dc09a2a3a9a848c1527/NSE/Sources/NotificationServiceExtension.swift) already handles shared-container/keychain access, concurrent delivery and locked-after-reboot conditions. Preserve and test those mechanisms while introducing accounts. Route every push to its account, coordinate SDK database access, and use a safe generic notification when decryption is unavailable. The extension is not a permanent mesh daemon. Own-bundle push registration, APNs credentials, push gateway configuration, app/extension entitlements and distribution profiles are concrete fork work, not branding substitutions.

Recent upstream reports [#6115](https://github.com/element-hq/element-x-ios/issues/6115) about verification and [#6108](https://github.com/element-hq/element-x-ios/issues/6108) about call navigation are reports, not reproduced project defects. Add their scenarios to base-selection tests. Do not claim stock-client verification, backup or calls work against Spindle until that actual stack passes.

## Rust embedding and transport boundary

PR #179's generated Swift bindings demonstrate an FFI surface, not a linked, signed, running iOS application. Reaching `ring` during a Linux cross-check identifies a current blocker; it does not establish that there are no later compiler, linker, simulator, concurrency, networking or store-lifecycle issues.

First native-mesh spike: build the selected core and transport for physical arm64 iOS and the appropriate simulator target on a Mac; package an XCFramework/Swift package with matching generated bindings; start and stop a LAN-only node; persist its identity; run an encrypted conversation on physical devices. Measure memory and startup overhead before integrating the full UI. Bind the local client API to loopback with appropriate authentication and avoid unnecessary network exposure.

Proposed boundaries: `NodeController` owns serialized start/stop/resume and stable storage; `DiscoveryProvider` yields bounded, expiring peer hints; `TransportAdapter` supplies backpressured packet exchange; `AccountCoordinator` owns SDK sessions; `CapabilityState` describes currently usable routes. None should be driven directly by view creation/destruction. Define callback cancellation, ownership across Swift/Rust, maximum frames, errors and queue limits before exposing `DatagramLink` through UniFFI. Reuse one framing contract across Android and iOS; do not implement a second cryptographic protocol in Swift.

Prefer Swift CoreBluetooth behind the existing transport seam as a proposal; compare against a Rust/objc2 backend at the adapter-design gate. A generated callback API must still demonstrate threading and lifetime safety. Do not assume BLE L2CAP stream boundaries equal datagrams; specify framing, MTU negotiation, flow control and reconnect behavior.

## Local Wi-Fi, Bluetooth and background execution

Local-network authorization and multicast entitlement are separate. Apple requires local-network access for Bonjour; declared specific service types can use system Bonjour APIs without the restricted entitlement needed for raw multicast/broadcast and certain broad Bonjour operations. Therefore a Network.framework/Bonjour adapter may avoid the existing raw-UDP discovery requirement, while seeded unicast peers provide another path. Neither bypasses user-denied local-network access. ([Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy))

Test compatibility with the actual mesh advertisements before changing discovery. Fixed peers still need reachable addresses and correct trust; QR peer hints must not silently install arbitrary trusted gateways. LAN chat can work without WAN if the required local services, DNS, TLS, authentication and routes remain usable. A remote Spindle or new online account cannot be assumed reachable in that condition.

Traditional CoreBluetooth background modes are event-driven, with scanning/advertising restrictions; background peripheral service UUID advertising has iOS-specific discovery behavior. That creates an Android interoperability test, not just a battery question. State restoration does not promise a permanently running process. ([Apple background guide](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html))

Update the older ADR for a newer option: Apple documents that iOS 26+ can retain certain foreground Bluetooth privileges with an instantiated CBManager and a Live Activity started before backgrounding. Evaluate an explicit attendee-started nearby-chat session with a truthful Live Activity, alongside older-OS behavior. This does not establish indefinite IP socket execution, guaranteed delivery, or perpetual relay eligibility. ([Current CoreBluetooth documentation](https://developer.apple.com/documentation/corebluetooth/))

Test iPhone central/Android peripheral and the reverse, foreground/background on either side, locked devices, user termination, Bluetooth toggling, permission revocation, low power and reconnect after long absence. Present “Nearby chat active” and “Open Chat to reconnect” only when accurate. Prefer infrastructure gateways for durable relay; a backgrounded gateway cannot deliver ciphertext into a suspended iPhone application merely by being online.

## Handoff and supported topology

Use one public HTTPS handoff format with Universal Links for owned native applications and a useful website fallback. Publish/verify the domain association during app distribution; test cold/warm launch and absent-app behavior. Offer a standards-compatible Matrix link for third-party clients, with copyable room/MXID and browser fallback. Do not assume a `matrix:` URL selects the intended installed client or account on every iPhone. Offline QR contact import should carry sufficient public data without requiring a URL fetch.

I0 supports ordinary Matrix conversations over a reachable compatible server. Conference-room bridging and encrypted remote-to-mesh delivery remain subject to #129/#165/#176. The phrase “gateways carry the rooms” cannot stand in for proof that an offline Android attendee can decrypt a remote iPhone message. Distinguish same-server classic conversations, a LAN-only reachable server, direct gateway participation and asynchronous downstream-phone delivery in documentation and test results.

## Branding, distribution and release admission

Companion and Chat use related icons and event entry points while respecting native navigation, Dynamic Type, VoiceOver, Reduce Motion, light/dark appearances and semantic colors. No pixel font for dense schedules or messages. Store metadata/screenshots must show the actual supported mode and retain the unofficial-project disclosure.

Before promising native distribution, record the Apple developer/distribution owner, bundle IDs, signing and extension capabilities, Mac CI availability, tested minimum OS and physical-device matrix. Validate required entitlements and TestFlight/App Store distribution through a signed build; generated bindings and simulator screenshots do not meet the gate. Keep PWA/standard-client instructions available regardless of native release timing.

Native Companion admission: meaningful native benefit, a named maintenance owner and offline/persistence/accessibility evidence. Native Chat admission: maintained fork base, complete credentials/notification lifecycle and a functioning signed-device build. Mesh admission: physical-device encrypted interoperability and truthful lifecycle behavior. BLE background capability is a separate optional gate. Until those pass, the honest 2026 promise is PWA Companion plus tested reachable-server Matrix chat.
