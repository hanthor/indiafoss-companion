# Event-day runbook

What to do when something breaks while attendees are on the floor. The rest
of the docs describe how the system works when it works; this one assumes it
is 09:00 on day one, a hall is filling up, and something is wrong.

Two properties shape every decision here:

- **The apps are offline-first.** A broken backend does not break the app in
  an attendee's pocket. They keep the last published programme, and the
  freshness indicator says so honestly. Nothing here is a total outage.
- **Nothing recovers itself.** Every automated path below opens a tracking
  issue on failure and then waits. There is no retry that fixes it for you.

So the question on the day is never "is the app down" — it is "how stale is
what attendees are holding, and is a change inside the next few hours
missing from it".

## Triage order

1. **Is the published programme current?** Compare
   `events/indiafoss-2026/published/manifest.json` (`revision`,
   `generatedAt`) against the live source's `sourceUpdatedAt`. This is the
   only failure that can show attendees the wrong room or a missing talk.
2. **Is the PWA serving that revision?** `pages.yml` deploys on push to
   `main`. A merged programme that was never deployed is just as stale from
   the attendee's side.
3. **Everything else.** Chat, mesh, nightly APK builds. Degraded, not
   load-bearing for "which talk, which room, when".

## The schedule import is stuck

Symptom: an open issue titled **Schedule sync is failing**, gaining a comment
every hour. Each comment names the run.

`schedule-sync.yml` runs hourly at :17 and has three jobs. `prepare` imports
from the live FOSS United APIs and opens a data-only candidate PR.
`publish` waits for the checks `main` requires, then merges it and dispatches
`pages.yml` and `nightly.yml`. `report` opens or closes the tracking issue.

The failure mode that matters is `prepare` succeeding while `publish` fails:
a candidate PR exists, is tested, and is not merged. Attendees keep the
previous revision indefinitely. The tracking issue is the only signal —
the app itself looks fine.

### Decide first: does the stranded change matter today?

Find the candidate PR (branch `automation/schedule-*`) and read its
`changes.<n>.json`. It carries a `summary` with counts and a `changes` array:

```bash
gh pr diff <pr> --repo hanthor/indiafoss-companion --name-only
gh api "repos/hanthor/indiafoss-companion/contents/events/indiafoss-2026/published/changes.<n>.json?ref=<branch>" \
  --jq '.content' | base64 -d | jq -r '.summary, (.changes[] | "\(.kind) :: \(.title)")'
```

A speaker-bio edit to a talk on day two can wait for the fix. An added or
moved session inside the next few hours cannot — that is the case where
attendees walk to the wrong place, and it justifies the manual merge below.

### Get the revision out

The candidate has already passed the full CI on its own head commit, so
merging it by hand publishes tested data, not a shortcut around the gate.
Confirm that before merging:

```bash
gh pr checks <pr> --repo hanthor/indiafoss-companion
```

Then merge it. If the required contexts are green on the head SHA but the
merge is still refused, the checks have not registered on the PR itself and
an admin merge is the correct call — the validation ran, GitHub is just not
attributing it. After merging, do what the `publish` job would have done,
because a bot-authored push starts no workflows:

```bash
gh workflow run pages.yml --ref main
gh workflow run nightly.yml --ref main
```

Watch `pages.yml` to completion. Until it finishes, the merge has changed
nothing for anyone holding the app.

### If the import itself is failing

When `prepare` is the job that fails, the candidate never existed and there
is nothing to merge. Reproduce locally — the same two commands the workflow
runs:

```bash
pnpm --filter @indiafoss/event-sync exec tsx src/index.ts sync indiafoss-2026 --source live
pnpm --filter @indiafoss/event-sync exec tsx src/index.ts publish indiafoss-2026
```

`sync` fetches and reconciles; `publish` copies the result to what the apps
serve. Run them in that order. If they succeed locally, the fault is in the
workflow or its token, not the data, and the output is a normal PR. If
`sync` fails against `--source live`, the upstream API is the problem:
substitute `--source fixture` to confirm the pipeline is otherwise intact,
and hold the last good revision rather than publishing a partial import.

Never hand-edit files under `events/indiafoss-2026/published/`. The manifest
names content-addressed assets and a mismatch is worse than stale data: the
apps will reject the bundle rather than fall back.

## The PWA is not serving the current revision

`pages.yml` on push to `main`, `concurrency: pages` with
`cancel-in-progress: true`. Two consequences worth knowing at 09:00:

- A rapid second push cancels the first deployment. The merge succeeded and
  the deploy did not. Re-dispatch: `gh workflow run pages.yml --ref main`.
- Bot-authored pushes do not trigger it at all, which is why the merge steps
  above dispatch it explicitly.

Verify from outside, not from the Actions tab — check that the deployed
`manifest.json` reports the revision you expect, and load the app in a
private window so a service worker does not serve you a cached answer.

## What is safe to leave alone

Under time pressure, these are not worth an intervention:

- **A red nightly APK build.** Attendees install from a release that already
  exists. A failed build does not remove it.
- **Chat, mesh, and gateway faults.** Out of scope for the schedule, the
  map, and the plan. They degrade in isolation, and the mesh has never been
  a load-bearing promise for finding a room.
- **A draft venue graph.** Route steps are already labelled an estimate
  while the graph is `_draft`. This is disclosed, not broken.

## After the event

Anything worked around by hand above is a fix that did not happen. Before
the repository goes quiet, file the underlying cause with the exact change
it needs, and note in the tracking issue which steps were manual — an admin
merge leaves no trace that the automated path is still broken, and the next
event inherits it silently.
