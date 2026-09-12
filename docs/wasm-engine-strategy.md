# WebAssembly Offline Schedule Engine & Client-Side Search Strategy

## Overview

As event size scales across regional FOSS United conferences (such as IndiaFOSS), venue network connectivity is frequently saturated or intermittent. To ensure sub-millisecond offline schedule filtering and fuzzy text search without remote server dependencies, `indiafoss-companion` will introduce a compiled WebAssembly (Wasm) Rust execution engine.

## Core Capabilities & Architecture

1. **Dedicated Worker-Thread Runtime**
   - The Wasm module runs inside a dedicated Web Worker to maintain 60fps UI responsiveness during bulk index processing.
   - Pre-compiled event bundles are ingested directly from IndexedDB into Wasm linear memory via SharedArrayBuffer / Transferable ArrayBuffers.

2. **In-Memory Fuzzy Indexing & Ranking**
   - Implements Trigram / Levenshtein-based fuzzy match algorithms in Rust for instant speaker name, talk title, and track searches.
   - Computes relevance scoring directly within Wasm to output ranked array offset indices back to the main thread.

3. **Offline Schedule Filtering & Constraint Solving**
   - High-speed bitset filter operations for multi-track time window collisions, room capacity constraints, and topic tag intersections.
   - Facilitates real-time calendar agenda collision detection entirely offline.

## Security & Memory Boundaries

- **Linear Memory Sandboxing**: The Wasm runtime operates under standard web worker sandboxing with strict array buffer bounds checking.
- **Zero Remote Dependencies**: The Wasm module is built deterministically via `wasm-pack` and bundled locally within client assets — no runtime CDN fetching.
- **No Evaluation Execution**: No `eval()` or dynamic code generation; static Wasm bytecode loading under strict CSP headers.

## Roadmap & Milestones

- **Phase 1**: Rust Wasm crate implementation (`@indiafoss/wasm-engine`) with basic fuzzy search & bitset filtering benchmarks.
- **Phase 2**: Integration into `@indiafoss/pwa` web worker worker pool and fallback to JS implementation for legacy engines.
- **Phase 3**: Offline calendar collision solver integration and PWA service worker pre-caching of Wasm bytecode modules.
