<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';

  const boothId = $derived(page.params.id);
  const bundle = $derived(eventState.bundle!);
  const booth = $derived(bundle?.booths.find((b) => b.id === boothId) ?? null);
  const location = $derived(bundle?.locations.find((l) => l.id === booth?.locationId));
</script>

<EventGate>
  {#if !booth}
    <p>Booth not found.</p>
  {:else}
    <h1>{booth.name}</h1>
    <p class="muted">{booth.category}</p>
    {#if booth.description}<p>{booth.description}</p>{/if}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    {#if booth.website}<p><a href={booth.website} rel="noreferrer">Website</a></p>{/if}
    {#if location}
      <p class="muted small">
        <a href={resolve('/map')}>Find on map</a> · {location.name}
      </p>
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
</style>
