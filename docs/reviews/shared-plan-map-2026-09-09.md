# Shared plan on every route — 9 September 2026

Issue #221. The layout now owns the current venue-day projection instead of
requiring the Now route to publish it. Now, map destination suggestions and the
leave-by banner on every route consume that projection. Plan uses the same
resolver for its independently selected editing day.

Preference, room, edit, routing, booth-visit, event-bundle and venue-day changes
invalidate the live projection. Pending and failed resolutions clear the old
projection; obsolete asynchronous results cannot republish it. Reactive edit
snapshots avoid reading IndexedDB before a just-made edit has been persisted.
Conflicting plans do not choose a destination. Explicit map destinations remain
available, independent of recommendations.

A must-go talk remains a hard planning constraint, but no longer causes a banner
to skip an earlier talk in the resolved plan. The banner says “in your plan”
instead of mislabelling every solver-selected entry as bookmarked. A map room
can be both live and next in the plan: the latter now has visible text and an
accessible label, independent of live-room colour.

## Verification

- 93 web unit tests passed; lint and typecheck passed (four existing warnings).
- Browser regressions cover direct map entry without visiting Now, immediate
  removal in Plan, schedule-route/reload persistence, conflicting-plan suppression,
  and must-go versus chronological plan order.
- Reviewed [390 × 844 map screenshot](shared-plan-map-2026-09-09/mobile.png).
  This is desktop Chromium emulating a phone viewport, not physical-device evidence.
- Full app/accessibility/simulator results and CI outcome are recorded on the PR
  after execution; the earlier run caught the obsolete must-go banner assertion.

## Remaining under #221

Reminders still need the resolved-plan integration and cancellation of stale
alarms; schedule markers still need revision/edit invalidation. Native parity,
custom-block-aware navigation, and cross-revision/midnight/offline acceptance
remain. This change does not claim that the whole issue is complete.
