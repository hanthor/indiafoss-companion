#!/usr/bin/env python3
"""Sign and verify a nightly without allowing a runner-generated fallback key."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def run(*args):
    # Tool diagnostics can contain signing configuration: never echo them.
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise ValueError(f"{Path(args[0]).name} failed; no APK will be published")
    return result.stdout


def verify_certificate(report, expected):
    fingerprints = re.findall(
        r"^(?:Signer (?:#\d+|\(minSdkVersion=[^\n]+\))|V[234]\.[0-9]+ Signer:) certificate SHA-256 digest: ([0-9a-fA-F]{64})$",
        report, re.MULTILINE,
    )
    # Source stamps and public-key digests do not identify the APK certificate.
    # Every signing scheme/SDK range must use the configured identity.
    if (re.search(r"^Number of signers: 1$", report, re.MULTILINE) is None
            or set(fingerprint.lower() for fingerprint in fingerprints) != {expected}):
        raise ValueError("APK signer does not match the configured certificate")


def main():
    source, destination = map(Path, sys.argv[1:])
    required = ("NIGHTLY_KEYSTORE_BASE64", "NIGHTLY_KEYSTORE_PASSWORD",
                "NIGHTLY_KEY_ALIAS", "NIGHTLY_CERT_SHA256", "APKSIGNER", "ZIPALIGN")
    if any(not os.environ.get(name) for name in required):
        raise ValueError("Missing nightly signing configuration; refusing to publish")
    expected = os.environ["NIGHTLY_CERT_SHA256"].replace(":", "").lower()
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValueError("Expected certificate must be a SHA-256 fingerprint")
    if destination.exists():
        raise ValueError("Refusing to overwrite an existing signed output")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # The key is transient, private, outside Gradle caches, and removed on failure.
    with tempfile.TemporaryDirectory(prefix="nightly-sign-") as directory:
        key = Path(directory) / "signing.p12"
        key.write_bytes(base64.b64decode(os.environ["NIGHTLY_KEYSTORE_BASE64"], validate=True))
        key.chmod(0o600)
        aligned = Path(directory) / "aligned.apk"
        signed = Path(directory) / "signed.apk"
        run(os.environ["ZIPALIGN"], "-f", "-p", "4", str(source), str(aligned))
        run(os.environ["APKSIGNER"], "sign", "--ks", str(key),
            "--ks-key-alias", os.environ["NIGHTLY_KEY_ALIAS"],
            "--ks-pass", "env:NIGHTLY_KEYSTORE_PASSWORD",
            "--key-pass", "env:NIGHTLY_KEYSTORE_PASSWORD",
            "--out", str(signed), str(aligned))
        report = run(os.environ["APKSIGNER"], "verify", "--verbose", "--print-certs", str(signed))
        verify_certificate(report, expected)
        run(os.environ["ZIPALIGN"], "-c", "-p", "4", str(signed))
        destination.write_bytes(signed.read_bytes())
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(".apk.sha256").write_text(f"{digest}  {destination.name}\n")
    destination.with_suffix(".apk.signing.json").write_text(json.dumps({
        "schemaVersion": 1,
        "certificateSha256": expected,
        "apkSha256": digest,
        "sourceCommit": os.environ.get("GITHUB_SHA"),
        "versionName": os.environ.get("NIGHTLY_VERSION"),
        "versionCode": os.environ.get("NIGHTLY_CODE"),
    }, indent=2) + "\n")
    print(f"Verified APK signing certificate SHA-256: {expected}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        print(f"Signing refused: {error}", file=sys.stderr)
        sys.exit(1)
