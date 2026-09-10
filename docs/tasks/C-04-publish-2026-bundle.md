# C-04 — Both clients open on the real IndiaFOSS 2026 schedule, not last year's fixture

> Status, 9 September 2026: Publication is implemented: both clients seed IndiaFOSS 2026; PRs #242/#243 demonstrated automatic import, full candidate CI, merge and deployment. Issues #239/#213 are closed. The remaining #191 work is event/venue rehearsal, not another 2026 cutover. Read the current event-sync implementation before using historical excerpts below.

- Status: Implemented. Persistent draft banner removed at the maintainer’s request; editorial source status is retained in data. See the [current event data](../../events/indiafoss-2026/README.md) and [verified nightly seed](../reviews/native-seed-2026-09-09.md).

The implementation narrative below records the original cutover problem; its 2025 defaults are historical, not the current client behaviour.

- Repository: indiafoss-companion
- Tracks: [#191](https://github.com/hanthor/indiafoss-companion/issues/191)
- Size: M
- Depends on: **C-01**, **C-02**, **C-03**, **C-07**

## Why this matters

An attendee installs the Companion for IndiaFOSS 2026, opens it, and sees the
2025 programme. Both clients default to the 2025 event id, so every talk, room
and time is a year out of date, presented with no indication that it is a
demonstration. That is worse than an empty app: it is confidently wrong, and it
is wrong offline, at the venue, when the attendee has no way to check.

The review put it directly: "Both current clients default to the 2025 fixture.
Keep demonstrations visibly labelled and require a validated 2026 bundle, room
mapping, room seeding, and consistent event identifiers before a conference
release."

## Context you need

### The event

The [official event page](https://fossunited.org/indiafoss/2026) lists
IndiaFOSS 2026 on **26 and 27 September 2026**.
[Workshops](https://www.fossunited.org/c/indiafoss/2026/workshops) are separate,
on **25 September**. The architecture is explicit that the workshop day is not
part of the main two days and that both must be represented correctly.

`docs/architecture/system.md`, "IndiaFOSS 2026 identity and interface":

> The [official event](https://fossunited.org/indiafoss/2026) lists 26–27
> September; [workshops](https://www.fossunited.org/c/indiafoss/2026/workshops)
> are separate on 25 September. Include the right date/context in icons where
> applicable, landing pages, QR posters, onboarding, schedule, room directory
> and release screenshots. **Verify the published schedule independently of its
> planned publication date.**

That last sentence is a requirement, not a caveat. A schedule appearing at the
URL on a date the organisers once announced is not evidence that it is the
final schedule. Check the content.

And from "Offline conference data and personal state":

> Use the real 2026 bundle when published; **never relabel a 2025 fixture as
> current data.**

### The pipeline, as it actually exists

Three tools, all real and all working today.

`packages/sources/src/fossunited/` is the live source. `FossUnitedSource`
posts form-encoded requests to `https://fossunited.org` (see
`FOSSU_BASE_URL` in `packages/sources/src/fossunited/index.ts`), fetches the
event document, the proposal list, the schedule, and then the linked proposal
detail pages in batches of eight. `normalize.ts` turns that into an
`EventBundle`. `FixtureSource` reads the committed raw captures instead.

`tools/event-sync/src/index.ts` is the publisher. Its usage text:

```
  event-sync sync <event-id> [--source fixture|live]
      Fetch -> normalize -> validate -> write versioned assets, diff against
      the previous revision, and refresh the manifest.
  event-sync publish <event-id>
      Copy the latest revision into the web app's static assets so the PWA
      can serve it (also done by the web app's prebuild).
```

`syncEvent` resolves the locator through `publicEventRoute`, which maps
`indiafoss-2026` to `c/indiafoss/2026` (there is a test for exactly that in
`tools/event-sync/src/index.test.ts`). It merges `events/<id>/booths.json` and
`events/<id>/messaging.json` when present, runs `isValidEventBundle`, prints
`collectBundleWarnings`, hashes the bundle, refuses to bump the revision when
the content hash is unchanged, writes the hash-addressed assets
(`event.<hash>.json`, `schedule.<hash>.json`, `people.<hash>.json`,
`booths.<hash>.json`), writes `changes.<revision>.json` and
`diff.<prev>-<next>.json` from `diffBundles`, and rewrites `manifest.json`.

`tools/fixture-recorder/src/index.ts` has `capture-details`, `normalize` and
`verify`. `capture-details` writes `events/<id>/raw/proposal-details.json` from
the live site; `normalize` writes `events/<id>/normalized/event-bundle.json`;
`verify` loads and validates.

`just verify-assets` is what CI runs:

```make
verify-assets:
    pnpm --filter @indiafoss/fixture-recorder exec tsx src/index.ts verify indiafoss-2025
    pnpm --filter @indiafoss/venue-validator exec tsx src/index.ts "$PWD/events" synthetic
    pnpm --filter @indiafoss/venue-validator exec tsx src/index.ts "$PWD/events" indiafoss-2026
```

Note the asymmetry: the venue validator already knows about 2026; the bundle
verifier only checks 2025.

### What exists under `events/` today

```
events/indiafoss-2025/  README.md booths.json messaging.json provenance.json
                        raw/{event,schedule,proposals,proposal-details}.json
                        raw/booths.html
                        normalized/event-bundle.json
                        published/{manifest.json, event.*.json, schedule.*.json,
                                   people.*.json, booths.*.json,
                                   changes.{1,2,3}.json, diff.*.json}
events/indiafoss-2026/  raw/README.md
                        raw/venue-both-floor-plan.svg
                        raw/venue-presentation-map.svg
                        venue/{venue.svg, venue.graph.json, venue.metadata.json,
                               provenance.json, validation-report.md, README.md}
events/synthetic/venue/ …
```

So 2026 has **venue assets only**. There is no raw schedule capture, no
normalized bundle, no published directory, no `booths.json`, no
`messaging.json`, and no `provenance.json` at the event level. The venue
metadata already names the rooms the venue will use (`hall-1`, `hall-2`,
`hall-3`, `room-1` and others across a ground and a first floor), which is what
the bundle's `locationId` values must match.

### Every place 2025 is currently hardcoded

Verified by reading each file:

- `apps/web/src/lib/event.svelte.ts` line 5:
  `export const DEFAULT_EVENT_ID = 'indiafoss-2025';` — lines 7 and 8 derive
  `EVENT_BUNDLE_URL` and `EVENT_MANIFEST_URL` from it, and `loadEvent` defaults
  to it, so the constant is the single web-side switch.
- `apps/android/native/.../data/EventRepository.kt` line 78:
  `const val DEFAULT_EVENT_ID = "indiafoss-2025"`. Every URL in that class is
  built as `"$baseUrl/events/$eventId/…"`, so the constant is the single
  Android-side switch.
- `apps/web/scripts/sync-assets.mjs`, run as the web app's `prebuild`. It has
  `indiafoss-2025` hardcoded twice: once in the `assets` list, copying
  `events/indiafoss-2025/normalized/event-bundle.json` into
  `apps/web/static/events/indiafoss-2025/`, and once in the block below it that
  copies `events/indiafoss-2025/published/manifest.json` and its hash-addressed
  event asset alongside. The venue entries in that same list already point at
  `events/indiafoss-2026/venue/`.
- `Justfile`, the `verify-assets` recipe: verifies `indiafoss-2025` only.
- `Justfile`, the `simulate` recipe: `day="2025-09-20"`.
- `apps/web/src/lib/components/FloorPlan.svelte` line 41 falls back to
  `'indiafoss-2025'` when there is no bundle.
- `apps/web/src/lib/clock.ts` line 7 uses a 2025 example in a comment.

### The dependencies, and why they are dependencies

- **C-01** fixes the update latch. Publishing a real bundle behind a client
  that checks once per session and then stops means a day-of schedule change
  never lands.
- **C-02** makes valid data persist even when the diff is empty, and detects
  reinstatement. Shipping real data through a path that silently drops
  revisions is shipping a known bug at the worst moment.
- **C-03** makes the Android cache write atomic, so the first real bundle
  cannot be truncated into an app with no schedule.
- **C-07** makes `event-sync` use the owned `EventManifest` type from
  `packages/model/src/contracts/` instead of its local interface. The manifest
  you publish here is the first one attendees depend on; it should be produced
  through the contract, not a duplicate declaration.

## What to do

The organisers published a draft on 8 September. The maintainer has authorised using that draft with a visible status label; final confirmation is not a cutover prerequisite.

1. Create `events/indiafoss-2026/` alongside the venue directory it already
   has: a `README.md` describing the capture, and `provenance.json` in the same
   shape as `events/indiafoss-2025/provenance.json`, recording where the data
   came from and when.

2. Make the pipeline event-agnostic where it is cheap to do so. Parameterise
   `apps/web/scripts/sync-assets.mjs` on an event id (a constant at the top, or
   an argument with a default) instead of two hardcoded `indiafoss-2025`
   strings, and add an `indiafoss-2026` line to the `verify-assets` recipe.
   Keep the 2025 lines: the 2025 fixture stays in the repository as a fixture
   and its verification must keep running.

3. Add a "this is a demonstration" label to the UI that appears whenever the
   loaded bundle is not the current event. Do not make it a debug-only flag.
   The architecture requires demonstrations to stay visibly labelled, and the
   2025 data will still be reachable after this task lands. The label must be
   visible on the schedule and plan surfaces, not only on a settings screen.
   Ship it with a test asserting that it renders when the loaded bundle is not
   the current event, and does not render when it is.

4. Write the acceptance tests for the 2026 bundle before the data exists, so
   the data is checked the moment it arrives. Assert against the bundle at
   `events/indiafoss-2026/normalized/event-bundle.json`:
   - every activity's `start` and `end` falls on 2026-09-26 or 2026-09-27, or,
     for workshop activities, 2026-09-25, and each is in the event timezone;
   - every activity's `locationId` resolves to a location in the bundle **and**
     to a key in `events/indiafoss-2026/venue/venue.metadata.json`;
   - activity ids are unique and stable;
   - `isValidEventBundle` passes and `collectBundleWarnings` is reviewed and documented. Preserve real duplicate opening/lunch rows across different rooms. Invalid end-before-start entries retain a timing note and cannot enter the planner.

5. **Draft now published.** Capture the real data:

   ```bash
   pnpm --filter @indiafoss/fixture-recorder exec tsx src/index.ts capture-details indiafoss-2026
   pnpm --filter @indiafoss/event-sync exec tsx src/index.ts sync indiafoss-2026 --source live
   ```

   Commit the raw capture under `events/indiafoss-2026/raw/` so the bundle is
   reproducible from committed inputs. Then **verify the content against the
   organisers, not against the URL**. Confirm the day count, the two main days
   plus the separate workshop day, the room names, and that the schedule is the
   draft status and any source inconsistencies. Record provenance without inventing organiser confirmation. Per the maintainer’s 8 September instruction, publish the current draft with a visible draft label; do not present it as final.

6. **Needs step 5.** Flip the defaults, in one change, once the bundle passes:
   `DEFAULT_EVENT_ID` in `apps/web/src/lib/event.svelte.ts`, `DEFAULT_EVENT_ID`
   in `EventRepository.kt`, the `sync-assets.mjs` event id, the `FloorPlan.svelte`
   fallback, and the `simulate` recipe's default day (to a 2026 date). Run
   `event-sync publish indiafoss-2026` and confirm the static assets under
   `apps/web/static/events/indiafoss-2026/` contain the manifest and the
   hash-addressed event asset.

7. Under no circumstances copy the 2025 bundle to `events/indiafoss-2026/` and
   edit the dates. If the real schedule is unavailable at release time, ship
   with the 2025 fixture still explicitly labelled as a demonstration, per
   step 3, and record that decision on #191.

## Acceptance

```bash
just verify-assets
just check
just offline-e2e
```

All pass, with `verify-assets` now verifying `indiafoss-2026` as well as
`indiafoss-2025`.

Negative cases, which are what this task is actually about:

- Introduce an activity with a 2025 date into the 2026 bundle and confirm the
  step 4 test fails.
- Introduce an activity whose `locationId` is absent from
  `events/indiafoss-2026/venue/venue.metadata.json` and confirm the test fails.
- Revert the demonstration label and confirm a test asserting its presence
  fails when a non-current bundle is loaded.

Observable outcome: a fresh browser profile loads the app offline and sees
IndiaFOSS 2026 sessions on 26 and 27 September, in the correct rooms, with no
demonstration label. Loading the 2025 event id shows the same UI **with** the
label. On Android, a fresh install with no network shows the 2026 schedule.

If step 5 has not happened, say so in the pull request. "The pipeline is ready
and the organisers have not published" is an honest state; a merged patch with
placeholder data is not.

## Out of scope

- The canonical room directory, its alias resolution and its validation are
  **C-06**, which depends on this task. Publish the bundle's `locations`; do
  not publish a `ConferenceDirectory` here.
- Seeding Matrix rooms and rehearsing the venue network is **C-14**.
- The update-check latch is **C-01**; empty-diff persistence and reinstatement
  are **C-02**; the Android atomic cache write is **C-03**. Do not fix any of
  them inside this change. If one of them has not landed, wait rather than
  inlining it.
- Adopting the owned `EventManifest` contract inside `event-sync` is **C-07**.
- Branding, icons and event artwork are tracked on
  [#33](https://github.com/hanthor/indiafoss-companion/issues/33). The only
  visual work in this task is the demonstration label in step 3.
- Do not delete `events/indiafoss-2025/`. It is the fixture the recorded tests
  and the day simulator run against, and the review's whole point is that a
  fixture must stay identifiable as a fixture.
