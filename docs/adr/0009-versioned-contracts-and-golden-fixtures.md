# 0009 — Versioned contracts and golden fixtures live in Companion, one directory, one fixture suite

- Status: **Proposed**
- Date: 2026-09-08
- Deciders: James (maintainer)
- Related: [ADR 0002](0002-native-compose-client-rendered-natively.md) (Kotlin
  ports of the core engines), [ADR 0006](0006-one-person-two-transports.md)
  (one person, two transports), [ADR 0008](0008-mesh-identity-and-discovery.md)
  (mesh identity), `docs/architecture/system.md` ("Share contracts, retain
  native interfaces"), `docs/architecture/ios.md`, #194, #199, #188 (identity
  binding, **blocks the crypto half of `IdentityBinding`**)

## Context

Companion already runs on two platforms and the architecture record proposes a
third. ADR 0002 chose _native rendering with ported engines_ rather than a
shared runtime, which is the right call for UI and algorithms — and it means
every data format that crosses an app boundary now has two or three independent
implementations of its parser. Today those are `packages/model/src/` in
TypeScript and `apps/android/native/core/src/main/kotlin/…/Model.kt` +
`VCard.kt` + `Handshake.kt` in Kotlin, hand-kept in step.

That is already the source of a real class of defect. `packages/model` exports
`EVENT_BUNDLE_SCHEMA_VERSION = 1` and `collectBundleIssues()`; the publish
manifest at `events/indiafoss-2025/published/manifest.json` carries its own
independent `schemaVersion`, defined structurally inside
`tools/event-sync/src/index.ts` rather than in the model package. Nothing
verifies that the Kotlin reader accepts exactly the bundles the TypeScript
validator accepts, or that either rejects the same malformed input. The
architecture record names six formats that must survive a third platform, and
four of them (`ConferenceDirectory`, `IdentityBinding`, `AppHandoff`,
`Capability`/`ReleaseRecord`) have no owning module at all — they exist only as
prose in `docs/architecture/system.md`.

`packages/test-fixtures` was created for exactly this and is still a stub:
`export const test_fixturesVersion = '0.1.0';` with the comment _"Placeholder
module — implementation lands in a later phase."_ This is that phase.

### Forces

- The architecture record explicitly says to _"avoid a new service or repository
  merely to share small documents"_ and to _"extract shared executable logic
  only when divergence actually warrants it."_ A new package for six type
  files would violate the first; porting validators to a shared runtime would
  violate the second.
- Small changes must stay reviewable. A contributor adding an optional field
  should touch one type, one validator, one fixture — not a schema compiler.
- Swift does not exist in this repository yet and may never be admitted
  (`docs/architecture/ios.md` gates it). The contract mechanism must not
  assume a third implementation, but must be trivially consumable by one.
- The repository has no JSON Schema and no zod. Validation is hand-written
  `collectXIssues(): string[]`. Introducing a schema toolchain would be a
  larger change than the problem justifies, and would not help Kotlin or Swift.

## Decision

### 1. Contracts are TypeScript modules in `packages/model/src/contracts/`

One module per cross-boundary format, extending the existing package rather
than creating a parallel one. Each module exports, with no runtime
dependencies:

- an integer `X_SCHEMA_VERSION` constant,
- doc-commented `interface` declarations using the existing conventions
  (ISO-8601 strings for instants, string ids, union string literals, never
  enums),
- `collectXIssues(value: unknown): string[]`, matching `collectBundleIssues`.

The six contracts are `EventManifest`, `ConferenceDirectory`, `ContactCard`,
`IdentityBinding`, `AppHandoff` and `CapabilityRecord`. `EventBundle` stays
where it is and is _referenced_ by `EventManifest`; it is not moved.

Validators take `unknown`, not the interface type. These formats arrive from
the network, from a QR code and from other people's devices — a validator that
can only be called with an already-well-typed value validates nothing at the
boundary that matters.

