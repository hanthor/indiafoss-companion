# C-05 — Bookmark three talks and get a useful plan, without ranking anything

- Status: Ready
- Repository: indiafoss-companion
- Tracks: [#192](https://github.com/hanthor/indiafoss-companion/issues/192)
- Size: M

## Updated product direction — 8 September

Use [talk discovery and whole-devroom planning](../recommendations.md): gold crown Must go, green Want to go, grey Not interested, and a separate Stay for this devroom choice. Learn from these direct answers locally; pairwise ranking is optional. Do not ask attendees to finish every talk before generating a plan. The exact original steps below are subordinate to this updated direction.

## Why this matters

Someone opens the Companion on the train to the venue. They know three talks
they want. The app tells them to rank the sessions first, and the ranking flow
starts by asking them to swipe through every talk on the day before it will
resolve a single overlap. Most people will not finish that, and the ones who
abandon it get a plan built from defaults with no explanation of where it came
from.

The plan should be immediately useful from three bookmarks. Ranking should be
optional refinement that only touches the decisions affecting the next few
hours.

## Context you need

This is mostly a scoping and entry-point problem, not a new planner. The engine
already does what is needed; the flow in front of it asks for too much first.

### What already works

`packages/solver/src/index.ts` solves a day from whatever preferences exist,
with no requirement that anything has been ranked. `activityUtility` at line
124:

```ts
export function activityUtility(a: Activity, prefs: SolverPreferences): number {
  const rating = prefs.ratingOf(a.id);
  const must = prefs.dispositionOf(a.id) === 'must-attend' ? SOLVER_CONFIG.mustAttendBonus : 0;
  const bookmark = prefs.bookmarked(a.id) ? SOLVER_CONFIG.bookmarkBonus : 0;
  const fatigue = (durationMinutes(a) / 60) * SOLVER_CONFIG.fatiguePenaltyPerHour;
  return rating + must + bookmark - fatigue;
}
```

with the weights at line 19:

```ts
export const SOLVER_CONFIG = {
  mustAttendBonus: 10_000,
  bookmarkBonus: 50,
  fatiguePenaltyPerHour: 10,
  defaultBufferSeconds: 300,
  defaultTravelSeconds: 300,
  flexibleDurationsMinutes: [15, 30, 45, 60],
} as const;
```

An unranked activity has the Elo starting rating, `INITIAL_RATING = 1200` from
`packages/elo/src/index.ts`. A bookmark adds 50 and a must-attend adds 10,000,
which is deliberately large enough to dominate. So three bookmarks already
produce a differentiated, feasible plan today. Nothing in the solver requires a
comparison to have been made.

`SolverResult` already carries the material needed to explain a plan
(`packages/solver/src/index.ts`, line 93):

```ts
export interface SolverResult {
  itinerary: Itinerary;
  /** Activities deliberately left out (feasibility, preferences). */
  excluded: string[];
  /** Watch-later activities retained for the post-event archive. */
  watchLater: string[];
  /** Incompatible hard locks (§19). When non-empty the itinerary omits them. */
  mustAttendConflicts: MustAttendConflict[];
  /** Per scheduled activity id, its ranked alternatives (§21). */
  backups: Record<string, string[]>;
}
```

`mustAttendConflicts` is already surfaced in `apps/web/src/routes/plan/+page.svelte`:

```svelte
{#if result.mustAttendConflicts.length > 0}
  <section class="conflict" role="alert">
    <h2>Your must-attend items conflict</h2>
    {#each result.mustAttendConflicts as c (c.a + c.b)}
      <p>
        <strong>{activityTitle(c.a)}</strong> and <strong>{activityTitle(c.b)}</strong> cannot both fit.
      </p>
    {/each}
    <a href={resolve('/plan/rank')}>[Compare]</a>
  </section>
{/if}
```

`packages/elo/src/index.ts` already knows how to ask only the questions that
matter. From its own documentation above `selectNextComparison` (line 126):

> Only pairs whose answer changes the plan are offered: two sessions that
> overlap in time and whose ratings are still close enough that either could
> win. Everything else is skipped on purpose —
>
> - non-overlapping pairs never need a winner (you can attend both), and
>   asking about them was what made a day feel endless;
> - a conflict already decided by a wide rating gap (`SETTLED_GAP`) is not
>   re-asked, so a strong pick settles its other clashes transitively;
> - pairs already answered are never repeated unless re-asked.

with `SETTLED_GAP = 2 * K_FACTOR` at line 123, plus `conflictSlots` and
`conflictProgress` for the slot-by-slot view.

### Where the "review everything first" flow actually lives

Three places, all verified.

`apps/web/src/routes/welcome/+page.svelte` line 17 makes ranking the last and
strongest onboarding step:

```ts
const STEPS = ['reminders', 'ticket', 'you', 'rank'] as const;
```

and line 206 makes it the primary button, under this copy:

```svelte
      <div class="eyebrow">4 · YOUR DAY</div>
      <h2>Rank the sessions</h2>
      <p class="muted">
        Say which devrooms are for you, swipe through the talks, settle the overlaps: a few minutes
        now and the app builds a plan around what you would actually go to.
      </p>
      <div class="actions">
        <button class="button dark" onclick={() => finish('/plan/rank')}>Rank my sessions →</button>
        <button class="button secondary" onclick={() => finish('/')}>Later, show me around</button>
```

`apps/web/src/routes/plan/+page.svelte` line 163 puts the same instruction at
the top of the plan itself:

```svelte
<a href={resolve('/plan/rank')}>Rank this day first →</a>
```

and the page subtitle explains the plan as a product of ranking:

```svelte
Your personal itinerary, generated from your ratings — edit it as the day goes.
```

`apps/web/src/routes/plan/rank/+page.svelte` is a three-mode flow: `rooms`,
then `cards`, then `slots`. The card step iterates the whole day, lines 131-136:

```ts
const untriaged = $derived(daySessions.filter((a) => !triageOf(a.id)));
const triaged = $derived(daySessions.filter((a) => !!triageOf(a.id)));
const keptCount = $derived(daySessions.filter((a) => triageOf(a.id) === 'yes').length);
const droppedCount = $derived(daySessions.filter((a) => triageOf(a.id) === 'no').length);
const card = $derived<Activity | undefined>(untriaged[0]);
const nextCard = $derived<Activity | undefined>(untriaged[1]);
```

and the mode chooser at line 372 sends a new attendee through cards before
slots:

```ts
chosenMode =
  forcedMode ??
  (!roomPrefsState.decided && rooms.length > 0
    ? 'rooms'
    : untriaged.length > 0 && choicesMade === 0
      ? 'cards'
      : 'slots');
```

`untriaged.length > 0` is true for every session on the day at first run, so
the default path is "swipe through everything".

### What the architecture and the review require

`docs/architecture/system.md`, "Offline conference data and personal state":

> Provide an immediately useful browse/star/manual-plan path; ranking is
> optional refinement.

`docs/architecture/review-2026-09-07.md`, "Product direction I would choose":

> **Keep ranking optional and short.** The current flow still describes
> reviewing every talk before resolving overlaps. Let someone bookmark three
> talks and immediately get a useful plan, then refine only decisions that
> affect their next few hours. Explain why a talk was selected and expose
> conflicting must-attend choices. Measure time to a useful plan through
> observed usability sessions; no tracking service is necessary.

The last sentence is a constraint on how you validate this task, and it is
absolute: **do not add analytics, telemetry, event counters or any tracking
service**, opt-in or otherwise, to measure it. The measurement is a person
watching a person use the app.

## What to do

1. Make bookmarking the primary path into a plan. On the schedule and activity
   surfaces, the star should be the obvious first action, and once at least one
   activity is bookmarked the app should offer "See my plan", not "Rank this
   day first".

2. In `apps/web/src/routes/plan/+page.svelte`, replace `Rank this day first →`
   with an optional refinement affordance that is only offered when refining
   would change something. Use the existing `selectNextComparison` and
   `conflictProgress` from `@indiafoss/elo`: if there is no open conflict pair
   for the relevant window, do not offer ranking at all. Change the subtitle so
   it does not describe the plan as generated from ratings.

3. Scope refinement to the near term. When the attendee does choose to refine,
   restrict the candidate pairs to conflicts in the next few hours of the
   current day rather than the whole event, and make the scope visible in the
   copy ("2 overlaps before lunch", not "43 sessions to go"). Decide the window
   as one named constant in one place; do not scatter a magic number.

4. In `apps/web/src/routes/plan/rank/+page.svelte`, stop making the
   swipe-every-talk `cards` mode the default entry. Let the mode chooser at
   line 372 open on `slots`, the conflict-resolution step, and keep `cards`
   reachable as an explicit choice for someone who wants to browse everything.
   Do not delete the cards mode; people who like it should still have it.

5. Explain each selection. For every item in the itinerary, show why it is
   there in the attendee's terms: bookmarked, marked must-attend, the winner of
   a comparison you made, or a gap-filler chosen because nothing else fit.
   Derive this from the components of `activityUtility` plus the `backups` map
   already on `SolverResult`. Put the derivation in a testable function in
   `packages/solver/` or `apps/web/src/lib/`, not inline in the template.

6. Keep the must-attend conflict surface and make it reachable earlier. The
   block already in `plan/+page.svelte` is correct; ensure it appears for
   someone who has bookmarked and marked must-attend without ranking, and that
   its `[Compare]` link leads to the scoped refinement from step 3 rather than
   the full flow.

7. Update the onboarding copy in `apps/web/src/routes/welcome/+page.svelte`.
   The fourth step should offer "star a few talks" as the primary action and
   ranking as the secondary one. Do not remove the step; change what it asks
   for.

8. Tests:
   - in `packages/solver/src/index.test.ts` or a co-located web test, a bundle
     with three bookmarked activities and no ratings produces an itinerary
     containing all three when they do not overlap, and a feasible plan that
     explains the omission when they do;
   - the selection-reason function returns the right reason for a bookmarked
     item, a must-attend item, a comparison winner and a gap-filler;
   - two must-attend activities that overlap produce a non-empty
     `mustAttendConflicts` and the plan page renders the conflict block;
   - the refinement affordance is absent when there are no open conflicts in
     the window, and present when there is one.

## Acceptance

```bash
just check
just test-e2e
just a11y
```

All pass. `just a11y` matters here because you are changing primary calls to
action; a new button that fails contrast or has no accessible name is a
regression this task would otherwise introduce.

Negative case: revert the mode-chooser change in step 4 and confirm the test
asserting the refinement entry point fails. Revert the selection-reason
function and confirm its tests fail. Restore both.

Observable outcome, and this is the acceptance that counts: with a fresh
profile, bookmark three talks and reach a plan showing all three, with a stated
reason for each, **without visiting `/plan/rank`**. Then mark two overlapping
talks must-attend and confirm the conflict is stated plainly on the plan page.

Then a usability observation, not a metric. Watch at least three people who
have not seen the app do the following, and write down where they hesitate:
open the app, find a talk they want, and get to a plan. Record the observations
in the pull request or on
[#192](https://github.com/hanthor/indiafoss-companion/issues/192). If you
cannot recruit three people, say how many you observed. An honest "I watched
one person" is acceptable; an invented number is not, and neither is skipping
this and substituting an instrumented measurement.

**No tracking service, analytics package, telemetry endpoint or usage counter
may be added by this task.** If you find yourself wanting one to prove the
outcome, that is the signal to go and watch someone instead.

## Out of scope

- Do not change the Elo maths. `applyComparison`, `provisionalScale`,
  `pairKScale` and `SETTLED_GAP` in `packages/elo/src/index.ts` stay as they
  are; this task changes which pairs are offered and when, not how a result is
  scored.
- Do not change the solver's weights in `SOLVER_CONFIG`. If three bookmarks do
  not produce a good plan, the fix is the explanation and the entry point, not
  a re-tuned bonus. If you believe a weight is genuinely wrong, note it on
  [#192](https://github.com/hanthor/indiafoss-companion/issues/192) and leave
  it.
- Do not delete the ranking flow or the `cards` mode. Ranking becomes optional,
  not absent.
- The event data behind the plan is **C-04**. Do not touch `DEFAULT_EVENT_ID`
  or anything under `events/`.
- Venue routing and travel times are settled work; `createGraphTravelTime` and
  the routing profile in `apps/web/src/lib/routingPrefs.svelte.ts` are not part
  of this task.
- Calendar export, reminders and the notification schedule are unchanged. If
  the selection reasons need to appear in an exported calendar, that is a
  follow-up on #192, not this change.
