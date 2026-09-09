<script lang="ts">
  import { page } from '$app/state';
  import { eventState } from '$lib/event.svelte';
  import { eventDay } from '$lib/resolved-plan';
  import { livePlanState, planInputs, resolveDayPlan } from '$lib/resolved-plan.svelte';
  import { planEdits, readPlanEdits } from '$lib/planEdits.svelte';
  import { preferenceFor } from '$lib/prefs.svelte';
  import { roomPreferences } from '$lib/roomPrefs.svelte';
  import { routingPrefs } from '$lib/routingPrefs.svelte';
  import { clockFromParams, isFixedClock } from '$lib/clock';
  import { tickInterval } from '$lib/simulator.svelte';

  const clock = $derived(
    clockFromParams(page.url.searchParams.get('now'), page.url.searchParams.get('speed')),
  );
  let now = $state('');
  $effect(() => {
    now = clock.now();
    if (isFixedClock(clock)) return;
    const timer = setInterval(() => {
      now = clock.now();
    }, tickInterval(1000));
    return () => clearInterval(timer);
  });
  const day = $derived(eventState.bundle && now ? eventDay(now, eventState.bundle.timezone) : null);

  $effect(() => {
    const bundle = eventState.bundle;
    const currentDay = day;
    void JSON.stringify(bundle?.activities.map((a) => preferenceFor(a.id)));
    void JSON.stringify(roomPreferences());
    const editsSnapshot = JSON.stringify(planEdits.edits);
    const editingThisDay = planEdits.eventId === bundle?.id && planEdits.day === currentDay;
    void routingPrefs.profile;
    void planInputs.revision;
    let active = true;
    livePlanState.bundle = bundle;
    livePlanState.day = currentDay;
    livePlanState.result = null;
    livePlanState.activityIds = [];
    livePlanState.status = 'loading';
    if (!bundle || !currentDay) return;
    // Use the reactive edit snapshot while the editor is active: its IndexedDB
    // write can still be pending when this effect runs.
    const edits = editingThisDay
      ? Promise.resolve(JSON.parse(editsSnapshot))
      : readPlanEdits(bundle.id, currentDay);
    void edits
      .then((saved) => resolveDayPlan(bundle, currentDay, saved))
      .then((resolved) => {
        if (!active) return;
        livePlanState.result = resolved;
        livePlanState.activityIds =
          resolved.edited.feasible && resolved.mustAttendConflicts.length === 0
            ? resolved.edited.items.map((item) => item.id)
            : [];
        livePlanState.status = 'ready';
      })
      .catch(() => {
        if (active) livePlanState.status = 'error';
      });
    return () => {
      active = false;
    };
  });
</script>
