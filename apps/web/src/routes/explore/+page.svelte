<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatDayLabel, formatTime } from '@indiafoss/schedule';
  import { searchEvent } from '@indiafoss/search';
  import { computeNowState } from '@indiafoss/schedule';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';

  const bundle = $derived(eventState.bundle!);

  let query = $state('');
  const hasQuery = $derived(query.trim().length >= 2);
  const results = $derived(hasQuery ? searchEvent(bundle, query, { limit: 30 }) : []);
  const nowState = $derived(bundle ? computeNowState(bundle, new Date().toISOString()) : null);
  const tracks = $derived(bundle?.tracks ?? []);
  const roomName = (id: string | undefined) => bundle?.locations.find((l) => l.id === id)?.name;

  const activityFor = (id: string) => bundle.activities.find((a) => a.id === id);
</script>

<EventGate>
  <h1>Explore</h1>
  <p class="muted">Search talks, speakers, devrooms and booths — works offline.</p>
  <p class="muted small"><a href={resolve('/explore/booths')}>Booth directory →</a></p>

  <div class="search">
    <input
      type="search"
      aria-label="Search"
      placeholder="Try kernel, devroom, a speaker name…"
      bind:value={query}
    />
  </div>

  {#if hasQuery}
    <p class="muted small" role="status">
      {results.length} result{results.length === 1 ? '' : 's'}
    </p>

    <ul class="results">
      {#each results as hit (hit.kind + hit.id)}
        <li>
          {#if hit.kind === 'activity'}
            <a class="title" href={resolve(`/activity/${hit.id}`)}>{hit.title}</a>
            <p class="muted small">
              {#if hit.subtitle}{hit.subtitle}{/if}
              {#if activityFor(hit.id)?.start}
                · {formatDayLabel(activityFor(hit.id)!.start!.slice(0, 10))}
                {formatTime(activityFor(hit.id)!.start!)}
              {/if}
            </p>
          {:else if hit.kind === 'person'}
            <a class="title" href={resolve(`/speaker/${hit.id}`)}>{hit.title}</a>
            <p class="muted small">
              Speaker · {hit.subtitle ?? ''}
              {#if hit.relatedIds && hit.relatedIds.length > 0}
                · {hit.relatedIds.length} session{hit.relatedIds.length === 1 ? '' : 's'}
              {/if}
            </p>
          {:else}
            <a class="title" href={resolve(`/booth/${hit.id}`)}>{hit.title}</a>
            <p class="muted small">{hit.subtitle ?? ''}</p>
          {/if}
          <TypeBadge type={hit.kind} />
        </li>
      {/each}
    </ul>

    {#if results.length === 0}
      <p class="muted">No matches for “{query}”.</p>
    {/if}
  {:else}
    <section class="browse" aria-label="Browse">
      <a class="tile" href={resolve('/explore/booths')}>
        <strong>Booths</strong>
        <span class="muted small">{bundle.booths.length} communities, projects and sponsors</span>
      </a>
      {#if tracks.length > 0}
        <h2>Rooms and tracks</h2>
        <div class="chips">
          {#each tracks as track (track.id)}
            <button class="chip" onclick={() => (query = track.name)}>{track.name}</button>
          {/each}
        </div>
      {/if}
      {#if nowState && nowState.current.length > 0}
        <h2>Happening now</h2>
        <ul class="results">
          {#each nowState.current as a (a.id)}
            <li>
              <a href={resolve(`/activity/${a.id}`)}>{a.title}</a>
              <p class="muted small">
                {roomName(a.locationId) ?? ''}{a.end ? ` · until ${formatTime(a.end)}` : ''}
              </p>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</EventGate>

<style>
  .browse h2 {
    margin: 1rem 0 0.4rem;
    font-size: 0.95rem;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.8rem 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--text);
    text-decoration: none;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface-raised);
    color: var(--text);
    font-size: 0.82rem;
    cursor: pointer;
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
  .search input {
    width: 100%;
    padding: 0.7rem 0.9rem;
    border: 1px solid color-mix(in srgb, var(--text-muted) 35%, transparent);
    border-radius: 12px;
    font-size: 1rem;
    margin: 0.6rem 0;
  }
  .results {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0;
  }
  .results li {
    padding: 0.6rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
  }
  .title {
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
  }
  .title:hover {
    text-decoration: underline;
    text-decoration-color: var(--event-accent);
  }
</style>
