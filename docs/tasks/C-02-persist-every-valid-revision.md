# C-02 — A reinstated talk stops showing as cancelled, and valid data is never dropped

- Status: Ready
- Repository: indiafoss-companion
- Tracks: [#190](https://github.com/hanthor/indiafoss-companion/issues/190)
- Size: S

## Why this matters

An organiser cancels a talk in the morning and reinstates it at noon. The
attendee's app fetches the new revision, computes an empty diff, decides no
banner is needed, and then records that revision as handled **without saving
the bundle**. The talk stays cancelled on the attendee's phone forever, and
because the revision number is now stored, no later check will ever fix it.

The same branch silently discards every update that is real but not
notification-worthy: a corrected venue name, a new booth, changed event
metadata. "No banner needed" currently means "do not apply the data".

## Context you need

There are two separate defects, one in each of two files. Both are quoted here
in full so you do not have to go looking.

### Defect one: the diff is one-directional

`packages/schedule/src/index.ts` declares the change vocabulary at line 224:

```ts
export type ScheduleChangeType =
  | 'added'
  | 'cancelled'
  | 'time-changed'
  | 'room-changed'
  | 'title-changed'
  | 'speaker-changed'
  | 'recording-added';

export interface ScheduleChange {
  activityId: string;
  title: string;
  type: ScheduleChangeType;
  detail?: string;
}
```

`diffBundles` at line 245 compares activities by stable id. The relevant line
is 255:

```ts
export function diffBundles(prev: EventBundle, next: EventBundle): ScheduleChange[] {
  const changes: ScheduleChange[] = [];
  const prevById = new Map(prev.activities.map((a) => [a.id, a]));

  for (const a of next.activities) {
    const old = prevById.get(a.id);
    if (!old) {
      changes.push({ activityId: a.id, title: a.title, type: 'added' });
      continue;
    }
    if (a.cancelled && !old.cancelled) {
      changes.push({ activityId: a.id, title: a.title, type: 'cancelled' });
    }
    // …time / room / title / speaker / recording comparisons…
  }
  // …activities absent from `next` are reported as 'cancelled'…
  return changes;
}
```

`a.cancelled && !old.cancelled` fires only in the false→true direction. The
true→false direction, a reinstatement, produces nothing. If every other field
on that activity is unchanged, `diffBundles` returns `[]` for a revision that
genuinely changed the day.

### Defect two: an empty diff means "throw the data away"

`apps/web/src/lib/updates.svelte.ts`, lines 71-77, inside `checkForUpdates`:

```ts
const next = (await bundleRes.json()) as EventBundle;
const changes = diffBundles(eventState.bundle, next);
if (changes.length === 0) {
  // A no-op revision (metadata only) must not nag: remember it as applied.
  await recordRevision(eventId, manifest.revision);
  return;
}
pendingBundle = next;
```

`next` is a fully downloaded, parsed bundle. On the empty-diff path it is
discarded and only the revision number is written. The guard earlier in the
function, at line 63, then prevents any recovery:

```ts
const local = await storedRevision(eventId);
if (!manifest.revision || (local !== null && manifest.revision <= local)) return;
```

The stored revision now equals the published revision, so the newer data is
never fetched again. Applying an update is only reachable through
`applyUpdate`, which requires `updateState.available`:

```ts
export async function applyUpdate(eventId: string): Promise<void> {
  if (!updateState.available) return;
  let next = pendingBundle;
  // …
  pendingBundle = null;
  await getStorage().saveEventBundle(next);
  await recordRevision(eventId, updateState.revision ?? undefined);
  eventState.bundle = next;
  updateState.available = false;
  updateState.changes = [];
  updateState.summary = {};
}
```

So the write path exists and is correct. It is simply not reached when the diff
is empty.

### What the architecture requires

`docs/architecture/system.md`, "Offline conference data and personal state":

> Maintain one atomically accepted bundle/revision per event, a pending
> candidate, and last-check/error metadata. Validate and persist a candidate
> before advertising success. Keep the last good version after storage/network
> failures. Session cancellations and reinstatements both produce correct plan
> changes.

The review (`docs/architecture/review-2026-09-07.md`, finding 3) reproduced
this one:

> If a cancelled talk is reinstated with otherwise unchanged fields, the diff
> is empty. The update code then records the new revision without saving the
> new bundle. The attendee retains a cancelled talk while the app records that
> revision as handled.

### One thing to know before you edit

`diffBundles` and `summarizeChanges` have a second consumer. `event-sync`
imports them and writes their output into the published diff files:

```ts
import { diffBundles, summarizeChanges } from '@indiafoss/schedule';
```

`tools/event-sync/src/index.ts` writes `changes.<revision>.json` and
`diff.<prev>-<next>.json` from that result. Adding a new change type therefore
makes a new value appear in those published files. That is expected and
correct, not a regression. Do not add a second diff implementation to avoid it.

## What to do

1. In `packages/schedule/src/index.ts`, add `'reinstated'` to
   `ScheduleChangeType`, and in `diffBundles` emit it for the true→false
   direction next to the existing cancellation check:

   ```ts
   if (a.cancelled && !old.cancelled) {
     changes.push({ activityId: a.id, title: a.title, type: 'cancelled' });
   } else if (!a.cancelled && old.cancelled) {
     changes.push({ activityId: a.id, title: a.title, type: 'reinstated' });
   }
   ```

   Keep the existing "present in `prev`, absent from `next`" loop as
   `'cancelled'`. It is correct.

2. Wherever a `ScheduleChangeType` is rendered as human text or an icon in
   `apps/web/src/`, add the reinstated case. Search for the existing
   `'recording-added'` string to find every switch or lookup table that needs
   it. A change type with no label must not render as an empty row.

3. In `apps/web/src/lib/updates.svelte.ts`, make persistence independent of
   notification. Replace the empty-diff early return with a silent apply:

   ```ts
   const changes = diffBundles(eventState.bundle, next);
   if (changes.length === 0) {
     // Valid new data is applied whether or not it deserves a banner.
     await getStorage().saveEventBundle(next);
     eventState.bundle = next;
     await recordRevision(eventId, manifest.revision);
     return;
   }
   ```

   The order matters: persist the bundle first, update the in-memory state,
   and record the revision **last**. If `saveEventBundle` throws, the revision
   must not be recorded, so the next check retries rather than skipping the
   revision forever.

4. Do not silently apply a bundle you have not validated. Before saving,
   confirm the parsed object is a usable bundle for this event (at minimum:
   the `id` matches `eventId` and `activities` is an array). On failure, leave
   the stored bundle and the stored revision untouched and set
   `updateState.error`. A malformed download must never evict a good bundle.

5. Leave the non-empty-diff path alone. A diff with changes still parks the
   bundle in `pendingBundle` and waits for the attendee to press apply. That
   consent step is deliberate; this task does not remove it.

6. Tests in `packages/schedule/src/index.test.ts`:
   - cancelled→not cancelled with all other fields equal yields exactly one
     `'reinstated'` change;
   - not cancelled→cancelled still yields `'cancelled'`;
   - an activity removed from `next` still yields `'cancelled'`;
   - `summarizeChanges` counts the new type.

7. Tests in `apps/web/src/lib/updates.test.ts`, with `fetch` and storage mocked.
   **C-01 creates this file**; if it has already landed, extend it rather than
   replacing it, and if it has not, create it following the co-located
   `*.test.ts` convention:
   - a metadata-only revision (empty diff) results in `saveEventBundle` being
     called with the new bundle **and** the revision recorded;
   - after that, a reload reading from storage sees the new bundle;
   - a reinstatement produces a non-empty diff and the normal banner path;
   - a revision whose bundle fails validation leaves both the stored bundle
     and the stored revision unchanged;
   - if `saveEventBundle` rejects, the revision is not recorded.

## Acceptance

```bash
pnpm --filter @indiafoss/schedule test
pnpm --filter @indiafoss/web test
just typecheck
just lint
just check
```

All pass. Then the negative case, which is the point of the exercise: revert
your change to `diffBundles` locally and confirm the reinstatement test fails;
revert the `updates.svelte.ts` change and confirm the metadata-only test fails.
A test that passes against the broken code is testing nothing. Restore both
before you finish.

Then the observable outcome, by hand in a browser: load the app, publish a
revision that only flips `cancelled` from `true` to `false` on one activity,
let the check run, and confirm the talk is no longer struck through **and**
survives a full page reload. Repeat with a revision that only edits event
metadata: no banner appears, and the new metadata is present after a reload.

## Out of scope

- **When** the check runs, the `checked` latch, reconnect and foreground
  triggers, and the freshness limit all belong to **C-01**. This task assumes
  a check happens and fixes only what the check does with the result. Do not
  touch the latch here; C-01 needs it intact to write its regression test.
- The Android cached-bundle write is **C-03**. `EventRepository.kt` has its own
  version of "keep the last good copy" and is fixed separately.
- Validating the fetched manifest with the owned `EventManifest` contract from
  `packages/model/src/contracts/` is **C-07**. Use a minimal inline check in
  step 4; wiring the contract into the fetch path here would entangle two
  reviews.
- Do not change the consent step for notification-worthy updates, and do not
  redesign the update banner. Publishing the real 2026 data is **C-04**.
