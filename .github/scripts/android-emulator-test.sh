#!/usr/bin/env bash
#
# Runs inside reactivecircus/android-emulator-runner, with a booted emulator
# and adb on PATH.
#
# Two layers, deliberately, because they fail differently:
#
#   1. A launch gate driven by adb alone. It needs nothing from the
#      accessibility tree, so it stays true regardless of how the UI is
#      built, and it catches the regression that matters most — the app
#      installs and dies, or never starts at all.
#   2. Maestro flows, which drive the UI and so can tell an app that started
#      from an app that started and rendered a blank WebView.
#
# Layer 1 running first means a crash-on-launch is reported as a crash on
# launch, rather than as five confusing selector timeouts.
set -euo pipefail

APP_ID=org.indiafoss.companion
APK=apk/app-debug.apk
ARTIFACTS=emulator-artifacts

mkdir -p "$ARTIFACTS"

# Always leave the logs behind, whatever happened — a red job with no logcat
# is a job someone has to re-run locally to learn anything from.
collect() {
  adb logcat -d > "$ARTIFACTS/logcat.txt" 2>&1 || true
  adb exec-out screencap -p > "$ARTIFACTS/final-screen.png" 2>/dev/null || true
  # The accessibility tree of whatever is on screen when we stop — which,
  # after a failed flow, is the screen the assertion failed on. Without this
  # a selector that does not match can only be debugged by guessing at
  # another one and spending a whole CI run to find out.
  maestro hierarchy > "$ARTIFACTS/hierarchy.txt" 2>&1 || true
  cp -r ~/.maestro/tests/* "$ARTIFACTS/" 2>/dev/null || true
  find . -maxdepth 1 -name '*.png' -exec cp {} "$ARTIFACTS/" \; 2>/dev/null || true
}
trap collect EXIT

echo "::group::Device"
adb devices
adb shell getprop ro.build.version.sdk
echo "::endgroup::"

echo "::group::Install"
adb install -r -g "$APK"
echo "::endgroup::"

echo "::group::Launch gate"
adb logcat -c
adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1

# Give the WebView time to come up on a 2-vCPU runner, then ask whether the
# process is still there. A Capacitor shell that fails to load its assets
# usually dies here rather than rendering an error page.
for _ in $(seq 1 30); do
  sleep 1
  if adb shell pidof "$APP_ID" > /dev/null 2>&1; then
    break
  fi
done

if ! adb shell pidof "$APP_ID" > /dev/null 2>&1; then
  echo "::error::$APP_ID is not running after launch"
  adb logcat -d | tail -200
  exit 1
fi

# A native crash can leave the process alive while the UI is gone, so check
# the log too rather than trusting the pid alone.
if adb logcat -d | grep -q 'FATAL EXCEPTION'; then
  echo "::error::a fatal exception was logged during launch"
  adb logcat -d | grep -A 30 'FATAL EXCEPTION' | head -60
  exit 1
fi

echo "$APP_ID is up."
echo "::endgroup::"

echo "::group::Maestro flows"
maestro test .maestro/ --format junit --output "$ARTIFACTS/maestro-report.xml"
echo "::endgroup::"
