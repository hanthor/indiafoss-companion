# Conference Feedback & Post-Event Survey Engine Strategy

## Overview

This strategy outlines the architecture and deployment plan for an offline-first, privacy-preserving session feedback and post-event survey collection engine for IndiaFOSS Companion apps.

## Key Objectives

1. **Privacy-Preserving Data Collection**: Collect quantitative session ratings (1-5 stars) and qualitative commentary without requiring user identity or device identifiers.
2. **Offline Queueing & Store-and-Forward**: Store feedback locally using encrypted persistence when disconnected, automatically syncing when venue or local peer connections are restored.
3. **Aggregated Insights for Organizers**: Provide real-time, zero-knowledge feedback aggregation for track leads and conference organizers while preventing individual attendee tracking.

## Technical Architecture

### 1. Data Schema & Anonymity

- **Feedback Payload**:
  - `session_id`: Unique identifier of the presentation/workshop.
  - `rating`: Integer from 1 to 5.
  - `aspects`: Multi-select tags (e.g., `content_quality`, `speaker_engagement`, `audio_visual`).
  - `comments`: Optional sanitized string (max 500 characters).
  - `timestamp`: Bucketized timestamp rounded to 15-minute intervals to prevent timing correlation attacks.
  - `nonce`: Ephemeral cryptographic nonce for deduplication without persistent user tracking.

### 2. Synchronization Flow

- **Local Storage**: Encrypted SQLite / IndexedDB payload storage.
- **Transport**:
  - Direct HTTP submission to conference spindle gateway when online.
  - Mesh / peer-to-peer sync relay to organizer gateways when internet connectivity is constrained.

## Implementation Roadmap

- **Phase 1**: Define feedback protobuf / JSON schemas and local database migration scripts.
- **Phase 2**: Build attendee UI components for post-session rating popups and survey prompts.
- **Phase 3**: Implement privacy-preserving aggregation service on the backend spindle gateway.
