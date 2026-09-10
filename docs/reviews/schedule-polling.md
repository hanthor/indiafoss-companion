# Foreground schedule polling (#213)

Both clients check once a minute from two hours before the published event starts until two hours after it ends, and every fifteen minutes outside that window. Offsets in the published timestamps determine the window. Polling uses the real clock, independent of the day simulator.

The web app stops timers while hidden or offline and checks again when visible/online, subject to the existing one-minute freshness gate. Android starts its loop when the Activity starts and stops it when the Activity stops. An already-running native refresh may finish, but no new background poll starts. Manual refresh and automatic native refresh share one in-flight job; web triggers share the existing update gate.

Web downloads have a twelve-second overall timeout, including the manifest and event asset. A revision already downloaded for attendee review is not downloaded again on each poll. Failed checks retry; the existing offline schedule remains available. Polling does not change the review interaction: the web attendee still applies visible schedule changes, and Android retains its automatic application and change banner.

Validation covers event-window boundaries with timezone offsets, retry after failure, stopping during an in-flight check, and a browser remaining on the same schedule while the poll runs, pauses, and resumes. Android core policy tests and the existing native screenshot/emulator gates cover the native build and startup path. No background execution or delivery guarantee is implied for a suspended app.
