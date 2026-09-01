<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type { Activity } from '@indiafoss/model';
  import {
    activityProgress,
    computeNowState,
    formatDayLabel,
    formatTime,
  } from '@indiafoss/schedule';
  import { clockFromParams, isFixedClock } from '$lib/clock';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';

  const clock = clockFromParams(page.url.searchParams.get('now'));
  const initialNow = clock.now();
  let now = $state<string>(initialNow);

  $effect(() => {
    if (isFixedClock(clock)) return;
    const timer = setInterval(() => {
      now = clock.now();
    }, 1000);
    return () => clearInterval(timer);
  });

  const bundle = $derived(eventState.bundle);
  const nowState = $derived(bundle ? computeNowState(bundle, now) : null);

  const locationName = (a: Activity): string | undefined =>
    bundle?.locations.find((l) => l.id === a.locationId)?.name;

  function minutesUntil(endIso: string, nowIso: string): string {
    const mins = Math.max(0, Math.ceil((Date.parse(endIso) - Date.parse(nowIso)) / 60000));
    if (mins < 1) return 'under a minute';
    return `${mins} min`;
  }
</script>

<EventGate>
  <h1>Now</h1>

  {#if isFixedClock(clock)}
    <p class="devtime">Developer time: {now}</p>
  {/if}

  {#if !nowState}
    <p>Loading…</p>
  {:else if nowState.phase === 'before'}
    <section class="card">
      <h2>Not started yet</h2>
      <p>
        IndiaFOSS starts {formatDayLabel(bundle!.start.slice(0, 10))} at
        {formatTime(bundle!.start)}.
      </p>
      {#if nowState.next}
        <h3>First up</h3>
        <a href={resolve(`/activity/${nowState.next.id}`)}>{nowState.next.title}</a>
      {/if}
    </section>
  {:else if nowState.phase === 'after'}
    <section class="card">
      <h2>That's a wrap</h2>
      <p>The conference has ended. See you at the next one!</p>
    </section>
  {:else}
    <section class="card" aria-labelledby="now-heading">
      <h2 id="now-heading">Happening now</h2>
      {#if nowState.current.length === 0}
        <p class="muted">Between sessions — take a break or explore the map.</p>
      {:else}
        {#each nowState.current as activity (activity.id)}
          <div class="session">
            <div class="row">
              <a href={resolve(`/activity/${activity.id}`)}>{activity.title}</a>
              <TypeBadge type={activity.type} />
            </div>
            <p class="muted">{locationName(activity)}</p>
            <div
              class="progress"
              role="progressbar"
              aria-valuenow={Math.round(activityProgress(activity, now) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                class="fill"
                style:width="{Math.round(activityProgress(activity, now) * 100)}%"
              ></div>
            </div>
            <p class="muted small">
              {formatTime(activity.start!)}–{formatTime(activity.end!)} · ends in
              {minutesUntil(activity.end!, now)}
            </p>
          </div>
        {/each}
      {/if}
    </section>

    {#if nowState.next}
      <section class="card" aria-labelledby="next-heading">
        <h2 id="next-heading">Next</h2>
        <div class="row big">
          <a href={resolve(`/activity/${nowState.next.id}`)}>{nowState.next.title}</a>
          <TypeBadge type={nowState.next.type} />
        </div>
        <p class="muted">{locationName(nowState.next)} · {formatTime(nowState.next.start!)}</p>
        <p class="muted small">Starts in {minutesUntil(nowState.next.start!, now)}.</p>
        <p class="muted small">Walking time unavailable until your location is known.</p>
      </section>
    {/if}
  {/if}
</EventGate>

<style>
  .devtime {
    font-size: 0.8rem;
    color: var(--warning);
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
  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
  }
  .row a {
    color: var(--text);
    font-weight: 600;
    text-decoration: none;
  }
  .row a:hover {
    text-decoration: underline;
    text-decoration-color: var(--event-accent);
  }
  .row.big {
    font-size: 1.1rem;
  }
  .muted {
    color: var(--text-muted);
    margin: 0.3rem 0;
  }
  .small {
    font-size: 0.82rem;
  }
  .session {
    border-top: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
    padding-top: 0.6rem;
    margin-top: 0.6rem;
  }
  .progress {
    height: 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-muted) 20%, transparent);
    overflow: hidden;
    margin: 0.4rem 0;
  }
  .fill {
    height: 100%;
    background: var(--event-primary);
    border-radius: 999px;
    transition: width 1s linear;
  }
  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
