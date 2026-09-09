# Native offline seed freshness — 9 September 2026

Tracks #191 and #110. Automatic schedule import updates the canonical `events/indiafoss-2026/normalized/event-bundle.json`. The PWA build copies it to static assets, but the standalone nightly APK workflow does not run that web build. Android's previous `copySeedBundle` input therefore packaged the older checked-in web static copy.

The Android build now copies the canonical normalized bundle directly. It needs no Node installation, web build, network fetch or extra workflow step. Gradle tracks the canonical file as the copy task's input, so each data-only publication also updates the next APK's offline seed.

The repository test reads the packaged Android asset and compares every byte with the canonical file. At this change's base, the old web static copy differs from the canonical programme, so the regression test distinguishes the old and new build inputs. The existing repository tests still cover online refresh, seed fallback and corrupted-cache repair.

No local JDK/SDK is available; run native CI and emulator gates before merging. Verify the resulting nightly APK's actual `assets/event-bundle.json` against the canonical source after deployment. Venue/device rehearsal remains open.

## Published artifact verification

PR #255 merged after all four checks passed. The subsequent automatic schedule PR #256 merged as `eb235828b88b3ef1a481f37cdf68e74bd97e1d9c` after the importer validation passed. Its separate CI rerun [34301034285](https://github.com/hanthor/indiafoss-companion/actions/runs/34301034285) also passed all four gates.

Pages run [34301357704](https://github.com/hanthor/indiafoss-companion/actions/runs/34301357704) and nightly run [34301359099](https://github.com/hanthor/indiafoss-companion/actions/runs/34301359099) succeeded. A fresh browser confirmed revision 7, 162 activities, 148 people and source timestamp `2026-09-09 07:15:22.828779`.

Downloaded release `2026.127-eb23582` was checked against its published checksum and the canonical source from that exact commit:

- APK SHA-256: `fa38d4b126c01cb06474aee06fff68330349cec5563825458400ed323a4286c3`.
- Embedded event seed SHA-256: `d169b28ac6bdca18817432bc48e5eae2e4e3157f56c10f2a589762ed13b59ab1`.
- `assets/event-bundle.json` matched the canonical bundle byte-for-byte.
- The release body and nightly tag identified the same commit at verification time.

This proves the downloaded artifact's seed, not a physical-device or venue rehearsal. The nightly tag is mutable; later builds supersede this recorded artifact.
