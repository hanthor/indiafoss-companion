# IndiaFOSS Companion Roadmap — Q4 2026 Planning

**Status**: Planning document (2026-10-03)
**Audience**: Maintainers, contributors, ecosystem partners
**Last updated**: 2026-10-03

---

## Strategic Context

The companion app shipped its core feature set for IndiaFOSS 2026 (schedule, ranking, venue routing, P2P contact sharing, and live mesh messaging). Post-event analysis identifies three strategic priorities for Q4 2026:

1. **Adoption at scale** — mesh node discovery and attendee roster integration
2. **Organizer value** — speaker slide distribution and live Q&A/polling
3. **Developer experience** — local testing, cross-platform CI, and contract documentation

This document outlines the scope, sequencing, and success criteria for each.

---

## Theme 1: Mesh Node Discovery & Attendee Roster

### Problem Statement

The app supports direct peer discovery (vCard QR, Bluetooth handshake, Web NFC) but lacks ambient discovery of attendees on the mesh. At scale (1000+ attendees), this creates friction:
- Latecomers see an empty roster until they manually exchange QR codes
- No way to find speakers or organizers without explicit interaction
- Newcomers to mesh networks face high friction (unclear who to add)

### Proposed Solution

Publish an attendee roster to the conference Matrix homeserver as a state event (`m.room.attendee_roster`) in a public room. The app queries this on load and lazy-fetches profiles as needed. Profiles remain peer-signed vCards; the roster just serves discovery.

### Scope

- [ ] **Contract**: Define `AttendeeRoster` and `RosterEntry` in `packages/model/src/contracts/` with validation for vCard signatures
- [ ] **PWA**: Add roster polling to the Matrix session layer; display roster in a discoverable UI (e.g., "Who's here?" sheet)
- [ ] **Native**: Mirror roster sync and UI to the native app (Kotlin/Compose)
- [ ] **Testing**: End-to-end test with two local mesh nodes; fixture coverage for roster variants
- [ ] **Docs**: Publish guidance for event organizers on seeding the roster

### Success Criteria

- Roster syncs within 5 seconds of joining a conference room
- Profile fetch latency <500ms p50 (cached; <2s p95 on first fetch)
- Zero signature verification failures in E2E tests

### Related Issues

- **Mesh scaling**: Roster discovery should work on any federation-compatible homeserver (not just event-specific)
- **Privacy**: Roster entries include only opt-in fields (profile, avatar, identity binding); no forced exposure

---

## Theme 2: Speaker Slides & DRM-Free Archival

### Problem Statement

Speakers want to share slides during talks; attendees want to archive them post-event. Current gaps:
- No in-app slide viewer or integration with external viewers
- Matrix file uploads are capped at 100 MB and not designed for bulk media
- No archival pipeline or CDN integration

### Proposed Solution

**Phase 1 (in-band)**: Add a `SpeakerSlides` contract with a URL pointer (HTTPS or mesh-hosted CDN) and slide metadata (title, page count, timestamp). The app renders an embedded PDF viewer or defers to native handlers.

**Phase 2 (archival)**: Event organizers run a post-event tool that harvests slides from the conference room state and publishes them to a CDN or S3 bucket (DRM-free, Creative Commons licensed). The companion app's "Archive" tab links to the published collection.

### Scope

- [ ] **Contract**: `SpeakerSlides` with URL, MIME type, page count, and speaker identity
- [ ] **PWA**: Embed a PDF viewer (pdfjs or similar); defer to external viewer for formats outside scope
- [ ] **Native**: Android native PDF intent or WebView fallback
- [ ] **Archival tool**: Python script to harvest slides from Matrix room state and publish to CDN
- [ ] **Docs**: Speaker upload guide and CDN deployment runbook

### Success Criteria

- Slides viewable within the app for PDF, PPTX (converted); external links for others
- Archival tool runs in <5 minutes for 100+ slide decks
- Zero licensing conflicts (all slides CC-licensed or explicitly archived with permission)

### Related Issues

- **Offline access**: Slides should cache locally for offline viewing (PWA service worker)
- **Remix culture**: Licensing should explicitly permit non-commercial reuse and remix

---

## Theme 3: Live Q&A & Audience Polling

### Problem Statement

Conference organizers and speakers lack real-time engagement tools. Currently:
- No way to ask questions or upvote during talks
- No anonymous polling or sentiment tracking
- No metrics on which sessions drove engagement

### Proposed Solution

Add a lightweight Q&A/polling layer using Matrix state events (`m.room.q_and_a` / `m.room.poll`) published to per-session rooms. The app provides:
- A question sheet (slide-up from session detail) with upvote, sorting, and speaker-moderation controls
- Anonymous polling UI (radio buttons, percentage bars)
- Aggregate results visible to speakers and organizers only

### Scope

- [ ] **Contracts**: `SessionPolling` and `SessionQuestion` with validation and moderation flags
- [ ] **PWA**: Q&A sheet UI, upvote interactions, speaker moderation dashboard
- [ ] **Native**: Mirror Q&A UI to native app; use native sheets for question input
- [ ] **Matrix integration**: Publish Q&A state to session rooms; subscribe and sync in real time
- [ ] **Privacy**: Ensure questions are anonymous by default; speaker can reveal identity if approved
- [ ] **Moderation**: Spam/abuse flagging; speaker or organizer approval before public display

### Success Criteria

