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
  }: {
    activities: Activity[];
    bundle: EventBundle;
    day: string;
  } = $props();

  // locationId -> activities, as a plain array of entries (kept non-reactive).
  const byLocation = $derived(
    (() => {
      // Fresh Map per derivation — not reactive state, so SvelteMap is unnecessary.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const groups = new Map<string, Activity[]>();
      for (const a of activities) {
        if (!a.locationId) continue;
        const list = groups.get(a.locationId) ?? [];
        list.push(a);
        groups.set(a.locationId, list);
      }
      return [...groups.entries()];
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
      const firstHour = Math.floor((dayStartMs - 330 * 60000) / 3600000) * 3600000;
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

  const hourLabel = (iso: string): string => formatTime(iso);
</script>

<div class="timeline" style:--total-height="{totalHeight}px">
  <div class="ruler">
    {#each hours as hour (hour)}
      <div class="tick" style:top="{((Date.parse(hour) - dayStartMs) / 60000) * PPM}px">
        <span>{hourLabel(hour)}</span>
      </div>
    {/each}
  </div>

  <div class="columns">
    {#each byLocation as [locId, acts] (locId)}
      <div class="column" style:width="{COLUMN_WIDTH}px">
        <h3 class="colhead">{locationName(locId) ?? locId}</h3>
        <div class="colbody">
          {#each layout(acts) as slot (slot.act.id)}
            <a
              class="cell"
              class:cancelled={slot.act.cancelled}
              href={resolve(`/activity/${slot.act.id}`)}
              style:top="{slot.top}px"
              style:height="{slot.height}px"
              style:left="{slot.left}%"
              style:width="{slot.width}%"
              title={slot.act.title}
            >
              <strong>{slot.act.title}</strong>
            </a>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .timeline {
    display: flex;
    gap: 0;
    overflow-x: auto;
    --total-height: 600px;
  }
  .ruler {
    position: relative;
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
  .tick::after {
    content: '';
    position: absolute;
    left: calc(100% + 4px);
    top: 50%;
    width: 9999px;
    height: 1px;
    background: color-mix(in srgb, var(--text-muted) 18%, transparent);
  }
  .columns {
    display: flex;
    gap: 8px;
    flex: 1;
  }
  .column {
    flex-shrink: 0;
    border-left: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
  }
  .colhead {
    position: sticky;
    top: 0;
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
    opacity: 0.45;
    text-decoration: line-through;
  }
  .cell:hover {
    border-color: var(--event-accent);
  }
</style>
