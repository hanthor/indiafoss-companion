# Strategic Planning: Real-Time Conference Emergency & Organizer Announcement Broadcast Protocol

## Overview

In large-scale, multi-venue technology conferences such as IndiaFOSS, maintaining prompt and reliable communication between event organizers and attendees is critical. Traditional announcement mechanisms — such as push notifications via cloud providers (FCM/APNs), RSS feeds, or periodic HTTP polling — suffer from server overload, network congestion, and total failure when cellular networks or internet uplinks fail in high-density conference venues.

This strategy document defines an offline-first, peer-to-peer priority broadcast relay protocol designed to propagate signed organizer announcements, emergency alerts, and room/schedule changes across local BLE, Wi-Fi Direct, and Matrix room gateways.

---

## Strategic Objectives

1. **Deterministic Offline Broadcast Propagation**: Ensure emergency and high-priority organizer alerts reach offline attendees within 15 seconds of issuance across venue mesh networks.
2. **Cryptographic Authenticity & Non-Repudiation**: Prevent unauthorized or spoofed alert broadcasts on open wireless channels by requiring Ed25519 signatures tied to pre-seeded organizer public keys.
3. **Zero Cloud Infrastructure Dependency**: Allow local venue nodes to function as autonomous gossip relays without requiring active cloud connectivity or external API availability.
4. **Bandwidth Efficiency & Anti-Amplification**: Mitigate broadcast storm overhead using bloom-filter deduplication, strict time-to-live (TTL) bounding, and priority queuing.

---

## Architectural Architecture & Protocol Specification

### 1. Priority Packet Structure

Broadcast announcements are encapsulated in a compact binary payload (`EmergencyBroadcastPacket`):

```json
{
  "packet_id": "ebp_2026_09_12_001",
  "issuer_id": "organizer_pubkey_ed25519_hex",
  "priority": "CRITICAL", // CRITICAL, HIGH, INFO
  "timestamp": 1789259000,
  "expires_at": 1789262600,
  "ttl": 5,
  "scope": {
    "venue_id": "main_stage_hall_a",
    "target_audience": "all"
  },
  "content": {
    "title": "Emergency Evacuation - Main Hall A",
    "body": "Please exit Main Hall A immediately using the South exits due to power maintenance.",
    "action_url": "companion://map/evacuation-south"
  },
  "signature": "ed25519_signature_hex"
}
```

### 2. Multi-Transport Relay Pipeline

```
[ Organizer Terminal ] --(Signed Packet)--> [ Matrix Gateway / Venue Spindle ]
                                                     |
                     +-------------------------------+-------------------------------+
                     |                               |                               |
          (Wi-Fi Direct Gossip)            (BLE Mesh Advertising)            (PWA Local Handoff)
                     |                               |                               |
                     v                               v                               v
           [ Attendee Node A ] ------------> [ Attendee Node B ] ------------> [ Attendee Node C ]
```

- **Transport 1: Matrix Gateway / Spindle**: High-priority state events published to the `#announcements:indiafoss.org` room with standard Matrix E2EE fallback.
- **Transport 2: BLE Mesh Advertising**: Compact chunked payloads broadcast over Bluetooth LE advertising channels (`0xFE33` service UUID) for rapid neighbor-to-neighbor propagation.
- **Transport 3: Local Wi-Fi Direct Gossip**: Bulk payload dissemination over local peer sockets when high-resolution media or full schedule changes accompany the alert.

---

## Security & Verification Guarantees

1. **Key Distribution**: Organizer public key hashes are pinned inside the application binary during build assembly and verified against the pre-seeded event bundle index.
2. **Replay Protection**: Packets containing expired `expires_at` timestamps or duplicate `packet_id` hashes are immediately dropped by the relay engine.
3. **Local Notification Overrides**: `CRITICAL` priority alerts override silent/do-not-disturb app settings (where OS permissions allow) and trigger persistent local heads-up notifications.

---

## Implementation Roadmap & Milestones

- **Phase 1 (Near-Term)**: Define protobuf/JSON schema for `EmergencyBroadcastPacket` and build Ed25519 verification hooks in `indiafoss-companion` sources package.
- **Phase 2 (Mid-Term)**: Integrate priority queue into BLE and Wi-Fi mesh gossip transport protocols in `indiafoss-chat-android`.
- **Phase 3 (Long-Term)**: Conduct venue-wide rehearsal at regional FOSS conference with simulated network blackout.
