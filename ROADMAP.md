# IndiaFOSS Companion — Roadmap

**Current Status**: Nested developer preview with live event deployments  
**Latest Release**: Nightly builds (web PWA + Android APK)  
**Last Updated**: 2026-10-08

---

## Overview

IndiaFOSS Companion is an offline-first conference app that helps attendees answer four key questions:
1. What's happening right now?
2. What should I do next?
3. How do I get there?
4. Who did I just meet?

The project ships incrementally alongside live IndiaFOSS events, with each conference deployment validating architecture and collecting adoption signals. The roadmap reflects learnings from IndiaFOSS 2026 and strategic priorities for the next 12 months.

---

## Current Status (Q4 2026)

### Completed

- **Offline ranking engine**: Elo-based session selection with progressive disclosure
- **Real-time live hall display**: Progress bars and countdowns for running sessions
- **Venue floor plans**: Vector-based maps with live room highlighting
- **Contact exchange**: QR-based badge verification and attendee roster (IndiaFOSS 2026 tested)
- **Native Android client**: Kotlin Compose with Matrix/Neutrino mesh integration
- **Web PWA**: Progressive web app with offline support and installability
- **Matrix federation**: Bridge between on-site mesh and public Matrix instances
- **Accessibility testing**: AT-SPI validation journeys and WCAG coverage
- **Event day operations**: Schedule sync, deployment checklist, incident response policy

### Known Limitations

- **Voice/video**: Matrix voice/video available over federation but not optimized for mesh
- **Cross-platform account sync**: Ratings stored locally per device; no cloud sync
- **Mesh scalability**: Tested on ~100 attendees; behavior >500 unclear
- **Event archive**: No DRM-free speaker slide archival yet; manual uploads only
- **Attendance tracking**: No analytics on session popularity or drop-off by room
- **Offline map updates**: Venue floor plans require app rebuild; no dynamic ingestion

---

## Next Release (Q1-Q2 2027)

### 3-month priorities

1. **Mesh node discovery** (adoption blocker)
   - Make attendee roster discoverable without manual QR exchange
   - Publish roster metadata to local mesh with privacy controls
   - Closure: Issue #980, demonstrated on 50+ device mesh

2. **Speaker slides & DRM-free archival** (ecosystem opportunity)
   - Publish slide decks during talks via Companion portal
   - Archive talks with synchronized speaker notes
   - Post-event: downloadable slide bundles with Creative Commons licensing
   - Closure: Issue #981, first archived conference by Q2 2027

3. **Live Q&A and audience polling** (engagement multiplier)
   - Real-time audience polls synchronized across web and native
   - Speaker Q&A with moderation and vote-on-questions
   - Venue mesh only; not visible on public Matrix feed
   - Closure: Issue #982, tested with 2+ speaker tracks

4. **Multi-platform testing harness** (quality gate)
   - Local mesh testbed (Linux, macOS, Windows)
   - Automated cross-platform validation in CI
   - Closure: Issue #983

### Refactoring & Technical Debt

