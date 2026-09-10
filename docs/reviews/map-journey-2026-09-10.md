# Map From/To journey — 10 September 2026

Issue #223. The 2026 map now states the journey explicitly instead of only
highlighting a destination room. A panel above the plan carries **From** (the
manually set location), **To** (the next planned talk from the shared resolved
plan, a `/map/to/<location>` link, or any room picked directly) and the saved
routing profile. When the venue graph knows a route it shows the walking
estimate, the number of floor changes and a per-floor step list ("Walk to the
stairs on the ground floor · Take the stairs up to the first floor · Walk to
Room 2 on the first floor"). The accessible and avoid-stairs profiles change the
steps, not only the minutes.

The From and To selects are the keyboard and large-text equivalent of tapping
the plan; "I'm here" and the new "Go here" in the room sheet write the same
state. The location is labelled **manually set** with a Clear control. Without a
location or a destination no estimate is invented. Every estimate is labelled
"Estimate: draft venue graph, not yet walked on site" while
`venue.metadata.json` carries `_draft: true`; a signed-off graph reads
"Validated venue path". The route-review checklist still governs that flag.

The room sheet keeps the physical room name and the devroom running there
visible together ("Hall 3 · Devroom now: Compilers, Programming Languages and
Systems"), and room labels wrap a devroom's name to two lines instead of
cutting it.

## Verification

- 119 web unit tests passed (8 new in `route-steps.test.ts`, including the
  committed 2026 graph); 17 venue unit tests passed. Format, lint and typecheck
  pass with the existing warnings.
- `tests/map-journey.spec.ts` (3 tests, `--workers=2`): the no-plan case by
  keyboard, plan default → map link → devroom sheet, and 200 % text without the
  panel overflowing. Neighbouring gates run locally are listed on the PR.
- Reviewed [390 × 844 map screenshot](map-journey-2026-09-10/mobile.png):
  Hall 1 → Room 2 on day one at 14:29 with the steps open. This is desktop
  Chromium emulating a phone viewport, not physical-device evidence.

## Not claimed

No walk time or floor transition has been checked at NIMHANS; the graph stays
`_draft`. Nothing is drawn on the plan for the route itself; the steps are a
list. Native Compose parity is untouched. The panel takes roughly a third of a
phone screen with steps open; the steps collapse, but a compact mode was not
explored.
