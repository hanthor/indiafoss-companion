#!/usr/bin/env bash
# Rasterise the PWA's eight official IndiaFOSS 2026 devroom patterns for the
# native client: 960 × 480 (the SVG's own viewBox) as WebP, density-independent
# (`drawable-nodpi`), so Compose crops the top of the same image the web shows.
# Re-run after apps/web/static/branding/2026/devroom-*.svg changes.
# Needs rsvg-convert (librsvg) and cwebp (libwebp).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$here/../../../web/static/branding/2026"
out="$here/../app/src/main/res/drawable-nodpi"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for name in aosp devops compilers docs design hardware rtos security; do
    rsvg-convert -w 960 -h 480 "$src/devroom-$name.svg" -o "$tmp/$name.png"
    cwebp -quiet -q 82 "$tmp/$name.png" -o "$out/devroom_$name.webp"
done
ls -l "$out"/devroom_*.webp
