# Contributing to IndiaFOSS Companion

Thank you for your interest in contributing! This guide covers setting up your development environment, understanding the project structure, and the workflow for submitting changes.

## Quick Start

### Prerequisites

- **Node.js** >= 20.19
- **pnpm** 11 (or any recent version; we use `pnpm install` to lock exact dependencies)
- **Git**

For Android development:

- Android SDK (API 31+)
- JDK 21

For iOS (web PWA):

- No additional setup; the PWA builds and runs in any modern browser

### Clone and Set Up

```bash
git clone https://github.com/hanthor/indiafoss-companion.git
cd indiafoss-companion
pnpm install
```

### Run the Local Dev Server

```bash
# Start the web dev server (PWA) on http://localhost:5173
just dev
```

The dev server includes hot module reloading. The PWA works offline once loaded, and all data is stored locally on your device.

### Build and Test Locally

Before opening a PR, run the complete quality gate:

```bash
just check
```

This runs (in order):

- `format-check` — verify code formatting
- `lint` — check for linting errors
- `typecheck` — TypeScript type checking
- `test` — unit and property tests
- `verify-assets` — validate event fixtures and venue data
- `build` — build all packages and the PWA

If any step fails, run the individual command to see details:

- `just format` — auto-fix formatting issues
- `just lint` — see linting errors
- `just typecheck` — see type errors
- `just test` — run tests

### Build for Android

See [docs/native-client.md](docs/native-client.md) for detailed setup. Quick version:

```bash
cd apps/android/native
./gradlew :core:test :app:assembleDebug
```

Builds land in `app/build/outputs/apk/debug/`. For emulator testing, see [docs/android-testing.md](docs/android-testing.md).

---

## Project Structure

```
.
├── packages/          # Shared libraries and tools
│   ├── contracts      # TypeScript data models and APIs
│   ├── model          # Core domain model (events, venues, rankings, etc.)
│   ├── sources        # Data adapters (FOSS United API, matrix providers, etc.)
│   ├── matrix         # Matrix federation and crypto (Neutrino fork)
│   └── fixture-recorder, venue-validator, event-sync
│
├── apps/
│   ├── web/           # PWA (React + TypeScript)
│   │   ├── src/app.css  # Design tokens (colors, fonts, spacing)
│   │   ├── tests/       # Playwright E2E tests
│   │   └── scripts/     # Build and utility scripts
│   │
│   └── android/       # Native Android Compose client
│       ├── native/    # Gradle project (Kotlin)
│       └── ...
│
├── events/            # Static event data (schedules, venues)
├── docs/              # Architecture, decisions, how-tos
├── Justfile           # Developer command shortcuts
└── README.md          # Project overview and quick links
```

**Key entry points:**

- `packages/contracts` — data models; changes here require fixture updates
- `packages/model` — business logic (ranking Elo, itinerary solving, etc.)
- `apps/web/src` — React components and pages
- `docs/adr/` — architecture decisions; read these before large changes

---

## Development Workflow

### 1. Pick an Issue

