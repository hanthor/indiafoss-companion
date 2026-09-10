# Venue map

The `/map` tab is the NIMHANS Convention Centre floor plan, not a generic
viewer. It answers two questions: what is happening around me now, and when do
I need to move.

## Drawing

`apps/web/src/lib/venue-floors.ts` holds both floors extracted from the
architect's `both--floor-plan-expo.svg`: outline, floor fill, walls, podiums,
stairs and one path per room, in the drawing's own coordinates. Each floor has
its own `viewBox` because both floors share one coordinate space.
`FloorPlan.svelte` renders the active floor as an inline `<svg>` that fills the
space between the app bar and the tab bar (`preserveAspectRatio="xMidYMid meet"`)
and positions an HTML label button over every room using `anchorPercent()`,
corrected for the letterboxed drawing so labels stay on their rooms at any
aspect ratio.

Rooms: ground `hall-1` Audi 1 (750), `hall-2` Audi 2 (250), `hall-3` Audi 3
(120), `lunch`; first `room-1` (100), `room-2` (30), `room-3` (30),
`hall-1-balcony` Audi 1 balcony (200), `silent`. The ids follow the
architect's drawing; IndiaFOSS calls the halls Audi 1, 2 and 3, so the
labels do.

## Schedule on the plan

`venue-rooms.ts` maps a venue location's entrance node to a drawn room. The
2026 venue metadata names entrances after rooms (`gf-hall-1` → `hall-1`); the
synthetic venue that carries the 2025 programme is aliased onto the physical
rooms (Audi 1 → `hall-1`, Devroom 2 → `room-1`, …), so the plan shows the
schedule's own names ("Devroom 2") with the plan's name as a subtitle.

Room state comes from the bundle and the app clock (`?now=` works here as on
Now):

- **LIVE** (mint): a session is running there; the label shows the title and
  minutes left.
- **TO** (amber): the journey's destination — the room of your next planned
  session (`computeNextUp` over the shared resolved plan, within three hours),
  the destination of a `/map/to/<location>` link, or a room chosen in the
  From/To panel or with "Go here" in the sheet.
- **Selected** (black outline): the room whose sheet is open.
- **You** (green dot): the room of your current location.

Floor chips carry a green dot when that floor has live sessions; a corner hint
says when you or your next talk are on the other floor.

## Room sheet

Tapping a room (shape or label) pans it into the strip above the sheet and
opens a bottom sheet that **peeks** (name, floor and seats, ON NOW) and expands
on the grabber to NEXT HERE and "I'm here" / "Clear location" (the same state a
room QR's `?at=` deep link sets). This is the Google I/O app's map pattern:
full-screen vector map, floor selector, small markers, a peeking bottom sheet.
No route is drawn on the plan; the destination room is highlighted and the
journey is described in the panel above the plan. Labels hide once they leave the plan
rather than dangling off-screen, and the drawing's viewBox carries 6 % padding
so no wing is clipped at any aspect ratio.

## From / To panel

Above the plan (#223): **From** is the manually set location (a select over the
drawn rooms, the same state as "I'm here" and a room QR's `?at=`), labelled
MANUALLY SET with a Clear control; **To** defaults to the next planned talk or a
`/map/to/` link and otherwise lists every room, so an attendee without a plan
picks one directly; the saved routing profile sits alongside. With both ends
known, `route-steps.ts` turns the graph route into a walking estimate, the floor
changes and per-floor steps ("Walk to the lift on the ground floor", "Take the
lift up to the first floor", …), honouring the profile. Estimates are labelled
as such while the venue metadata is `_draft`; a signed-off graph reads
"Validated venue path". Without a location or destination nothing is estimated.

## Next-up banner

`LeaveByBanner.svelte` sits under the app bar on every tab and names the next
session: `STARTS IN 12 MIN · 14:45 — title · Hall 2`, amber at five minutes,
STARTING NOW after. Must-attend sessions come first and are tagged. Tapping it
opens `/map/to/<location>`. Reminders are scheduled separately by
`notifications.ts` when they are enabled in Settings.
