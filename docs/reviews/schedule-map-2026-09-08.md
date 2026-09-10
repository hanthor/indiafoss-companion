# Schedule, planner and map review — 8 September 2026

The official source changed its schedule-row IDs. Publication now reconciles CFP IDs against the previous revision, retaining existing attendee choice keys. New single-occurrence CFP talks use a CFP-derived key. Repeated occurrences retain separate activity keys. The checked-in identity map reproduces the published fixture.

Two live captures produced revisions 4 and 5. The latest contains 153 activities and 136 people, with source modification time 2026-09-08 23:17:05.653269. Removed source rows appear in revision diffs; they are not silently reinterpreted as new talks.

The hourly schedule-sync workflow prepares a data-only PR, calls all existing CI jobs on that candidate, and merges only following successful validation and an unchanged-base check. It explicitly dispatches Pages and nightly workflows after a bot-authored merge. Empty programmes, disappearance of over one quarter of previous activities, ambiguous identity assignment, and loss of previously available proposal pages stop publication. Repository permission to let Actions create PRs is an operational prerequisite. The workflow has not yet run on main.

The room selector filters list and room-grid views. The grid uses local venue hour labels and distinct meal styling. Planned markers reflect the last generated, edited plan, including locks and removals, and persist across reload. This is not completion of the broader shared-plan work in #221.

Per-room meal entries remain in the schedule but are excluded from talk candidates. The solver places at most one 30-minute lunch block inside an available official lunch window, including a whole-devroom gap. It does not displace talks to force lunch. Native planner parity remains follow-up.

Map labels show physical Hall/Room names and secondary devroom labels. The selected-room sheet uses that room's actual floor, keeps the location action near the top, and scrolls within a bounded height. Route times remain estimates; this review does not verify physical venue accessibility.

Speaker pages have a bounded reading width and explicit spacing between identity, biography, links and sessions. The native session title moved out of the fixed-height toolbar into the scrolling content with unrestricted wrapping; a long-title screenshot test was added for Android CI.

## Evidence

- All 107 Chromium tests passed, including both accessibility themes, offline recovery and three new 2026 schedule/map regressions.
- Planner editing/reload regression passed three consecutive runs.
- Web unit tests: 82 passed. Solver tests: 30 passed. Event-sync tests: 6 passed, including unchanged fixture publication for both event years.
- Workspace lint and typechecks passed. The full workspace unit run reached the already-running local neutrino-lan service on port 8008: upstream gap tripwires failed because that service implements those endpoints. A separately labelled fork probe still fails three multi-user/device expectations, so gateway compatibility is not certified by this change. Android execution and screenshots require CI; no physical-device claim.
- Public GitHub email now fills an empty contact field. Broader profile-first/OAuth follow-up is recorded in #173; PWA/native personal-data transfer remains #240.

Screenshots at 390 × 844 and 1440 × 1000:

- [Ground floor](schedule-map-2026-09-08/map-ground-final.png)
- [Collapsed room and location action](schedule-map-2026-09-08/map-room-final.png)
- [Destination on another floor](schedule-map-2026-09-08/map-destination-final.png)
- [Accessible routing preference](schedule-map-2026-09-08/map-accessible-final.png)
- [Mobile room grid](schedule-map-2026-09-08/schedule-grid-mobile-final.png)
- [Desktop room grid](schedule-map-2026-09-08/schedule-grid-desktop-final.png)
- [Mobile speaker page](schedule-map-2026-09-08/speaker-mobile-final.png)
- [Desktop speaker page](schedule-map-2026-09-08/speaker-desktop-final.png)

The room-column/time-axis design and per-room breaks follow the documented [Pretalx schedule model](https://docs.pretalx.org/user/schedule/).
