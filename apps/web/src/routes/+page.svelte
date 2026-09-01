<script lang="ts">
  import { resolve } from '$app/paths';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';

  const bundle = $derived(eventState.bundle);
</script>

<EventGate>
  <section class="hero">
    <h1>{bundle?.name ?? 'IndiaFOSS Companion'}</h1>
    <p class="tagline">
      Conference schedule, personal ranking, itinerary and indoor navigation — all offline, no
      account needed.
    </p>
  </section>

  <nav class="quick" aria-label="Quick actions">
    <a href={resolve('/now')}>
      <strong>Now</strong>
      <span>What's happening right now</span>
    </a>
    <a href={resolve('/schedule')}>
      <strong>Schedule</strong>
      <span>Browse the full programme</span>
    </a>
    <a href={resolve('/explore')}>
      <strong>Explore</strong>
      <span>Search talks, speakers, booths</span>
    </a>
    <a href={resolve('/map')}>
      <strong>Map</strong>
      <span>Venue navigation</span>
    </a>
  </nav>

  {#if bundle}
    <p class="muted small">
      {bundle.name} · {bundle.activities.length} sessions · {bundle.people.length} speakers ·
      {bundle.timezone}
    </p>
  {/if}
</EventGate>

<style>
  .hero h1 {
    font-size: 1.6rem;
    margin: 1rem 0 0.3rem;
  }
  .tagline {
    color: var(--text-muted);
    line-height: 1.5;
  }
  .quick {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.6rem;
    margin: 1.2rem 0;
  }
  .quick a {
    display: block;
    background: var(--surface-raised);
    border-radius: var(--radius);
    padding: 0.9rem;
    text-decoration: none;
    color: var(--text);
    border: 1px solid color-mix(in srgb, var(--text-muted) 18%, transparent);
  }
  .quick a strong {
    display: block;
    color: var(--event-primary);
    font-size: 1.05rem;
    margin-bottom: 0.2rem;
  }
  .quick a span {
    font-size: 0.8rem;
    color: var(--text-muted);
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
</style>