- Questions sync within 2 seconds of submission
- Q&A sheet loads in <1 second even with 100+ questions
- Zero exposure of attendee identity unless explicitly approved
- Moderation dashboard surfaces flagged content within 5 seconds

### Related Issues

- **Accessibility**: Q&A sheet must be keyboard navigable and screen-reader friendly
- **Internationalization**: Questions should render in attendee's preferred language (i18n already present)

---

## Developer Experience: Local Testing & Cross-Platform CI

### Problem Statement

Contributors struggle to:
1. Set up a local mesh harness for testing P2P features
2. Run tests across web and native platforms simultaneously
3. Understand which changes require end-to-end testing vs. fixtures

### Proposed Solution

Document and automate three aspects of developer workflow:

**1. Local Mesh Setup**: Step-by-step guide to running neutrino-probe with two local homeservers and the companion app. Include:
- Docker Compose template for mesh nodes
- CLI commands for adding peers and running tests
- Troubleshooting guide (common firewall issues, port conflicts)

**2. Cross-Platform CI**: New GitHub Actions workflow that:
- Spins up an Android emulator and PWA dev server in parallel
- Runs coordinated interaction tests (import data in web, export in native, verify sync)
- Reports coverage for both platforms in a single report

**3. Contract Testing Guide**: Document the fixture layer and add tooling to:
- List all contract variants with coverage status
- Generate fixture coverage report in CI
- Fail if a new contract variant lands without fixtures

### Scope

- [ ] **Docs**: \`docs/local-mesh-setup.md\` with Docker Compose template
- [ ] **Docs**: Update \`docs/android-testing.md\` with cross-platform guidance
- [ ] **CI**: New workflow \`.github/workflows/cross-platform-e2e.yml\` with Android emulator
- [ ] **Tooling**: Script to report fixture coverage by contract variant
- [ ] **Testing**: Example cross-platform test case (personal-data import/export)

### Success Criteria

- New contributor can run local mesh tests in <10 minutes using the setup guide
- Cross-platform E2E tests run in <5 minutes (with emulator startup overhead)
- Fixture coverage report runs in CI and fails if coverage drops below 80% per contract

### Related Issues

- Existing test coverage PRs (#719, #810, #814, #887, #908, #909, #946) should integrate with this framework
- Current docs (#34, #730, #872) should reference the new local testing guide

---

## Sequencing & Milestones

### Week 1–2 (Oct 7–18)
- **Theme 1**: Draft `AttendeeRoster` contract; ship PWA prototype
- **DevEx**: Publish local mesh setup guide and Docker Compose template
- **Goal**: Unblock external contributors; gather feedback on roster UX

### Week 3–4 (Oct 21–Nov 1)
- **Theme 2**: Define `SpeakerSlides` contract; implement PDF viewer in PWA
- **Theme 3**: Draft Q&A contract; spec moderation API
- **Goal**: Have contracts and UI prototypes ready for native app porting

### Week 5–6 (Nov 4–15)
- **Theme 1**: Integrate roster into native app; end-to-end testing
- **Theme 2**: Archival tool (Python script); CDN deployment guide
- **Theme 3**: Q&A UI on native app; moderation dashboard
- **DevEx**: Cross-platform CI workflow (Android emulator + PWA)
- **Goal**: All three themes have shippable native implementations

### Week 7–8 (Nov 18–29)
- **Testing**: Fixture coverage integration; cross-platform test suite
- **Docs**: Q&A organizer guide, slide upload guide, archival runbook
- **Goal**: Ready for a coordinated release across web, native, and docs

---

## Success Metrics

### Adoption
- Roster discovery reduces manual handshake count by >50% in post-event surveys
- Slide archival tool used for 100% of speaker decks within 24 hours of event close
- Q&A generates >100 questions per session (baseline: 0 currently)

### Quality
- Cross-platform E2E tests catch >80% of sync bugs before merge
- Fixture coverage stays >80% per contract type
- Local mesh setup time <15 minutes for first-time contributors

### Community
- >5 community-contributed contract extensions (e.g., organizer notes, speaker bio)
- >3 event organizers from other conferences adopt the tools

---

## Open Questions

1. **Roster privacy**: Should attendees be able to opt out of the roster? How to balance discoverability with privacy?
2. **Slide DRM**: Should we support password-protected slides or enforce CC licensing?
3. **Q&A moderation**: Who moderates (speaker, organizer, community upvoting)? Different policies per event?
4. **Mesh scalability**: Will roster syncing cause issues on slow/lossy networks (typical conference WiFi)?

---

## Related Documentation

- **Contracts**: `docs/adr/0009-versioned-contracts-and-golden-fixtures.md`
- **Federation**: `docs/federation-compatibility.md`
- **Contact sharing**: `docs/contact-sharing.md`
- **Mesh protocol**: `docs/mesh-protocol.md`
- **Existing roadmap**: `docs/roadmap.md`

---

## Next Steps

1. File three GitHub issues (one per theme) with checkable completion criteria
2. Review this document in a maintainer discussion; gather feedback on sequencing and scope
3. Cut branches and PRs for contracts, starting with the roster
4. Land local testing guide and Docker Compose template in week 1
5. Use cross-platform CI as a gate for all subsequent PRs

---

*Prepared by: strategist agent (ACMM L5 — hold-gated mode)*
*Review requested from: @maintainers, @ecosystem-partners*
