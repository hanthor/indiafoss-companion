<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type { Activity } from '@indiafoss/model';
  import {
    activityProgress,
    computeNowState,
    formatDayLabel,
    formatTime,
  } from '@indiafoss/schedule';
  import { clockFromParams, isFixedClock } from '$lib/clock';
  import { tickInterval } from '$lib/simulator.svelte';
  import { eventState } from '$lib/event.svelte';
  import { loadVenue, venueKeyForEvent } from '$lib/venue.svelte';
  import {
    currentLocation,
    hydrateLocation,
    locationIdFromDeepLink,
    setCurrentLocation,
  } from '$lib/location.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';
  import { sessionRoomLink } from '$lib/element-links';

  const clock = clockFromParams(
    page.url.searchParams.get('now'),
    page.url.searchParams.get('speed'),
  );
  let now: string = $state(clock.now());

  $effect(() => {
    if (isFixedClock(clock)) return;
    const timer = setInterval(() => {
      now = clock.now();
    }, tickInterval(1000));
    return () => clearInterval(timer);
  });

  const bundle = $derived(eventState.bundle);
  const nowState = $derived(bundle ? computeNowState(bundle, now) : null);

  const venueKey = $derived(bundle ? venueKeyForEvent(bundle.id) : 'synthetic');
  let venue = $state<Awaited<ReturnType<typeof loadVenue>> | null>(null);

  // Deep-link / QR entry: ?at=<location-id> sets the current location.
  // Hydrate first so the stored value never clobbers the deep link.
  $effect(() => {
    const at = page.url.searchParams.get('at');
    void (async () => {
      await hydrateLocation();
      if (at) await setCurrentLocation(locationIdFromDeepLink(at) ?? at);
    })();
    void loadVenue(venueKey).then((v) => {
      venue = v;
    });
  });

  const locationName = (a: Activity): string | undefined =>
    bundle?.locations.find((l) => l.id === a.locationId)?.name;

  const venueLocations = $derived(
    (venue ? Object.entries(venue.metadata.locations) : []) as [string, { floor?: string }][],
  );

  function minutesUntil(endIso: string, nowIso: string): string {
    const mins = Math.max(0, Math.ceil((Date.parse(endIso) - Date.parse(nowIso)) / 60000));
    if (mins < 1) return 'under a minute';
    return `${mins} min`;
  }
</script>

