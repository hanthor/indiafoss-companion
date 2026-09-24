<script lang="ts">
  import type { Activity, EventBundle } from '@indiafoss/model';
  import { resolve } from '$app/paths';
  import { activityProgress, formatTime } from '@indiafoss/schedule';

  /**
   * Happening now, one lane per room. Each lane scrolls sideways on its own
   * and opens on the talk running in that room, so the first screen is the
   * whole venue right now and everything later is a scroll to the right.
   *
   * Cards are a fixed, readable width rather than one scaled to the talk's
   * length: a ten-minute lightning talk needs the same room for its title as
   * an hour-long one, and a grid scaled to time gave it a sliver (#657).
   * The room name is rotated into the left margin so it stays put while the
   * lane scrolls and costs almost no width.
   */
  let {
    activities,
    bundle,
    day,
    now,
  }: {
    activities: Activity[];
    bundle: EventBundle;
    day: string;
    now: string;
  } = $props();

  const byLocation = $derived(
    (() => {
      // Fresh Map per derivation — not reactive state, so SvelteMap is unnecessary.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const groups = new Map<string, Activity[]>();
      for (const a of activities) {
        if (!a.locationId || !a.start || !a.end || Date.parse(a.end) <= Date.parse(a.start))
          continue;
        const list = groups.get(a.locationId) ?? [];
        list.push(a);
        groups.set(a.locationId, list);
      }
      for (const list of groups.values()) {
        list.sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!));
      }
      return [...groups.entries()].sort(([a], [b]) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
    })(),
  );

  /**
   * The card a lane opens on: what is running in that room, else the next
   * talk there, else the last one so a finished room shows its own end rather
   * than its morning.
   */
  function anchorId(acts: Activity[]): string | undefined {
    const nowMs = Date.parse(now);
    const running = acts.find((a) => Date.parse(a.start!) <= nowMs && Date.parse(a.end!) > nowMs);
    const next = acts.find((a) => Date.parse(a.start!) > nowMs);
    return (running ?? next ?? acts.at(-1))?.id;
  }

  const locationName = (id: string): string | undefined =>
    bundle.locations.find((l) => l.id === id)?.name;

  const trackName = (activity: Activity): string | undefined =>
    (
      bundle.tracks.find((track) => track.id === activity.devroomId) ??
      bundle.tracks.find((track) => track.id === activity.trackId)
    )?.name;

  const speakerNames = (activity: Activity): string =>
    activity.speakerIds
      .map((id) => bundle.people.find((p) => p.id === id)?.name)
      .filter((name): name is string => Boolean(name))
      .join(', ');

  /**
   * Scroll each lane to its anchor card. Keyed on the day and the clock so a
   * time-travelled clock re-anchors, and written without smooth scrolling so
   * the first paint is already in the right place.
   */
  function openOnNow(lane: HTMLElement) {
    const card = lane.querySelector<HTMLElement>('[data-anchor="true"]');
    lane.scrollLeft = card ? card.offsetLeft : 0;
  }

  let lanes = $state<HTMLElement[]>([]);
  $effect(() => {
    void day;
    void now;
    for (const lane of lanes) if (lane) openOnNow(lane);
  });
</script>

<div class="nowgrid" data-testid="now-grid">
  {#each byLocation as [locId, acts], row (locId)}
    {@const name = locationName(locId) ?? locId}
    {@const anchor = anchorId(acts)}
    <section class="room">
      <h3 class="rowhead"><span>{name}</span></h3>
      <!-- A scrollable region needs to be reachable by keyboard to be scrollable by keyboard. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="lane"
        role="group"
        aria-label="{name}, by time"
        tabindex="0"
        bind:this={lanes[row]}
      >
        {#each acts as act (act.id)}
          {@const progress = activityProgress(act, now)}
          {@const running = progress > 0 && progress < 1}
          {@const label = `${act.title}, ${formatTime(act.start!)}–${formatTime(act.end!)}, ${name}`}
          <a
            class="card"
            class:running
            class:cancelled={act.cancelled}
            href={resolve(`/activity/${act.id}`)}
            aria-label={label}
            data-anchor={act.id === anchor}
          >
            <span class="meta"
              >{running ? 'Now · ' : ''}{formatTime(act.start!)}–{formatTime(act.end!)}</span
            >
            {#if trackName(act)}<span class="track">{trackName(act)}</span>{/if}
            <strong class="title">{act.title}</strong>
            {#if speakerNames(act)}<span class="speakers">{speakerNames(act)}</span>{/if}
            {#if running}
              <span
                class="progress"
                role="progressbar"
                aria-label="Progress of {act.title}"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style:width="{Math.round(progress * 100)}%"></span>
              </span>
            {/if}
          </a>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .nowgrid {
    /* Near the full lane, with a sliver of the next talk left showing so the
       lane reads as scrollable without a scrollbar to prove it. */
    --card-w: min(21rem, 100% - 2.25rem);
    --card-h: 8.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    /* Lanes scroll inside themselves; the page never grows sideways. */
    max-width: 100%;
    overflow-x: hidden;
  }
  .room {
    display: flex;
    align-items: stretch;
    gap: 0.4rem;
    min-width: 0;
  }
  /* Frozen in the left margin: the lane scrolls under it, the name does not. */
  .rowhead {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.4rem;
    margin: 0;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  .rowhead span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    max-height: var(--card-h);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lane {
    position: relative;
    display: flex;
    gap: 0.5rem;
    min-width: 0;
    flex: 1 1 auto;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    padding-bottom: 0.35rem;
  }
  .lane:focus-visible {
    outline: 2px solid var(--event-primary);
    outline-offset: 2px;
  }
  .card {
    flex: 0 0 var(--card-w);
    scroll-snap-align: start;
    display: flex;
    flex-direction: column;
    height: var(--card-h);
    box-sizing: border-box;
    overflow: hidden;
    background: var(--surface-raised);
    border: 1px solid var(--line);
    border-left: 3px solid var(--event-primary);
    border-radius: 8px;
    padding: 0.5rem 0.65rem;
    color: var(--text);
    text-decoration: none;
    font-size: 0.75rem;
    line-height: 1.3;
  }
  .card.running {
    background: color-mix(in srgb, var(--mint-soft) 55%, var(--surface-raised));
    border-left-color: var(--mint);
  }
  .card:hover {
    border-color: var(--event-accent);
  }
  .card.cancelled {
    opacity: 0.8;
    text-decoration: line-through;
  }
  .meta {
    display: block;
    font-size: 0.68rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .running .meta {
    color: var(--event-primary-text);
    font-weight: 700;
  }
  .track {
    display: inline-block;
    align-self: flex-start;
    margin-top: 0.2rem;
    max-width: 100%;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
    font-size: 0.62rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: 0.25rem;
    font-size: 0.85rem;
  }
  .speakers {
    display: block;
    margin-top: 0.15rem;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .progress {
    display: block;
    height: 4px;
    margin-top: auto;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-muted) 25%, transparent);
    overflow: hidden;
  }
  .progress > span {
    display: block;
    height: 100%;
    background: var(--event-primary);
  }
</style>
