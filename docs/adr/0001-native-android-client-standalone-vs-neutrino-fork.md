# 0001 — Native Android client: standalone app vs Neutrino-fork feature layer

- Status: **Accepted**
- Date: 2026-09-02
- Deciders: James (maintainer)
- Related: issue #10 (native Material 3 Android client), issue #11 (optional
  Neutrino/Matrix messaging), issue #12 (notifications & deep links),
  issue #13 (release hardening)

## Context

The PWA (SvelteKit + Svelte 5, wrapped by Capacitor) is the primary
Web/iOS/Android distribution. Issue #10 asks for an **optional native Jetpack
Compose / Material 3 Android client** that consumes the same versioned
`EventBundle` JSON contract, with its own versioned native persistence adapter
for local state (preferences, comparisons, notes, itinerary) — without changing
the canonical data contract.

Issue #10's last acceptance criterion forces this decision:

> Architecture decision documents whether this is a standalone native client or
> a feature layer in the Neutrino fork.

"The Neutrino fork" is
[`element-hq/element-x-android-neutrino`](https://github.com/element-hq/element-x-android-neutrino):
a P2P fork of Element X Android (snapshot of `v26.05.2`), a full Matrix client
built on the Matrix Rust SDK and Jetpack Compose, licensed **AGPL-3.0**, with an
embedded Neutrino homeserver. Issue #11 proposes using it for optional
conference messaging.

So there are really two questions bundled together, and the second depends on
the first:

1. **What is the native event client's codebase?** A fresh, purpose-built
   Compose app, or the Element X Neutrino fork with the event experience added
   as a feature module inside it?
2. **How does optional Matrix messaging attach?** (Decided in principle here;
   detailed integration is issue #11.)

### Forces

- **Contract, not fork.** The whole app architecture is "one canonical
  `EventBundle`; every surface reads the bundle, never raw upstream data." The
  native client should be another _consumer_ of that contract.
- **Scope mismatch.** Element X Neutrino is a large, fast-moving Matrix
  messenger. A conference schedule/ranking/itinerary/map app is a different
  domain with a fraction of the surface area.
- **Optionality is a hard requirement.** Issue #10 says the native client is
  optional; issue #11 says messaging must be optional — "schedule, map, ranking,
  and contact sharing work without it." A base that _is_ a Matrix client makes
  messaging structurally non-optional.
- **F-Droid / no mandatory Google push.** Issue #12/#13 require an
  FCM-free core. Element X reaches F-Droid via UnifiedPush, but its push story
  is heavier and has had gaps; coupling our core to it inherits that risk.
- **Maintenance.** Tracking an upstream fork snapshot (`v26.05.2`) and rebasing
  our event features onto Element X releases is a large, ongoing burden with
  merge risk on every upstream bump.
- **Licensing.** Both projects are AGPL-3.0(-or-later), so license compatibility
  is not the blocker; branding/attribution obligations (Element) and Neutrino
  GitHub Packages access are (issue #11's concern).
- **Reuse.** The domain logic (`@indiafoss/model`, `elo`, `solver`, `venue`,
  `schedule`, `search`) is TypeScript. A native Kotlin client cannot reuse it
  directly and must either re-implement or embed the web logic.

## Decision

**The native Android event client is a standalone Jetpack Compose / Material 3
app that consumes the published `EventBundle` contract. It is NOT built as a
feature layer inside the Element X Neutrino fork.**

Optional Matrix/Neutrino messaging (issue #11), if approved, attaches by
**handoff**, not by inversion: the standalone event client hands off to a
Matrix client (the Neutrino fork, or any Matrix app) via QR / `matrix:` /
`indiafoss://` deep links. The event client never becomes a Matrix client.

To bound the native effort and avoid re-implementing the TypeScript domain
engines in Kotlin, the standalone client is expected to be **thin**: a native
Material 3 shell (navigation, adaptive layout, accessible semantics, Android
back-stack, native persistence adapter) around the existing offline web
experience and/or the shared `EventBundle` assets. Whether the shell embeds the
web app in a hardened WebView surface or renders bundle data natively is an
implementation choice for issue #10; either way it reads the same contract and
does not fork Element X.

## Consequences

### Positive

- **Optionality holds structurally**: messaging is an add-on reached by
  handoff; the event app runs and ships without any Matrix code.
- **Small, ownable surface**: no rebasing onto Element X releases; the native
  app tracks only the `EventBundle` schema version.
- **FCM-free core stays simple**: local notifications only; no inherited push
  complexity from a Matrix messenger.
- **Contract integrity**: the native client is one more consumer of the
  canonical bundle, consistent with the rest of the system.
- **Licensing/branding isolation**: Element/Neutrino attribution and GitHub
  Packages requirements are confined to the optional messaging path, not the
  core app.

### Negative / costs

- **No direct reuse** of the TypeScript engines in native Kotlin. Mitigation:
  keep the native client thin (shell over the shared bundle / offline web
  surface) rather than porting `elo`/`solver`/`venue` to Kotlin.
- **Two UI stacks** (Svelte PWA + native Compose) if a fully-native UI is built.
  Mitigation: the PWA remains primary; the native client is optional and can
  start as a hardened shell before any native-rendered screens.
- **Handoff is less seamless** than embedded messaging. Accepted: messaging is
  explicitly optional and out of MVP scope.

### Follow-ups

- Issue #10 implements the standalone shell (navigation set, Material 3,
  adaptive/accessible, native persistence adapter, CI debug APK) — the current
  Capacitor wrapper is the pragmatic first form of this shell.
- Issue #11 prototypes the **handoff** to the Neutrino/Matrix client and
  produces the threat/privacy model; it must not require changing this decision.
- Revisit only if a first-class, always-on in-app messaging experience becomes a
  product requirement — that would justify re-opening the fork-as-base option.

## Alternatives considered

### A. Feature layer inside the Element X Neutrino fork (rejected)

Add the event experience as a module within the Element X Neutrino codebase and
ship a single combined app.

- Rejected: inverts the architecture (a Matrix client that also shows a
  schedule), makes messaging non-optional, imposes continuous rebasing onto a
  large upstream fork, complicates the FCM-free/F-Droid story, and confines the
  core app to Element's release cadence and branding constraints.

### B. Standalone native client + optional messaging by handoff (accepted)

As decided above.

### C. No native client; PWA + Capacitor wrapper only (deferred, not rejected)

Keep only the current Capacitor wrapper and never build native-rendered screens.

- This is effectively the _starting point_ of decision B and remains valid until
  a native UI is justified. Decision B does not force native screens; it fixes
  the _codebase ownership_ question (standalone, contract-consuming) regardless
  of how much UI is eventually native.
