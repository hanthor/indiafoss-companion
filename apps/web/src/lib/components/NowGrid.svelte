<script lang="ts">
  import type { Activity, EventBundle } from '@indiafoss/model';
  import { resolve } from '$app/paths';
  import { activityProgress, formatTime } from '@indiafoss/schedule';

  /**
   * Happening now as a horizontal time-grid: one row per room, time running
   * left to right, one rich card per talk. The schedule TimelineGrid
   * transposed, so the rules match it: rooms in numeric-aware order, the span
   * from the earliest start to the latest end (never under an hour), hour
   * ticks on whole hours, first-fit lanes for overlaps in one room.
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

  /** Pixel width per minute of wall time; cards never get narrower than this. */
  const PPM = 3;
  const MIN_CARD = 160;
  const CARD_HEIGHT = 148;

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
      return [...groups.entries()].sort(([a], [b]) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
    })(),
  );

  const starts = $derived(
    activities
      .map((a) => a.start)
      .filter((s): s is string => Boolean(s))
      .sort(),
  );
  const ends = $derived(
    activities
      .map((a) => a.end)
      .filter((s): s is string => Boolean(s))
      .sort(),
  );
  const dayStartMs = $derived(
    starts.length > 0 ? Date.parse(starts[0]!) : Date.parse(`${day}T00:00:00+05:30`),
  );
  const dayEndMs = $derived(ends.length > 0 ? Date.parse(ends.at(-1)!) : dayStartMs + 60 * 60000);
  const totalMinutes = $derived(Math.max(60, (dayEndMs - dayStartMs) / 60000));
  const totalWidth = $derived(totalMinutes * PPM);
  const nowX = $derived(((Date.parse(now) - dayStartMs) / 60000) * PPM);

  const hours = $derived(
    (() => {
      const list: string[] = [];
      const offset = 330 * 60000;
      const firstHour = Math.ceil((dayStartMs + offset) / 3600000) * 3600000 - offset;
      for (let ms = firstHour; ms <= dayEndMs + 60000; ms += 3600000) {
        list.push(new Date(ms).toISOString());
      }
      return list;
    })(),
  );

  /** First-fit lanes for one room's sessions, like the schedule grid. */
  function layout(
    acts: Activity[],
  ): { act: Activity; left: number; width: number; lane: number; lanes: number }[] {
    const sorted = [...acts].sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!));
    const laneEnds: number[] = [];
    const assigned: { act: Activity; lane: number }[] = [];
    for (const act of sorted) {
      const s = Date.parse(act.start!);
      const e = Date.parse(act.end!);
      let lane = laneEnds.findIndex((end) => end <= s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = Math.max(laneEnds[lane] ?? 0, e);
      assigned.push({ act, lane });
    }
    const lanes = Math.max(1, laneEnds.length);
    return assigned.map(({ act, lane }) => ({
      act,
      left: ((Date.parse(act.start!) - dayStartMs) / 60000) * PPM,
      width: Math.max(
        MIN_CARD,
        ((Date.parse(act.end!) - Date.parse(act.start!)) / 60000) * PPM,
      ),
      lane,
      lanes,
    }));
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

  const hourLabel = (iso: string): string =>
    new Date(iso).toLocaleTimeString('en-GB', {
      timeZone: bundle.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  let scroller: HTMLDivElement | null = $state(null);

  // Open on now, with a little of the past peeking in from the left.
  $effect(() => {
    if (scroller && nowX >= 0) {
      scroller.scrollTo({ left: Math.max(0, nowX - 80) });
    }
  });
</script>

<div class="nowgrid" data-testid="now-grid" bind:this={scroller}>
  <div class="ruler" style:width="{totalWidth}px">
    {#each hours as hour (hour)}
      <span
        class="tick"
        style:left="{((Date.parse(hour) - dayStartMs) / 60000) * PPM}px">{hourLabel(hour)}</span
      >
    {/each}
  </div>

  {#each byLocation as [locId, acts] (locId)}
    {@const slots = layout(acts)}
    {@const lanes = Math.max(1, ...slots.map((s) => s.lanes))}
    <h3 class="rowhead">{locationName(locId) ?? locId}</h3>
    <div class="lanes" style:width="{totalWidth}px" style:height="{lanes * (CARD_HEIGHT + 8)}px">
      {#each slots as slot (slot.act.id)}
        {@const progress = activityProgress(slot.act, now)}
        {@const running = progress > 0 && progress < 1}
        {@const label = `${slot.act.title}, ${formatTime(slot.act.start!)}–${formatTime(slot.act.end!)}, ${locationName(locId)}`}
        <a
          class="card"
          class:running
          class:cancelled={slot.act.cancelled}
          href={resolve(`/activity/${slot.act.id}`)}
          aria-label={label}
          title={slot.act.title}
          style:left="{slot.left}px"
          style:width="{slot.width}px"
          style:top="{slot.lane * (CARD_HEIGHT + 8)}px"
        >
          <span class="meta">{running ? 'Now · ' : ''}{formatTime(slot.act.start!)}–{formatTime(
            slot.act.end!,
          )}</span>
          {#if trackName(slot.act)}<span class="track">{trackName(slot.act)}</span>{/if}
          <strong class="title">{slot.act.title}</strong>
          {#if speakerNames(slot.act)}<span class="speakers">{speakerNames(slot.act)}</span>{/if}
          {#if running}
            <span
              class="progress"
              role="progressbar"
              aria-label="Progress of {slot.act.title}"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style:width="{Math.round(progress * 100)}%"></span>
            </span>
          {/if}
        </a>
      {/each}
      {#if nowX >= 0 && nowX <= totalWidth}
        <div class="nowline" style:left="{nowX}px" aria-hidden="true"></div>
      {/if}
    </div>
  {/each}
</div>

<style>
  /* The region scrolls sideways internally; the page itself never grows. */
  .nowgrid {
    overflow-x: auto;
    max-width: 100%;
    padding-bottom: 0.5rem;
  }
  .ruler {
    position: relative;
    height: 1.6rem;
  }
  .tick {
    position: absolute;
    transform: translateX(-50%);
    font-size: 0.7rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .rowhead {
    position: sticky;
    left: 0;
    display: inline-block;
    margin: 0.9rem 0 0.35rem;
    padding: 0.15rem 0.6rem 0.15rem 0;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted);
    background: var(--surface);
  }
  .lanes {
    position: relative;
  }
  .card {
    position: absolute;
    display: block;
    overflow: hidden;
    height: 148px;
    box-sizing: border-box;
    background: var(--surface-raised);
    border: 1px solid var(--line);
    border-left: 3px solid var(--event-primary);
    border-radius: 8px;
    padding: 0.45rem 0.6rem;
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
    margin-top: 0.2rem;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--line);
    font-size: 0.62rem;
    font-weight: 600;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: 0.2rem;
    font-size: 0.8rem;
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
    margin-top: 0.4rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-muted) 25%, transparent);
    overflow: hidden;
  }
  .progress > span {
    display: block;
    height: 100%;
    background: var(--event-primary);
  }
  .nowline {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--event-primary);
  }
</style>
