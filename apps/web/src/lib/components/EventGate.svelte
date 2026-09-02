<script lang="ts">
  import { eventState, loadEvent } from '$lib/event.svelte';

  let { children }: { children: import('svelte').Snippet } = $props();

  $effect(() => {
    void loadEvent();
  });
</script>

{#if eventState.status === 'ready' && eventState.bundle}
  {@render children()}
{:else if eventState.status === 'error'}
  <section class="empty" role="alert">
    <h2>The event could not be loaded.</h2>
    <p>You're offline and the schedule hasn't been downloaded yet, or the request failed.</p>
    <p class="detail">{eventState.error}</p>
    <button class="primary" onclick={() => loadEvent()}>Retry</button>
  </section>
{:else}
  <section class="empty" role="status">
    <h2>Loading IndiaFOSS…</h2>
    <p>Downloading the event schedule for offline use.</p>
  </section>
{/if}

<style>
  .empty {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-muted);
  }
  .detail {
    font-size: 0.8rem;
    word-break: break-word;
  }
  button.primary {
    margin-top: 1rem;
    border: none;
    background: var(--event-primary);
    color: var(--ink);
    padding: 0.6rem 1.4rem;
    border-radius: var(--radius);
    font-size: 1rem;
    cursor: pointer;
  }
</style>
