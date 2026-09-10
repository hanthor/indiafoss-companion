#!/usr/bin/env python3
"""Unit tests for the advertised-download-link check.

These cover the parsing, which is what silently goes wrong. The live network
check is exercised by the workflow itself.
"""

import contextlib
import importlib.util
import os
import pathlib
import subprocess
import tempfile
import unittest

_spec = importlib.util.spec_from_file_location(
    "check_download_links",
    pathlib.Path(__file__).resolve().parent / "check-download-links.py",
)
links = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(links)


class UrlPattern(unittest.TestCase):
    def test_matches_a_release_asset(self):
        found = links.URL.findall(
            "see https://github.com/hanthor/indiafoss-chat-android/releases/download/nightly/indiafoss-chat-android.apk here"
        )
        self.assertEqual(
            found,
            [
                "https://github.com/hanthor/indiafoss-chat-android/releases/download/nightly/indiafoss-chat-android.apk"
            ],
        )

    def test_ignores_a_tag_link(self):
        # A tag page resolves even when no asset was ever published, which is
        # the failure this check exists to catch. It must not be mistaken for
        # evidence that the download works.
        self.assertEqual(
            links.URL.findall(
                "https://github.com/hanthor/indiafoss-companion/releases/tag/nightly"
            ),
            [],
        )

    def test_stops_at_markdown_and_quote_delimiters(self):
        base = "https://github.com/o/r/releases/download/nightly/a.apk"
        for wrapper in (f"[text]({base})", f'href="{base}"', f"'{base}'", f"`{base}`"):
            with self.subTest(wrapper=wrapper):
                self.assertEqual(links.URL.findall(wrapper), [base])


@contextlib.contextmanager
def working_directory(path):
    previous = pathlib.Path.cwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(previous)


class Advertised(unittest.TestCase):
    def _repo(self, files):
        directory = tempfile.mkdtemp()
        root = pathlib.Path(directory)
        subprocess.run(["git", "init", "-q"], cwd=root, check=True)
        for name, text in files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
        subprocess.run(["git", "add", "-A"], cwd=root, check=True)
        return root

    def test_collects_every_file_that_advertises_a_url(self):
        url = "https://github.com/o/r/releases/download/nightly/a.apk"
        root = self._repo({"README.md": url, "a.svelte": f'href="{url}"'})
        with working_directory(root):
            found = links.advertised()
        self.assertEqual(sorted(found[url]), ["README.md", "a.svelte"])

    def test_skips_a_templated_url(self):
        # A URL built from workflow expressions cannot be resolved from here.
        root = self._repo(
            {
                "w.yml": "https://github.com/${{ github.repository }}/releases/download/nightly/a.apk"
            }
        )
        with working_directory(root):
            self.assertEqual(links.advertised(), {})

    def test_ignores_an_untracked_file(self):
        url = "https://github.com/o/r/releases/download/nightly/a.apk"
        root = self._repo({"README.md": "nothing here"})
        (root / "scratch.md").write_text(url, encoding="utf-8")
        with working_directory(root):
            self.assertEqual(links.advertised(), {})


if __name__ == "__main__":
    unittest.main()
