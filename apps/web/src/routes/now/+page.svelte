<script lang="ts">
  import { livePlanState } from '$lib/resolved-plan.svelte';
  import { eventDay, nextPlannedItem } from '$lib/resolved-plan';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type { Activity } from '@indiafoss/model';
  import {
    activitiesForDay,
    computeNowState,
    formatDayLabel,
    formatTime,
  } from '@indiafoss/schedule';
  import NowGrid from '$lib/components/NowGrid.svelte';
  import { clockFromParams, isFixedClock } from '$lib/clock';
  import { tickInterval } from '$lib/simulator.svelte';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import GettingThere from '$lib/components/GettingThere.svelte';
  import { goTarget, GOING_LABEL, showGettingThere } from '$lib/now-page';

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

  const bundle = $derived(eventState.bundle);
  const nowState = $derived(bundle && now ? computeNowState(bundle, now) : null);

  const day = $derived(bundle && now ? eventDay(now, bundle.timezone) : null);
  /** Today's sessions still running or yet to start: the Now grid's rows. */
  const remaining = $derived(
    bundle && day && now
      ? activitiesForDay(bundle, day).filter((a) => a.end && Date.parse(a.end) > Date.parse(now))
      : [],
  );
  const currentPlan = $derived(livePlanState.bundle === bundle && livePlanState.day === day);
  const personalPlan = $derived(currentPlan ? livePlanState.result : null);
  const planStatus = $derived(currentPlan ? livePlanState.status : 'loading');
  const planConflicted = $derived(
    Boolean(
      personalPlan &&
      (!personalPlan.edited.feasible || personalPlan.mustAttendConflicts.length > 0),
    ),
  );
  const personalNext = $derived(
    personalPlan && !planConflicted ? nextPlannedItem(personalPlan.edited, now) : null,
  );
  const gridIds = $derived(new Set(remaining.map((a) => a.id)));
  /** The card drawn in gold: your plan's talk, else the programme's next (#221). */
  const go = $derived(
    goTarget({
      planStatus,
      planConflicted,
      planItemId: personalNext?.id,
      gridIds,
      programmeNextId: nowState?.next?.id,
    }),
  );
  /** Your plan's item when it has no card to light: a personal block, lunch. */
  const planBlock = $derived(personalNext && !gridIds.has(personalNext.id) ? personalNext : null);
  const trackName = (activity: Activity): string | undefined =>
    (
      bundle?.tracks.find((track) => track.id === activity.devroomId) ??
      bundle?.tracks.find((track) => track.id === activity.trackId)
    )?.name;
</script>

