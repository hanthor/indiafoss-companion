# Implementation tasks

Each file here is one self-contained unit of work derived from the architecture
record in [`docs/architecture/`](../architecture/). A spec inlines the context
it needs, names the exact files, and states acceptance as commands you can run.
You should not have to read #194 to do one.

**These are specs, not tickets.** The GitHub issues listed in the _Tracks_
column already own this work; a spec says _how_, the issue says _whether_ and
records the decision. Do not open new issues for these.

## Rules for whoever implements one

1. **Read the whole spec before editing.** The _Out of scope_ section is
   load-bearing — most of these tasks sit next to something deliberately not
   being done yet.
2. **Do not widen the task.** If you find a second bug, note it on the tracking
   issue and leave it. A change that fixes two things is a change nobody can
   revert.
3. **Acceptance commands must actually pass**, and you must paste real output.
   A merged patch is not an installed-device result — several specs below turn
   on exactly that distinction.
   - **Rebuild before running Playwright.** `npx playwright test` serves
     whatever is already in `apps/web/build`, so it will happily pass against
     a build made before your change. Use `just test-e2e` (which depends on
     `build`) or run `just build` first. This has already produced one green
     local run for a change CI then rejected.
   - **`just android-test` runs both core and app tests.** It requires JDK 21
     and the Android SDK; see [Android testing](../android-testing.md).
     `just android-core-test` is explicitly core-only. Say which gate ran,
     and require native CI plus emulator success for native changes.
4. **If the spec is wrong, stop and say so.** The architecture document wins
   over the spec, and reality wins over both. Do not implement something you
   can see is incorrect.
5. **Fork-touching work updates `docs/forks.md` in the same change.** This is a
   repository rule, not a preference.
6. Contracts and fixtures live in
   [`packages/model/src/contracts/`](../../packages/model/src/contracts) and
   [`packages/test-fixtures/fixtures/`](../../packages/test-fixtures/fixtures)
   (ADR 0009). Reuse them; do not hand-roll a second parser.

## Status vocabulary

| Status             | Meaning                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| **Ready**          | Everything needed is in the repository. Start now.                        |
| **Needs hardware** | Ready, but acceptance requires physical devices or the venue network.     |
| **Blocked**        | A named decision or protocol review must land first. The spec says which. |

## Companion — conference reliability (the September release path)

These are the work that makes a conference day trustworthy. Do these first.