<EventGate>
  <h1>Now</h1>

  {#if isFixedClock(clock)}
    <p class="devtime"><span class="devtag">DEV CLOCK</span> {now}</p>
  {/if}

  {#if !nowState}
    <p>Loading…</p>
  {:else if nowState!.phase === 'before'}
    <section class="card">
      <h2>Not started yet</h2>
      <p>
        IndiaFOSS starts {formatDayLabel(bundle!.start.slice(0, 10))} at {formatTime(
          bundle!.start,
        )}.
      </p>
      {#if nowState!.next}
        <h3>First up</h3>
        <a href={resolve(`/activity/${nowState!.next.id}`)}>{nowState!.next.title}</a>
      {/if}
    </section>
  {:else if nowState!.phase === 'after'}
    <section class="card">
      <h2>That's a wrap</h2>
      <p>The conference has ended. See you at the next one!</p>
    </section>
  {:else}
    <section class="card" aria-labelledby="now-heading">
      <h2 id="now-heading">Happening now</h2>
      {#if nowState!.current.length === 0}
        <p class="muted">Between sessions — take a break or explore the map.</p>
      {:else}
        {#each nowState!.current as activity (activity.id)}
          {@const room = sessionRoomLink(bundle, activity.id, activity.locationId, activity.title)}
          <div class="session">
            <div class="row">
              <a href={resolve(`/activity/${activity.id}`)}>{activity.title}</a>
              <TypeBadge type={activity.type} />
            </div>
            <p class="muted">
              {locationName(activity)}
              {#if room}
                <!-- eslint-disable svelte/no-navigation-without-resolve -- external matrix.to link -->
                ·
                <a href={room.href} title={room.alias}>💬 chat</a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
              {/if}
              {#if activity.livestreamUrl}
                <!-- eslint-disable svelte/no-navigation-without-resolve -- external stream link -->
                ·
                <a href={activity.livestreamUrl} target="_blank" rel="noreferrer">▶ watch live ↗</a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
              {/if}
            </p>
            <div
              class="progress"
              role="progressbar"
              aria-label="Progress of {activity.title}"
              aria-valuenow={Math.round(activityProgress(activity, now) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                class="fill"
                style:width="{Math.round(activityProgress(activity, now) * 100)}%"
              ></div>
            </div>
            <p class="muted small">
              {formatTime(activity.start!)}–{formatTime(activity.end!)} · ends in
              {minutesUntil(activity.end!, now)}
            </p>
          </div>
        {/each}
      {/if}
    </section>

    {#if nowState!.next}
      <section class="card" aria-labelledby="next-heading">
        <h2 id="next-heading">Next</h2>
        <div class="row big">
          <a href={resolve(`/activity/${nowState!.next.id}`)}>{nowState!.next.title}</a>
          <TypeBadge type={nowState!.next.type} />
        </div>
        <p class="muted">
          {locationName(nowState!.next)} · {formatTime(nowState!.next.start!)} · starts in
          {minutesUntil(nowState!.next.start!, now)}
        </p>

        {#if currentLocation.value}
          <p class="leave">
            You are at <strong
              >{locationName({ locationId: currentLocation.value } as Activity) ??
                currentLocation.value.replace(/-/g, ' ')}</strong
            >.
          </p>
          <div class="actions">
            <a class="cta" href={resolve(`/map/to/${nowState!.next.locationId}`)}>Show on map</a>
            <button class="ghost" onclick={() => setCurrentLocation(null)}>Clear my location</button
            >
          </div>
        {:else}
          <p class="muted small">Tell the app where you are and the map opens on your room.</p>
          <label>
            <span class="sr-only">Set your current location</span>
            <select
              aria-label="Set your current location"
              value={currentLocation.value ?? ''}
              onchange={(e) => setCurrentLocation(e.currentTarget.value || null)}
            >
              <option value="">Where are you?</option>
              {#each venueLocations as [id, ref] (id)}
                <option value={id}
                  >{ref.floor === 'first' ? '↑ ' : ''}{id.replace(/-/g, ' ')}</option
                >
              {/each}
            </select>
          </label>
        {/if}
      </section>
    {/if}
  {/if}
</EventGate>

<style>
  .devtime {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0.5rem;
    border: 1px dashed var(--amber);
    border-radius: var(--radius);
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-muted);
  }
  .devtag {
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--amber-ink);
  }
  .card {
    background: var(--surface-raised);
    border-radius: var(--radius);
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .card h2 {
    margin: 0 0 0.75rem;
    font-size: 1.05rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
  }
  .row a {
    color: var(--text);
    font-weight: 600;
    text-decoration: none;
  }
  .row a:hover {
    text-decoration: underline;
    text-decoration-color: var(--event-accent);
  }
  .row.big {
    font-size: 1.1rem;
  }
  .muted {
    color: var(--text-muted);
    margin: 0.3rem 0;
  }
  .small {
    font-size: 0.82rem;
  }
  .session {
    border-top: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
    padding-top: 0.6rem;
    margin-top: 0.6rem;
  }
  .progress {
    height: 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-muted) 20%, transparent);
    overflow: hidden;
    margin: 0.4rem 0;
  }
  .fill {
    height: 100%;
    background: var(--event-primary);
    border-radius: 999px;
    transition: width 1s linear;
  }
  .leave {
    margin: 0.35rem 0;
    font-size: 0.95rem;
  }
  .actions {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }
  .cta {
    display: inline-block;
    background: var(--event-primary);
    color: var(--ink);
    padding: 0.55rem 1.2rem;
    border-radius: 999px;
    text-decoration: none;
    font-weight: 600;
  }
  .ghost {
    border: 1px solid color-mix(in srgb, var(--text-muted) 35%, transparent);
    background: var(--surface);
    border-radius: 999px;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  select {
    width: 100%;
    padding: 0.6rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--text-muted) 35%, transparent);
    border-radius: 10px;
    font-size: 0.95rem;
    margin-top: 0.3rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