### 2. Compatibility policy is uniform and stated in code

Unknown optional fields are preserved and tolerated. An unrecognised **major**
`schemaVersion` is rejected, and rejection must never discard the last good
value. Every validator encodes this identically so all three platforms can
behave the same way, and so "the update broke my saved plan" cannot be
reintroduced per-platform.

### 3. Golden fixtures are JSON, in `packages/test-fixtures/fixtures/`

Laid out as `fixtures/<contract>/{valid,invalid}/<case>.json`, with a
machine-readable `fixtures/index.json` listing every case and, for invalid
cases, the substring each expected issue message must contain. The index is the
contract between platforms: a Kotlin or Swift conformance test reads the same
JSON files and asserts the same accept/reject outcomes, without needing to
parse TypeScript or agree on exact message wording.

Fixtures are checked in, human-readable, and small. They are test data, not
event data — the real event bundles stay under `events/<eventId>/`.

### 4. `IdentityBinding` ships its envelope now and its cryptography later

The versioned envelope, the identifier fields, scope, validity and revocation
shape are defined now, because forward-compatible storage does not require a
settled signature format (this is the same argument as #160). The canonical
signing encoding, the domain separation string, replay and expiry rules, and
Matrix device-trust verification are **out of scope for this ADR** and are
specified in #188.

Until #188 lands, `collectIdentityBindingIssues()` validates structure only and
the module states in a doc comment that a structurally valid binding is **not**
a verified one. No caller may treat it as proof of account control.

## What we explicitly do not do

- No JSON Schema, no zod, no code generation. If contracts later outgrow
  hand-written validators, that is a new ADR with evidence behind it.
- No new package and no new repository.
- No Swift or Kotlin implementation in this ADR. Fixtures are laid out so those
  can be added under their own admission gates; adding them is not authorized
  here.
- No moving of `EventBundle`, the contact/vCard modules, or the venue graph
  types. Existing formats are wrapped, not relocated.

## Consequences

### Positive

- One place to look for every format that crosses an app or device boundary.
- Divergence between platforms becomes a failing test rather than a field
  report, and the failure names the case.
- A third platform costs a fixture-runner, not a format negotiation.
- The four undefined contracts stop being prose.

### Negative / costs

- Hand-written validators are more code than a schema would be, and can drift
  from the interfaces they validate. The fixture suite is the mitigation; a
  contract without invalid-case fixtures is not done.
- `packages/model` grows. If it becomes unwieldy the split is mechanical, but
  it is a future cost.
- Fixture files are duplicated effort at authoring time. Accepted: they are the
  only artifact three languages can share without a runtime.

### Follow-ups

- `tools/event-sync` should import `EventManifest` from `@indiafoss/model`
  instead of declaring it structurally.
- The Kotlin core should gain a conformance test over the same fixtures. That
  is task work, not part of this decision.
- `docs/forks.md` is unaffected — no fork is touched by this ADR.

## Open questions for the maintainer

1. Should `CapabilityRecord` be checked into this repository at all, or does it
   belong with release operations where the evidence is produced? It is defined
   here on the assumption that clients must _read_ it to decide what to offer.
2. Is `indiafoss://` still the intended handoff scheme, given
   `docs/architecture/ios.md` recommends HTTPS Universal Links for owned native
   apps? `AppHandoff` currently models both and treats the custom scheme as the
   offline/no-network form.
3. What is the canonical web origin for HTTPS handoffs? `HANDOFF_HOSTS` is set
   to the actual deployment today — `hanthor.github.io`, with the project base
   path `/indiafoss-companion/` — because that is what exists, not because it
   is the right long-term answer. A custom domain would need to be added
   alongside it rather than replacing it, so that links already printed on
   posters keep resolving. Note this is a different domain from the Matrix
   alias server, which is `reilly.asia` in `events/<eventId>/messaging.json`;
   the web origin and the homeserver are unrelated choices and #181 should
   record both.
