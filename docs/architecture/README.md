# Architecture record — September 2026

These documents are the reviewed architecture for Companion and Chat. They are
**proposals and recommendations**, not claims that anything below is
implemented or that the maintainer has accepted every default. Where a document
recommends something, the acceptance record lives in
[#181](https://github.com/hanthor/indiafoss-companion/issues/181).

| Document                                     | Scope                                                                                                          | Tracking issue                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [system.md](system.md)                       | App boundaries, shared contracts, identity and trust, delivery and recovery, gateways, branding, release gates | [#194](https://github.com/hanthor/indiafoss-companion/issues/194) |
| [ios.md](ios.md)                             | Companion and Chat paths on iOS, upstream findings, notifications, permissions, device validation              | [#199](https://github.com/hanthor/indiafoss-companion/issues/199) |
| [review-2026-09-07.md](review-2026-09-07.md) | The project review both documents extend                                                                       | [#195](https://github.com/hanthor/indiafoss-companion/issues/195) |

## Current implementation evidence

Use the [task status index](../tasks/README.md) for merged work and remaining gates, the [event README](../../events/indiafoss-2026/README.md) for schedule and booth source maintenance, and the [personal-data transfer contract](personal-data-transfer.md) for migration. The PWA exports personal data; import and native transfer UI remain unfinished. A stock Matrix client plus the PWA remains the iOS baseline pending device rehearsal. These implementation records do not waive the protocol or native iOS admission gates below.

The [attendee persona walkthrough](../reviews/attendee-personas-2026-09-09.md) maps eight hypothetical event journeys to observed friction, proposed features and existing issues. It prioritizes plan consistency, navigation and trust before more recommendation machinery; it is not a substitute for real-attendee/device testing.

## How to use these when implementing

Do not implement directly from these documents. They are deliberately dense and
carry more context than any single change needs. Instead:

1. Find the task in [`docs/tasks/README.md`](../tasks/README.md). Each task
   spec is self-contained — it inlines the architecture excerpt it depends on,
   names the exact files to touch, and states runnable acceptance commands.
2. Implement against the versioned contracts in
   [`packages/model/src/contracts/`](../../packages/model/src/contracts) and
   the golden fixtures in
   [`packages/test-fixtures/fixtures/`](../../packages/test-fixtures/fixtures).
   The fixtures are the cross-language conformance suite: TypeScript, Kotlin
   and Swift adapters all validate the same files.
3. If a task and these documents disagree, the documents win — but say so on
   the tracking issue rather than silently diverging.

## What these documents deliberately do not authorize

- Creating `apps/ios/*`. Native iOS is gated on the admission evidence in
  [ios.md](ios.md); task specs exist, an app skeleton does not.
- Implementing the encrypted mesh↔Matrix seam. Protocol review comes first
  ([#176](https://github.com/hanthor/indiafoss-companion/issues/176)).
- Automatic cross-transport routing. That is gated on the identity binding
  specification ([#188](https://github.com/hanthor/indiafoss-companion/issues/188)).
- Reviving the Capacitor shell (ADR 0004 stands).