- Consolidate Matrix ID validation (indiafoss-companion#1050, 3 sites)
- Extract shared event/venue data models (reduce duplication across web/native)
- Publish one canonical "instant" predicate for event scheduling

---

## Mid-term (Q3-Q4 2027, Target for 1.0)

### Strategic themes

#### 1. **Offline-first conference mesh** (Core)
- Full attendee directory with privacy tiers
- Decentralized session availability (no central server)
- Mesh routing resilience (handle 20%+ link loss gracefully)
- Integration with other conference apps (Pretalx, Frab via Matrix Appservice)

#### 2. **Speaker experience platform** (Growth)
- Presentation tools: speaker notes, slides, Q&A timing
- Slide sync across multiple speaker devices (failover)
- Real-time audience sentiment (polls, reactions)
- Post-talk analytics: engagement curve, Q&A summary

#### 3. **Cross-event federation** (Ecosystem)
- Multi-conference attendee roster (FOSS events only, opt-in)
- Shared speaker profiles across IndiaFOSS, Debian Conf, FOSDEM
- Portable rankings: sessions you've rated sync across events
- Trust anchors: Matrix identity binding to FOSS community keys

#### 4. **Accessibility-first implementation** (Quality)
- AT-SPI compliance on all platforms (web, Android, future iOS)
- Keyboard-only navigation workflows
- Color-blind friendly venue maps
- Documented testing journey per accessibility feature

### Release milestones

| Milestone | Target | Scope |
|-----------|--------|-------|
| **Mesh Preview** | Q3 2027 | Issues #980–983; 200 attendees on real event |
| **Slides & Archive** | Q3 2027 | Issue #981; first complete conference archive published |
| **1.0-rc1** | Q4 2027 | All security gates; venue mesh fully resilient |
| **1.0 GA** | Early 2028 | Multi-conference federation support; production SLAs |

---

## Known Technical Debt

| Issue | Severity | Estimated Effort | Status |
|-------|----------|------------------|--------|
| Schedule sync wait-loop bug (#728) | High | 1-2d | Blocked on event-day runbook (#730) |
| Capability matrix stale with 27 commits (#799) | Medium | 1d | Needs weekly refresh cycle |
| App calls finished programme "provisional" (#826) | Medium | 2-4h | Label-only fix; needs event-phase awareness |
| Install guide references retired chat app (#831) | High | 2-4h | Remove IndiaFOSS Chat refs; add Companion F-Droid link |
| PWA has no post-event state (#877) | Low | 4-6h | Archive view; redirect closed events to repository |
| 25 held PRs (refactor 13, test 7, fix 5) (#1027) | Critical | N/A | Merge velocity bottleneck; needs architecture review |

---

## Adoption & Contribution

### Where we need help

1. **Testing on real hardware** (low barrier)
   - Android: Pixel, Samsung, OnePlus devices
   - Web: iOS Safari, Firefox focus modes
   - Report venue map rendering quirks

2. **Accessibility validation** (medium barrier)
   - Test with NVDA, JAWS, VoiceOver
   - Keyboard-only workflows on all screens
   - Open issues for unmet WCAG 2.1 AA criteria

3. **Mesh networking** (high barrier)
   - Multi-device routing and failover testing
   - Bandwidth constraints (train/venue wifi)
   - Security audit of Spindle integration

4. **Documentation & tooling** (low-medium barrier)
   - Local mesh development guide (#975)
   - Cross-platform testing CI (#983)
   - Event organizer deployment playbook

### Contribution areas

- **Code**: Matrix protocol impl, mesh routing, accessibility fixes  
- **Docs**: Deployment guides, troubleshooting, API examples  
- **Testing**: Journeys, accessibility tests, performance baselines  
- **Design**: Venue map templates, speaker slide integration UX  

### Review & Support

- All contributions must include a signed-off commit (DCO)
- Planning issues (roadmap, architecture) require hold-gated PR review
- Code PRs require CI passing + at least one maintainer review
- Hold queue target: merge within 5 days of maintainer feedback

---

## Out of Scope (Explicit Non-Goals)

- **Real-time audio/video on mesh**: Use Jitsi or commercial vendors
- **Attendee analytics**: No tracking; this is privacy-first
- **Multi-language translation**: Not in scope for nested preview
- **Mobile wallet integration**: Badges are QR codes; no platform tie-in
- **Sponsorship portals**: Handled by conference organizers separately

---

## Success Metrics

### For Nested Preview (Q1 2027)
- 500+ concurrent attendees on 3+ test events
- Zero data loss during 8-hour event day
- 95%+ accessibility test pass rate

### For 1.0 (Early 2028)
- 2+ conference deployments per year
- Published speaker slide archive for 3+ events
- 50%+ attendee opt-in to mesh roster

### Long-term (Year 2)
- Used by 5+ FOSS conferences (FOSDEM, DebConf, Pycon IN, etc.)
- Decentralized speaker network across events
- Community fork adoption (adapted by regional conferences)

---

## How to Get Involved

1. **Join the discussion**: Open an issue with your use case or deployment need
2. **Review held PRs**: Many are waiting for architecture decisions ([#1027](https://github.com/hanthor/indiafoss-companion/issues/1027))
3. **Test local mesh**: Follow [#975](https://github.com/hanthor/indiafoss-companion/issues/975) for dev setup
4. **Report accessibility gaps**: Link to WCAG criteria + test evidence in issues

See [CONTRIBUTING.md](CONTRIBUTING.md) for code contribution details and [docs/development.md](docs/development.md) for local setup.

---

*Last refreshed: 2026-10-08*  
*Next review: 2026-12-15 (post-planning cycle)*  
*Roadmap maintained by: strategist agent (open for human review)*
