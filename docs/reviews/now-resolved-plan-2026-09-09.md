# Now follows the edited plan — 9 September 2026

Advances #221. Plan and Now now use `resolveDayPlan`: current event data and explicit saved edits go through the same solver and edit validation. Now does not treat the last cached list of planned activity IDs as a current itinerary.

“Your plan now” shows an in-progress item or the next item that has not ended, including personal blocks and flexible time. Removed sessions stay removed across reloads. Cancelled activities are excluded from the current activity lookup, so a stale replacement becomes a conflict rather than a valid destination. Conflicting commitments/edits prompt the attendee to resolve their plan. Errors are shown separately from an empty day.

Dates use the venue's timezone, not the phone timezone or UTC date. “Open your plan” carries the current day into Plan. Async results are ignored after the day/source changes or the route unmounts; the old personal destination is cleared while a new projection loads.

The global leave-by banner, while on Now, selects only upcoming activities in that resolved plan. It cannot resurrect an excluded bookmark or must-go through programme fallback. During loading or a conflict it has no personal destination. The banner describes the upcoming session, while the card may describe the session already in progress. General suggestions remain separately labelled “Next in the programme”. Personal blocks without a location have no invented map link.

Validation: 93 web unit tests and 67 browser/accessibility tests passed locally; Svelte check has zero errors and four existing warnings; lint/build passed. Coverage includes in-progress/end boundaries, venue-date rollover from UTC, empty/conflicting plan selection, removed-session reload, custom-block reload, conflicting custom blocks, current-day navigation, and existing Plan editing behaviour. Reviewed the [390px mobile screen](now-resolved-plan-2026-09-09/mobile.png).

The first full CI run caught a simulator clock mismatch: Now initialized before the run started and kept the wall clock while the banner followed simulated time. Now reacts to clock changes; all three simulation tests pass locally with reminder-tier/delivery checks retained and an explicit assertion that Now displays the simulated event day. The warm-cache offline reload also passed after service-worker installation/control; cutting connectivity before installation did not.

## Remaining #221 work

- Map selection and the global banner on other routes still use their existing preference-based logic. Move them to the current projection with consistent loading/error/conflict handling.
- Notification scheduling still needs this projection, including cancellation of obsolete reminders after removal, replacement or revision changes.
- Schedule markers still use the saved activity-ID snapshot; they need current revision/choice invalidation.
- Add cross-surface revision, cancellation/reinstatement and conflicting-commitment acceptance tests; complete native parity and installed-device rehearsal.

This change does not claim all destinations/reminders are unified or that PWA background notifications are dependable.
