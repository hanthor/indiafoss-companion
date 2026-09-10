#!/usr/bin/env python3
"""Check that every release download URL the project advertises resolves.

The Chat app's download link pointed at a `nightly` release that had never
been published, so attendees following the app's own instructions got a 404.
Nothing noticed, because no test asserts that an advertised link resolves.

This walks the tracked sources, collects every GitHub release-download URL,
and fails if one does not return a success status. It is deliberately not one
of the required pull-request gates: it depends on github.com being reachable
and on a release existing, neither of which a pull request controls.
"""

from __future__ import annotations

import re
import subprocess
import sys
import urllib.error
import urllib.request

# Only release-download URLs. A tag or repository link resolves even when no
# asset was ever published, which is exactly the failure this exists to catch.
URL = re.compile(r"https://github\.com/[\w.-]+/[\w.-]+/releases/download/[^\s\"'`)\]]+")

SEARCHED = ("*.md", "*.svelte", "*.ts", "*.kt", "*.yml", "*.yaml")

# A URL built from workflow expressions cannot be checked from here.
TEMPLATED = ("${{", "$GITHUB", "{{")


def advertised() -> dict[str, list[str]]:
    """Map each advertised URL to the tracked files that advertise it."""
    files = subprocess.run(
        ["git", "ls-files", "-z", *SEARCHED],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split("\0")

    found: dict[str, list[str]] = {}
    for path in filter(None, files):
        try:
            with open(path, encoding="utf-8") as handle:
                text = handle.read()
        except (UnicodeDecodeError, OSError):
            continue
        for match in URL.findall(text):
            url = match.rstrip(".,;:")
            if any(marker in url for marker in TEMPLATED):
                continue
            found.setdefault(url, [])
            if path not in found[url]:
                found[url].append(path)
    return found


def resolves(url: str) -> tuple[bool, str]:
    """Follow redirects and report whether the asset can be downloaded."""
    request = urllib.request.Request(url, method="HEAD")
    # A default urllib agent is served differently by some CDNs.
    request.add_header("User-Agent", "indiafoss-companion-link-check")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return 200 <= response.status < 400, str(response.status)
    except urllib.error.HTTPError as error:
        return False, f"HTTP {error.code}"
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return False, f"unreachable: {error}"


def main() -> int:
    links = advertised()
    if not links:
        print("No release download URLs are advertised.")
        return 0

    broken: list[tuple[str, str, list[str]]] = []
    for url, paths in sorted(links.items()):
        ok, detail = resolves(url)
        print(f"{'ok  ' if ok else 'DEAD'} {detail:<16} {url}")
        if not ok:
            broken.append((url, detail, paths))

    if not broken:
        print(f"\nAll {len(links)} advertised download links resolve.")
        return 0

    print(f"\n{len(broken)} advertised download link(s) do not resolve:")
    for url, detail, paths in broken:
        print(f"\n  {url}\n    {detail}")
        for path in paths:
            print(f"    advertised in {path}")
    print("\nEither publish the release asset or stop advertising the link.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