Browse [open issues](https://github.com/hanthor/indiafoss-companion/issues) or the [roadmap](docs/roadmap.md). Issues labeled `help wanted`, `good first issue`, or `docs` are good starting points.

Issues on the [project board](https://github.com/hanthor/indiafoss-companion/projects) show priority and status.

### 2. Make Your Changes

- **Web (PWA)**: Edit files in `apps/web/src/` or `packages/`. The dev server reloads on save.
- **Android**: Edit `apps/android/native/app/src` (Kotlin). Rebuild and reinstall on the emulator.
- **Shared logic**: Changes to `packages/*` may affect both web and Android; test both.

**Style:**

- Follow existing code style. No style guide doc yet; look at a similar file in the same directory.
- Use TypeScript strict mode; avoid `any` where possible.
- Format with `just format` before committing.

### 3. Test Your Work

```bash
# Unit tests (runs on save in watch mode during development)
just test

# Full gate (format, lint, types, tests, asset verification, build)
just check

# Browser E2E tests (offline, accessibility, simulator)
just ci
```

**Which tests are required?**

- `just check` must pass before you push
- E2E tests (`just ci`) will run in CI, but running locally first catches many issues
- If you change event models or venue data, run `verify-assets` to regenerate fixtures

### 4. Commit and Push

```bash
git add .
git commit -m "feat: <description of your change>"
git push origin guide/docs-your-change-name
```

**Commit messages:** Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `refactor:` — code reorganization without behavior change
- `test:` — test additions or fixes
- `chore:` — build, deps, tooling

Sign your commits with DCO: `git commit -s`.

### 5. Open a Pull Request

Push your branch and [open a PR](https://github.com/hanthor/indiafoss-companion/compare). Include:

- **Title**: concise, follows Conventional Commits
- **Description**: what the PR does and why; link related issues with `Closes #NNN` or `Refs #NNN`
- **Testing**: describe how you tested the change (e.g., "tested on web and Android", "ran E2E suite")

**Checklist before requesting review:**

- [ ] Code formatted (`just format`)
- [ ] Tests pass (`just check` or `just ci`)
- [ ] No new console warnings or errors
- [ ] Commit message(s) are clear and follow Conventional Commits
- [ ] Related docs are updated (if needed)

### 6. Review and Iterate

Maintainers will review your PR. Respond to feedback by pushing new commits to the same branch; the PR updates automatically. Do not force-push unless asked.

**Review turnaround:** Typically 1–7 days depending on scope and maintainer availability. See [roadmap](docs/roadmap.md) for current priorities.

### 7. Merge

Once approved, the PR will be squashed and merged to `main`. Your branch can be deleted after merge.

---

## Code Review Expectations

- **Functionality**: Does it work correctly? Is it tested?
- **Design**: Does it fit the architecture? Does it follow ADRs and existing patterns?
- **Performance**: Does it cause regressions? Is offline sync still fast?
- **Accessibility**: Does it work with screen readers? Does contrast meet WCAG AA?
- **Documentation**: Are new APIs documented? Are docs updated if needed?

---

## Documentation

Documentation lives in `docs/` and covers:

- **Architecture** (`docs/architecture/`) — system design and data flow
- **ADRs** (`docs/adr/`) — architectural decisions
- **How-tos** (`docs/event-onboarding.md`, `docs/venue-map.md`, etc.) — feature guides
- **Roadmap** (`docs/roadmap.md`) — priorities and phases

**When to update docs:**

- You add a significant feature or change behavior → update the related how-to
- You make an architectural decision → file an ADR
- You fix a typo or clarify existing text → edit the doc directly

**How to document:**

- Use Markdown
- Link to related docs and ADRs inline
- Include examples or screenshots if helpful
- Keep prose concise; reference links for deep dives

---

## Common Tasks

### Run Tests in Watch Mode

```bash
just test --watch
```

### Test the PWA in Production Mode Locally

```bash
just build
cd apps/web
pnpm exec serve -l 5173 build
```

Then open http://localhost:5173 and test offline.

### Regenerate Event Fixtures

If you change the data model or add a new event:

```bash
just fixture-normalize indiafoss-2026
just fixture-verify indiafoss-2026
```

### Check Dependencies for Security Issues

```bash
just audit
```

### Generate a Software Bill of Materials (SBOM)

```bash
just sbom
# → sbom.cdx.json (CycloneDX format)
```

---

## Getting Help

- **Questions about setup or workflow?** Open a [Discussion](https://github.com/hanthor/indiafoss-companion/discussions) or ask in a PR comment.
- **Found a bug?** [Open an issue](https://github.com/hanthor/indiafoss-companion/issues/new) with steps to reproduce.
- **Design question?** Read [docs/architecture/](docs/architecture/) and [docs/adr/](docs/adr/) first; comment on a related issue if unsure.
- **Need help with Android?** See [docs/native-client.md](docs/native-client.md) and [docs/android-testing.md](docs/android-testing.md).

---

## Code of Conduct

This project follows the [FOSS United Code of Conduct](https://fossunited.org/coc). Please be respectful and inclusive in all interactions.

---

## License

By contributing, you agree that your work is licensed under [AGPL-3.0-or-later](LICENSE).

---

**Thank you for contributing to IndiaFOSS Companion!** 🎉
