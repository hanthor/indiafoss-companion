<script lang="ts">
  import { resolve } from '$app/paths';
  import type { SolverResult } from '@indiafoss/solver';
  import { formatDayLabel, formatTime, getEventDays, itineraryToIcs } from '@indiafoss/schedule';
  import { eventState } from '$lib/event.svelte';
  import { solveForDay } from '$lib/solver.svelte';
  import { downloadTextFile, shareCalendarFile } from '$lib/calendar';
  import EventGate from '$lib/components/EventGate.svelte';

  const bundle = $derived(eventState.bundle!);
  const days = $derived(bundle ? getEventDays(bundle) : []);

  let selectedDay = $state<string | null>(null);
  let solving = $state(false);
  let result: SolverResult | null = $state(null);
  let calendarMessage = $state('');

  async function exportItinerary(): Promise<void> {
    if (!bundle || !result) return;
    const ics = itineraryToIcs(bundle, result.itinerary.items, { includeAlarm: true });
    const filename = `${bundle.id}-${result.itinerary.day}-itinerary.ics`;
    try {
      const shared = await shareCalendarFile(filename, ics);
      if (!shared) downloadTextFile(filename, ics, 'text/calendar;charset=utf-8');
      calendarMessage = shared ? 'Calendar share opened.' : 'Itinerary calendar downloaded.';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      downloadTextFile(filename, ics, 'text/calendar;charset=utf-8');
      calendarMessage = 'Itinerary calendar downloaded.';
    }
  }

  $effect(() => {
    if (selectedDay === null && days.length > 0) selectedDay = days[0]!;
  });

  $effect(() => {
    if (!bundle || !selectedDay) return;
    solving = true;
    void solveForDay(bundle, selectedDay)
      .then((r) => {
        result = r;
        solving = false;
      })
      .catch(() => {
        solving = false;
      });
  });

  const locationName = (id: string | undefined): string | undefined =>
    bundle?.locations.find((l) => l.id === id)?.name;

  const activityTitle = (id: string): string | undefined => {
    const found = bundle?.activities.find((a) => a.id === id);
    return found?.title;
  };
</script>

<EventGate>
  <h1>Plan</h1>
  <p class="muted">Your personal itinerary, generated from ratings and preferences (§18).</p>

  <div class="days">
    {#each days as day, i (day)}
      <button class:active={selectedDay === day} onclick={() => (selectedDay = day)}>
        Day {i + 1} <small>{formatDayLabel(day)}</small>
      </button>
    {/each}
  </div>

  <div class="actions">
    <a href={resolve('/plan/rank')}>Rank this day first →</a>
    {#if result && result.itinerary.items.length > 0}
      <button class="calendar" onclick={exportItinerary}>Add selected talks to calendar</button>
    {/if}
  </div>
  {#if calendarMessage}<p class="muted small" role="status">{calendarMessage}</p>{/if}

  {#if solving}
    <p role="status">Computing your best day…</p>
  {:else if result}
    {#if result.mustAttendConflicts.length > 0}
      <section class="conflict" role="alert">
        <h2>Your must-attend items conflict</h2>
        {#each result.mustAttendConflicts as c (c.a + c.b)}
          <p>
            <strong>{activityTitle(c.a)}</strong> and <strong>{activityTitle(c.b)}</strong> cannot both
            fit.
          </p>
        {/each}
        <a href={resolve('/plan/rank')}>[Compare]</a>
      </section>
    {/if}

    {#if result.itinerary.items.length > 0}
      <ol class="itinerary">
        {#each result.itinerary.items as item, i (item.activityId + i)}
          <li class:flex={item.flexible}>
            <time>{formatTime(item.start)}–{formatTime(item.end)}</time>
            <div>
              {#if item.flexible}
                <span class="flabel">{item.label ?? 'Flexible time'}</span>
              {:else}
                <a href={resolve(`/activity/${item.activityId}`)}
                  >{activityTitle(item.activityId)}</a
                >
              {/if}
              <span class="loc">
                {locationName(bundle.activities.find((a) => a.id === item.activityId)?.locationId)}
              </span>
              {#if !item.flexible && result.backups[item.activityId]}
                <span class="backups">
                  Backup: {result.backups[item.activityId]!.map((id) => activityTitle(id)).join(
                    ' · ',
                  )}
                </span>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
      <p class="muted small">
        Utility {Math.round(result.itinerary.totalUtility)} · {result.itinerary.items.length} slots ·
        {result.excluded.length} sessions left out
      </p>
    {:else if result.mustAttendConflicts.length === 0}
      <p class="muted">No sessions scheduled for this day yet.</p>
    {/if}
  {/if}
</EventGate>

<style>
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
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
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
    align-items: center;
  }
  .actions a {
    color: var(--event-primary-dark);
    font-weight: 600;
    font-size: 0.9rem;
  }
  .calendar {
    border: 1px solid var(--event-primary-dark);
    background: var(--event-primary);
    color: var(--event-secondary);
    border-radius: 999px;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 700;
  }
  .conflict {
    background: color-mix(in srgb, var(--danger) 10%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
    border-radius: var(--radius);
    padding: 0.8rem 1rem;
    margin-bottom: 1rem;
  }
  .conflict h2 {
    margin: 0 0 0.4rem;
    font-size: 1rem;
  }
  .itinerary {
    list-style: none;
    padding: 0;
    margin: 1rem 0;
    border-left: 3px solid var(--event-primary);
  }
  .itinerary li {
    display: grid;
    grid-template-columns: 5.5rem 1fr;
    gap: 0.6rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
  }
  .itinerary li.flex {
    border-left: 4px solid var(--event-accent);
    background: color-mix(in srgb, var(--event-accent) 6%, transparent);
  }
  .itinerary time {
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .itinerary a {
    color: var(--text);
    font-weight: 600;
    text-decoration: none;
  }
  .flabel {
    font-weight: 600;
    color: var(--event-accent);
  }
  .loc {
    display: block;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .backups {
    display: block;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.2rem;
  }
</style>
