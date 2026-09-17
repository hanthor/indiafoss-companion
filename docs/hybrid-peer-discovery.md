# Dynamic Hybrid Peer Discovery & Fallback Topology Strategy

**Target Issue**: #494  
**Author**: Strategist Agent (ACMM L5 — Hold-Gated Mode)  
**Status**: Strategic Planning / Hold-Gated

---

## 1. Executive Summary & Context

The IndiaFOSS Companion platform operates across varied conference environments—ranging from dense physical auditoriums with minimal cellular reception to remote hybrid setups. To ensure seamless schedule synchronization, peer-to-peer contact exchange, and decentralized messaging, the client architecture must support a **Dynamic Hybrid Peer Discovery & Fallback Topology Engine**.

This document outlines the multi-tiered protocol hierarchy, state machine transitions, power-aware adaptation strategies, and platform-specific implementations across Android, iOS, and Web environments.

---

## 2. Multi-Tier Peer Discovery Architecture

The discovery architecture is structured into four distinct physical and logical transport layers:

```
+-----------------------------------------------------------------------+
|                       Application Layer                               |
|            (Contact Sync / Mesh Chat / Schedule Broadcast)           |
+-----------------------------------------------------------------------+
                                  |
                                  v
+-----------------------------------------------------------------------+
|                 Dynamic Fallback Topology Orchestrator                 |
+-----------------------------------------------------------------------+
   |                        |                         |
   v                        v                         v
+------------------+ +-----------------------+ +------------------------+
| Tier 1: Local    | | Tier 2: LAN Multicast | | Tier 3: WebRTC         |
| BLE Advertising  | | / mDNS (Bonjour/NSD)  | | Signaling Gateway    |
+------------------+ +-----------------------+ +------------------------+
   |                        |                         |
   v                        v                         v
(Short-range,        (Medium-range, High     (Wide-area, Cellular /   |
 Low-power)           Bandwidth Wi-Fi)        Internet Cloud Relay)   |
                                                                        |
   +--------------------------------------------------------------------+
   | Tier 0: Direct NFC / QR Pairing (Bootstrapping / Out-of-Band Verification)
```

### Protocol Tier Specifications

1. **Tier 0 (Out-of-Band Bootstrapping / Verification)**:
   - **Transports**: Near Field Communication (NFC), Animated QR Code streams.
   - **Use Case**: Immediate high-trust identity binding, emergency contact verification, initial session key exchange.

2. **Tier 1 (BLE Advertising & Scanning)**:
   - **Transports**: Bluetooth Low Energy (BLE) peripheral advertising & central discovery streams.
   - **Service UUID**: `0000F055-0000-1000-8000-00805F9B34FB` (IndiaFOSS Mesh Discovery Service).
   - **Use Case**: Continuous zero-connectivity proximity detection and background mesh routing.

3. **Tier 2 (Local LAN Multicast & mDNS)**:
   - **Transports**: mDNS (`_indiafoss-mesh._tcp.local.`), UDP Multicast (`239.255.60.1:4884`).
   - **Use Case**: High-throughput peer discovery on shared conference Wi-Fi networks where WAN egress is choked.

4. **Tier 3 (WebRTC & Matrix Spindle Signaling)**:
   - **Transports**: WebSocket signaling, Matrix Spindle TURN/STUN fallback, WebAssembly client mesh hub.
   - **Use Case**: Wide-area routing across distinct Wi-Fi subnets, venue rooms, and remote attendees.

---

## 3. Dynamic Topology State Machine & Fallback Mechanics

The client transport orchestrator continuously evaluates environmental metrics to switch discovery tiers dynamically.

### State Transition Diagram

```
                +-------------------------+
                |    INITIALIZING         |
                +-------------------------+
                             |
                             v
                +-------------------------+
                |    TIER 1: BLE ONLY     | <----+ (LAN Lost / Off Wi-Fi)
                +-------------------------+      |
                             |                   |
               (Joined Wi-Fi | mDNS Active)      |
                             v                   |
                +-------------------------+      |
                | Tier 1 + 2: BLE & mDNS  | -----+
                +-------------------------+
                             |
                (WAN Reachable & TURN OK)
                             v
                +-------------------------+
                | Tier 1+2+3: FULL HYBRID |
                +-------------------------+
```

### Fallback & Elevation Criteria

| Trigger Condition | Current State | Target State | Action |
| :--- | :--- | :--- | :--- |
| Wi-Fi Connected & LAN Multicast functional | Tier 1 (BLE) | Tier 1 + Tier 2 | Spawns mDNS listener; announces local peer endpoint |
| Matrix Spindle Gateway ping `< 250ms` | Tier 1+2 | Tier 1+2+3 | Connects WebRTC signaling socket; registers peer bundle |
| Battery level `< 15%` | Any | Low-Power Tier 1 | Throttles BLE scan duty cycle to 10%; suspends mDNS/WebRTC |
| High BLE Congestion (Duty cycle drop) | Tier 1 | Tier 2 / Tier 0 | Prompts user to scan QR code or connect to venue Wi-Fi |

---

## 4. Platform-Specific Integration Plan

### Android (`apps/native`)
- **BLE Service**: Implement `L2CAP` channels via `BluetoothGattServer` for higher data throughput than standard GATT attributes.
- **mDNS / NSD**: Utilize Android `NsdManager` with automatic fallback to JmDNS if OEM network service discovery hangs.

### iOS (`packages/mesh-core-swift`)
- **Multipeer Connectivity**: Integrate `CBPeripheralManager` and `CBCentralManager` alongside `NWBrowser` / `NWListener` for iOS background advertising boundaries.

### Web / PWA (`apps/pwa`)
- **Web Bluetooth & WebRTC**: Support WebRTC datachannel mesh connections bootstrapped via Matrix Spindle signaling fallback when Web Bluetooth API is disabled by browser policy.

---

## 5. Security & Privacy Guarantees

- **Ephemeral Peer Identifiers**: BLE advertising payloads use rotating 16-byte cryptographically blurred tokens refreshed every 15 minutes to eliminate persistent tracking.
- **Mutual Authentication**: Handshakes require Noise Protocol Framework (`Noise_XX_25519_ChaChaPoly_BLAKE2b`) payload verification before exposing user profile metadata across Tier 1/2/3 networks.

---

## 6. Implementation Roadmap & Milestones

1. **Milestone 1 (Q4 2026)**: Finalize BLE advertising packet format and dynamic state machine orchestrator interfaces.
2. **Milestone 2 (Q1 2027)**: Implement Tier 2 mDNS fallback layer and integration harness in `packages/mesh-core`.
3. **Milestone 3 (Q2 2027)**: Cross-platform validation on Android and PWA during regional FOSS mini-events.
