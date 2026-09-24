# Presentation Slide Sync & DRM-Free Archival Architecture Strategy

## Overview

This strategy specification defines the architectural roadmap for automated, DRM-free presentation slide synchronization and archival within the IndiaFOSS Companion platform ecosystem.

During multi-track tech conferences, attendees frequently face degraded mobile network connectivity in auditorium settings. Offline slide deck availability, synchronized session notes, and full-text search across presented slides provide crucial attendee accessibility and preserve conference domain knowledge.

---

## Strategic Objectives

1. **DRM-Free Open Standards**: Ingest speaker presentation assets strictly in open formats (PDF, SVG, HTML5 presentations) without proprietary viewer requirements or encryption wrappers.
2. **Offline-First Synchronization**: Pre-fetch and cache presentation assets via progressive sync workers so slides are accessible during live sessions even without active cellular or Wi-Fi data.
3. **Privacy-Preserving Search & Extract**: Perform client-side text extraction and vector indexing (WebAssembly PDF engine) without transmitting attendee query telemetries to central servers.
4. **Bandwidth-Aware Delta Compression**: Serve multi-tier slide renditions (full-res PDF master vs compressed SVG slide packages) based on detected client network constraints.

---

## Technical Architecture & Schema

### Slide Metadata Schema (`packages/schema/src/slide-deck.ts`)

```typescript
export interface SlideDeckManifest {
  id: string;
  sessionId: string;
  speakerId: string;
  title: string;
  version: number;
  format: 'pdf' | 'svg_bundle' | 'html5';
  sha256: string;
  byteSize: number;
  pageCount: number;
  downloadUrl: string;
  fallbackUrl?: string;
  license: 'CC-BY-4.0' | 'CC-BY-SA-4.0' | 'MIT' | 'Public-Domain';
  extractedTextUrl?: string;
}
```

### Sync Protocol Lifecycle

```
[ Organizer / Speaker Ingest Portal ]
                  │ (PDF Upload + SHA256 Verification)
                  ▼
   [ Static CDN / Asset Mirror ]
                  │
                  ├──────────────────────────────┐
                  ▼                              ▼
    [ Compressed SVG Package ]          [ PDF Master Archival ]
                  │                              │
                  └──────────────┬───────────────┘
                                 ▼
                 [ Client Sync Engine Worker ]
                                 │
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
          [ IndexedDB Cache ]      [ Wasm Full-Text Index ]
```

---

## Security & Integrity Guidelines

- **Content Verification**: All downloaded slide packages must match the signed `sha256` checksum specified in the event bundle manifest before rendering.
- **Sandboxed Rendering**: PDF viewer components must disable inline JavaScript execution within PDF streams (`pdfjs` sandbox mode enabled).
- **Attribution & Licensing**: Open licenses must be explicitly declared by speakers prior to public asset distribution.

---

## Implementation Roadmap

- **Phase 1 (Near-Term)**: Define TypeScript schemas and add static manifest ingestion to event bundle builders.
- **Phase 2 (Mid-Term)**: Integrate Progressive Web App (PWA) cache storage strategies for pre-downloading talk slides based on attendee schedule favorites.
- **Phase 3 (Long-Term)**: Deploy WebAssembly-based client-side OCR and snippet search for slide diagrams and code samples.
