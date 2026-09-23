# IndiaFOSS 2026 — Venue

The real venue floor plan, supplied as SVGs.

## Files

- `venue.svg` — cleaned venue asset (presentation layer for the venue engine).
- `floor-ground.svg`, `floor-first.svg` — the organiser's latest per-floor
  artwork (issue #657): the presentation plans both maps draw, with the room
  numbers the map key explains.
- `map-legend.svg` — the organiser's map key: which number is which room.
- `../raw/venue-both-floor-plan.svg` — byte-for-byte copy of the earlier source.
- `provenance.json` — sources, hashes, and cleanup record.

## Room numbers (map key, issue #657)

| No. | Room               | Floor | Programme              |
| --- | ------------------ | ----- | ---------------------- |
| 1   | Hall 1             | 0     | General Track          |
| 2   | Hall 2             | 0     | General Track          |
| 3   | Hall 3             | 0     | Devroom Track          |
| 4   | Sponsor booths     | 0     | —                      |
| 5   | Hardware Showcase  | 0     | —                      |
| —   | Help Desk          | 0     | FOSS United            |
| 6   | Room 1             | 1     | Devroom Track          |
| 7   | Room 2             | 1     | BOF sessions           |
| 8   | Room 3             | 1     | BOF sessions           |
| 9   | Community Showcase | 1     | open area, no walls    |
| —   | Silent Room        | 1     | quiet room             |

Amenities on both plans: Food (through the main exit), Drinking Water,
Washrooms, Lift. The Community Showcase (9) is an open area, so it has no
tappable walls in the app maps — the badge and the key say where it is.

## Structure

The older `venue.svg` contains both floors as separate layers plus shared geometry:

| Layer          | Content                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Ground Floor` | Hall 1 (750), Hall 2 (250), Hall 3 (120), Sponsor Booths (16, numbered 1–16), HW Showcase, FOSS U Help Desk, Water Station, lunch area, entrance |
| `First Floor`  | Hall 1 (200), Room 1 (100), Room 2 (30), Room 3 (30), Silent Room, Community Booths, Water Station                                               |
| shared         | venue outline, rooms (lunch area), stairs, podium                                                                                                |

Each floor also carries a small legend (Wall / Door / Entrance / Podium / Stairs / …).

## Cleanup applied to `venue.svg`

- Removed 16 redundant `12 ft x 6 ft` booth-dimension text annotations
  (all identical, stacked on each booth in the authoring file).
- Fixed typo `Lunch Areaa` → `Lunch Area`.
- Normalised straight quotes to typographic quotes in `Say “FOSS”, and Enter!`.

Multi-word labels are intentionally split across `<tspan>` lines
(e.g. `HW` / `Showcase`, `Sponsor` / `Booths`); this wrapping was preserved.

## Known issues for the venue engine (Phase 5)

- **Floors reconciled with the SVG.** The draft graph originally placed Room 1/2/3
  and the Silent Room on the ground floor; the SVG layers put them on the First
  Floor. `venue.graph.json` and `venue.metadata.json` now model them as
  first-floor rooms reached via the stairs/lift, and the venue validator enforces
  floor consistency, reachability, and stairs/lift floor transitions
  (see `docs/venue-route-review-checklist.md`).
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
