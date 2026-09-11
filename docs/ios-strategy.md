# Cross-Platform iOS Native & Multipeer BLE Mesh Strategy

## Executive Summary

The IndiaFOSS Companion ecosystem aims to provide high-density event attendees with reliable, off-grid schedule synchronization, room coordination, and peer-to-peer messaging. While `indiafoss-chat-android` implements native Android BLE mesh transport and durable outbox queues, iOS participation is currently bounded by Web PWA baseline interfaces.

This document outlines the strategic architecture for bringing full feature parity to iOS via a native client integration layer leveraging Apple's `MultipeerConnectivity` framework alongside Bluetooth Low Energy (BLE) mesh adapters, hardware-backed Keychain key isolation, and mesh-Matrix gateway convergence.

## Architectural Objectives

1. **Off-Grid Transport Parity**: Enable seamless peer-to-peer discovery and message relay between iOS devices and Android/gateway nodes in low-connectivity venue environments.
2. **Framework Alignment**: Utilize native `MultipeerConnectivity` for high-throughput local Wi-Fi/P2P links while bridging to standard BLE GATT services for cross-platform Android interoperability.
3. **Hardware Key Isolation**: Protect cryptographic identity and room session keys within the iOS Keychain and Secure Enclave (`CryptoKit` + `SecKey`).
4. **Gateway Convergence**: Connect iOS peer networks into the tested Spindle/Matrix gateway seam without altering canonical event bundle schemas.

## Transport & Protocol Seams

```
+-----------------------------------------------------------------------+
|                         iOS Native Companion                          |
+-----------------------------------+-----------------------------------+
|    MultipeerConnectivity Peer     |       CoreBluetooth GATT          |
|    (iOS-to-iOS High Throughput)   |   (Cross-Platform BLE Mesh)       |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                    Mesh-Matrix Gateway Seam                           |
|      (Matrix Federation / Neutrino Room Actor / Durable Outbox)       |
+-----------------------------------------------------------------------+
```

### MultipeerConnectivity & CoreBluetooth Hybrid Transport

- **MultipeerConnectivity Adapter**: Primary transport for iOS-to-iOS cluster discovery. Provides low-latency binary stream handling for event schedule diffs and media attachments.
- **CoreBluetooth GATT Service**: Secondary transport implementing the standard IndiaFOSS BLE service UUIDs (`0xFA11` / custom service contracts). Ensures seamless peer routing to Android devices running `indiafoss-chat-android`.
- **Durable Outbox Queue**: Shared SQLite / CoreData outbox matching the Android envelope contract to queue undelivered messages across app suspension and background execution limits.

## Cryptographic Security & Identity Model

- **Device Key Isolation**: Key pairs for Matrix device signing (`m.device_key`) and one-time keys (`m.one_time_key`) are generated using `SecKeyCreateRandomKey` backed by the Secure Enclave.
- **Biometric Protection**: Private key access requires `kSecAccessControlBiometryAny` or device passcode authorization for sensitive room key export.
- **Trust Delegation**: Verification of peer devices leverages in-person QR identity binding contracts aligned with `docs/identity-binding.md`.

## Interoperability & Test Harness Matrix

| Test Scenario | Transport Layer | Expected Behavior | Conformance Benchmark |
| :--- | :--- | :--- | :--- |
| **iOS <-> iOS Sync** | MultipeerConnectivity | Direct P2P schedule diff resolution within 200ms | Zero internet reliance |
| **iOS <-> Android Mesh** | CoreBluetooth GATT | Cross-platform text envelope relay across 3 hops | Envelope contract validation |
| **iOS <-> Venue Gateway** | Wi-Fi / Local LAN | Federation sync and room state reconciliation | Spindle gateway gateway contract |
| **App Backgrounding** | Background Processing | Pending outbox flush within OS background execution budget | No dropped outbox messages |

## Implementation Roadmap & Milestones

1. **Phase 1: Transport Seam Prototyping**
   - Implement `CoreBluetooth` GATT scanner and peripheral manager matching the Android BLE packet framing.
   - Validate MultipeerConnectivity peer session setup and binary payload serializer.

2. **Phase 2: Durable Storage & Key Binding**
   - Integrate Keychain Secure Enclave wrapper for device identity signing.
   - Replicate the durable outbox storage engine for iOS Swift codebase.

3. **Phase 3: Cross-Platform Venue Rehearsal**
   - Deploy mixed iOS/Android test harness simulating high-density conference room conditions.
   - Verify room state reconciliation against synthetic event fixtures (`events/synthetic`).
