# Peer-to-Peer Contact Verification & Privacy Audit Strategy

## Executive Summary

As IndiaFOSS Companion scales across high-density FOSS United technical conferences, maintaining zero-knowledge data isolation and cryptographic identity verification remains paramount. This document establishes the strategic roadmap for peer-to-peer contact verification, local storage revocation controls, identity envelope validation, and automated privacy audit compliance pipelines across web and native mobile platforms.

## Core Pillars & Strategic Goals

### 1. Peer-to-Peer Zero-Trust Verification

- **Cryptographic Contact Signatures**: Expand `X-INDIAFOSS-SIG` verification to enforce identity binding validation during off-grid BLE mesh handshakes.
- **Visual Key Badges**: Standardize 5x5 deterministic pixel key badges derived from `X-INDIAFOSS-KEY` across native iOS/Android camera viewfinders.
- **Unverified Identity Shielding**: Ensure unverified Matrix IDs and Neutrino peer public keys are explicitly flagged to prevent spoofing or relay attacks.

### 2. Granular Storage Revocation & Data Hygiene

- **Selective Field Revocation**: Enable per-field dynamic QR code scrubbing, permitting instantaneous revocation of sensitive fields (email, phone, Matrix ID).
- **Session-Based Ephemeral Storage**: Introduce auto-expiring ephemeral state options for conference attendees desiring zero trace upon event conclusion.
- **One-Click Audit & Wiping**: Provide a consolidated local privacy dashboard exposing indexed storage stats and one-tap IndexedDB purging.

### 3. Automated Privacy Audit Pipelines

- **Static Asset Leak Detection**: Run automated CI static analysis verifying no third-party telemetry, tracking SDKs, or external network requests exist in published bundles.
- **Network Egress Guardrails**: Enforce strict Content Security Policy (CSP) headers prohibiting non-essential outbound connections.
- **Reproducible F-Droid Builds**: Validate source-to-binary determinism for all F-Droid indices and standalone APK releases.

## Deployment Timeline & Milestones

| Target Milestone | Scope | Deliverables |
| --- | --- | --- |
| Q4 2026 | Visual Key Badge Harmonization | Cross-platform key badge component & signature verification unit test suite |
| Q1 2027 | Storage Revocation & Audit UI | IndexedDB size inspector & ephemeral session storage toggle in `/settings` |
| Q2 2027 | Automated Privacy CI Guard | Privacy leak scanner integrated into pull request CI checks |
