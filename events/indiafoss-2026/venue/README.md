# IndiaFOSS 2026 — Venue

The real venue floor plan, supplied as an Inkscape SVG.

## Files

- `venue.svg` — cleaned venue asset (presentation layer for the venue engine).
- `../raw/venue-both-floor-plan.svg` — byte-for-byte copy of the supplied source.
- `provenance.json` — source, hashes, and cleanup record.

## Structure

The SVG contains both floors as separate layers plus shared geometry:

| Layer | Content |
| --- | --- |
| `Ground Floor` | Hall 1 (750), Hall 2 (250), Hall 3 (120), Sponsor Booths (16, numbered 1–16), HW Showcase, FOSS U Help Desk, Water Station, lunch area, entrance |
| `First Floor` | Hall 1 (200), Room 1 (100), Room 2 (30), Room 3 (30), Silent Room, Community Booths, Water Station |
| shared | venue outline, rooms (lunch area), stairs, podium |

Each floor also carries a small legend (Wall / Door / Entrance / Podium / Stairs / …).

## Cleanup applied to `venue.svg`

- Removed 16 redundant `12 ft x 6 ft` booth-dimension text annotations
  (all identical, stacked on each booth in the authoring file).
- Fixed typo `Lunch Areaa` → `Lunch Area`.
- Normalised straight quotes to typographic quotes in `Say “FOSS”, and Enter!`.

Multi-word labels are intentionally split across `<tspan>` lines
(e.g. `HW` / `Showcase`, `Sponsor` / `Booths`); this wrapping was preserved.

## Known issues for the venue engine (Phase 5)

- **Duplicate element IDs** throughout (e.g. `path9`, `path6`, `rect…` appear
  2–3×). The SVG authoring duplicated shared geometry across floors. These
  must be disambiguated before `venue.svg` can be referenced by a routing
  graph; the venue validator (§23/§53) is expected to reject them.
- Inkscape editor metadata (`sodipodi:namedview`, `inkscape:*`) is still
  present; harmless but removable.
- 16 blue `stroke:#0000ff` dimension rectangles remain (they were paired with
  the removed `12 ft x 6 ft` labels) and can be removed if desired.

The routing graph (`venue.graph.json`) and location metadata
(`venue.metadata.json`) are authored separately in Phase 5.
