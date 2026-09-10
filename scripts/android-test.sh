#!/usr/bin/env bash
# Shared local/CI gate: never silently downgrade to core-only validation.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../apps/android/native"

if [[ -n "${JAVA_HOME:-}" ]]; then
    java_command="$JAVA_HOME/bin/java"
else
    java_command="$(command -v java || true)"
fi
if [[ ! -x "$java_command" ]]; then
    echo 'Android tests require JDK 21. Set JAVA_HOME or install java on PATH; see docs/android-testing.md.' >&2
    exit 1
fi

if [[ ! -d "${ANDROID_HOME:-}" && ! -d "${ANDROID_SDK_ROOT:-}" && ! -f local.properties ]]; then
    echo 'Android tests require an Android SDK. Set ANDROID_HOME or sdk.dir in apps/android/native/local.properties; see docs/android-testing.md.' >&2
    echo 'For Kotlin core tests only, use just android-core-test. That does not validate the app.' >&2
    exit 1
fi

exec ./gradlew :core:test :app:testDebugUnitTest "$@"
