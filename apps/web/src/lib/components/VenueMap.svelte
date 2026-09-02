<script lang="ts">
  import { findRoute } from '@indiafoss/venue';
  import type { Route, RoutingProfile } from '@indiafoss/venue';
  import { loadVenue, venueKeyForEvent } from '$lib/venue.svelte';
  import { eventState } from '$lib/event.svelte';

  let { initialFrom = '', initialTo = '' }: { initialFrom?: string; initialTo?: string } = $props();

  const eventId = $derived(eventState.bundle?.id ?? 'indiafoss-2025');
  const venueKey = $derived(venueKeyForEvent(eventId));

  let venue = $state<Awaited<ReturnType<typeof loadVenue>> | null>(null);
  let venueError: string | null = $state(null);

  $effect(() => {
    void loadVenue(venueKey)
      .then((v) => {
        venue = v;
      })
      .catch((e) => {
        venueError = e instanceof Error ? e.message : String(e);
      });
  });

  let fromLoc = $state(initialFrom);
  let toLoc = $state(initialTo);
  let profile: RoutingProfile = $state('fastest');

  const locations = $derived(venue ? Object.entries(venue.metadata.locations) : []);

  function nodeFor(locId: string): string | null {
    return venue?.metadata.locations[locId]?.entrances[0] ?? null;
  }

  const route = $derived.by<Route | null>(() => {
    const from = nodeFor(fromLoc);
    const to = nodeFor(toLoc);
    if (!venue || !from || !to || from === to) return null;
    return findRoute(venue.graph, from, to, profile);
  });

  const nodeCoords = $derived.by<Map<string, { x: number; y: number }>>(() => {
    // Fresh map per derivation — not reactive state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<string, { x: number; y: number }>();
    for (const n of venue?.graph.nodes ?? []) map.set(n.id, { x: n.x, y: n.y });
    return map;
  });

  const routePoints = $derived(
    route
      ? route.nodeIds
          .map((id) => nodeCoords.get(id))
          .filter((c): c is { x: number; y: number } => Boolean(c))
      : [],
  );

  const routePolyline = $derived(routePoints.map((p) => `${p.x},${p.y}`).join(' '));

  const svgViewBox = $derived.by<string>(() => {
    if (!venue) return '0 0 800 760';
    const m = venue.svg.match(/viewBox="([^"]+)"/);
    return m?.[1] ?? '0 0 800 760';
  });

  function locationLabel(id: string): string {
    return id.replace(/-/g, ' ');
  }

  function nodeLabel(nodeId: string): string {
    return nodeId.replace(/(gf|ff)-/g, '');
  }
</script>

{#if venueError}
  <section class="empty" role="alert">
    <p>The venue map could not be loaded.</p>
    <p class="small">{venueError}</p>
  </section>
{:else if !venue}
  <p role="status">Loading venue…</p>
{:else}
  <div class="controls">
    <label>
      <span class="sr-only">You are at</span>
      <select bind:value={fromLoc} aria-label="You are at">
        <option value="">Where are you?</option>
        {#each locations as [id, ref] (id)}
          <option value={id}>{ref.floor === 'first' ? '↑ ' : ''}{locationLabel(id)}</option>
        {/each}
      </select>
    </label>
    <label>
      <span class="sr-only">Destination</span>
      <select bind:value={toLoc} aria-label="Destination">
        <option value="">Where to?</option>
        {#each locations as [id, ref] (id)}
          <option value={id}>{ref.floor === 'first' ? '↑ ' : ''}{locationLabel(id)}</option>
        {/each}
      </select>
    </label>
    <div class="seg" role="group" aria-label="Routing profile">
      <button class:active={profile === 'fastest'} onclick={() => (profile = 'fastest')}
        >Fastest</button
      >
      <button class:active={profile === 'accessible'} onclick={() => (profile = 'accessible')}
        >Accessible</button
      >
      <button class:active={profile === 'avoid-stairs'} onclick={() => (profile = 'avoid-stairs')}
        >No stairs</button
      >
    </div>
  </div>

  <div class="mapwrap">
    <div class="svg" role="img" aria-label="Venue floor plan">
      <!-- trusted static asset bundled with the app, not user input -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html venue.svg}
      {#if route && routePoints.length > 1}
        <svg viewBox={svgViewBox} class="overlay" aria-hidden="true">
          <polyline class="route" points={routePolyline} />
          {#if routePoints[0]}
            <circle class="mark start" cx={routePoints[0].x} cy={routePoints[0].y} r="6" />
          {/if}
          {#if routePoints.at(-1)}
            <circle class="mark end" cx={routePoints.at(-1)!.x} cy={routePoints.at(-1)!.y} r="6" />
          {/if}
        </svg>
      {/if}
    </div>
  </div>

  {#if route}
    <section class="routeinfo" aria-live="polite">
      <h2>
        {locationLabel(fromLoc)} → {locationLabel(toLoc)}
      </h2>
      <p class="muted">
        {Math.round(route.durationSeconds / 60)} min walk · {Math.round(route.distanceMeters)} m
        {#if route.restricted}<span class="tag">accessible route</span>{/if}
      </p>
      <ol class="steps">
        {#each route.segments as seg, i (i)}
          <li>
            <strong>{nodeLabel(seg.fromNode)}</strong>
            {seg.instruction ? `→ ${seg.instruction} →` : '→'}
            <strong>{nodeLabel(seg.toNode)}</strong>
            <span class="floor">({seg.floor})</span>
          </li>
        {/each}
      </ol>
    </section>
  {:else if fromLoc && toLoc && fromLoc !== toLoc}
    <p class="muted">No route found with this profile.</p>
  {/if}
{/if}

<style>
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0.8rem 0;
  }
  .controls select {
    width: 100%;
    padding: 0.6rem 0.7rem;
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
    flex: 1;
    border: none;
    background: var(--surface);
    padding: 0.5rem;
    cursor: pointer;
    font-size: 0.82rem;
  }
  .seg button.active {
    background: var(--event-primary-dark);
    color: #fff;
  }
  .mapwrap {
    border: 1px solid color-mix(in srgb, var(--text-muted) 25%, transparent);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--surface-raised);
  }
  .svg {
    position: relative;
    width: 100%;
  }
  .svg :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }
  .svg .overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .route {
    fill: none;
    stroke: var(--event-accent);
    stroke-width: 5;
    stroke-linejoin: round;
    stroke-dasharray: 12 6;
    animation: dash 1.2s linear infinite;
  }
  .mark {
    stroke: #fff;
    stroke-width: 2;
  }
  .mark.start {
    fill: var(--success);
  }
  .mark.end {
    fill: var(--danger);
  }
  @keyframes dash {
    to {
      stroke-dashoffset: -18;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .route {
      animation: none;
    }
  }
  .routeinfo {
    margin-top: 1rem;
    background: var(--surface-raised);
    border-radius: var(--radius);
    padding: 0.8rem 1rem;
  }
  .routeinfo h2 {
    margin: 0 0 0.3rem;
    font-size: 1rem;
  }
  .tag {
    font-size: 0.7rem;
    background: color-mix(in srgb, var(--success) 15%, transparent);
    color: var(--success);
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
    margin-left: 0.4rem;
  }
  .steps {
    list-style: none;
    padding: 0;
    margin: 0.6rem 0 0;
  }
  .steps li {
    font-size: 0.85rem;
    padding: 0.2rem 0;
    color: var(--text-muted);
  }
  .steps strong {
    color: var(--text);
  }
  .floor {
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
