# IndiaFOSS Companion developer commands.
# Install prerequisites: pnpm 11, Node.js >= 20.19.

set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

# Show this command list when no recipe is specified.
default:
    @just --list

# Install all workspace dependencies.
install:
    pnpm install

# Run the local web development server.
dev:
    pnpm --filter @indiafoss/web dev

# Format all source files.
format:
    pnpm format

# Check formatting without changing files.
format-check:
    pnpm format:check

# Lint every workspace project.
lint:
    pnpm -r lint

# Typecheck every workspace project.
typecheck:
    pnpm -r typecheck

# Run unit and property tests.
test:
    pnpm -r test

# Build packages, the PWA, and sync Capacitor assets.
build:
    pnpm -r build

# Run the complete local quality gate (without Playwright).
check: format-check lint typecheck test build

# Build the web PWA and run browser E2E tests.
test-e2e: build
    cd apps/web && pnpm exec playwright test tests/app.spec.ts

# Run the release-blocking offline E2E gate.
offline-e2e: build
    cd apps/web && pnpm exec playwright test tests/offline.spec.ts

# Run all local checks, including browser E2E.
ci: check test-e2e

# Run the production dependency audit (report-only in GitHub Actions for now).
audit:
    pnpm audit --prod

# Normalize captured event fixtures into EventBundle JSON.
fixture-normalize event="indiafoss-2025":
    pnpm --filter @indiafoss/fixture-recorder exec tsx src/index.ts normalize {{event}}

# Verify a captured fixture and its canonical bundle.
fixture-verify event="indiafoss-2025":
    pnpm --filter @indiafoss/fixture-recorder exec tsx src/index.ts verify {{event}}

# Fetch/normalize/diff a fixture or live public FOSS United event.
event-sync event="indiafoss-2025" source="fixture":
    pnpm --filter @indiafoss/event-sync exec tsx src/index.ts sync {{event}} --source {{source}}

# Publish the latest event-sync revision to the PWA static assets.
event-publish event="indiafoss-2025":
    pnpm --filter @indiafoss/event-sync exec tsx src/index.ts publish {{event}}

# Validate the synthetic venue graph, metadata, and SVG targets.
venue-validate event="synthetic":
    pnpm --filter @indiafoss/venue-validator exec tsx src/index.ts events {{event}}

# Add the native Android project once after installing the Android SDK.
android-add:
    pnpm --filter @indiafoss/android exec cap add android

# Build the web app and sync its assets into Capacitor.
android-sync: build
    pnpm --filter @indiafoss/android build

# Assemble a debug APK (requires JDK 21 and Android SDK).
android-apk: android-sync
    cd apps/android/capacitor/android && ./gradlew assembleDebug

# Build for GitHub Pages project-site hosting.
# Example: just pages-build indiafoss-companion
pages-build repo="indiafoss-companion":
    SVELTE_BASE=/{{repo}} pnpm --filter @indiafoss/web build
    cp apps/web/build/index.html apps/web/build/404.html

# Remove generated web/native build output.
clean:
    rm -rf apps/web/build apps/web/.svelte-kit apps/android/capacitor/android/app/build
