# Resolved-plan reminders and schedule highlights — 9 September 2026

Issue #221. Reminders previously used bookmarks plus a separate read of custom
blocks. Schedule markers used saved activity-ID snapshots that could outlive
the programme or preference change that produced them.

Reminders now resolve the event's days through the same edited-plan resolver
as Plan, Now and the map. Only feasible days contribute alerts. Removed and
replaced sessions cannot retain their old reminders; valid manual custom blocks
retain their reminders. Default solver break suggestions do not gain unsolicited
custom-block alerts.

A serial reminder reconciler cancels old timers before resolving replacements.
A generation check rejects superseded calculations, and transport writes are
serialised so disabling reminders also cancels a schedule call already in flight.
Changed rooms/times replace notifications even when their activity IDs stay the
same. Preference, room, edit, booth, routing and event changes trigger re-arming
immediately rather than waiting for the periodic timer.

Schedule markers re-resolve the selected day against current data and preferences.
A saved plan is still required: browsing a fresh schedule alone does not mark
algorithmic suggestions as the attendee's plan. Loading, corrupt or conflicting
plans do not display stale markers. Plan itself now observes the complete shared
set of preference inputs.

## Validation

- 97 web unit tests pass, including obsolete-result, delayed transport write,
  removed-alert, same-ID replacement and failed-resolution regressions.
- 91 app, accessibility, simulator, update and offline browser tests pass.
- New browser cases retain a must-go preference but remove it from the edited
  plan, then verify its alerts do not fire while other planned alerts do.
  Another case changes interest after making a plan and checks schedule markers
  without reopening Plan, including reload.
- The reminder quality test still checks every tier, location, walking estimate,
  click handler and duplicate suppression for its target session. It now allows
  other resolved-plan sessions to generate their own alerts.
- Typecheck and lint pass; four existing Svelte warnings remain.
- These are browser/timer and CI checks, not phone background-delivery evidence.

## Remaining acceptance

Native Compose planner/reminder parity and physical-device recovery remain under
#221/#110. Web reminders retain their documented open-app/timer limitations.
The generation tests do not certify Android OS alarm cancellation latency.
Custom-block navigation and broader physical venue acceptance remain separate.
