<script lang="ts">
  import type { Activity, EventBundle } from '@indiafoss/model';
  import { resolve } from '$app/paths';
  import { formatTime } from '@indiafoss/schedule';

  /** Pixel height per minute of wall time. */
  const PPM = 2;
  /** Fixed width of each location column. */
  const COLUMN_WIDTH = 240;

  let {
    activities,
    bundle,
    day,
    plannedIds = new Set<string>(),
  }: {
    activities: Activity[];
    bundle: EventBundle;
    day: string;
    plannedIds?: Set<string>;
  } = $props();

  // locationId -> activities, as a plain array of entries (kept non-reactive).
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
  const totalHeight = $derived(totalMinutes * PPM);

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

  /** Lane layout for overlapping sessions within one location column (§11.2). */
  function layout(
    acts: Activity[],
  ): { act: Activity; top: number; height: number; left: number; width: number }[] {
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
      top: ((Date.parse(act.start!) - dayStartMs) / 60000) * PPM,
      height: Math.max(12, ((Date.parse(act.end!) - Date.parse(act.start!)) / 60000) * PPM),
      left: (lane / lanes) * 100,
      width: 100 / lanes,
    }));
  }

  const locationName = (id: string): string | undefined =>
    bundle.locations.find((l) => l.id === id)?.name;

  const hourLabel = (iso: string): string =>
    new Date(iso).toLocaleTimeString('en-GB', {
      timeZone: bundle.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
</script>

<div
  class="timeline"
  role="region"
  aria-label="Schedule by room and time"
  tabindex="0"
  style:--total-height="{totalHeight}px"
>
  <div class="ruler">
    {#each hours as hour (hour)}
      <div class="tick" style:top="{((Date.parse(hour) - dayStartMs) / 60000) * PPM + 36}px">
        <span>{hourLabel(hour)}</span>
      </div>
    {/each}
  </div>

  <div class="columns">
    {#each byLocation as [locId, acts] (locId)}
      <div class="column" style:--column-width="{COLUMN_WIDTH}px">
        <h3 class="colhead">{locationName(locId) ?? locId}</h3>
        <div class="colbody">
          {#each layout(acts) as slot (slot.act.id)}
            <a
              class="cell"
              class:planned={plannedIds.has(slot.act.id)}
              class:cancelled={slot.act.cancelled}
              class:meal={slot.act.type === 'meal'}
              aria-label={`${slot.act.title}, ${formatTime(slot.act.start!)}–${formatTime(slot.act.end!)}, ${locationName(locId)}`}
              href={resolve(`/activity/${slot.act.id}`)}
              style:top="{slot.top}px"
              style:height="{slot.height}px"
              style:left="{slot.left}%"
              style:width="{slot.width}%"
              title={slot.act.title}
            >
              {#if plannedIds.has(slot.act.id)}<span class="planned-mark">Planned · </span>{/if}
              <strong>{slot.act.title}</strong>
            </a>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .cell.planned {
    box-shadow: inset 3px 0 0 var(--mint);
  }
  .planned-mark {
    font-size: 0.7rem;
    font-weight: 600;
  }
  .timeline {
    display: flex;
    gap: 0;
    overflow: auto;
    max-height: 72vh;
    position: relative;
    --total-height: 600px;
  }
  .ruler {
    position: sticky;
    left: 0;
    z-index: 3;
    background: var(--surface);
    width: 56px;
    flex-shrink: 0;
    height: var(--total-height);
  }
  .tick {
    position: absolute;
    right: 4px;
    transform: translateY(-50%);
    font-size: 0.7rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .columns {
    display: flex;
    gap: 8px;
    flex: 1;
  }
  .column {
    flex-shrink: 0;
    width: var(--column-width);
    border-left: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
  }
  @media (min-width: 1024px) {
    .timeline {
      max-height: calc(100dvh - 21rem);
      min-height: 24rem;
    }
    /* Rooms share the width equally; six of them fit a 1200px reading
       column, and narrower screens scroll the region sideways as before. */
    .column {
      flex: 1 1 0;
      width: auto;
      min-width: 11rem;
    }
  }
  .colhead {
    position: sticky;
    top: 0;
    height: 36px;
    box-sizing: border-box;
    background: var(--surface);
    z-index: 1;
    margin: 0;
    padding: 0.4rem 0.5rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 18%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .colbody {
    position: relative;
    height: var(--total-height);
  }
  .cell.meal {
    background: var(--surface-raised);
    border-style: dashed;
    color: var(--text-muted);
  }
  .cell {
    position: absolute;
    display: block;
    overflow: hidden;
    background: color-mix(in srgb, var(--event-primary) 12%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--event-primary) 45%, transparent);
    border-radius: 6px;
    padding: 0.2rem 0.35rem;
    color: var(--text);
    text-decoration: none;
    font-size: 0.68rem;
    line-height: 1.25;
  }
  .cell strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell.cancelled {
    opacity: 0.8;
    text-decoration: line-through;
  }
  .cell:hover {
    border-color: var(--event-accent);
  }
</style>
