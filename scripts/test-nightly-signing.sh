#!/usr/bin/env bash
# Real Android signing-tool acceptance with a disposable CI-only identity.
set -euo pipefail
python3 scripts/test_nightly_signing.py
signing_test_dir=$(mktemp -d)
trap 'rm -rf "$signing_test_dir"' EXIT
export NIGHTLY_KEYSTORE_PASSWORD=ci-only-password NIGHTLY_KEY_ALIAS=ci-test
keytool -genkeypair -keystore "$signing_test_dir/key.p12" -storetype PKCS12 \
  -storepass:env NIGHTLY_KEYSTORE_PASSWORD -keypass:env NIGHTLY_KEYSTORE_PASSWORD \
  -alias "$NIGHTLY_KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 2 -dname "CN=Disposable CI test"
export NIGHTLY_KEYSTORE_BASE64
NIGHTLY_KEYSTORE_BASE64=$(base64 -w0 "$signing_test_dir/key.p12")
keytool -exportcert -keystore "$signing_test_dir/key.p12" \
  -storepass:env NIGHTLY_KEYSTORE_PASSWORD -alias "$NIGHTLY_KEY_ALIAS" -file "$signing_test_dir/cert.der"
export NIGHTLY_CERT_SHA256
NIGHTLY_CERT_SHA256=$(sha256sum "$signing_test_dir/cert.der" | cut -d' ' -f1)
python3 scripts/sign-nightly.py "$1" "$signing_test_dir/first.apk"
python3 scripts/sign-nightly.py "$1" "$signing_test_dir/second.apk"
python3 - "$signing_test_dir" <<'PY'
import json, sys
from pathlib import Path
directory = Path(sys.argv[1])
first = json.loads((directory / "first.apk.signing.json").read_text())
second = json.loads((directory / "second.apk.signing.json").read_text())
assert first["certificateSha256"] == second["certificateSha256"]
PY
if NIGHTLY_CERT_SHA256=$(printf '%064d' 0) python3 scripts/sign-nightly.py "$1" "$signing_test_dir/wrong.apk"; then
  echo "Wrong certificate unexpectedly accepted" >&2
  exit 1
fi
test ! -e "$signing_test_dir/wrong.apk"
if NIGHTLY_KEYSTORE_BASE64= python3 scripts/sign-nightly.py "$1" "$signing_test_dir/missing.apk"; then
  echo "Missing key unexpectedly accepted" >&2
  exit 1
fi
test ! -e "$signing_test_dir/missing.apk"
echo "Two signing operations and fail-closed negative controls passed (not a device upgrade test)."
