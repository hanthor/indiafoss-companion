# The day simulator

Issue #93 asked for a way to step through a whole conference day as if it
were happening, at 100× or so, and see every prompt and reminder an attendee
would get, by hand or driven by Playwright so an agent can judge the UX.

## What it is

`RunningClock` (`packages/schedule`) starts at one instant of the event and
advances at a multiple of real time, keeping the event's UTC offset so every
screen formats time as it would on the day. `apps/web/src/lib/simulator.svelte.ts`
holds the run in `sessionStorage` (it survives navigation and a reload of
the tab, ends with the tab), and `appClock()` is what the Now screen, the map,
the leave-by banner and the reminder scheduler all read. Nothing about the
attendee's own data changes: bookmarks, must-attend marks, ratings and
contacts are the real ones.

Reminders run on the simulated clock: `WebLocalNotificationTransport` takes
a clock and divides delays by the speed, so a reminder due in 15 simulated
minutes fires in 15 real seconds at 60×. Android's alarm transport is never
used during a run (an alarm set for a simulated instant would ring at the
wrong real time). Everything that happens is logged with its simulated time:
reminders (`notification`), the banner changing (`banner`), screens visited
(`screen`), and the run's own start/pause/stop.

## Starting one

- **Settings → Simulate the day**: pick the day, a start time and a speed
  (10×, 60×, 100×, 600×), Start. The strip under the app bar shows the
  simulated time, the speed, Pause/Stop and the latest thing that happened;
  Settings shows the full log while the run is on.
- **From a URL**: `/now?now=2025-09-20T09:00:00+05:30&speed=100`. The plain
  `?now=` (no `speed`) is still the fixed developer clock the E2E tests use.
- **Automation**: `window.__indiafossSim` exposes `state()`, `log()`,
  `start(iso, speed)`, `pause()`, `resume()` and `stop()`.

## Driving it

```
pnpm --filter @indiafoss/web build
pnpm --filter @indiafoss/web simulate                 # day one, 09:00–18:30, 600×
pnpm --filter @indiafoss/web simulate -- --day 2025-09-21 --from 08:30 --speed 300 --must act-abc,act-def
```

`scripts/simulate.mjs` marks the given sessions must attend (default: the
10:15 talk on day one), switches reminders on, starts the run and cycles the
main screens until the day is over, then prints the timeline and writes
`apps/web/simulation-report.json` for an agent to read.

`tests/simulate.spec.ts` is the CI gate: at 600× from 09:40 with a 10:15
must-attend session, the log must contain the 30-minute heads-up, "leave
now", "starting soon" and "starting now" at their simulated times, and the
banner counting down; a run must survive navigation and a reload, and Stop
must end it.

## Limits

Only local reminders and in-app prompts are simulated. The Android alarm
path, the mesh chat and anything on a server are outside the run.
