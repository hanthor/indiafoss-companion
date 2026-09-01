# Venue route-review checklist

The venue routing graph is a **best-effort draft** authored from the supplied
Inkscape floor plan. The physical venue and the venue team are the source of
truth. Use this checklist to turn the draft into an authoritative asset before
production use, then remove the `_draft: true` flag in
`events/<event>/venue/venue.metadata.json`.

Run the structural checks first:

```
just venue-validate indiafoss-2026     # console PASS/FAIL
just venue-report    indiafoss-2026     # writes venue/validation-report.md
```

The validator enforces: unique ids, no dangling edges, no negative/zero weights,
no self-loops or duplicate edges; every location entrance exists in the graph;
each location's declared floor matches its entrance node's floor; every public
location is reachable from the entrance; and any floor change traverses a stairs
or lift edge. It cannot confirm the _physical_ facts below — a human must.

## 1. SVG reuse and provenance

- [ ] Confirm the floor plan may be redistributed/branded in the app.
- [ ] `provenance.json` records the source, `rawSha256`, `cleanedSha256`, and the
      cleanup applied.

## 2. Names and structure (per floor)

- [ ] Floor names are correct (`ground`, `first`).
- [ ] Every room/hall name matches venue signage (Hall 1/2/3, Room 1/2/3,
      Silent Room, first-floor Hall 1).
- [ ] Booth zones are correct (Sponsor Booths, HW Showcase, Community Booths —
      ground vs first).
- [ ] Amenities are placed (FOSS United help desk, water stations, lunch area,
      toilets).
- [ ] Entrances, stairs, and lifts are located on both floors.

## 3. Floor assignment (verified against the physical venue)

- [ ] Room 1, Room 2, Room 3, and the Silent Room are on the **First Floor**
      (as modelled) — confirm this matches the venue.
- [ ] Community Booths: confirm whether they are ground, first, or both, and
      whether `community-booths` (ground) and `community-booths-first` are both
      real or one is a drafting artefact.

## 4. Routing graph values

- [ ] Replace estimated `distanceMeters` / `timeSeconds` with measured or paced
      values.
- [ ] Confirm which vertical transitions exist (stairs, lift) and their
      `accessible` flag (a stairs-only floor is an accessibility gap the
      validator warns about).
- [ ] Confirm any one-way constraints (`oneWay`).
- [ ] Confirm accessible routes for wheelchair users reach every public room.

## 5. Schedule ↔ venue binding

- [ ] Every scheduled activity location resolves to a canonical location with a
      routing entrance and, where applicable, a valid `svgTarget`.
- [ ] `community-booths` and `registration` have no `svgTarget` yet — add one or
      confirm they intentionally have none.

## 6. Sign-off

- [ ] `just venue-report` shows PASS and the committed
      `validation-report.md` is up to date.
- [ ] A venue representative has confirmed sections 1–5.
- [ ] `_draft` removed from `venue.metadata.json`.

## Note

The synthetic venue fixture (`events/synthetic/venue`) is kept deliberately for
deterministic algorithm tests and must not be replaced by real data.

A candidate presentation map is stored at
`events/indiafoss-2026/raw/venue-presentation-map.svg`. It is flattened (no
labels/ids/layers) and is **not** wired in. Before it can back the app map,
add stable element ids/layers by hand to match the venue locations, then
re-run `just venue-report indiafoss-2026`.
