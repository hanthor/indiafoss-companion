# IndiaFOSS 2026 — raw venue sources

Unprocessed venue artwork as supplied. These are **not** wired into the venue
engine; the routing asset is `../venue/venue.svg` plus the graph/metadata.

## Files

- `venue-both-floor-plan.svg` — the Inkscape floor plan (labelled, layered).
  Source for the cleaned routing SVG in `../venue/venue.svg`.
  `sha256: d5f0b5758b01f4f57375f3a37735ba8d2a8b4bbe2a59be815a0f541afda589bb`
- `venue-presentation-map.svg` — a colourful presentation/design-export map
  (Google Drive, 2026). Flattened geometry only: 138 paths + 34 rects, **no
  text labels, no element IDs, no floor layers**, one landscape artboard
  (3813×1383). Kept as a candidate rendered map.
  `sha256: 63f40503ce5ba3f130a541cb728748e16e2da321af5db0c2b622fbc4ae42d649`

## Status of the presentation map

Not usable for routing or `svgTarget` highlighting as-is — it has no labels or
stable ids to anchor locations to. James will annotate the SVG by hand (add
named ids/layers matching the venue locations) before it can back the app map.
Do not auto-annotate its anonymous paths; that would be guesswork. Once
labelled, run `just venue-report indiafoss-2026` to re-validate.
