# IndiaFOSS 2025 — historical integration fixture

Golden real-world fixture for the canonical event model. IndiaFOSS 2025 ran at
NIMHANS Convention Centre, Bengaluru, on 2025-09-20/21.

## Files

- `raw/event.json` — `fossunited.api.dashboard.get_event` (by route `c/indiafoss/2025`)
- `raw/schedule.json` — `fossunited.api.schedule.get_event_schedule` (131 sessions, 12 halls)
- `raw/proposals.json` — `fossunited.api.proposal.get_event_proposals` (359 proposals)
- `raw/booths.html` — public official booth directory page (60 booths)
- `raw/proposal-details.json` — parsed captures of 108 public proposal detail pages
- `booths.json` — normalized official booth records derived from the public directory
- `normalized/event-bundle.json` — canonical `EventBundle` produced by
  `@indiafoss/sources` (131 activities, 117 people, 12 locations, 12 tracks, 60 booths)
- `provenance.json` — endpoints, event doctype name, content hashes

## Programme shape

- 131 scheduled sessions across two days.
- 12 halls: Audi 1, Audi 2, BoF Room, Workshops Room, Food Area, Devroom 2,
  plus six day-specific devroom tracks (AOSP, Hardware, FOSS in Science, Open
  Data, Compilers, Geopolitics).
- Up to four concurrent streams (auditoriums + devrooms).
- Session categories: Talk, Lightning Talk, Opening Note, Break, Other
  (panels/BOFs resolved via proposal session type).

## Regenerating

```bash
pnpm --filter @indiafoss/fixture-recorder exec tsx src/index.ts normalize indiafoss-2025
```

## Notes

- Booths are published as a public directory page rather than the schedule API;
  the captured 60 records are imported from that official page, with zone-level
  map locations because individual booth coordinates are not published.
- `normalized/event-bundle.json` is committed so tests never need the live site.
