# Desktop PWA layout review — 10 September 2026

Issue #205 showed the PWA at 1900 × 1160 as a stretched phone: a five-item tab bar across the full width, a single centred column, and the map's room sheet covering the bottom of the plan. This change gives the app a desktop layout from 1024px while leaving the phone layout as it was. It is a layout pass, not a redesign: the same routes, components, tokens and controls, arranged for the width available.

## What changed

- From 1024px the bottom tab bar is hidden and the same five destinations appear in a side rail before the content, so keyboard order follows the visual order (app bar, rail, page). Only one primary navigation is in the accessibility tree at any width. The rail's surface is painted by the row rather than by the rail itself, so a viewport-tall rail cannot push the page below the fold when a banner is showing. `--tabbar-height` is zero at desktop widths, so the schedule-update banner and the map sheet stop reserving space for a bar that is not there.
- Schedule opens on the room grid at desktop widths; the toggle still works both ways, and phones keep the list. Grid columns share the reading width equally (six rooms fit the 1200px column at 1900px); narrower desktops scroll the grid region sideways as before. In the list view, sessions that start together sit beside each other.
- Now places your plan and the next programme item on the left and the longer live list on the right.
- Plan keeps the itinerary at a reading width and moves "Removed" and "Add a block" into a sticky side column.
- Map: the room sheet becomes a panel to the right of the floor plan, sized to the viewport, so opening a room hides no map and the legend and zoom controls remain visible. The grabber is not shown there.

Phone screenshots of Schedule, Now and Plan at 390 × 844 are pixel-identical before and after. The map phone screenshot differs only because the after capture opened a room sheet; the sheet, grabber and tab bar behave as before.

## Not changed

Home, Explore, Connect, Scan, Settings, discovery and the activity/speaker pages keep their existing centred column inside the new rail layout; they were not redesigned. Desktop keyboard shortcuts for discovery (Left/Right/Up, Z) are untouched. No new colours, fonts or components were introduced. This is Chromium evidence at three viewports, not testing on a physical desktop browser matrix, and no volunteer walkthrough was performed.

## Evidence

- Unit tests (apps/web): 111 passed in 23 files, including the design-token guard.
- Browser tests with `--workers=2`: 41 passed, none on retry — the 32 existing accessibility checks (light and dark) and 9 new checks in `tests/desktop.spec.ts` covering rail/tab bar presence, the room grid side by side at 1900 and 1024, keyboard order, two-column Now and Plan, the map panel beside the plan, and no horizontal scroll at 1900 × 1160 and 390 × 844.
- Workspace format check, lint and typecheck passed (three pre-existing svelte-check warnings, none in changed lines).
- Browser inspection: `scrollWidth` equals `clientWidth` on Schedule, Now, Plan and Map at 1900, 1024 and 390 wide.

## Screenshots

| Route    | 1900 × 1160 before                                           | 1900 × 1160 after                                          |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Schedule | [before](desktop-pwa-2026-09-10/schedule-desktop-before.png) | [after](desktop-pwa-2026-09-10/schedule-desktop-after.png) |
| Now      | [before](desktop-pwa-2026-09-10/now-desktop-before.png)      | [after](desktop-pwa-2026-09-10/now-desktop-after.png)      |
| Plan     | [before](desktop-pwa-2026-09-10/plan-desktop-before.png)     | [after](desktop-pwa-2026-09-10/plan-desktop-after.png)     |
| Map      | [before](desktop-pwa-2026-09-10/map-desktop-before.png)      | [after](desktop-pwa-2026-09-10/map-desktop-after.png)      |

[Schedule at 1024 × 768](desktop-pwa-2026-09-10/schedule-laptop-after.png) ·
[Map at 1024 × 768](desktop-pwa-2026-09-10/map-laptop-after.png) ·
[Schedule at 390 × 844](desktop-pwa-2026-09-10/schedule-phone-after.png) ·
[Map at 390 × 844](desktop-pwa-2026-09-10/map-phone-after.png).
