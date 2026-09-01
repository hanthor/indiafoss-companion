# IndiaFOSS 2025 — historical integration fixture

Golden real-world fixture for the canonical event model. IndiaFOSS 2025 ran at
NIMHANS Convention Centre, Bengaluru, on 2025-09-20/21.

## Files

- `raw/event.json` — `fossunited.api.dashboard.get_event` (by route `c/indiafoss/2025`)
- `raw/schedule.json` — `fossunited.api.schedule.get_event_schedule` (131 sessions, 12 halls)
- `raw/proposals.json` — `fossunited.api.proposal.get_event_proposals` (359 proposals)
- `normalized/event-bundle.json` — canonical `EventBundle` produced by
  `@indiafoss/sources` (131 activities, 117 people, 12 locations, 12 tracks)
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

- Booths are not exposed by any public FOSS United API; the booth fixture is
  authored separately (Phase 7).
- `normalized/event-bundle.json` is committed so tests never need the live site.
