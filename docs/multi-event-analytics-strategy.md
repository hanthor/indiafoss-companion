# Multi-Event Analytics Aggregator & Comparative Insights Strategy

## Executive Summary

As the FOSS United event ecosystem expands across national (IndiaFOSS), regional (CityFOSS), and specialized (FOSS Hack) conferences, event organizers need high-level comparative insights into attendance growth, track popularity, venue capacity utilization, and attendee engagement across multiple events.

This document outlines the strategic design for a **Multi-Event Analytics Aggregator** that consumes local, privacy-preserving differential privacy metrics from individual conference companion deployments and aggregates them into cross-conference insights without centralized tracking or personal data collection.

---

## Strategic Goals

1. **Cross-Event Trend Analysis**: Identify growth patterns, popular technical tracks, and schedule overlap challenges across multiple conference instances over annual cycles.
2. **Resource Allocation & Venue Planning**: Provide empirical benchmark data to help organizers size venues, allocate speaker stages, and optimize sponsor booth placement based on historical cross-event attendance density.
3. **Strict Privacy Preservation**: Maintain zero client IP logging, zero persistent device identifiers, and strict local differential privacy ($\epsilon$-differentially private noise injection) prior to multi-event aggregation.

---

## Architectural & Data Pipeline

```
┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│  IndiaFOSS Companion Instance   │      │   CityFOSS Companion Instance   │
│  (Differential Privacy Rollup)  │      │  (Differential Privacy Rollup)  │
└────────────────┬────────────────┘      └────────────────┬────────────────┘
                 │                                        │
                 └───────────────────┬────────────────────┘
                                     ▼
                     ┌───────────────────────────────┐
                     │ Multi-Event Aggregator Engine │
                     │  (Cross-Conference Rollup)    │
                     └───────────────┬───────────────┘
                                     ▼
                     ┌───────────────────────────────┐
                     │  Comparative Insights Portal  │
                     │  (Track Density & Retention)  │
                     └───────────────────────────────┘
```

### Data Schema (`docs/schemas/multi-event-telemetry.json`)

Each event node submits a telemetry manifest containing noise-infused aggregate counts:

```json
{
  "event_id": "indiafoss-2026",
  "organization_id": "foss-united",
  "schema_version": "1.0",
  "aggregation_timestamp": "2026-09-16T00:00:00Z",
  "metrics": {
    "total_attendees_estimated": 1850,
    "peak_venue_occupancy_ratio": 0.82,
    "track_engagement": [
      { "track": "devops-cloud", "avg_session_fill_ratio": 0.91 },
      { "track": "ai-ml", "avg_session_fill_ratio": 0.95 },
      { "track": "web3-crypto", "avg_session_fill_ratio": 0.44 }
    ],
    "schedule_app_adoption_rate": 0.78
  },
  "privacy_spec": {
    "differential_privacy_epsilon": 0.5,
    "noise_distribution": "laplace"
  }
}
```

---

## Key Metrics & Comparative Views

### 1. Track Demand Velocity Index
Compares session capacity vs actual attendance across different technical domains over consecutive events to guide Call-For-Proposals (CFP) curation.

### 2. Multi-Venue Density Heatmaps
Normalizes indoor navigation movement density by venue floor plan area, identifying layout friction points across different conference facilities.

### 3. Year-over-Year Ecosystem Retention
Calculates privacy-safe cohort growth without user tracking by analyzing aggregate anonymized peer verification counts across consecutive event years.

---

## Implementation Milestones

- **Phase 1 (Q4 2026)**: Define multi-event schema specification and local export parser in `packages/telemetry`.
- **Phase 2 (Q1 2027)**: Implement static site generator extension for cross-conference dashboard visualization.
- **Phase 3 (Q2 2027)**: Deploy automated CI pipeline for publishing periodic ecosystem metrics reports.

---
