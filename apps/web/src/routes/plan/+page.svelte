<script lang="ts">
  import { resolve } from '$app/paths';
  import type { EditedItem, ItineraryItem, SolverResult } from '@indiafoss/solver';
  import { applyItineraryEdits } from '@indiafoss/solver';
  import { formatDayLabel, formatTime, getEventDays, itineraryToIcs } from '@indiafoss/schedule';
  import { eventState } from '$lib/event.svelte';
  import { solveForDay } from '$lib/solver.svelte';
  import { downloadTextFile, shareCalendarFile } from '$lib/calendar';
  import {
    addCustomBlock,
    clearReplacement,
    hydratePlanEdits,
    planEdits,
    removeCustomBlock,
    removeItem,
    replaceItem,
    restoreItem,
    toggleLock,
  } from '$lib/planEdits.svelte';
  import EventGate from '$lib/components/EventGate.svelte';

  const bundle = $derived(eventState.bundle!);
  const days = $derived(bundle ? getEventDays(bundle) : []);

  let selectedDay = $state<string | null>(null);
  let solving = $state(false);
  let result: SolverResult | null = $state(null);
  let calendarMessage = $state('');

  // Custom-block form state.
  let blockLabel = $state('');
  let blockStart = $state('');
  let blockEnd = $state('');
  let blockLocation = $state('');
  let blockFlexible = $state(false);

  $effect(() => {
    if (selectedDay === null && days.length > 0) selectedDay = days[0]!;
  });

  $effect(() => {
    if (!bundle || !selectedDay) return;
    solving = true;
    void Promise.all([solveForDay(bundle, selectedDay), hydratePlanEdits(bundle.id, selectedDay)])
      .then(([r]) => {
        result = r;
        solving = false;
      })
      .catch(() => {
        solving = false;
      });
  });

  const activityMap = $derived(new Map((bundle?.activities ?? []).map((a) => [a.id, a])));

  const edited = $derived.by(() => {
    const r = result;
    if (!r) return null;
    return applyItineraryEdits({
      base: r.itinerary.items,
      edits: planEdits.edits,
      activities: activityMap,
    });
  });

  const locationName = (id: string | undefined): string | undefined =>
    bundle?.locations.find((l) => l.id === id)?.name;

  const activityTitle = (id: string): string | undefined => activityMap.get(id)?.title;

  /** Backups still available for a base activity (not removed, still in schedule). */
  function backupsFor(activityId: string): string[] {
    return (result?.backups[activityId] ?? []).filter((id) => activityMap.has(id));
  }

  function isoForDay(day: string, hhmm: string): string {
    return `${day}T${hhmm}:00+05:30`;
  }

  async function submitCustomBlock(): Promise<void> {
    if (!selectedDay || !blockLabel.trim() || !blockStart || !blockEnd) return;
    await addCustomBlock({
      id: `custom-${Date.now()}`,
      label: blockLabel.trim(),
      start: isoForDay(selectedDay, blockStart),
      end: isoForDay(selectedDay, blockEnd),
      locationId: blockLocation || undefined,
      flexible: blockFlexible,
    });
    blockLabel = '';
    blockStart = '';
    blockEnd = '';
    blockLocation = '';
    blockFlexible = false;
  }

  async function exportItinerary(): Promise<void> {
    if (!bundle || !edited || !selectedDay) return;
    // Map edited rows into calendar items; manual/custom rows that are not real
    // activities are exported as labelled flexible entries.
    const items: ItineraryItem[] = edited.items.map((i: EditedItem) => ({
      activityId: i.id,
      start: i.start,
      end: i.end,
      flexible: i.flexible || !activityMap.has(i.id),
      label: i.label,
    }));
    const ics = itineraryToIcs(bundle, items, { includeAlarm: true });
    const filename = `${bundle.id}-${selectedDay}-itinerary.ics`;
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

  const isCustom = (id: string): boolean => id.startsWith('custom-');
</script>

<EventGate>
  <h1>Plan</h1>
  <p class="muted">
    Your personal itinerary, generated from ratings — then edited by you (§18–§21).
  </p>

  <div class="days">
    {#each days as day, i (day)}
      <button class:active={selectedDay === day} onclick={() => (selectedDay = day)}>
        Day {i + 1} <small>{formatDayLabel(day)}</small>
      </button>
    {/each}
  </div>

  <div class="actions">
    <a href={resolve('/plan/rank')}>Rank this day first →</a>
    {#if edited && edited.items.length > 0}
      <button class="calendar" onclick={exportItinerary}>Add plan to calendar</button>
    {/if}
  </div>
  {#if calendarMessage}<p class="muted small" role="status">{calendarMessage}</p>{/if}

  {#if solving}
    <p role="status">Computing your best day…</p>
  {:else if result && edited}
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

    {#if edited.conflicts.length > 0}
      <section class="conflict warn" role="alert" data-testid="edit-conflicts">
        <h2>Some edits don't fit</h2>
        <p class="muted small">
          These items stay in your plan so you can fix them — nothing was silently removed.
        </p>
        <ul>
          {#each edited.conflicts as conflict, i (conflict.a + (conflict.b ?? '') + i)}
            <li>{conflict.message}</li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if edited.items.length > 0}
      <ol class="itinerary">
        {#each edited.items as item (item.id)}
          <li class:flex={item.flexible} class:locked={item.locked} class:manual={item.manual}>
            <time>{formatTime(item.start)}–{formatTime(item.end)}</time>
            <div class="body">
              <div class="titleline">
                {#if item.flexible || isCustom(item.id)}
                  <span class="flabel">{item.label ?? 'Flexible time'}</span>
                {:else}
                  <a href={resolve(`/activity/${item.id}`)}
                    >{item.label ?? activityTitle(item.id)}</a
                  >
                {/if}
                {#if item.locked}<span class="badge" title="Locked">🔒</span>{/if}
                {#if item.replacedActivityId}<span class="badge alt">replaced</span>{/if}
              </div>
              {#if item.locationId}
                <span class="loc">{locationName(item.locationId)}</span>
              {/if}

              <div class="rowcontrols">
                {#if !isCustom(item.id)}
                  <button
                    class="chip"
                    aria-pressed={item.locked}
                    onclick={() => toggleLock(item.id)}
                  >
                    {item.locked ? 'Unlock' : 'Lock'}
                  </button>
                  <button class="chip" onclick={() => removeItem(item.id)}>Remove</button>
                  {#if item.replacedActivityId}
                    <button class="chip" onclick={() => clearReplacement(item.replacedActivityId!)}>
                      Undo replace
                    </button>
                  {/if}
                {:else}
                  <button
                    class="chip"
                    aria-pressed={item.locked}
                    onclick={() => toggleLock(item.id)}
                  >
                    {item.locked ? 'Unlock' : 'Lock'}
                  </button>
                  <button class="chip" onclick={() => removeCustomBlock(item.id)}>Delete</button>
                {/if}
              </div>

              {#if !item.flexible && !isCustom(item.id)}
                {@const backups = backupsFor(item.replacedActivityId ?? item.id)}
                {#if backups.length > 0}
                  <label class="replace">
                    <span class="sr-only">Replace with a backup</span>
                    <select
                      onchange={(e) => {
                        const v = e.currentTarget.value;
                        if (v) void replaceItem(item.replacedActivityId ?? item.id, v);
                        e.currentTarget.value = '';
                      }}
                    >
                      <option value="">Replace with backup…</option>
                      {#each backups as backupId (backupId)}
                        <option value={backupId}>{activityTitle(backupId)}</option>
                      {/each}
                    </select>
                  </label>
                {/if}
              {/if}
            </div>
          </li>
        {/each}
      </ol>
      <p class="muted small">
        {edited.items.length} slots ·
        {edited.feasible ? 'No conflicts' : `${edited.conflicts.length} conflict(s) to resolve`}
      </p>
    {:else if result.mustAttendConflicts.length === 0}
      <p class="muted">No sessions scheduled for this day yet. Add a block below.</p>
    {/if}

    {#if planEdits.edits.removed.length > 0}
      <section class="removed">
        <h2>Removed</h2>
        <ul>
          {#each planEdits.edits.removed as id (id)}
            <li>
              <span>{isCustom(id) ? 'Custom block' : (activityTitle(id) ?? id)}</span>
              {#if !isCustom(id)}
                <button class="chip" onclick={() => restoreItem(id)}>Restore</button>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="add-block">
      <h2>Add a block</h2>
      <form
        onsubmit={(event) => {
          event.preventDefault();
          void submitCustomBlock();
        }}
      >
        <label>
          What
          <input bind:value={blockLabel} placeholder="Lunch with the KDE folks" required />
        </label>
        <div class="times">
          <label>
            Start
            <input type="time" bind:value={blockStart} required />
          </label>
          <label>
            End
            <input type="time" bind:value={blockEnd} required />
          </label>
        </div>
        <label>
          Where (optional)
          <select bind:value={blockLocation}>
            <option value="">No location</option>
            {#each bundle.locations as loc (loc.id)}
              <option value={loc.id}>{loc.name}</option>
            {/each}
          </select>
        </label>
        <label class="check">
          <input type="checkbox" bind:checked={blockFlexible} /> Flexible (no travel check)
        </label>
        <button class="calendar" type="submit">Add block</button>
      </form>
    </section>
  {/if}
</EventGate>

<style>
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
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
    min-height: 44px;
  }
  .conflict {
    background: color-mix(in srgb, var(--danger) 10%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
    border-radius: var(--radius);
    padding: 0.8rem 1rem;
    margin-bottom: 1rem;
  }
  .conflict.warn {
    background: color-mix(in srgb, var(--warning) 12%, var(--surface));
    border-color: color-mix(in srgb, var(--warning) 45%, transparent);
  }
  .conflict h2 {
    margin: 0 0 0.4rem;
    font-size: 1rem;
  }
  .conflict ul {
    margin: 0.4rem 0 0;
    padding-left: 1.1rem;
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
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
  }
  .itinerary li.flex {
    border-left: 4px solid var(--event-accent);
    background: color-mix(in srgb, var(--event-accent) 6%, transparent);
  }
  .itinerary li.locked {
    background: color-mix(in srgb, var(--event-primary) 6%, transparent);
  }
  .itinerary li.manual {
    border-left: 4px solid var(--event-primary-dark);
  }
  .itinerary time {
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .titleline {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
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
  .badge {
    font-size: 0.72rem;
  }
  .badge.alt {
    background: color-mix(in srgb, var(--event-primary) 18%, transparent);
    border-radius: 6px;
    padding: 0 0.35rem;
    color: var(--event-primary-dark);
    font-weight: 700;
  }
  .loc {
    display: block;
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0.15rem 0;
  }
  .rowcontrols {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.35rem;
  }
  .chip {
    border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
    background: var(--surface);
    border-radius: 8px;
    padding: 0.35rem 0.6rem;
    cursor: pointer;
    font-size: 0.78rem;
    min-height: 36px;
  }
  .chip[aria-pressed='true'] {
    border-color: var(--event-primary);
    color: var(--event-primary-dark);
    font-weight: 700;
  }
  .replace {
    display: block;
    margin-top: 0.35rem;
  }
  .replace select,
  .add-block select,
  .add-block input {
    min-height: 40px;
    border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
    border-radius: 8px;
    padding: 0.4rem 0.55rem;
    background: var(--surface);
    font-family: inherit;
  }
  .removed {
    margin: 1rem 0;
  }
  .removed h2,
  .add-block h2 {
    font-size: 1rem;
    margin: 0 0 0.5rem;
  }
  .removed ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .removed li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.35rem 0;
    color: var(--text-muted);
  }
  .add-block {
    margin: 1.5rem 0;
    padding: 1rem;
    background: var(--surface-raised);
    border-radius: var(--radius);
  }
  .add-block form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .add-block label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .add-block .times {
    display: flex;
    gap: 0.6rem;
  }
  .add-block .times label {
    flex: 1;
  }
  .add-block .check {
    flex-direction: row;
    align-items: center;
    gap: 0.4rem;
    font-weight: 500;
  }
  .add-block .check input {
    min-height: auto;
  }
</style>
