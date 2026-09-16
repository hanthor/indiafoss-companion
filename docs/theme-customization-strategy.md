# Multi-Tenant Conference Branding & Theme Asset Customization Strategy

## Overview

As the **IndiaFOSS Companion** platform expands to support regional FOSS United conferences (e.g., DelhiFOSS, MumbaiFOSS, KochiFOSS) and partner open-source events across multiple cities, event organizers require a flexible, modular, and white-label theme asset pipeline.

This document outlines the architecture for build-time theme configuration, runtime asset injection, color palette dynamic switching, sponsor badge formatting, and automated JSON schema validation for multi-tenant deployments.

## Objectives & Scope

1. **Standardized Theme Directory Layout**: Establish a predictable `themes/<conference-id>/` asset structure for logos, custom icons, color palettes, and typography tokens.
2. **Schema-Driven Validation**: Define JSON Schema specifications (`theme.schema.json`) to validate conference theme manifests during CI/CD assembly.
3. **Zero-Code White-Label Builds**: Allow organizers to supply theme bundles via environment variables or build flags without modifying core app code.
4. **Dynamic Runtime Fallbacks**: Ensure seamless fallback to default IndiaFOSS branding whenever custom assets or theme keys are missing or invalid.

## Theme Directory Structure

Organizers configure their conference branding by providing a theme directory matching the following convention:

```
themes/
└── <conference-slug>/
    ├── theme.json
    ├── assets/
    │   ├── logo-light.svg
    │   ├── logo-dark.svg
    │   ├── favicon.ico
    │   ├── sponsor-banner.png
    │   └── venue-map-overlay.geojson
    └── fonts/
        └── custom-font.woff2
```

## Theme Manifest Specification (`theme.json`)

```json
{
  "$schema": "./theme.schema.json",
  "id": "delhifoss-2026",
  "name": "DelhiFOSS 2026",
  "organizer": "FOSS United Delhi",
  "colors": {
    "primary": "#E53E3E",
    "primaryVariant": "#C53030",
    "secondary": "#319795",
    "background": "#F7FAFC",
    "surface": "#FFFFFF",
    "onPrimary": "#FFFFFF",
    "onBackground": "#1A202C"
  },
  "assets": {
    "logoLight": "assets/logo-light.svg",
    "logoDark": "assets/logo-dark.svg",
    "venueMapOverlay": "assets/venue-map-overlay.geojson"
  },
  "features": {
    "enableSponsorBanners": true,
    "enableCustomFonts": false,
    "enableMultilingualHeader": true
  }
}
```

## Build Pipeline & Assembly Strategy

1. **Build Flag Selection**: The target conference theme is selected via `THEME=<conference-slug>` environment variable or build argument.
2. **Validation Step**: CI workflow runs JSON Schema verification against `theme.json` before triggering bundler compilation.
3. **Asset Aliasing**: Bundlers (Vite/Webpack/Gradle) map `@theme-assets/` alias path directly to `themes/${THEME}/assets/`.
4. **CSS Custom Properties**: Theme colors are converted to CSS variable declarations (`--color-primary`, etc.) injected into root styles at build time.

## Roadmap & Milestone Timeline

- **Phase 1 (Near-Term)**: Schema definition, asset aliasing bundler plugin, and fallback theme loader implementation.
- **Phase 2 (Mid-Term)**: Dynamic runtime theme switching for multi-conference aggregate app builds.
- **Phase 3 (Long-Term)**: Self-service web dashboard for conference organizers to preview and generate theme bundles.
