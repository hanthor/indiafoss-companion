# Mobile Push Notification Relay & Privacy-Preserving Alert Delivery Strategy

## Executive Summary

The IndiaFOSS Companion platform currently relies on offline bundle caching and local WebAssembly client-side indexing for fast schedule lookups. However, real-time event updates—such as sudden room reassignments, emergency announcements, or session delay notifications—require an active push alert channel. 

This document outlines the architecture strategy for integrating a decentralized, privacy-preserving push notification relay using the **UnifiedPush** protocol standard with optional fallback gateways, ensuring minimal battery impact and zero tracking of attendee location or schedule interests.

## Strategic Principles

1. **Privacy-Preserving Subscriptions**: Topic subscriptions must use zero-knowledge hashed event handles. The relay server never gains visibility into which specific sessions or speakers an attendee is following.
2. **Decentralized Protocol (UnifiedPush)**: Support open UnifiedPush distributors (e.g., nntpchan, WebPush, Nextcloud, Gotify) to eliminate hard dependencies on proprietary vendor clouds.
3. **Graceful Fallbacks**: Provide optional FCM (Firebase Cloud Messaging) and APNs (Apple Push Notification service) relay bridges for attendees running stock Android or iOS builds without active UnifiedPush distributors.
4. **Offline-First Resilience**: Push notifications serve solely as dynamic invalidation triggers or urgent advisory alerts. The client app continues operating reliably even if notification endpoints are blocked or unroutable.

## Target Architecture & Data Flow

```
+--------------------------+        +---------------------------+        +--------------------------+
|  Conference Admin Portal |------->| Push Relay Server (Spindle)|------->| UnifiedPush / FCM Gateway |
+--------------------------+        +---------------------------+        +--------------------------+
                                                                                      |
                                                                                      v
                                                                         +--------------------------+
                                                                         |  IndiaFOSS Companion App |
                                                                         +--------------------------+
```

1. **Payload Encryption**: All push notification payloads containing schedule differential metadata are encrypted at the relay server using ephemeral event keys before dispatch.
2. **Topic Hashing**: Topic channels (e.g., `event:indiafoss2026:track:devops`) are SHA-256 hashed with a daily rotating salt to prevent network eavesdroppers from inferring attendee interest profiles.
3. **Payload Minimalism**: Push notifications carry minimal payload size (< 4 KB), triggering local background bundle fetch and delta verification upon reception.

## Implementation Roadmap & Milestones

- **Phase 1 (Near-Term)**: Define UnifiedPush distributor detection seam in `@indiafoss/shared` and add push subscription permission controls.
- **Phase 2 (Mid-Term)**: Deploy open Spindle Push Gateway bridge for Matrix / UnifiedPush event routing.
- **Phase 3 (Long-Term)**: Integrate APNs / FCM token anonymization proxy for cross-platform fallback delivery.
