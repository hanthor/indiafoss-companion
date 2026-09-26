# Live Session Q&A and Audience Polling Protocol Strategy

## Overview

During community FOSS conferences, real-time attendee interaction (question submission, upvoting, and live polling) enhances session engagement. Relying on external SaaS products (e.g. Slido, Mentimeter) presents privacy concerns, vendor lock-in, and dependency on high-bandwidth internet connectivity that often degrades during crowded events.

This document outlines the strategic design for an offline-first, local-mesh-compatible Live Q&A and Audience Polling Protocol within the IndiaFOSS Companion platform.

---

## Architectural Principles

1. **Privacy-Preserving Identity**: Attendee submissions are signed using ephemeral session keys without requiring PII or persistent account registration.
2. **Offline & Local Mesh Resilience**: Questions and votes can propagate via Matrix Spindle gateways or local peer-to-peer BLE/Wi-Fi mesh when WAN backhaul is down.
3. **Presenter Moderation**: Organizers and session chairs have cryptographic moderation controls to filter, group, or dismiss questions.
4. **Bandwidth Efficiency**: Upvotes and poll responses use delta CRDT encoding to minimize payload sizes over mesh radio links.

---

## Strategic Implementation Plan

### Phase 1: Local Q&A Submission & Voting Schema

- Define lightweight JSON-schema for `QuestionSubmission`, `QuestionUpvote`, and `PollResponse` events.
- Implement client-side queueing and duplicate detection.

### Phase 2: Mesh & Gateway Broadcast Protocol

- Integrate question state synchronization with Matrix Spindle relay node.
- Support real-time presenter view broadcast via WebSocket / SSE.

### Phase 3: Analytics & Post-Session Archival

- Provide anonymized summary reports for speakers and event organizers after talk conclusion.
