# C-01 — A schedule change published during the day actually reaches the attendee

- Status: Partially implemented; per-event freshness and status remain in #189
- Repository: indiafoss-companion
- Tracks: [#189](https://github.com/hanthor/indiafoss-companion/issues/189)
- Size: S

## Current implementation and remaining work

`UpdateGate` replaced the permanent latch. Launch/reconnect/foreground/manual
triggers, foreground polling and a 12-second manifest-plus-bundle timeout are
implemented. The historical reproduction below should not be implemented again.

The next patch should key freshness by event, show the last successful check,
report HTTP/asset failures consistently, and make Settings read the active
event's revision instead of `DEFAULT_EVENT_ID`. Extend the existing gate and
browser tests, including an offline-to-online update without reload that retains
notes and custom blocks as well as bookmarks and ratings. Keep data adoption in
C-02: its atomic web implementation shipped in PR #235. See #189 for current
review evidence and acceptance; it remains open.

## Why this matters

An attendee opens the app on the venue Wi-Fi before the first talk. The check
fails because the network is not up yet. For the rest of the day the app never
checks again — not on reconnect, not on manual refresh, not when they return
from another app. A room change published at 11am is never seen. The same latch
also fires on success: one successful morning check disables every later check
in the same session.

This is the conference-day promise failing quietly, which is worse than failing
loudly.

## Context you need

The whole defect is in
[`apps/web/src/lib/updates.svelte.ts`](../../apps/web/src/lib/updates.svelte.ts).
A module-level flag guards the entry point:

```ts
let checked = false;

export async function checkForUpdates(eventId: string): Promise<void> {
  if (checked || eventState.status !== 'ready' || !eventState.bundle) return;
  checked = true;
  updateState.checking = true;
  try {
    // …fetch manifest, maybe fetch bundle…
  } catch (error) {
    updateState.error = error instanceof Error ? error.message : String(error);
  } finally {
    updateState.checking = false;
  }
}
```

`checked` is set to `true` _before_ the fetch and is never reset — not in
`catch`, not in `finally`. So:

- an initial offline rejection permanently disables checking until the module
  reloads (a full page reload, not a navigation);
- a successful check also permanently disables later checks in the session;
- there is no reconnect or foreground path that bypasses it.

The review reproduced this with the real functions and mocked fetch/storage:
calling `checkForUpdates` twice after an offline rejection produced only one
fetch. See `docs/architecture/review-2026-09-07.md`, finding 2.

The architecture states the intended behaviour
(`docs/architecture/system.md`, "Offline conference data and personal state"):

> Check on launch, foreground return, reconnect and manual refresh, with
> bounded fetch timeouts, freshness limits and retry backoff. Background
> refresh is opportunistic. Display the actual locally stored revision/time and
> make offline operation useful.

Two distinct pieces of state are being conflated. Separate them:

- **a request in flight** — prevents two overlapping fetches; cleared in
  `finally`, always;
- **the last successful check** — a timestamp, used for a freshness limit so
  four triggers in ten seconds do not become four fetches.

## What to do

1. In `apps/web/src/lib/updates.svelte.ts`, replace `let checked = false` with
   an in-flight guard and a last-success timestamp. Suggested shape:

   ```ts
   let inFlight: Promise<void> | null = null;
   let lastSuccessAt = 0;
   const FRESHNESS_MS = 60_000;
   ```

   Return the existing promise when a check is already running, so concurrent
   triggers coalesce instead of racing. Clear `inFlight` in `finally`.

2. Add a `force` option (`checkForUpdates(eventId, { force: true })`) that
   skips the freshness limit. Manual refresh uses it; automatic triggers do
   not.

3. Record `lastSuccessAt` only on a genuinely successful manifest fetch — not
   when the request throws, and not when the response is not `ok`. A failed
   check must leave the app willing to try again immediately.

4. Surface the failure. `updateState.error` is already set in `catch`, but it
   is never cleared on a later success — clear it at the start of a successful
   apply so a stale morning error does not sit on screen all day.

5. Add the reconnect and foreground triggers. In the layout
   (`apps/web/src/routes/+layout.svelte`), call `checkForUpdates` on the
   `online` event and on `visibilitychange` when the document becomes visible.
   Keep these unforced so the freshness limit still applies.

6. Add a manual refresh affordance wherever the update status is shown, calling
   with `{ force: true }`.

7. Tests in `apps/web/src/lib/updates.test.ts` (create it if absent), with
   `fetch` and storage mocked, following the co-located `*.test.ts` convention:
   - two calls after an offline rejection produce **two** fetches;
   - two calls inside the freshness window produce **one** fetch;
   - two calls spanning the freshness window produce two;
   - `{ force: true }` inside the window still fetches;
   - concurrent calls produce one fetch and both resolve;
   - a failing check leaves the previously stored bundle and revision intact.

## Acceptance

```bash
pnpm --filter @indiafoss/web test
just typecheck
just lint
```

All pass, and the new tests fail if you revert the `checked` change — verify
that by reverting locally before you finish. A test that passes against the
broken code is testing nothing.

Then the end-to-end scenario, which is the actual promise:

```bash
just offline-e2e
```

Manually, in a browser: load the app offline, restore connectivity, publish a
revision with a changed room, and confirm the change arrives **without a page
reload** and **without losing the personal plan**.

## Out of scope

- Do not change what happens _after_ a newer revision is found. The
  "valid data is dropped when the diff is empty" defect is real but belongs to
  **C-02**, and mixing the two makes both unreviewable.
- Do not add background sync or a service-worker periodic update. Background
  refresh is explicitly opportunistic and is not part of this task.
- Do not touch `EventRepository.kt` on Android — that is **C-03**.
- Do not adopt `collectEventManifestIssues` here yet; wiring the contract into
  the fetch path is **C-07**, and doing it inside this fix would hide the
  regression test.
