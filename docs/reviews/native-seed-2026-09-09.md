# Native offline seed freshness — 9 September 2026

Tracks #191 and #110. Automatic schedule import updates the canonical `events/indiafoss-2026/normalized/event-bundle.json`. The PWA build copies it to static assets, but the standalone nightly APK workflow does not run that web build. Android's previous `copySeedBundle` input therefore packaged the older checked-in web static copy.

The Android build now copies the canonical normalized bundle directly. It needs no Node installation, web build, network fetch or extra workflow step. Gradle tracks the canonical file as the copy task's input, so each data-only publication also updates the next APK's offline seed.

The repository test reads the packaged Android asset and compares every byte with the canonical file. At this change's base, the old web static copy differs from the canonical programme, so the regression test distinguishes the old and new build inputs. The existing repository tests still cover online refresh, seed fallback and corrupted-cache repair.

No local JDK/SDK is available; run native CI and emulator gates before merging. Verify the resulting nightly APK's actual `assets/event-bundle.json` against the canonical source after deployment. Venue/device rehearsal remains open.
