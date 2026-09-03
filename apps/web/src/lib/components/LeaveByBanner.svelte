<script lang="ts">
  import { untrack } from 'svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { formatTime } from '@indiafoss/schedule';
  import { clockFromParams, isFixedClock } from '$lib/clock';
  import { eventState } from '$lib/event.svelte';
  import { bookmarked, dispositionOf } from '$lib/prefs.svelte';
  import { computeNextUp } from '$lib/nextup';
  import { logSimEvent, simState, tickInterval } from '$lib/simulator.svelte';

  const BUFFER_SECONDS = 300;

  // The `?now=` time-travel parameter works here as on the Now screen.
  const clock = $derived(
    clockFromParams(page.url.searchParams.get('now'), page.url.searchParams.get('speed')),
  );
  let now = $state('');

  $effect(() => {
    now = clock.now();
    if (isFixedClock(clock)) return;
    const timer = setInterval(
      () => {
        now = clock.now();
      },
      simState.run ? tickInterval(30_000) : 30_000,
    );
    return () => clearInterval(timer);
  });

  const bundle = $derived(eventState.bundle);

  const next = $derived(
    bundle && now
      ? computeNextUp({
          bundle,
          now,
          bookmarked,
          mustAttend: (id) => dispositionOf(id) === 'must-attend',
          venue: null,
          currentLocation: null,
          profile: 'fastest',
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

  const urgent = $derived((next?.startsInMinutes ?? 99) <= 5);

  const kicker = $derived.by(() => {
    if (!next) return '';
    if (next.startsInMinutes <= 0) return 'STARTING NOW';
    return `STARTS IN ${next.startsInMinutes} MIN`;
  });

  // Under the simulator, every change of what the banner says is logged: it is
  // the prompt an attendee would see on the day.
  // One entry per session and state (upcoming, leave now, starting), not one
  // per minute of countdown.
  let lastBanner = '';
  $effect(() => {
    const key = next
      ? `${next.activity.id}|${urgent}|${next.startsInMinutes <= 0 ? 'now' : 'soon'}`
      : '';
    if (!simState.run || key === lastBanner) return;
    lastBanner = key;
    const line = next ? `${kicker} · ${next.activity.title}` : '';
    const room = roomName ?? undefined;
    if (line) untrack(() => logSimEvent('banner', line, room));
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
  <a
    class="leaveby"
    class:urgent
    class:must={next.mustAttend}
    {href}
    aria-label="{next.mustAttend ? 'Must attend, ' : ''}{kicker}: {next.activity.title}"
  >
    <span class="kicker">
      {#if next.mustAttend}<span class="musttag">★ MUST ATTEND</span> ·
      {/if}{kicker}
      <span class="clock">· {formatTime(next.activity.start!)}</span>
    </span>
    <span class="detail">
      <strong>{next.activity.title}</strong>
      {#if roomName}· {roomName}{/if}
      {#if next.planned && !next.mustAttend}· bookmarked{/if}
    </span>
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}

<style>
  .leaveby {
    position: sticky;
    top: calc(64px + var(--safe-top));
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
  .leaveby.must {
    border-left: 4px solid var(--amber);
  }
  .musttag {
    color: var(--amber-ink);
  }
  .leaveby.urgent .musttag {
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
