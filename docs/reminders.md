# Reminders and must-attend

Reminders are local notifications (§37): the Notification API and timers on
the web, native `AlarmManager` scheduling
(`apps/android/native/app/src/main/kotlin/org/indiafoss/companion/reminders/`)
on Android. Nothing leaves the device and there is no push service. They are
off until the attendee switches them on in Settings.

## Tiers

`computeNotifications()` in `apps/web/src/lib/notifications.ts` is pure and
takes a `tierFor(activityId)` callback:

| Tier          | Who                         | Alerts                                                       |
| ------------- | --------------------------- | ------------------------------------------------------------ |
| `must-attend` | disposition "★ Must attend" | heads-up 30 min before, starting soon (15 min), at the start |
| `planned`     | bookmarked sessions         | starting soon                                                |
| `none`        | everything else             | silent                                                       |

## What an alert says

A reminder that does not say where to go is only half a reminder, so every
alert names the session in the **title** and the room and the start time in
the **body**:

| When                | Title                                 | Body                                           |
| ------------------- | ------------------------------------- | ---------------------------------------------- |
| must-attend, 30 min | `In 30 min: First Step into Open So…` | `Must attend · 10:15 in Devroom 1 (AOSP)`      |
| starting soon       | `In 15 min: <session>`                | `10:15 in Devroom 1 (AOSP)`                    |
| at the start        | `Starting now: <session>`             | `Devroom 1 (AOSP) · you marked it must attend` |
| your own block      | `In 10 min: <label>`                  | `On your plan · Food Area · starts 13:00`      |

The session goes in the title because a shade with three reminders in it must
be readable without opening any of them; five identical "Starting soon" rows
are not. Titles longer than `MAX_NOTIFICATION_TITLE` (56) are trimmed on a
word boundary so the time cue at the front survives.

There is no walk time and no "leave now" alert: the venue is small enough
that every room is under five minutes away, so the 15-minute "starting soon"
is already the cue to move.

Tapping a reminder opens the session it is about: `url` on the web
notification, `indiafoss://activity/<id>` on the native alarm. Each alert
carries `tag` = its stable id, so re-arming replaces the previous one instead
of stacking a second copy, and the app icon so it is recognisable in the
shade.

`armNotifications()` recomputes this every minute for the next 90 minutes and
hands the result to the transport; ids are stable (`must-`, `soon-`, `leave-`,
`start-` + activity id) so re-arming replaces rather than duplicates.

## When the phone is in a pocket

On the web the timers only run while the page runs. A locked phone freezes
the page, so a timer set for 10:00 fires when the screen comes back on. Alerts
used to be dropped at that point as "in the past", which is what made
reminders look as if they never worked. Now an alert that fell due within
`graceMinutes` (20) is delivered the moment the page is visible again
(`catchUpLateAlerts()`): the latest late one per session, since a five-minute
late "starting now" says everything the "in 15 min" before it said; a "starting
now" stays useful `LATE_START_MINUTES` (10) into the session. The web
transport remembers what it has shown so a plan change, which re-arms
everything, never shows one twice. The layout re-arms on `visibilitychange`
so this happens at once, not at the next minute tick.

Only the Android app's alarms ring with the app closed. iPhone Safari tabs
have no Notification API at all; the installed (Home Screen) app does, and
the status text says so on iOS.

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
