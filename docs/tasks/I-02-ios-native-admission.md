# I-02 — Decide whether a native iOS Companion is worth maintaining, before anyone writes Swift

- Status: Blocked — admission gate
- Repository: indiafoss-companion
- Tracks: [#199](https://github.com/hanthor/indiafoss-companion/issues/199)
  (stage I1),
  [PR #179](https://github.com/hanthor/indiafoss-companion/pull/179)
- Size: M

## Why this matters

A native iOS Companion is a fourth application to build, sign, distribute,
test on hardware and keep alive after the conference. If it is admitted
without a maintainer, it becomes an unmaintained app in a store with our
name on it — which is worse for an attendee than the PWA they would
otherwise have used. If it is admitted with a real benefit and a real owner,
iPhone attendees get native reminders, native accessibility and durable
storage the PWA cannot promise.

This task does not decide. It assembles the dossier the maintainer decides
from.

## This task does NOT authorize creating `apps/ios/`

Say it once here and once at the end, because it is the thing most likely to
go wrong: **the output of this task is a written dossier, not code.** Do not
create `apps/ios/`. Do not create an Xcode project, a `project.yml`, a
`Package.swift`, a `.xcodeproj`, or a single `.swift` file. Do not add an iOS
job to CI. Do not open a distribution account on the project's behalf.

`docs/architecture/ios.md` describes the location as a proposal, in the
conditional:

> Proposed location: `apps/ios/native` in the Companion monorepo, following
> existing repository conventions **when implementation starts**.

Implementation has not started, and this task is what determines whether it
ever does.

## Context you need

### The gate itself

From `docs/architecture/ios.md`:

> Native Companion admission: meaningful native benefit, a named maintenance
> owner and offline/persistence/accessibility evidence.

Three conditions, all of which must be answered in writing:

1. **A meaningful native benefit over the PWA.** Not "it would feel nicer" —
   a named capability an attendee gets that the PWA demonstrably does not.
   The candidates the architecture names are local reminders that fire
   without connectivity (the PWA's Web Push cannot: see I-01), durable
   transactional storage that Safari cannot evict, native share sheets, and
   VoiceOver/Dynamic Type behaviour. Each candidate must be argued against
   what I-01 actually measured, not against an assumption about the PWA.
2. **A named maintenance owner.** A person, named, who is accountable for
   the app after IndiaFOSS 2026. "The maintainer" is not a name unless the
   maintainer says it is.
3. **Offline, persistence and accessibility evidence.** The stage table
   calls for: "Signed device build, shared fixture compatibility, offline
   launch, VoiceOver, Dynamic Type, reminder reconciliation and upgrade
   persistence."

Separately, and **before any distribution promise is made in any issue, PR,
README or store listing**:

> Before promising native distribution, record the Apple
> developer/distribution owner, bundle IDs, signing and extension
> capabilities, Mac CI availability, tested minimum OS and physical-device
> matrix. Validate required entitlements and TestFlight/App Store
> distribution through a signed build; generated bindings and simulator
> screenshots do not meet the gate. Keep PWA/standard-client instructions
> available regardless of native release timing.

### The correction PR #179 needs

PR #179 is open and its evidence is real but narrower than it reads. From
`docs/architecture/ios.md`:

> PR #179's generated Swift bindings demonstrate an FFI surface, not a
> linked, signed, running iOS application. Reaching `ring` during a Linux
> cross-check identifies a current blocker; it does not establish that there
> are no later compiler, linker, simulator, concurrency, networking or
> store-lifecycle issues.

ADR 0005 states the two measurements PR #179 rests on: `uniffi-bindgen` in
library mode over `libneutrino_ble.so` generates the complete Swift API on a
Linux box, and with the `aarch64-apple-ios` std installed `cargo check`
proceeds until `ring`, whose build script needs Apple's clang and an iOS SDK
sysroot. Both are true. Neither is an app. The dossier must say so in those
words, because "the FFI surface ports" has already been read as "iOS is
nearly done".

### Capacitor is not coming back

ADR 0004 is **Accepted** and deleted `apps/android/capacitor`: "The
Capacitor Android shell (`apps/android/capacitor`) is deleted. The native
Compose client is the only Android distribution; the PWA is the only
Web/iOS distribution." `docs/architecture/ios.md` revises only the
app-_count_ framing, and only as a proposal:

> This deliberately revises ADR 0004's permanent-sounding app-count
> constraint only as a proposal: retiring a Capacitor wrapper does not
> prevent a later useful native Companion. It does not authorize bringing
> that wrapper back or promise two new native apps before the conference.

A dossier that proposes a WebView wrapper, a Capacitor shell, or any
cross-platform runtime around the existing PWA does not satisfy this gate —
it re-opens a decision that was made with device evidence.

### The OS floor is ours to choose

> Upstream inspected at 1af16e92. Its develop project.yml sets iOS 18.5 and
> MatrixRustSDK 26.09.07. The latest listed release at review time is
> 26.08.4, published 25 August. These are different snapshots; do not infer
> the released app's minimum OS from develop or copy the Android SDK pin
> into Swift.

and:

> Proposed native Companion OS floor is independent of Chat's; decide it
> from attendee coverage and the chosen APIs rather than inheriting 18.5
> automatically. Preserve PWA access for excluded devices.

So the dossier proposes a floor with a reason: which iOS versions IndiaFOSS
attendees actually carry, and which APIs the named benefits require. Element
X's develop branch is not the reason.

## What unblocks this, and who decides

The **maintainer (James) decides**, and records the decision on
[#199](https://github.com/hanthor/indiafoss-companion/issues/199) —
admitted, deferred, or rejected. This task is unblocked when the dossier is
written and reviewed; the _implementation_ it might authorize stays blocked
until that recorded decision exists.

Two of the dossier's sections cannot be written without hardware and an
account, and those are the parts that keep this Blocked in practice:

- **A Mac.** ADR 0005: "a Mac is the first hard gate, and the only toolchain
  gate," because Apple's SDK is not redistributable. Without one, no signed
  build and no honest statement about compiler, linker or simulator issues.
- **An Apple Developer account**, with a named human or organisation on it,
  before bundle IDs, entitlements, TestFlight or a physical-device matrix
  mean anything.

Note that a native _Companion_ — schedule, plan, venue, contacts, handoff —
needs neither the Rust core nor the multicast entitlement. It is
mesh-free by design: `docs/architecture/ios.md` says the native Companion
"adds no mesh promise". The `ring` blocker and the entitlement lead time
belong to the Chat/mesh stages, not to this one. Do not let them be quoted
as blockers for a plain SwiftUI Companion, and do not let a plain SwiftUI
Companion smuggle in an embedded node.

## What to do

Write **one document** — `docs/ios-native-admission.md` is the suggested
path — containing the following sections. Nothing else in this change.

1. **What PR #179 does and does not show.** Two paragraphs, using the
   correction quoted above verbatim. Then state what would show more: a
   linked, signed application running on a physical iPhone.

2. **The native benefit, argued against measured PWA behaviour.** For each
   candidate benefit, cite what I-01 recorded on a physical iPhone. A
   benefit whose PWA counterpart was never measured is not yet an argument.
   If I-01 has not run, say so and stop — this section cannot be honestly
   written before it.

3. **The maintenance owner.** A name, and what they are committing to:
   Xcode upgrades, annual OS releases, store review responses, device
   testing before each release, and who covers them when unavailable. If
   there is no name, the dossier's recommendation is "defer", and that is a
   legitimate and useful outcome.

4. **Distribution facts.** Apple developer/distribution owner; proposed
   bundle IDs; signing and extension capabilities required; Mac CI
   availability (or its absence, honestly — GitHub-hosted macOS runners cost
   money and have their own limits); tested minimum OS with the coverage and
   API reasoning behind it; and the physical-device matrix the project can
   actually reach. Every unknown is written as "unknown", not omitted.

5. **Scope, if admitted.** The proposed location is `apps/ios/native`. The
   architecture's design constraints, which the dossier should restate as
   the contract the implementation would be held to: SwiftUI navigation and
   native accessibility; a small domain layer for event validation, plan
   operations, contact-card parsing and handoff; consume the shared
   versioned contracts and fixtures in
   [`packages/model/src/contracts/`](../../packages/model/src/contracts) and
   [`packages/test-fixtures/fixtures/`](../../packages/test-fixtures/fixtures)
   rather than embedding the TypeScript runtime; event revisions persisted
   separately from the attendee plan in a transactional store with explicit
   migrations; a bundled valid event snapshot; local reminders reconciled
   after data updates; denied notifications leaving the plan fully usable;
   camera only when requested; no system Contacts access for the core flow.
   Also: "The native Companion owns its own personal state. PWA storage does
   not automatically migrate into it; provide a deliberate export/import
   journey with preview and duplicate handling." And: "Do not require the
   companion and Chat to share an App Group, signing team or keychain to
   function. Public handoff is enough."

6. **What is explicitly not proposed.** No Capacitor or WebView shell (ADR
   0004). No mesh node in the Companion. No second cross-platform stack, and
   no rewrite of the Android client. No promise that the PWA goes away —
   "Keep PWA/standard-client instructions available regardless of native
   release timing."

7. **A recommendation**, in one sentence: admit, defer, or reject, with the
   single strongest reason.

Then link the dossier from #199 and stop. Do not begin implementation on the
strength of your own recommendation.

## Acceptance

This spec has no test command, and that is not an oversight — the artifact
is a decision document. It is accepted when:

- the dossier exists and answers all three admission conditions explicitly,
  including answering "no" or "unknown" where that is the truth;
- every distribution fact from the list above appears, with unknowns marked
  as unknown;
- the PR #179 correction is present in the words quoted above;
- no Swift, Kotlin, Xcode project, `apps/ios/` directory or iOS CI job was
  created by this change — verify with `git status` and `git diff --stat`
  before you finish;
- the maintainer records admitted / deferred / rejected on #199.

The negative case matters more than usual here: if this change contains a
single `.swift` file, it has failed regardless of how good the dossier is.

Evidence checklist for the parts that need hardware, if you get that far:

- **Mac**: model, macOS version, Xcode version, Swift version.
- **Devices**: each iPhone by model and exact iOS version.
- **Build**: whether it was signed, with which profile, and whether it was
  installed on a physical device or only run in the simulator — stated
  separately, because "generated bindings and simulator screenshots do not
  meet the gate."
- **Limitations**: which OS versions and device classes were not covered.

## Out of scope

- **Creating `apps/ios/` or any Swift source file.** Repeated deliberately.
  The gate decides that; this task feeds the gate.
- The iPhone attendee experience for 2026. That is **I-01**, it is
  independent of this decision, and it must not wait for it.
- Native iOS **Chat**, the Element X fork, the embedded Rust node, the
  multicast entitlement application and CoreBluetooth. Those are stages
  I2–I4 in `docs/architecture/ios.md` and ADR 0005's stages 1 and 2, with
  their own admission gates: "Native Chat admission: maintained fork base,
  complete credentials/notification lifecycle and a functioning signed-device
  build. Mesh admission: physical-device encrypted interoperability and
  truthful lifecycle behavior."
- Reviving the Capacitor shell in any form. ADR 0004 owns that decision and
  it is Accepted.
- Any change to `docs/adr/0004-retire-the-capacitor-shell.md` or
  `docs/adr/0005-ios-mesh-chat.md`. If the dossier's conclusion warrants
  amending an ADR, that is a separate change with the maintainer's decision
  already recorded.
