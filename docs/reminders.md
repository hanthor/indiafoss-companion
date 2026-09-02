# Reminders and must-attend

Reminders are local notifications (§37): the Notification API and timers on
the web, `@capacitor/local-notifications` alarms on Android. Nothing leaves
the device and there is no push service. They are off until the attendee
switches them on in Settings.

## Tiers

`computeNotifications()` in `apps/web/src/lib/notifications.ts` is pure and
takes a `tierFor(activityId)` callback:

| Tier          | Who                         | Alerts                                                                                     |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `must-attend` | disposition "★ Must attend" | heads-up 30 min before, starting soon (15 min), "time to head over" (10 min), at the start |
| `planned`     | bookmarked sessions         | starting soon, leave now                                                                   |
| `none`        | everything else             | silent                                                                                     |

`armNotifications()` recomputes this every minute for the next 90 minutes and
hands the result to the transport; ids are stable (`must-`, `soon-`, `leave-`,
`start-` + activity id) so re-arming replaces rather than duplicates.

## Must attend

"Must attend" is one of the session dispositions (`must-attend`,
`not-interested`, `watch-later`) stored with the Elo rating. It can be set on
the session page or with the `!!` mark on any schedule row, and removed from
the Plan tab's **★ Must attend** list. Besides the extra reminders it:

- is forced into the itinerary by the solver (`mustAttendBonus`), which
  reports clashes between two must-attend sessions on the Plan tab;
- leads the leave-by banner: `computeNextUp()` picks the earliest upcoming
  must-attend session before any other bookmark, and the banner is tagged
  `★ MUST ATTEND`.