| ID                                           | Task                                                     | Status                           | Tracks                                                            |
| -------------------------------------------- | -------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| [C-01](C-01-update-check-latch.md)           | Schedule updates can be missed for a whole session       | Partial — refresh status remains | [#189](https://github.com/hanthor/indiafoss-companion/issues/189) |
| [C-02](C-02-persist-every-valid-revision.md) | A reinstated talk stays cancelled; valid data is dropped | Implemented (web), PR #235       | [#190](https://github.com/hanthor/indiafoss-companion/issues/190) |
| [C-03](C-03-android-atomic-bundle-write.md)  | An interrupted write can truncate the cached schedule    | Ready                            | [#190](https://github.com/hanthor/indiafoss-companion/issues/190) |
| [C-04](C-04-publish-2026-bundle.md)          | Ship the real 2026 bundle, not the 2025 fixture          | Ready                            | [#191](https://github.com/hanthor/indiafoss-companion/issues/191) |
| [C-05](C-05-plan-without-ranking.md)         | A useful plan without ranking every talk                 | Ready                            | [#192](https://github.com/hanthor/indiafoss-companion/issues/192) |

## Companion — contracts and handoff

| ID                                                 | Task                                              | Status | Tracks                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| [C-06](C-06-publish-conference-directory.md)       | Publish and validate the canonical room directory | Ready  | [#166](https://github.com/hanthor/indiafoss-companion/issues/166)                                                                  |
| [C-07](C-07-event-sync-uses-contract.md)           | `event-sync` uses the owned `EventManifest` type  | Ready  | ADR 0009                                                                                                                           |
| [C-08](C-08-kotlin-fixture-conformance.md)         | Kotlin validates the same golden fixtures         | Ready  | ADR 0009                                                                                                                           |
| [C-09](C-09-handoff-parse-consolidation.md)        | One handoff parser, both encodings                | Ready  | [#31](https://github.com/hanthor/indiafoss-companion/issues/31)                                                                    |
| [C-10](C-10-contact-trust-states.md)               | Never show a profile match as verified            | Ready  | [#31](https://github.com/hanthor/indiafoss-companion/issues/31), [#188](https://github.com/hanthor/indiafoss-companion/issues/188) |
| [C-11](C-11-capability-record-release-evidence.md) | Releases record what was actually tested          | Ready  | [#34](https://github.com/hanthor/indiafoss-companion/issues/34)                                                                    |

## Companion — gated work

| ID                                             | Task                                        | Status                        | Tracks                                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [C-12](C-12-identity-binding-spec.md)          | Specify the mesh↔Matrix identity binding    | Blocked — maintainer decision | [#188](https://github.com/hanthor/indiafoss-companion/issues/188), [#181](https://github.com/hanthor/indiafoss-companion/issues/181)                                                                    |
| [C-13](C-13-encrypted-seam-protocol-review.md) | Protocol review for the encrypted seam      | Blocked — review before code  | [#176](https://github.com/hanthor/indiafoss-companion/issues/176)                                                                                                                                       |
| [C-14](C-14-venue-gateway-rehearsal.md)        | Rehearse the venue gateway and room seeding | Needs hardware                | [#163](https://github.com/hanthor/indiafoss-companion/issues/163), [#165](https://github.com/hanthor/indiafoss-companion/issues/165), [#115](https://github.com/hanthor/indiafoss-companion/issues/115) |

## iOS

| ID                                   | Task                                                         | Status                   | Tracks                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| [I-01](I-01-ios-pwa-baseline.md)     | Rehearse the 2026 iPhone baseline: PWA + stock Matrix client | Needs hardware           | [#199](https://github.com/hanthor/indiafoss-companion/issues/199)                                                                     |
| [I-02](I-02-ios-native-admission.md) | Assemble the native Companion admission dossier              | Blocked — admission gate | [#199](https://github.com/hanthor/indiafoss-companion/issues/199), [PR #179](https://github.com/hanthor/indiafoss-companion/pull/179) |

## Chat — a different repository

These specs live here because the architecture does, but the work happens in
[`indiafoss-chat-android`](https://github.com/hanthor/indiafoss-chat-android).
**Do not create Kotlin or Swift files in this repository for them.**

| ID                                       | Task                                                     | Status         | Tracks                                                                              |
| ---------------------------------------- | -------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| [X-01](X-01-chat-media-pin-and-proof.md) | Build the media fix into an installable APK and prove it | Needs hardware | Chat #44/#45/#49, [#182](https://github.com/hanthor/indiafoss-companion/issues/182) |
| [X-02](X-02-chat-durable-outbox.md)      | A durable logical outbox with honest delivery states     | Ready          | Chat #48                                                                            |
| [X-03](X-03-chat-account-coordinator.md) | Account coexistence without one session erasing another  | Ready          | Chat #46/#47                                                                        |

## Dependency order

```mermaid
flowchart TD
  C01[C-01 update latch] --> C04[C-04 real 2026 bundle]
  C02[C-02 persist revisions] --> C04
  C03[C-03 atomic write] --> C04
  C07[C-07 event-sync uses contract] --> C04
  C04 --> C06[C-06 room directory]
  C06 --> C14[C-14 venue rehearsal]
  C08[C-08 Kotlin conformance]
  C09[C-09 handoff parser] --> C10[C-10 trust states]
  C10 --> C12[C-12 binding spec]
  C12 --> C13[C-13 seam review]
  C11[C-11 capability records] --> X01[X-01 APK + device proof]
  X03[X-03 account coordinator] --> X02[X-02 durable outbox]
  C05[C-05 plan without ranking]
  I01[I-01 iPhone baseline]
  I02[I-02 native admission]
  C02 -. both edit tools/event-sync .-> C07
```

C-05, C-08 and I-01 have no prerequisites and can run alongside anything.

Two couplings the arrows understate, both found while writing the specs:

- **C-02 and C-07 both change `tools/event-sync`.** C-02 adds a `reinstated`
  change type, which then appears in the published `changes.<rev>.json`; C-07
  replaces that tool's local `EventManifest` declaration. Neither blocks the
  other, but doing them in parallel will conflict. Take them in either order,
  one at a time.
- **C-03 needs the full native gate.** `just android-test` covers both
  `:core:test` and `:app:testDebugUnitTest`; `just android-core-test` alone
  cannot validate `EventRepository` or app wiring.

## Spec template

New specs use this shape. Keep _Context_ self-contained — inline the
architecture excerpt rather than linking to it.

```markdown
# <ID> — <one-line outcome, in the user's terms>

- Status: Ready | Needs hardware | Blocked — <what unblocks it>
- Repository: indiafoss-companion | indiafoss-chat-android | neutrino
- Tracks: #NNN
- Size: S | M | L

## Why this matters

<The attendee-visible consequence. Two or three sentences.>

## Context you need

<Everything required to do the work, inlined. Quote the architecture, quote
the current code, name the file:line. Assume the reader has read nothing.>

## What to do

<Numbered, concrete steps. Name exact files and functions.>

## Acceptance

<Runnable commands and the observable outcome of each. Include the negative
case — what must still fail.>

## Out of scope

<What not to touch, and why. Name the task or issue that owns it instead.>
```
