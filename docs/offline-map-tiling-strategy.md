# Offline Map Vector Tiling & Indoor Navigation Strategy

This document outlines the strategic roadmap for introducing offline vector tile caching and multi-venue indoor navigation capabilities within the IndiaFOSS Companion ecosystem.

## Executive Summary

While the current companion client utilizes SVG-based floorplans for single-venue conferences (such as NIMHANS), expanding adoption across multi-building, multi-hall FOSS events requires a scalable offline map architecture. Transitioning to pre-packaged vector tile archives (MBTiles / Mapbox Vector Tiles - MVT) combined with lightweight client-side Canvas rendering enables offline campus map interaction, room filtering, and smooth zoom capabilities without relying on external map tile servers or user location tracking.

## Core Architectural Pillars

### 1. Vector Tile Schema & Archive Packaging
- **Standardized Layers**: Define schema layers for `venue_boundary`, `buildings`, `floors`, `rooms`, `walkways`, and `points_of_interest`.
- **Pre-packaged MBTiles**: Bundle compressed `.mbtiles` packages within application releases or fetch via event bundle updates (`packages/schedule`).
- **Zero-External Dependency**: Map rendering must operate entirely offline without external map server requests (Mapbox, OpenStreetMap tile servers, Google Maps).

### 2. Client-Side Rendering Engine
- **Canvas/WebGL Pipeline**: Render MVT data on mobile and PWA clients with smooth pan/zoom, layer filtering, and interactive room highlight states.
- **Fallback SVG Bridge**: Retain inline SVG rendering for single-hall events to preserve minimal bundle overhead on low-end devices.

### 3. Indoor Positioning & Wayfinding
- **BLE Beacon Topology**: Integrate with low-power Bluetooth beacons for coarse indoor proximity detection without GPS reliance.
- **Floor-Level Routing**: Calculate shortest path routes across multi-floor stairwells and walkways using local pathfinding graphs.

## Implementation Milestones

- **Phase 1 (Near-Term)**: Define MVT layer schema and implement offline MBTiles unpacker in `packages/companion-core`.
- **Phase 2 (Mid-Term)**: Add Canvas vector tile map component to PWA (`apps/web`) and Android native client.
- **Phase 3 (Long-Term)**: Implement multi-building wayfinding and BLE beacon-assisted floor auto-switching.
