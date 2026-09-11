# Matrix Federation & Conference Spindle Gateway Deployment Strategy

This document details the operational strategy and deployment architecture for scaling the conference Matrix Spindle homeserver network (#115), bridging Bluetooth LE venue mesh clusters with federated server backbones, and implementing progressive room-version convergence.

## Executive Summary

High-density event environments require reliable communication channels across varying connectivity conditions. The conference Spindle network provides the central internet-facing Matrix bridge for remote attendees, organizer announcements, and offline-mesh reconciliation. Scaling from single-instance deployments to a resilient gateway topology ensures zero message loss during peak session changes and network handoffs.

## 1. Multi-Node Gateway Topology

To prevent homeserver starvation from thousands of concurrent mobile clients, the venue architecture deploys isolated gateway proxies:

- **Edge Gateway Nodes**: Deploy 3 to 5 low-power gateway nodes at high-density venue hubs (Registration, Main Auditorium, Expo Hall).
- **Peer Isolation**: Configure `[federation.allow_internal]` and explicit peer mappings in `spindle.toml` to prevent unthrottled fan-out across venue subnets.
- **Backoff Tuning**: Set `max_backoff_ms = 3600000` (1 hour) on gateway peers to preserve transaction queues during intermittent WAN link dropouts without exhausting connection pools.

## 2. Protocol & Sync Optimization

- **MSC4186 Simplified Sliding Sync**: Transition from legacy `/sync` long-polling to Simplified Sliding Sync to reduce bandwidth overhead by up to 70% per client connection.
- **Room Alias Pre-Seeding**: Deterministically provision official conference room aliases (`#announcements`, `#audi1-qa`, `#devroom-chat`) during pre-event staging.
- **UIAA Auth Flow Integrity**: Standardize User-Interactive Authentication API dummy-flow (`m.login.dummy`) validation across client apps and Neutrino probe harnesses (`tools/neutrino-probe`).

## 3. Mesh-to-Spindle Convergence (ADR 0003 Alignment)

Joining the peer-to-peer BLE Neutrino mesh and federated Spindle instances requires strict cryptographic and room-version alignment:

1. **Identity Linking**: Public key identity envelopes bind Matrix `@user:server` IDs to local BLE device keypairs without exposing raw phone identifiers.
2. **Room Version Convergence**: Standardize event signing and DAG room-version algorithms across both transport layers prior to full event synchronization.
3. **Bridge Privacy Boundaries**: Reject automated message mirroring across offline and online spaces to preserve local attendee privacy and prevent room-state corruption.

## 4. Verification & Testing Playbook

- **Load Simulation**: Execute synthetic connection sweeps against test Spindle gateways using headless client instances prior to event deployment.
- **Contract Verification**: Run contract suites with `PROBE_GAPS=0` to verify registration, room state, membership lists, and message history under degraded network conditions.
- **Failover Verification**: Test gateway disconnect and reconnect cycles to confirm zero message duplication or dropped outbox transactions.
