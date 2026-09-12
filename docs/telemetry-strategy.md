# Privacy-Preserving Telemetry & Organizer Analytics Strategy

This document specifies the architecture and deployment strategy for privacy-preserving, local-first event analytics and organizer crowd density insights for IndiaFOSS Companion.

## Executive Summary

Organizer insights (such as devroom occupancy, session interest heatmaps, and schedule flow transitions) are essential for operating large multi-track community conferences. However, traditional telemetry platforms collect continuous location traces, unique device IDs, or invasive network ping telemetry.

The strategy outlined here enables opt-in, privacy-preserving aggregated telemetry using **Local Differential Privacy (LDP)** and **K-Anonymity batching**, ensuring event organizers receive actionable operational metrics while guaranteeing client privacy and identity protection.

---

## Strategic Goals & Principles

1. **Zero Personally Identifiable Information (PII)**
   - No device identifiers, IP addresses, persistent tokens, or biometric signatures are ever transmitted.
   - All submissions are completely unauthenticated and stateless.

2. **Local Differential Privacy (LDP)**
   - Noise (randomized response mechanism) is added locally on-device before any telemetry ping is queued.
   - Organizers can reconstruct accurate aggregate statistics across hundreds of attendees while mathematically limiting individual user disclosure.

3. **Opt-In Explicit Consent**
   - Telemetry collection is disabled by default.
   - A clear disclosure modal during event onboarding details what aggregate counts are submitted.

4. **Offline Queue & Anonymized Batching**
   - Telemetry events (e.g. "entered Audi 1", "bookmarked track keynotes") are stored locally.
   - Submissions are shuffled and delay-batched over random time intervals to prevent time-correlation analysis.

---

## System Architecture

```
+-----------------------------------+
|     Client Device (Companion App) |
|  - Opt-in state check             |
|  - Event trigger (Room/Track)     |
|  - Local Noise Addition (LDP)    |
|  - Random Delay & Batching Queue  |
+-----------------------------------+
                  |
                  | Anonymous TLS Post (shuffled)
                  v
+-----------------------------------+
|      Organizer Spindle Relay      |
|  - Drops IP/HTTP headers          |
|  - K-Anonymity threshold check    |
|  - Aggregate Noise De-biasing    |
+-----------------------------------+
                  |
                  v
+-----------------------------------+
|     Organizer Realtime Dashboard  |
|  - Room occupancy heatmaps        |
|  - Popular track transitions      |
+-----------------------------------+
```

---

## Implementation Roadmap

### Phase 1: Local Telemetry Schema & Opt-In UI
- Define `TelemetryEvent` data types (`SessionBookmark`, `RoomOccupancyBucket`, `TrackTransition`).
- Implement user consent preferences in native and web settings with clear toggle controls.

### Phase 2: Differential Noise & Local Aggregation Engine
- Implement randomized response algorithm for boolean/categorical metrics.
- Enforce noise parameter (privacy budget control) to cap total privacy loss per conference day.

### Phase 3: Organizer Spindle Relay Integration
- Deploy lightweight, stateless relay endpoint on Spindle infrastructure.
- Strips incoming HTTP network headers (IP, User-Agent) before passing aggregate buckets to the visualization dashboard.

---

## Success Metrics & Adoption Criteria

- Zero leakage of individual user itineraries or live coordinate traces.
- Organizer feedback validation: aggregate room density metrics accurate within +/- 5% for devrooms with >50 attendees.
- Opt-in rate transparency and user trust retention across conference attendees.
