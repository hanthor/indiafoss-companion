# Testing the Android app

CI built the native Compose app for a long time and never launched it on a
device — only Robolectric screenshots on the JVM. Gradle assembling
successfully and every screen rendering under Robolectric says the code
compiles and each screen draws in isolation; it says nothing about whether
the Activity survives a real launch, or whether tapping a tab actually
navigates. `CompanionViewModel` crashed on every real-device launch for
exactly this reason — its constructor read its own `MutableStateFlow` before
assignment — and nothing in the build or the screenshot tests caught it.

So there are now two layers on an emulator, and they exist for different
reasons.

## The gate: Maestro on an emulator

Runs on every push and pull request, as the **Android emulator (Maestro)** job
in `ci.yml`. It reuses the debug APK the `Native Compose client` job already
uploaded, so the cost is an emulator boot rather than a second Gradle run.

The job does two things, in order, because they fail differently:

1. **A launch gate driven by `adb` alone** (`.github/scripts/android-emulator-test.sh`).
   Install, start, wait, then check the process is alive and no `FATAL
EXCEPTION` was logged. It needs nothing from the accessibility tree, so it
   stays true regardless of how a screen is built, and it catches the
   regression that matters most. Running it first means a crash-on-launch is
   reported as a crash on launch rather than as a handful of confusing
   selector timeouts.
2. **Maestro flows** in `.maestro/`, which drive the UI and can therefore tell
   an app that started from an app that started and rendered nothing.

| Flow              | What it proves                                                      |
| ----------------- | ------------------------------------------------------------------- |
| `smoke.yaml`      | the Activity resumed and drew the welcome screen, not a blank frame |
| `navigation.yaml` | a first run clears setup and two different tabs draw real content   |

The same selector rules the retired Capacitor flows learned still apply —
real text nodes only, a selector is a regex matched against an element's
_entire_ text, never assert on programme content (a talk title, a devroom
name) since it is rewritten on every republish. One thing changed for the
better moving to Compose: the old WebView tab bar exposed the same label as
both `text` and `accessibilityText` on nested nodes, which made a tap
ambiguous and cost eight red CI runs to diagnose (see git history on this
file if you need the full story). A real device's accessibility dump of the
native tab bar shows each tab as one unambiguous text node — `Now`,
`Schedule`, `My plan`, `Map`, `Explore` — so no index disambiguation has been
needed here yet. If a future flow hits the "tap did not navigate" failure
mode, dump the real tree (`adb shell uiautomator dump` needs no Maestro
install) before guessing at a new selector.

### Running it locally

You need an emulator or a real device connected over `adb`, and the app
installed — Maestro does not care which:

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash   # once, needs a JVM
cd apps/android/native && ./gradlew :app:installDebug && cd -
maestro test .maestro/
```

Against a specific device when more than one is connected:

```bash
maestro --device <serial> test .maestro/
```

`maestro studio` is the fastest way to write a new flow: it shows the view
hierarchy the flows select against, which is also how you check whether an
element is visible to the driver at all.

### The things that make this work on free runners

- **`/dev/kvm` permissions.** Without the `udev` rule the emulator falls back
  to software rendering and the job times out instead of failing with
  something readable. This is the single most common reason an emulator job
  "hangs" on a hosted runner.
- **API 31, `default` target, x86_64.** The `default` (AOSP) image is lighter
  than `google_apis` and boots faster on a standard runner.
- **A cached AVD.** Created once and restored on later runs, which removes
  most of the boot cost.
- **No window, no audio, no boot animation.** Nothing is watching.

### When a flow fails

The job uploads an `android-emulator` artifact on success and failure alike:
`logcat.txt`, a screenshot of the final state, the Maestro JUnit report, and
every screenshot the flows took. A red job with no logs is a job somebody has
to reproduce locally to learn anything from, which is a waste of the run.

## The exploratory pass: Claude driving the app

`.github/workflows/android-explore.yml`, manual (`workflow_dispatch`) only.
Claude looks at a screenshot, decides what to tap, taps it, looks again, and
records what it thinks is wrong. The report lands in the job summary and as an
artifact.

**It is deliberately not a gate**, for three reasons that all disqualify it
independently:

- It is non-deterministic. The same commit can produce different findings, so
  a red result would not mean the commit is broken.
- It bills a token budget per run.
- `secrets` are not available to pull requests from forks, so as a required
  check it would be permanently unrunnable for outside contributors — the
  opposite of what a project inviting forks wants.

Without `ANTHROPIC_API_KEY` set, the workflow logs a warning explaining how to
add one and skips. It never fails for want of a key.

What it is genuinely good at is the class of problem an assertion cannot
express: a control invisible against its background, a screen that says
nothing while it loads, a tap target too small to hit, a label that
contradicts the screen it sits on. Deterministic flows can only check things
somebody already thought to check.

Treat its output as observations from one run, not as test failures. Confirm
before acting.

```bash
# Locally, against a booted emulator with the app installed:
export ANTHROPIC_API_KEY=...
pnpm --filter @indiafoss/android-explorer start
```

`EXPLORER_MAX_STEPS` (default 25) caps the turns, and so the spend. The action
space is four gestures plus two bookkeeping calls, which keeps the transcript
legible: every step is one gesture with coordinates you can replay by hand.

## Testing on real hardware

An emulator will not find a problem that only appears on a particular
vendor's OS build, and nothing here is a substitute for opening the app on a
phone before a release. Both layers above run unchanged against a real
device — connect it, confirm `adb devices` sees it, then either run
`android-emulator-test.sh`'s steps by hand or `maestro test .maestro/`
directly (see "Running it locally" above). Real hardware is also the only
place BLE mesh chat can be exercised at all — see the dedicated
`hanthor/indiafoss-chat-android` repository for that app's own test setup;
this app carries no P2P chat code (ADR 0004).

## What is still not covered

- **The manual test checklist** ([docs/manual-test-checklist.md](./manual-test-checklist.md))
  lists every feature area, deterministic or not — ranking, connect/scan,
  notifications, map, settings, accessibility, device compatibility. Only a
  fraction of it is codified as a Maestro flow yet; most of it still needs a
  human on a real phone before a release.
- **Native parity leftovers.** Custom plan blocks, contact import/profile-fill,
  the schedule-update banner, speaker avatars — tracked in
  [#110](https://github.com/hanthor/indiafoss-companion/issues/110). None of
  these have a flow yet because the screen they'd test doesn't exist yet.
- **Screens past My plan.** `navigation.yaml` stops at two tabs deep. Widening
  it should reuse the same tap → `extendedWaitUntil` → screen-specific-chrome
  pattern already proven for Now, Schedule and My plan, verified against a
  real device's accessibility dump before being added — that verification is
  what made this rewrite's flows pass without a single red run, unlike the
  original suite's first attempt.
