<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { formatTime } from '@indiafoss/schedule';
  import { clockFromParams, isFixedClock } from '$lib/clock';
  import { eventState } from '$lib/event.svelte';
  import { bookmarked } from '$lib/prefs.svelte';
  import { currentLocation, hydrateLocation } from '$lib/location.svelte';
  import { hydrateRoutingProfile, routingPrefs } from '$lib/routingPrefs.svelte';
  import { loadVenue, venueKeyForEvent } from '$lib/venue.svelte';
  import { computeNextUp } from '$lib/nextup';

  const BUFFER_SECONDS = 300;

  // The `?now=` time-travel parameter works here as on the Now screen.
  const clock = $derived(clockFromParams(page.url.searchParams.get('now')));
  let now = $state('');

  $effect(() => {
    now = clock.now();
    if (isFixedClock(clock)) return;
    const timer = setInterval(() => {
      now = clock.now();
    }, 30_000);
    return () => clearInterval(timer);
  });

  const bundle = $derived(eventState.bundle);
  let venue = $state<Awaited<ReturnType<typeof loadVenue>> | null>(null);

  $effect(() => {
    if (!bundle) return;
    void hydrateLocation();
    void hydrateRoutingProfile();
    void loadVenue(venueKeyForEvent(bundle.id))
      .then((v) => {
        venue = v;
      })
      .catch(() => {
        venue = null;
      });
  });

  const next = $derived(
    bundle && now
      ? computeNextUp({
          bundle,
          now,
          bookmarked,
          venue,
          currentLocation: currentLocation.value,
          profile: routingPrefs.profile,
          bufferSeconds: BUFFER_SECONDS,
        })
      : null,
  );

  const roomName = $derived(
    next?.activity.locationId
      ? (bundle?.locations.find((l) => l.id === next.activity.locationId)?.name ??
          next.activity.locationId)
      : null,
  );

  const urgent = $derived(next?.leaveInMinutes !== null && (next?.leaveInMinutes ?? 99) <= 5);

  const kicker = $derived.by(() => {
    if (!next) return '';
    if (next.leaveInMinutes === null) return `STARTS IN ${next.startsInMinutes} MIN`;
    if (next.leaveInMinutes <= 0) return 'LEAVE NOW';
    return `LEAVE IN ${next.leaveInMinutes} MIN`;
  });

  const href = $derived(
    next?.activity.locationId
      ? resolve(`/map/to/${next.activity.locationId}`)
      : resolve(`/activity/${next?.activity.id ?? ''}`),
  );
</script>

{#if next}
  <!-- `href` is built with resolve() above; the rule cannot see through the derived. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -- resolved in script -->
  <a class="leaveby" class:urgent {href} aria-label="{kicker}: {next.activity.title}">
    <span class="kicker">
      {kicker}
      {#if next.leaveBy}<span class="clock">· {formatTime(next.leaveBy)}</span>{/if}
    </span>
    <span class="detail">
      <strong>{next.activity.title}</strong>
      {#if roomName}· {roomName}{/if}
      · starts {formatTime(next.activity.start!)}
      {#if next.travelSeconds !== null}
        · {Math.max(1, Math.round(next.travelSeconds / 60))} min walk
      {/if}
      {#if next.floorChange}
        · take the {routingPrefs.profile === 'fastest' ? 'stairs' : 'lift'}
      {/if}
    </span>
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}

<style>
  .leaveby {
    position: sticky;
    top: 64px;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.45rem 1rem;
    background: var(--mint-soft);
    color: var(--mint-ink);
    text-decoration: none;
    border-bottom: 1px solid var(--line);
  }
  .leaveby.urgent {
    background: var(--amber);
    color: var(--ink);
  }
  .kicker {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
  }
  .clock {
    font-weight: 400;
  }
  .detail {
    font-size: 0.8rem;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail strong {
    font-weight: 600;
  }
</style>
