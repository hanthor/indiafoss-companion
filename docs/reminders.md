# Reminders and must-attend

Reminders are local notifications (§37): the Notification API and timers on
the web, native `AlarmManager` scheduling
(`apps/android/native/app/src/main/kotlin/org/indiafoss/companion/reminders/`)
on Android. Nothing leaves the device and there is no push service. They are
off until the attendee switches them on in Settings.

## Tiers

`computeNotifications()` in `apps/web/src/lib/notifications.ts` is pure and
takes a `tierFor(activityId)` callback:

| Tier          | Who                         | Alerts                                                                                     |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `must-attend` | disposition "★ Must attend" | heads-up 30 min before, starting soon (15 min), "time to head over" (10 min), at the start |
| `planned`     | bookmarked sessions         | starting soon, leave now                                                                   |
| `none`        | everything else             | silent                                                                                     |

## What an alert says

A reminder that does not say where to go is only half a reminder, so every
alert names the session in the **title** and the room, the walk and the start
time in the **body**:

| When                | Title                                 | Body                                                   |
| ------------------- | ------------------------------------- | ------------------------------------------------------ |
| must-attend, 30 min | `In 30 min: First Step into Open So…` | `Must attend · 10:15 in Devroom 1 (AOSP) · 4 min walk` |
| starting soon       | `In 15 min: <session>`                | `10:15 in Devroom 1 (AOSP) · 4 min walk`               |
| leave now           | `Leave now: <session>`                | `4 min walk to Devroom 1 (AOSP) · starts 10:15`        |
| at the start        | `Starting now: <session>`             | `Devroom 1 (AOSP) · you marked it must attend`         |
| your own block      | `In 10 min: <label>`                  | `On your plan · Food Area · starts 13:00`              |

The session goes in the title because a shade with three reminders in it must
be readable without opening any of them; five identical "Starting soon" rows
are not. Titles longer than `MAX_NOTIFICATION_TITLE` (56) are trimmed on a
word boundary so the time cue at the front survives.

The walk comes from the venue graph and only appears when the attendee has
said where they are; with no location the alert leaves it out rather than
inventing an estimate, while the leave-by time still allows a default five
minutes.

**Near-duplicates are merged.** For a room a couple of minutes away,
"starting soon" (15 min before) and "leave now" land within
`MERGE_WINDOW_MINUTES` (5) of each other and say almost the same thing, so
only the leave-now alert fires — it carries the walk and the start time, so it
says strictly more. On the 2025 day-one walk-through this took a must-attend
session from four alerts to three, and a bookmarked one from two to one.

Tapping a reminder opens the session it is about: `url` on the web
notification, `indiafoss://activity/<id>` on the native alarm. Each alert
carries `tag` = its stable id, so re-arming replaces the previous one instead
of stacking a second copy, and the app icon so it is recognisable in the
shade.

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
