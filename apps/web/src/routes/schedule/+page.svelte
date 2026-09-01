<script lang="ts">
  import type { ActivityType } from '@indiafoss/model';
  import { resolve } from '$app/paths';
  import { formatTime } from '@indiafoss/schedule';
  import { searchActivities } from '@indiafoss/search';
  import {
    activitiesForDay,
    formatDayLabel,
    getEventDays,
    groupByStart,
  } from '@indiafoss/schedule';
  import { bookmarked, dispositionOf } from '$lib/prefs.svelte';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import SessionCard from '$lib/components/SessionCard.svelte';
  import TimelineGrid from '$lib/components/TimelineGrid.svelte';

  const bundle = $derived(eventState.bundle!);
  const days = $derived(bundle ? getEventDays(bundle) : []);

  let selectedDay = $state<string | null>(null);
  let view: 'list' | 'grid' = $state('list');
  let query = $state('');
  let devroomsOnly = $state(false);
  let bookmarkedOnly = $state(false);

  const TYPE_TOGGLES: ActivityType[] = [
    'talk',
    'lightning-talk',
    'keynote',
    'workshop',
    'panel',
    'bof',
    'meal',
  ];
  const typeToggles = $state<Record<string, boolean>>(
    Object.fromEntries(TYPE_TOGGLES.map((t) => [t, true])),
  );

  $effect(() => {
    if (selectedDay === null && days.length > 0) selectedDay = days[0]!;
  });

  const typesOn = $derived(
    new Set(
      Object.entries(typeToggles)
        .filter(([, on]) => on)
        .map(([t]) => t),
    ),
  );

  const dayActivities = $derived(selectedDay ? activitiesForDay(bundle, selectedDay) : []);

  const searchIds = $derived(
    query.trim().length >= 2 ? new Set(searchActivities(bundle, query, 60).map((h) => h.id)) : null,
  );

  const filtered = $derived(
    dayActivities.filter((a) => {
      if (!typesOn.has(a.type)) return false;
      if (devroomsOnly && !a.devroomId) return false;
      if (bookmarkedOnly) {
        const d = dispositionOf(a.id);
        if (d === 'normal' && !bookmarked(a.id)) return false;
      }
      if (searchIds && !searchIds.has(a.id)) return false;
      return true;
    }),
  );

  function setType(type: string, checked: boolean): void {
    typeToggles[type] = checked;
  }
</script>

<EventGate>
  <header class="pagehead">
    <div>
      <h1>Schedule</h1>
      <p class="muted">{bundle.name} · {bundle.timezone}</p>
    </div>
    <a class="rank-link" href={resolve('/plan/rank')}>Rank your choices →</a>
  </header>

  <div class="controls">
    <div class="days" role="tablist" aria-label="Conference day">
      {#each days as day, i (day)}
        <button
          role="tab"
          aria-selected={selectedDay === day}
          class="daytab"
          class:active={selectedDay === day}
          onclick={() => (selectedDay = day)}
        >
          Day {i + 1}<br /><small>{formatDayLabel(day)}</small>
        </button>
      {/each}
    </div>

    <div class="row">
      <label class="search">
        <span class="sr-only">Search sessions</span>
        <input type="search" placeholder="Search talks, speakers, tags…" bind:value={query} />
      </label>
      <div class="seg" role="group" aria-label="View">
        <button class:active={view === 'list'} onclick={() => (view = 'list')}>List</button>
        <button class:active={view === 'grid'} onclick={() => (view = 'grid')}>Timeline</button>
      </div>
    </div>

    <details class="filters">
      <summary>Filters</summary>
      <div class="filters-inner">
        {#each Object.entries(typeToggles) as [type, on] (type)}
          <label class="check">
            <input
              type="checkbox"
              checked={on}
              onclick={(e) => setType(type, e.currentTarget.checked)}
            />
            {type.replace(/-/g, ' ')}
          </label>
        {/each}
        <label class="check">
          <input type="checkbox" bind:checked={devroomsOnly} />
          Devrooms only
        </label>
        <label class="check">
          <input type="checkbox" bind:checked={bookmarkedOnly} />
          Ranked / bookmarked
        </label>
      </div>
    </details>
  </div>

  <p class="muted small" role="status">
    {filtered.length} session{filtered.length === 1 ? '' : 's'}
  </p>

  {#if view === 'list'}
    <div class="list">
      {#each groupByStart(filtered) as group (group.start)}
        <div class="group">
          <div class="time">
            {#if group.activities[0]?.start}
              <span class="h">{formatTime(group.start)}</span>
            {/if}
          </div>
          <div class="items">
            {#each group.activities as activity (activity.id)}
              <SessionCard {activity} {bundle} />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <TimelineGrid activities={filtered} {bundle} day={selectedDay ?? ''} />
  {/if}
</EventGate>

<style>
  .pagehead {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .pagehead h1 {
    margin: 0;
  }
  .rank-link {
    color: var(--event-primary-dark);
    font-family: 'Space Mono', ui-monospace, monospace;
    font-size: 0.72rem;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin: 0.8rem 0;
  }
  .days {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
  }
  .daytab {
    border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
    background: var(--surface);
    border-radius: 10px;
    padding: 0.45rem 0.9rem;
    font-size: 0.85rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .daytab small {
    color: var(--text-muted);
  }
  .daytab.active {
    border-color: var(--event-primary);
    background: color-mix(in srgb, var(--event-primary) 10%, transparent);
    color: var(--event-primary);
    font-weight: 600;
  }
  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .search {
    flex: 1;
  }
  .search input {
    width: 100%;
    padding: 0.55rem 0.8rem;
    border: 1px solid color-mix(in srgb, var(--text-muted) 35%, transparent);
    border-radius: 10px;
    font-size: 0.95rem;
  }
  .seg {
    display: flex;
    border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
    border-radius: 10px;
    overflow: hidden;
  }
  .seg button {
    border: none;
    background: var(--surface);
    padding: 0.55rem 0.8rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .seg button.active {
    background: var(--event-primary);
    color: #fff;
  }
  .filters summary {
    cursor: pointer;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .filters-inner {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    padding-top: 0.5rem;
  }
  .check {
    font-size: 0.82rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    text-transform: capitalize;
  }
  .group {
    display: grid;
    grid-template-columns: 5rem 1fr;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
  }
  .time {
    text-align: right;
    padding-top: 0.85rem;
  }
  .h {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    font-size: 0.9rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
