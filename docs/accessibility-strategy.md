# Accessibility (a11y) & Inclusive Conference Experience Strategy

## Overview

The IndiaFOSS Companion platform aims to provide an accessible, seamless, and inclusive experience for all conference attendees, speakers, and organizers, regardless of physical, visual, auditory, or cognitive abilities.

This document outlines the technical standards, UX patterns, venue navigation protocols, screen reader accessibility requirements, and testing matrix required to achieve full compliance with WCAG 2.1 AA across both the PWA (Web/iOS) and the native Jetpack Compose (Android) client applications.

---

## Strategic Objectives

1. **WCAG 2.1 AA Compliance**: Guarantee that all web and native components meet contrast, keyboard navigation, focus management, and screen reader semantic requirements.
2. **Accessible Indoor Navigation**: Integrate step-free, elevator-accessible routing, visual path landmarks, and audio cues into the offline venue map engine.
3. **Screen Reader Semantics**: Ensure complete screen reader compatibility (TalkBack on Android, VoiceOver on iOS, NVDA/JAWS on Desktop PWA) across dynamic schedule timelines, interactive venue maps, and P2P contact exchange flows.
4. **Devroom & Session Accessibility**: Support live captioning streams, transcripts, and sign language interpreter location indicators within devroom schedule views.
5. **Adaptive Visual Experience**: Provide customizable high-contrast themes, dynamic font scaling without layout breakage, and motion reduction options.

---

## Technical Standards & Requirements

### 1. Web PWA (Svelte / HTML5)

- **Semantic HTML & ARIA Attributes**: Use native semantic tags (`<main>`, `<nav>`, `<article>`, `<header>`, `<footer>`) with explicit `aria-label`, `aria-describedby`, and `aria-expanded` attributes on complex controls.
- **Focus Management**:
  - Visible focus rings with high contrast ratio (`hsl(144 92% 37%)` mint accent or `#FFFFFF` against dark surfaces).
  - Trapped keyboard focus within modal sheets (e.g., room detail, contact QR dialogs) and restored focus on closure.
  - Skip navigation links (`#main-content`) for screen reader and keyboard users.
- **Color & Typography**:
  - Minimum contrast ratio of 4.5:1 for standard text and 3:1 for large text/ui components across dark (`hsl(0 0% 8%)`) and light surfaces.
  - Support `prefers-reduced-motion` to disable non-essential animations and slide transitions.
  - Text scales up to 200% without horizontal scroll or truncated text clipping.

### 2. Jetpack Compose Native Client (Android)

- **Semantics Node Tree**: Explicitly define `contentDescription`, `onClick` labels, and `clearAndSetSemantics` for complex composite cards.
- **TalkBack Optimization**:
  - Merge redundant accessibility nodes in schedule items (e.g., combining speaker name, room, and time into a single screen-reader announcement).
  - Dynamic accessibility events (`AccessibilityEvent.TYPE_ANNOUNCEMENT`) for real-time schedule updates and route guidance.
- **Touch Targets & Typography**:
  - Minimum 48dp × 48dp touch targets for all interactive buttons, tabs, and map markers.
  - Support Android System Font Scale up to 200% with flexible auto-resizing text containers.

---

## Accessible Venue Routing & Indoor Navigation

- **Graph Topology**: Extend `venue.graph.json` with node-level metadata for accessibility:
  - `accessible`: Boolean indicating step-free pathway eligibility.
  - `slope`: Maximum incline percentage.
  - `door_width_cm`: Minimum door passage width.
  - `has_elevator`: Indicator for floor level transitions.
- **Routing Engine Integration**:
  - Provide an explicit "Step-free / Accessible Route" toggle in venue routing controls.
  - Exclude stairs-only transitions and narrow choke points when step-free routing is active.
  - Include accessible facilities (ramps, elevators, accessible restrooms, quiet rooms) as explicit waypoints.

---

## Audio & Assistive Stream Integration

- **Live Session Captions**: Standardized protocol for integrating web-based live text captioning feeds (e.g., WebVTT over WebSocket/HTTP) into session views.
- **Devroom Assistive Indicators**: Clear visual and screen reader badges for devrooms providing sign language interpretation, assistive listening loops, or wheelchair priority seating.

---

## Testing & Quality Assurance Matrix

| Suite | Scope | Automated Tool | Frequency |
|---|---|---|---|
| Web Automated | Light & dark WCAG A/AA audits | `axe-core` / Playwright | Per CI commit |
| Android Automated | Accessibility node linting | Compose Testing Framework | Per CI commit |
| Manual Walkthrough | Screen reader navigation (TalkBack/VoiceOver) | Manual checklist | Pre-release cutover |
| Venue Validation | Physical ramp & step-free routing check | Physical walkthrough checklist | Event rehearsal |

---

## Phased Implementation Roadmap

- **Phase 1 (Near-Term)**: Standardize screen reader semantics for schedule timeline cards and modal sheets; enforce contrast audits in CI.
- **Phase 2 (Mid-Term)**: Enable step-free indoor routing filter in venue map graph engine and implement 200% dynamic text scaling support.
- **Phase 3 (Long-Term)**: Integrate live devroom captioning streams and tactile feedback cues for native turn-by-turn navigation.
