# Community Event Onboarding & Contribution Strategy

This document outlines the strategic framework, schema requirements, and contribution guidelines for onboarding new FOSS United events and community regional conferences into the IndiaFOSS Companion platform.

## 1. Executive Summary & Strategic Objectives

IndiaFOSS Companion is designed to serve as the unified event engine, offline-first schedule navigator, and privacy-preserving networking companion for FOSS United events across India. To expand platform adoption from flagship national conferences (e.g., IndiaFOSS 2026) to regional chapters (CityFOSS, campus meetups, and specialized developer summits), we require a self-serve, standardized contribution pipeline for community event leads.

### Key Objectives

1. **Decentralized Event Onboarding**: Allow regional event leads to prepare, validate, and submit event bundles via standard GitHub pull requests without modifying core PWA or Android application logic.
2. **Schema & Identifier Stability**: Enforce strict stability rules for activity, speaker, venue, and track identifiers (`eventId`, `activityId`, `personId`) to ensure offline attendee state (bookmarks, notes, itineraries) remains intact across event revisions.
3. **Automated Verification Pipeline**: Integrate automated CI validation tasks (`just fixture-verify`) to verify schema compliance, hash provenance, and asset integrity prior to bundle publication.
4. **Offline-First Asset Delivery**: Guarantee that map tiles, brand logos, and session schedules are bundled into hash-addressed, immutable distributions.

---

## 2. Event Lifecycle & Submission Workflow

The event lifecycle consists of five distinct phases:

```
[ Capture Raw Fixtures ] → [ Normalize to EventBundle ] → [ Verify & Lint ] → [ Publish Revision ] → [ App Distribution ]
```

### Phase 1: Raw Fixture Capture
Regional event leads collect upstream schedule data, proposal metadata, and venue maps.
- Store raw API responses under `events/<event-id>/raw/`.
- Provide a `provenance.json` recording source URLs, fetch timestamps, and SHA-256 hashes.

### Phase 2: Schema Normalization
Transform raw data into the canonical `EventBundle` schema using `@indiafoss/sources` adapters.
- Generated output location: `events/<event-id>/normalized/event-bundle.json`.
- Must contain all mandatory fields: `event`, `activities`, `people`, `locations`, `tracks`, and `booths`.

### Phase 3: Automated Verification & Linting
Run local verification commands before opening a pull request:
```bash
just fixture-normalize event=<event-id>
just fixture-verify    event=<event-id>
```
Verification checks include:
- Structural validation against JSON schema definitions.
- Referral integrity (every `activity.locationId` and `activity.speakerIds` must reference valid entities).
- ID persistence checks against previous published revisions.

### Phase 4: Event Publication
Upon PR approval, the event bundle is compiled into an immutable revision:
```bash
just event-publish event=<event-id>
```
Published assets are staged under `events/<event-id>/published/` and synched into the PWA static assets distribution directory.

---

## 3. Contribution Guidelines for Community Maintainers

### Directory Conventions

- `events/<event-id>/`: Isolated directory per event (e.g., `events/delhifoss-2026`).
- `docs/contributing-strategy.md`: Platform contribution guidelines (this document).
- `apps/web/static/events/`: Web distribution targets for static asset hosting.

### Pull Request Standards

1. **Scope Isolation**: Event onboarding PRs must only touch `events/<event-id>/` files and documentation. They must not mutate core app components or shared packages.
2. **Commit Signing**: All commits must be signed using DCO (`git commit -s`).
3. **Automated CI Validation**: CI will run `just fixture-verify` on all modified event directories. PRs with broken references or missing provenance files will be blocked.

---

## 4. Governance & Roadmap Alignment

- **Short-term**: Standardize `indiafoss-2026` and `cityfoss-2026` event bundle normalization.
- **Mid-term**: Deploy self-serve web-based event validator tools for non-developer event organizers.
- **Long-term**: Support dynamic decentralized event syncing via Matrix state-DAG federation (Spindle integration).
