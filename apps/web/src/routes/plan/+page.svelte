<script lang="ts">
  import { resolve } from '$app/paths';
  import { getEventDays, activitiesForDay, formatDayLabel } from '@indiafoss/schedule';
  import { bookmarked, dispositionOf, ratingOf } from '$lib/prefs.svelte';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';

  const bundle = $derived(eventState.bundle!);
  const days = $derived(bundle ? getEventDays(bundle) : []);

  let selectedDay = $state<string | null>(null);
  $effect(() => {
    if (selectedDay === null && days.length > 0) selectedDay = days[0]!;
  });

  const dayActivities = $derived(selectedDay ? activitiesForDay(bundle, selectedDay) : []);

  const ranked = $derived(
    dayActivities
      .filter((a) => !a.cancelled && a.type !== 'meal')
      .map((a) => ({ activity: a, rating: ratingOf(a.id), disposition: dispositionOf(a.id) })),
  );

  const mustAttend = $derived(ranked.filter((r) => r.disposition === 'must-attend'));
  const bookmarkedList = $derived(
    ranked.filter((r) => bookmarked(r.activity.id) && r.disposition !== 'not-interested'),
  );
  const highest = $derived([...ranked].sort((a, b) => b.rating - a.rating).slice(0, 3));
</script>

<EventGate>
  <h1>Plan</h1>
  <p class="muted">
    Your personal schedule starts with preferences, then the itinerary solver (§4).
  </p>

  <div class="days">
    {#each days as day, i (day)}
      <button class:active={selectedDay === day} onclick={() => (selectedDay = day)}>
        Day {i + 1} <small>{formatDayLabel(day)}</small>
      </button>
    {/each}
  </div>

  <a class="cta" href={resolve('/plan/rank')}>Rank this day's sessions →</a>

  {#if mustAttend.length > 0}
    <section>
      <h2>Must attend</h2>
      <ul>
        {#each mustAttend as r (r.activity.id)}
          <li><a href={resolve(`/activity/${r.activity.id}`)}>{r.activity.title}</a></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if bookmarkedList.length > 0}
    <section>
      <h2>Bookmarked</h2>
      <ul>
        {#each bookmarkedList as r (r.activity.id)}
          <li><a href={resolve(`/activity/${r.activity.id}`)}>{r.activity.title}</a></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if highest.length > 0}
    <section>
      <h2>Currently rated top picks</h2>
      <ol class="top">
        {#each highest as r (r.activity.id)}
          <li>
            <span class="rating">{Math.round(r.rating)}</span>
            <a href={resolve(`/activity/${r.activity.id}`)}>{r.activity.title}</a>
          </li>
        {/each}
      </ol>
    </section>
  {/if}
</EventGate>

<style>
  .muted {
    color: var(--text-muted);
  }
  .days {
    display: flex;
    gap: 0.4rem;
    margin: 0.8rem 0;
  }
  .days button {
    border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
    background: var(--surface);
    border-radius: 10px;
    padding: 0.45rem 0.8rem;
    cursor: pointer;
  }
  .days button.active {
    border-color: var(--event-primary);
    color: var(--event-primary);
    font-weight: 600;
  }
  .days small {
    color: var(--text-muted);
    font-weight: 400;
  }
  .cta {
    display: inline-block;
    margin: 0.4rem 0 1rem;
    background: var(--event-primary);
    color: #fff;
    padding: 0.6rem 1.2rem;
    border-radius: 999px;
    text-decoration: none;
    font-weight: 600;
  }
  ul,
  ol {
    padding-left: 1.2rem;
  }
  li {
    margin-bottom: 0.3rem;
  }
  a {
    color: var(--text);
  }
  .top .rating {
    display: inline-block;
    min-width: 3rem;
    font-variant-numeric: tabular-nums;
    color: var(--event-primary);
    font-weight: 700;
  }
</style>
