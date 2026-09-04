# 0004 — Retire the Capacitor shell; three apps, not four

- Status: **Accepted**
- Date: 2026-09-04
- Deciders: James (maintainer)
- Related: [ADR 0001](0001-native-android-client-standalone-vs-neutrino-fork.md),
  [ADR 0002](0002-native-compose-client-rendered-natively.md),
  [ADR 0003](0003-mesh-interop-by-federation-not-bridging.md)

## Context

ADR 0002 explicitly kept the Capacitor app in place: "The Capacitor app is
**not** replaced. It remains the shipping Android distribution and the only
one with the camera, handshake, ranking and messaging surfaces; the native
client is the parallel, native-feel client it was always allowed to become,
and it grows screen by screen."

That was the right call at the time — the native client had five screens and
no ranking flow. It now has all the screens ADR 0002 named (Now, Schedule, My
plan/Rank, Map, Explore, Settings, Connect) reading the same published
`EventBundle`, built and Maestro-tested on real hardware. Running the
Capacitor shell on a real device the same session surfaced the actual cost of
keeping it: it reads as a website in a native frame — long-press selects
arbitrary page text and pops the OS callout menu, taps flash grey, scroll
edges rubber-band — tells no amount of CSS hardening fully removes, because
the substrate is still a WebView.

Distribution scope, decided the same day:

- **Web + iOS**: the PWA. iOS gets no native wrapper; a dedicated iOS app is
  tracked as a separate, not-yet-started issue.
- **Android**: the native Compose client only.
- **P2P chat, on any platform**: the dedicated Element X / Neutrino fork
  (`hanthor/indiafoss-chat-android`), carrying the E2EE, federation, and
  mesh-protocol work described in `patches/neutrino/` and `docs/mesh-protocol.md` —
  not embedded in either the PWA or the native client.

Three apps, not four.

## Decision

**The Capacitor Android shell (`apps/android/capacitor`) is deleted.** The
native Compose client is the only Android distribution; the PWA is the only
Web/iOS distribution; P2P chat lives exclusively in the dedicated chat app.

Consequences for the parts of the system that assumed Capacitor:

- **CI**: the `Android build` job and the Capacitor-targeted Maestro flows are
  gone. The `Android emulator (Maestro)` job now drives the native app's own
  APK (`org.indiafoss.companion.nativeapp`), with new flows written against
  its real Compose accessibility tree — see `.maestro/` and
  `docs/android-testing.md`.
- **Nightly releases**: `nightly.yml` now builds and publishes the native
  client's debug APK, not the Capacitor one. It no longer fetches the
  Neutrino bindings — the native client was already message-free (ADR 0001),
  so it never consumed them.
- **The Neutrino bindings pin** (`version.json`) moves from
  `apps/android/capacitor/neutrino/` to `patches/neutrino/`, alongside the
  patch set it describes — a location that belongs to no particular app,
  since `neutrino-bindings.yml` now serves exactly one consumer:
  `hanthor/indiafoss-chat-android`'s own build (see that repo's
  `services/neutrino/impl/build.gradle.kts`).
- **The PWA's own embedded chat** (`/chat`, `packages/matrix`, the Settings →
  "Peer-to-peer chat" toggle, and the chat buttons/links on Now, Activity,
  Booth, and Connect) is dropped in the same spirit, tracked as a follow-up
  PR rather than folded into this one — it touches enough unrelated screens
  (contact sharing, session/booth detail, the top nav) that mixing it with
  the Capacitor deletion would make either change harder to review on its
  own. Until that PR lands, the PWA still contains chat code that no
  distribution target actually needs.

## Consequences

### Positive

- One Android codebase to maintain, test, and reason about instead of two
  with overlapping but not identical feature sets.
- Removes the WebView-native-feel gap entirely rather than continuing to
  chase it with CSS.
- CI's Android emulator job now actually tests the app that ships.

### Negative / costs

- **Feature gap, temporarily.** ADR 0002 named "camera, handshake" as
  Capacitor-only surfaces; the native client has no scan/handshake screen
  yet. It ships without one until that's built — a real regression for
  anyone who used it, not a hidden one.
- **The bindings-publishing workflow now serves a consumer in a different
  repository**, not this one. `neutrino-bindings.yml`,
  `neutrino-e2e.yml`, and `neutrino-complement.yml` all stay, because
  `hanthor/indiafoss-chat-android` depends on the `.aar` and the protocol
  contracts they publish and verify.
- **The PWA carries dead chat code until the follow-up lands** — see above.

## Alternatives considered

### A. Keep both, let native "grow into" full parity first (rejected)

Wait for the native client to gain a scan/handshake screen before retiring
Capacitor, so there's no capability gap at any point.

- Rejected: this is what ADR 0002 already chose, and the WebView-native-feel
  problem is not something more native screens fix — it is a property of the
  shell those screens _aren't_ rendered in yet. Every day the shell survives
  is a day of continuing to polish an app the plan says to stop shipping.

### B. Retire Capacitor entirely (accepted)

As decided above. The capability gap is real but temporary and honestly
scoped, rather than indefinitely deferred behind a shell nobody wants to keep
maintaining.
