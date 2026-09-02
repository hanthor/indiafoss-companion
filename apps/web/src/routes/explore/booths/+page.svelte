<script lang="ts">
  import { resolve } from '$app/paths';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';

  const bundle = $derived(eventState.bundle!);

  let categoryFilter = $state<string>('all');

  const categories = $derived(['all', ...new Set(bundle?.booths.map((b) => b.category) ?? [])]);
  const filtered = $derived(
    (bundle?.booths ?? [])
      .filter((b) => categoryFilter === 'all' || b.category === categoryFilter)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
</script>

<EventGate>
  <h1>Booths</h1>
  <p class="muted">Communities, projects and sponsors on the expo floor — schedule a visit.</p>

  <div class="filters" role="group" aria-label="Booth category">
    {#each categories as cat (cat)}
      <button class:active={categoryFilter === cat} onclick={() => (categoryFilter = cat)}>
        {cat}
      </button>
    {/each}
  </div>

  <p class="muted small" role="status">{filtered.length} booth{filtered.length === 1 ? '' : 's'}</p>

  <ul class="grid">
    {#each filtered as booth (booth.id)}
      <li>
        <a href={resolve(`/booth/${booth.id}`)}>
          <strong>{booth.name}</strong>
          <span class="cat"><TypeBadge type={booth.category} /></span>
        </a>
      </li>
    {/each}
  </ul>

  {#if filtered.length === 0}
    <p class="muted">No booths in this category yet.</p>
  {/if}
</EventGate>

<style>
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.8rem 0;
  }
  .filters button {
    border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
    background: var(--surface);
    border-radius: 999px;
    padding: 0.35rem 0.8rem;
    cursor: pointer;
    font-size: 0.82rem;
    text-transform: capitalize;
  }
  .filters button.active {
    border-color: var(--event-primary-text);
    background: color-mix(in srgb, var(--event-primary) 10%, transparent);
    color: var(--event-primary-text);
    font-weight: 600;
  }
  .grid {
    list-style: none;
    padding: 0;
    margin: 0.6rem 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.6rem;
  }
  .grid li a {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    background: var(--surface-raised);
    border: 1px solid color-mix(in srgb, var(--text-muted) 18%, transparent);
    border-radius: var(--radius);
    padding: 0.8rem;
    text-decoration: none;
    color: var(--text);
    min-height: 84px;
  }
  .grid li a:hover {
    border-color: var(--event-accent);
  }
  .cat :global(.badge) {
    align-self: flex-start;
  }
</style>
