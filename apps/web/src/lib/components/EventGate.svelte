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
  <!--
    A skeleton rather than a line of text (#33): on a conference network the
    first load is the slowest moment the app has, and a shape that matches
    what is coming reads as progress instead of a stall. Announced once,
    politely, so a screen reader is told what is happening without the
    placeholder bars being read out as content.
  -->
  <section class="loading" aria-busy="true">
    <p class="sr-only" role="status">Downloading the IndiaFOSS schedule for offline use.</p>
    <div class="skeleton hero" aria-hidden="true"></div>
    <div class="row" aria-hidden="true">
      <div class="skeleton chip"></div>
      <div class="skeleton chip"></div>
    </div>
    {#each [0, 1, 2] as card (card)}
      <div class="skeleton card" aria-hidden="true"></div>
    {/each}
  </section>
{/if}

<style>
  .loading {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.25rem 0 1rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  /*
    The bars are a moving highlight over the surface colour, so they follow
    the theme. The global prefers-reduced-motion rule in app.css stops the
    sweep for anyone who asked for less movement; the shapes still show.
  */
  .skeleton {
    border-radius: var(--radius-lg);
    background:
      linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in srgb, var(--text-muted) 10%, transparent) 50%,
          transparent 100%
        )
        no-repeat,
      color-mix(in srgb, var(--text-muted) 12%, transparent);
    background-size:
      50% 100%,
      100% 100%;
    animation: sweep 1.4s ease-in-out infinite;
  }
  .hero {
    height: 9rem;
  }
  .chip {
    height: 2.25rem;
    flex: 1;
    border-radius: 999px;
  }
  .card {
    height: 4.5rem;
  }
  @keyframes sweep {
    from {
      background-position:
        -60% 0,
        0 0;
    }
    to {
      background-position:
        160% 0,
        0 0;
    }
  }

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
