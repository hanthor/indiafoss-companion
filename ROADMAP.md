# Shrimply Roadmap

> Cross-platform video editor in active development.  
> **Current Status:** Pre-alpha (expect crashes, data loss, breaking changes)

---

## Current Status

**Version:** 0.0.x (development)  
**Status:** Pre-alpha  
**Platforms:** Linux/Flatpak (primary), macOS (partial), Windows (partial)  
**License:** GPLv3+ (Shrimply); dual-licensed components (CUDA, OptiX, codecs)

### What Works Today

- ✅ **Timeline editing**: Import video, cut, trim, reorder clips
- ✅ **GPU rendering**: CUDA (NVIDIA), wgpu/Metal (AMD/Intel/macOS)
- ✅ **Effects**: Color correction, transitions, filters, VFX (via Manim)
- ✅ **Export**: FFmpeg-based video/audio output to common formats
- ✅ **Cross-platform builds**: Flatpak, macOS app bundle, Windows executable
- ✅ **Real-time preview**: GPU-accelerated playback with seek

### Known Limitations (Pre-Alpha)

- ❌ **Project file stability**: Data loss between versions (format changes without notice)
- ❌ **Crashes**: Frequent in long editing sessions; expect p50 < 30 minutes
- ❌ **Plugin security**: No sandboxing; plugins execute arbitrary code
- ❌ **Performance**: Unoptimized GPU utilization; memory usage > 2GB typical
- ❌ **macOS/Windows**: Builds exist but incomplete (no native app support, limited testing)
- ❌ **Audio timeline**: Voice-over and multi-track audio not yet implemented
- ❌ **Accessibility**: Keyboard navigation partial; screen reader support missing
- ❌ **Documentation**: No user guide; developer-only docs in CONTRIBUTING.md

**For a detailed maturity matrix and release criteria, see [docs/source/RELEASE_STRATEGY.md](docs/source/RELEASE_STRATEGY.md).**

---

## Next 3 Months (Q4 2026 – Q1 2027)

### Priority 1: Stabilize Core Editing

