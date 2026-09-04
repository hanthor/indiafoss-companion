# Testing the Android app

CI built two APKs for a long time and launched neither. Gradle assembling
successfully says the code compiles and the resources link; it says nothing
about whether the app comes up. For a Capacitor shell that gap is wide — the
web assets are copied in at build time, and a wrong base path or a missing
asset produces an APK that installs, starts, and renders a blank WebView.
Every check stays green.

So there are now two layers on an emulator, and they exist for different
reasons.

## The gate: Maestro on an emulator

Runs on every push and pull request, as the **Android emulator (Maestro)** job
in `ci.yml`. It reuses the debug APK the `Android build` job already uploaded,
so the cost is an emulator boot rather than a second Gradle run.

The job does two things, in order, because they fail differently:

1. **A launch gate driven by `adb` alone** (`.github/scripts/android-emulator-test.sh`).
   Install, start, wait, then check the process is alive and no `FATAL
EXCEPTION` was logged. It needs nothing from the accessibility tree, so it
   stays true regardless of how the UI is built, and it catches the regression
   that matters most. Running it first means a crash-on-launch is reported as
   a crash on launch rather than as a handful of confusing selector timeouts.
2. **Maestro flows** in `.maestro/`, which drive the UI and can therefore tell
   an app that started from an app that started and rendered nothing.

| Flow              | What it proves                                                   |
| ----------------- | ---------------------------------------------------------------- |
| `smoke.yaml`      | the WebView loaded the app shell, not an error page              |
| `navigation.yaml` | every primary tab reaches a screen that rendered its own content |

Two rules govern what a flow may assert on, and both were learned by getting
them wrong on the first run:

1. **Real text nodes only.** A placeholder is an attribute on an `<input>`,
   not text, so it never reaches the accessibility tree and Maestro cannot see
   it however long it waits. `Search sessions…` failed for exactly this
   reason; `Filters` and `Timeline`, which are a `<summary>` and a `<button>`,
   work.
2. **Unconditional chrome, never programme content.** A flow asserting on a
   talk title has to be rewritten every time the bundle is republished, and
   one asserting on a conditional heading fails on the day the condition is
   false. Both are how a suite stops being trusted and then stops being run.

The `Now` screen is therefore asserted by screenshot alone: everything it
renders depends on what is live at the moment the flow runs, so any content
assertion there would really be an assertion about the clock.

### Running it locally

You need an emulator or a device, and the app installed.

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash   # once
pnpm --filter @indiafoss/web build
pnpm --filter @indiafoss/android build
cd apps/android/capacitor/android && ./gradlew installDebug && cd -
maestro test .maestro/
```

`maestro studio` is the fastest way to write a new flow: it shows the view
hierarchy the flows select against, which is also how you check whether a
WebView element is visible to the driver at all.

### The things that make this work on free runners

- **`/dev/kvm` permissions.** Without the `udev` rule the emulator falls back
  to software rendering and the job times out instead of failing with
  something readable. This is the single most common reason an emulator job
  "hangs" on a hosted runner.
- **API 31, `default` target, x86_64.** API 33+ images want more RAM than a
  standard runner comfortably has. The `default` (AOSP) image is lighter than
  `google_apis` and still ships a WebView new enough for Capacitor.
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

## What is still not covered

- **The native Compose client** (`apps/android/native`) has Robolectric
  screenshot tests and builds in CI, but nothing launches it on a device
  either. The same emulator job could run against `native-apk` with its own
  flows; its `applicationId` is `org.indiafoss.companion.nativeapp`.
- **The P2P variant.** CI builds the plain companion; the mesh needs a second
  device and BLE hardware, which no hosted runner has. See
  [neutrino-capabilities.md](./neutrino-capabilities.md) for what is measured
  instead.
- **Real hardware.** An emulator will not find a problem that only appears on
  a particular vendor's WebView, and nothing here is a substitute for opening
  the app on a phone before a release.