{#snippet trackTag(activity: Activity)}
  {#if trackName(activity)}<span class="track-tag">{trackName(activity)}</span>{/if}
{/snippet}

<EventGate>
  <div class="titlebar">
    <h1>Now</h1>
    {#if day}<a href={resolve(`/plan?day=${day}`)}>Your plan</a>{/if}
  </div>

  {#if isFixedClock(clock)}
    <p class="devtime"><span class="devtag">DEV CLOCK</span> {now}</p>
  {/if}

  {#if !nowState}
    <p>Loading…</p>
  {:else if nowState!.phase === 'before'}
    <section class="card">
      <h2>Not started yet</h2>
      <p>
        IndiaFOSS starts {formatDayLabel(bundle!.start.slice(0, 10))} at {formatTime(
          bundle!.start,
        )}.
      </p>
      {#if nowState!.next}
        <h3>First up</h3>
        {@render trackTag(nowState!.next)}
        <a href={resolve(`/activity/${nowState!.next.id}`)}>{nowState!.next.title}</a>
      {/if}
    </section>
    {#if bundle?.venue}
      <GettingThere venue={bundle.venue} />
    {/if}
  {:else if nowState!.phase === 'after'}
    <section class="card">
      <h2>That's a wrap</h2>
      <p>The conference has ended. See you at the next one!</p>
    </section>
  {:else}
    <!-- Your plan speaks through the grid: its talk is the gold card. Only what
         the grid cannot show gets a line here, and only one. -->
    {#if planConflicted}
      <p class="notice" role="status">
        Your plan has conflicting choices.
        <a href={resolve(`/plan?day=${day}`)}>Resolve them</a> to see where to go.
      </p>
    {:else if planStatus === 'error'}
      <p class="notice" role="status">Your plan could not be loaded. Open Plan to try again.</p>
    {:else if planBlock}
      <p class="goline">
        <span class="kicker">{GOING_LABEL}</span>
        <strong>{planBlock.label ?? 'Personal time'}</strong>
        <span class="muted"
          >{Date.parse(planBlock.start) <= Date.parse(now) ? 'Now · ' : ''}{formatTime(
            planBlock.start,
          )}–{formatTime(planBlock.end)}</span
        >
        {#if planBlock.locationId}
          · <a href={resolve(`/map/to/${planBlock.locationId}`)}
            >{bundle?.locations.find((l) => l.id === planBlock.locationId)?.name ??
              planBlock.locationId}</a
          >
        {/if}
      </p>
    {/if}

    <!-- No card around it: the grid is the page, edge to edge on a phone. -->
    <section class="happening" aria-labelledby="now-heading">
      {#if remaining.length === 0}
        <h2 id="now-heading">Happening now</h2>
        <p class="muted">Between sessions — take a break or explore the map.</p>
      {:else}
        <NowGrid
          activities={remaining}
          bundle={bundle!}
          day={day!}
          {now}
          goId={go?.id}
          goLabel={go?.label}
        >
          {#snippet header()}<h2 id="now-heading">Happening now</h2>{/snippet}
        </NowGrid>
      {/if}
    </section>

    <!-- For arriving: gone once the first morning is under way. -->
    {#if bundle?.venue && showGettingThere(bundle, now)}
      <GettingThere venue={bundle.venue} compact />
    {/if}
  {/if}
</EventGate>

<style>
  .track-tag {
    display: inline-block;
    margin-block: 0.25rem;
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius);
    background: var(--surface-raised);
    border: 1px solid var(--line);
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
  /* Density (issue 685): the grid is the page, so the chrome above it stays small. */
  .titlebar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  h1 {
    margin-block: 0.4rem 0.5rem;
  }
  .titlebar a {
    font-size: 0.85rem;
  }
  .devtime {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0 0 0.5rem;
    padding: 0.2rem 0.5rem;
    border: 1px dashed var(--amber);
    border-radius: var(--radius);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .devtag {
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--amber-ink);
  }
  .card {
    background: var(--surface-raised);
    border-radius: var(--radius);
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .card h2 {
    margin: 0 0 0.75rem;
    font-size: 1.05rem;
  }
  /* Out past the page's side padding (1rem below 1024px, in +layout.svelte),
     so on a phone the grid runs from edge to edge. */
  .happening {
    margin-inline: -1rem;
    padding-left: 0.25rem;
  }
  .happening h2 {
    margin: 0 0 0 0.35rem;
    font-size: 0.95rem;
  }
  @media (min-width: 1024px) {
    .happening {
      margin-inline: 0;
      padding-left: 0;
    }
  }
  .notice,
  .goline {
    margin: 0 0 0.6rem;
    padding: 0.45rem 0.7rem;
    border-radius: var(--radius);
    font-size: 0.85rem;
    line-height: 1.35;
  }
  .notice {
    border: 1px solid var(--danger);
    background: color-mix(in srgb, var(--danger) 8%, var(--surface-raised));
  }
  /* The same gold as the card it stands in for. */
  .goline {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.15rem 0.45rem;
    background: color-mix(in srgb, var(--amber-soft) 85%, var(--surface-raised));
    box-shadow: inset 0 0 0 2px var(--amber);
  }
  .kicker {
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--amber-ink);
  }
  .muted {
    color: var(--text-muted);
    margin: 0.3rem 0;
  }
  .goline .muted {
    margin: 0;
  }
</style>