- [ ] Fix crash-on-seek in timeline (GitHub #XX)
- [ ] Implement project file versioning (prevent silent corruption)
- [ ] Add project file recovery mode (detect and repair on load)
- [ ] Reduce memory usage in GPU rendering pipeline
- [ ] Publish performance baseline (baseline for regression detection in CI)

**Impact:** Enables 30+ minute uninterrupted editing sessions; safe project persistence.

### Priority 2: Expand Platform Coverage

- [ ] Harden macOS app bundle (code signing, notarization path)
- [ ] Test Windows builds on CI (GitHub Actions Windows runner)
- [ ] Document platform-specific limitations (what works where)
- [ ] Publish platform support matrix (tier 1 = Linux; tier 2 = macOS/Windows)

**Impact:** Attracts macOS and Windows users; clarifies support expectations.

### Priority 3: Test Coverage & CI Hardening

- [ ] Add integration tests for critical paths (import → edit → export)
- [ ] Fix intermittent Flatpak build failures (CUDA SDK availability)
- [ ] Document build prerequisites per platform (exact package versions)
- [ ] Create local build troubleshooting guide

**Impact:** Reduces contributor friction; catches regressions early; enables confident releases.

---

## Next 6–12 Months (Q1–Q3 2027)

### Alpha Release Readiness (Q2–Q3 2027, Target: 0.1.0)

**Acceptance Criteria:**
- [ ] Project file format stable (forward-compatible within 0.1.x)
- [ ] Core editing crash-free (80%+ uptime in typical 1-hour workflow)
- [ ] Plugin security implemented (sandboxed execution; no code injection)
- [ ] User documentation published (getting started, feature walkthrough, FAQ)
- [ ] macOS and Windows builds pass automated testing
- [ ] Performance targets: GPU > 70% utilization, memory < 2GB typical

**High-Impact Features:**
- Basic audio timeline (voiceover, sync)
- Keyboard shortcut customization
- Plugin browser/discovery UI
- Media library basics (organize, search, tags)
- Accessibility: Full keyboard navigation + partial screen reader

### Post-Alpha Roadmap (Q3 2027+)

- **Beta (0.2.0)**: Full audio timeline, advanced effects, accessibility compliance, Windows/macOS full support
- **GA (1.0.0)**: Production-grade stability, professional documentation, 99% uptime SLA, performance parity with industry peers

---

## Technical Priorities

### Architecture & Tech Debt

| Item | Effort | Urgency | Status |
|------|--------|---------|--------|
| Project file versioning | 2d | High | Blocked: needs design review (#XX) |
| GPU memory optimization | 3-4d | High | In progress (GPU utilization audit) |
| CUDA feature-gate (non-CUDA builds) | 1-2d | Medium | Blocked: architectural decision (#XX) |
| Plugin sandbox implementation | 3-4d | High | Planned for Alpha |
| Audio pipeline integration | 4-5d | Medium | Design phase |
| macOS native support | 2-3d | Medium | Partial (app signing/notarization) |
| Windows CI integration | 1d | Medium | Planned |

### Known Architectural Gaps

1. **Project file format**: Currently in flux; no migration path between versions
2. **Plugin security**: No isolation; plugins have full process access
3. **Compute server communication**: No timeout handling; hangs on network issues
4. **Audio timeline**: Separate from video timeline; needs architectural merge
5. **Memory management**: GPU buffers not pooled; allocations on every frame

---

## How Contributors Can Help

### Low Barrier to Entry

- **Documentation**: Write user guides, troubleshooting pages, build instructions
- **Testing**: File detailed bug reports (reproduction steps, system info, logs)
- **Translations**: Help translate UI and docs to your language
- **Examples**: Create sample projects showing Shrimply's capabilities

### Medium Barrier

- **Bug fixes**: Fix crashes, performance issues, platform-specific problems
- **Feature completion**: Implement missing effects, export formats, or UI features
- **Tests**: Add automated tests for critical paths (import → edit → export)
- **Build improvements**: Improve Flatpak, Windows, or macOS build reliability

### High Barrier

- **Architecture**: GPU pipeline optimization, memory pooling, plugin sandbox design
- **Audio timeline**: Design and implement multi-track audio integration
- **Performance**: Profile and optimize rendering, GPU memory, startup time
- **macOS/Windows**: Implement native app integration (window management, system tray, etc.)

---

## What We Don't Do (Out of Scope)

- **Multi-user collaboration**: Shrimply is single-user; no cloud sync or real-time multiplayer
- **Consumer-grade UI polish**: Pre-alpha and Alpha are developer/early-adopter focused
- **Professional color grading**: Basic correction only; DaVinci Resolve is the reference
- **Advanced compositing**: Not a replacement for After Effects or Nuke
- **Timeline sharing/versioning**: No built-in version control or branching

---

## Release Schedule (Provisional)

| Version | Status | Target Date | Stability SLA |
|---------|--------|-------------|---------------|
| 0.0.x | Current | Ongoing | None; expect data loss |
| 0.1.0 (Alpha) | Planned | Q2–Q3 2027 | Best effort; announce breaking changes 2 weeks prior |
| 0.2.0 (Beta) | Planned | Q4 2027 | 1-week bug fix SLA; project files stable |
| 1.0.0 (GA) | Planned | Q1 2028 | 99% uptime SLA; backwards-compatible |

**Note:** Dates are provisional and depend on reaching acceptance criteria. See [docs/source/RELEASE_STRATEGY.md](docs/source/RELEASE_STRATEGY.md) for detailed maturity definitions and acceptance criteria for each release.

---

## Getting Started

**Try Shrimply locally:**

```bash
# Clone and build
git clone https://github.com/hanthor/shrimply.git
cd shrimply
make dist  # Builds Flatpak (long build: 30-60 min, compiles FFmpeg + Rust + CUDA)
```

**Report issues or contribute:**

- [GitHub Issues](https://github.com/hanthor/shrimply/issues) — report bugs, request features, start discussions
- [CONTRIBUTING.md](CONTRIBUTING.md) — developer setup, contribution guidelines, DCO
- [Documentation](https://shrimply.pages.dev) — user guides and developer docs

---

## Strategic Vision

Shrimply is building a **free, open-source, GPU-accelerated video editor** that brings professional video editing to Linux and eventually all platforms. The vision is to provide a credible alternative to proprietary software while staying focused on core editing workflows rather than trying to replicate every feature of industry giants.

**Maturity path:** Pre-alpha (current) → Alpha (Q2–Q3 2027) → Beta (Q4 2027) → Production/1.0 (Q1 2028)

**Target user:** Video creators seeking open-source tools with GPU performance and workflow flexibility.

---

*Maintained by: strategist agent (hold-gated, human review required)*  
*Last updated: 2026-10-14*  
*Related planning docs: [docs/source/RELEASE_STRATEGY.md](docs/source/RELEASE_STRATEGY.md) (detailed maturity levels and acceptance criteria)*
