# 2026 draft cutover and local discovery — implementation review

Base: Companion upstream `93715d5f54ab19071ef5c231cfa38909f8d0d8cc`. Prepared for pull-request review. Merge is gated on CI; installed-device release rehearsal remains separate.

## Changes

- Web default, Android default/seed asset and local simulation date use IndiaFOSS 2026. The real public capture is reproducible offline; 2025 remains an explicitly labelled archive. Draft status travels with the event data and is visible in both apps.
- 111 programme entries, including breaks/ceremonies, 90 speakers, six physical rooms and eight named devrooms. There are 110 usable time intervals and one end-before-start source entry. Its title/start remain visible with a timing note; it cannot enter an automatic itinerary. The 16 same-room overlap pairs are recorded in provenance without fabricated corrections.
- Three direct choices: gold crown Must go, green Want to go, grey Not interested. Discovery learns from them locally and samples tracks without requiring pairwise comparisons. Undo and legacy ratings remain supported. Detailed design and limitations: [recommendations](../recommendations.md).
- Whole-devroom commitment reserves the published block and gaps. Physical rooms remain separate from programme tracks. Conflicting choices are visible; explicit exclusions remain excluded.
- Publisher imports the owned manifest contract. The preview/update paths follow the actually selected event. Generated Playwright traces are excluded from linting.

## Validation

- Web production build, workspace typecheck and lint pass. Typecheck retains two existing unused-CSS warnings on the speaker page.
- Host unit suite: 520 passed, 30 live-service checks skipped using an explicitly unreachable `NEUTRINO_URL`. This isolates unit validation from the separately running mesh node; it is not an integration pass.
- Browser app/discovery/offline suite: 34 passed. Light/dark accessibility and keyboard suite: 32 passed. Crown background is asserted as gold; 390px layout checked for horizontal overflow.
- Android Kotlin core: 57 passed. Android `:app:compileDebugKotlin` passes with JDK 21 and SDK 35, including the actual app module and copied 2026 seed.
- Both event fixtures and synthetic/2026 venue assets validate. Published data tests reject the wrong year and invented rooms, verify raw-input reproduction and distinguish programmes sharing Room 1.
- No physical-device release rehearsal or native UI screenshot gate was completed. Compilation is not evidence of installed-device notification, lifecycle or layout behavior.

## Separate live mesh findings

An unrestricted workspace test run found a pre-existing `neutrino-lan` service at localhost:8008. Default upstream-gap probes fail because several gaps are closed on that binary. Re-running in explicit fork mode still fails three unchanged integration contracts: distinct registration identities, account-data isolation/sync, and per-device to-device isolation. Neither probe nor Matrix code was modified in this work. These failures remain recorded for the mesh/account workstream; do not report the entire project green or infer encrypted cross-seam readiness.

## Release follow-through

Review the changes, rehearse the draft on installed devices, and publish only through the existing release process. A final schedule confirmation will produce a new data revision/status, not a fabricated date change. The draft does not yet supply a rehearsed canonical Matrix room directory or booth catalogue. Update source captures/provenance together as organisers revise the timetable.
