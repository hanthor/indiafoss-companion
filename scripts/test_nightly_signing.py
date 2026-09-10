"""Certificate-output compatibility and fail-closed regressions."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("sign_nightly", Path(__file__).with_name("sign-nightly.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CertificateReportTests(unittest.TestCase):
    def test_supported_android_tool_reports(self):
        for label in ("Signer #1", "Signer (minSdkVersion=28, maxSdkVersion=2147483647)", "V3.0 Signer:"):
            with self.subTest(label=label):
                module.verify_certificate(
                    f"Number of signers: 1\n{label} certificate SHA-256 digest: {'a' * 64}\n", "a" * 64)

    def test_rejects_missing_wrong_and_multiple_identities(self):
        for report in (
            "",
            f"Number of signers: 1\nSource Stamp Signer certificate SHA-256 digest: {'a' * 64}\n",
            f"Number of signers: 1\nV3.0 Signer: public key SHA-256 digest: {'a' * 64}\n",
            f"Number of signers: 1\nV3.0 Signer: certificate SHA-256 digest: {'b' * 64}\n",
            f"Number of signers: 2\nSigner #1 certificate SHA-256 digest: {'a' * 64}\n",
            f"Number of signers: 1\nV3.0 Signer: certificate SHA-256 digest: {'a' * 64}\nV3.1 Signer: certificate SHA-256 digest: {'b' * 64}\n",
        ):
            with self.subTest(report=report), self.assertRaises(ValueError):
                module.verify_certificate(report, "a" * 64)


if __name__ == "__main__":
    unittest.main()
