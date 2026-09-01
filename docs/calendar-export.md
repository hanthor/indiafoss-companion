# Calendar export: ICS compatibility and privacy

The app puts an attendee's selected talks and full itinerary into their existing
calendar without any account, sync service, or system calendar-provider
integration (§14). Everything is generated on-device in
`packages/schedule/src/calendar.ts`.

## What can be exported

- **A single activity** — `activityToIcs`.
- **The full event** — `eventToIcs` (one VEVENT per timed activity).
- **The selected itinerary** — `itineraryToIcs`, including manual custom/
  flexible blocks as labelled entries.

The PWA offers a download plus the Web Share / open-with-calendar flow
(`shareCalendarFile`, falling back to a `.vcf`/`.ics` download). A future native
Material 3 Android client may additionally offer permission-gated
`CalendarContract` batch insertion; the core flow never requires it.

## RFC 5545 decisions

- **VERSION:2.0**, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`.
- **Explicit VTIMEZONE for `Asia/Kolkata`** (+05:30, `IST`). Times are emitted
  as `DTSTART;TZID=Asia/Kolkata:YYYYMMDDTHHMMSS`, preserving the exact
  wall-clock timestamps instead of converting to UTC.
- **Stable UID = `<activityId>@<eventId>.indiafoss`.** Repeated exports of the
  same activity produce the same UID, so a re-import updates rather than
  duplicates the event. Flexible/custom blocks get an index-suffixed id because
  they are not stable schedule entities.
- **Line folding** at 75 octets on UTF-8 boundaries, so long titles/descriptions
  and non-Latin text import cleanly.
- **Escaping** of `\`, `;`, `,`, and newlines per spec.
- **Rich DESCRIPTION**: the activity summary followed by `Speakers: …` and any
  `Recording:` / `Slides:` / `Livestream:` links. Speakers and media are carried
  in DESCRIPTION rather than ATTENDEE/ATTACH for the widest importer support.
- **CATEGORIES** from the activity type and tags (or `flexible`).
- **URL** points at the canonical source (CFP) URL, falling back to recording or
  slides.
- **STATUS:CANCELLED** is emitted for cancelled activities.

## Alarms (no push services)

- `includeAlarm` adds a **starting-soon** `VALARM` (`alarmMinutesBefore`,
  default 15).
- `leaveByMinutesBefore` adds a second, distinct **leave-now** `VALARM` when it
  differs from the starting-soon trigger. The Plan export uses a 10-minute
  starting-soon and a 25-minute leave-by alarm.
- Alarms are local `VALARM` blocks handled by the attendee's own calendar app;
  no FCM/Google Play Services or other push dependency is involved, so the
  F-Droid/core flow works unchanged.

## Privacy

The export is generated locally and only ever leaves the device through the
attendee's explicit download or share action. No itinerary data is uploaded.

## Tests

`packages/schedule/src/calendar.test.ts` covers the VCALENDAR/VTIMEZONE
structure, RFC escaping and folding, alarms (including the distinct leave-by
alarm), speakers and recording/slides in the description, full-event and
itinerary export with flexible items, and stable UIDs across repeated exports.
