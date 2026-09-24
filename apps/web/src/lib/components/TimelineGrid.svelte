<script lang="ts">
  import type { Activity, EventBundle } from '@indiafoss/model';
  import { resolve } from '$app/paths';
  import { formatTime } from '@indiafoss/schedule';
  import { tick } from 'svelte';
  import { activityDevroomColor, devroomColor } from '$lib/devroom-art';
  import { devroomBlocks, devroomTrackNames } from '$lib/devrooms';

  /** What the attendee has said about a talk, for the grid's colouring. */
  export type GridChoice = 'yes' | 'must' | 'no';

  /** Pixel height per minute of wall time: the default, and how far zoom goes. */
  const DEFAULT_PPM = 2;
  const MIN_PPM = 0.6;
  const MAX_PPM = 8;
  /** One press of + or −. */
  const ZOOM_STEP = 1.6;
  /** The column headings above the body, which the scroll offset includes. */
  const HEAD_PX = 36;
  /** Fixed width of each location column. */
  const COLUMN_WIDTH = 240;

  let {
    activities,
    bundle,
    day,
    plannedIds = new Set<string>(),
    choices = new Map<string, GridChoice>(),
    onSelect,
    selectable = () => true,
    now,
  }: {
    activities: Activity[];
    bundle: EventBundle;
    day: string;
    plannedIds?: Set<string>;
    /** Choices to reflect on the cells (the planning grid, #470). */
    choices?: Map<string, GridChoice>;
    /** When given, a cell is a button that hands its session here instead of a link. */
    onSelect?: (activity: Activity) => void;
    /** Which sessions may be chosen in that mode; the rest stay links. */
    selectable?: (activity: Activity) => boolean;
    /** When it falls within the day: a line marks it, and the grid opens scrolled to it. */
    now?: string;
  } = $props();

  let ppm = $state(DEFAULT_PPM);

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
  const totalHeight = $derived(totalMinutes * ppm);

  const nowTop = $derived.by(() => {
    const ms = now ? Date.parse(now) : NaN;
    return ms >= dayStartMs && ms <= dayEndMs ? ((ms - dayStartMs) / 60000) * ppm : null;
  });

  // Open at now, once per day shown; after that the scroll is the reader's.
  let scroller: HTMLElement | undefined = $state();
  let placedFor = '';
  $effect(() => {
    if (!scroller || nowTop === null || placedFor === day) return;
    placedFor = day;
    // A little of what just started stays in view above the line.
    scroller.scrollTop = Math.max(0, nowTop - 60);
  });

  /**
   * Zoom the time axis so the moment `focalY` px below the view's top stays
   * put: under the fingers, the pointer, or the top edge for a key press.
   */
  async function zoomTo(next: number, focalY: number) {
    const el = scroller;
    if (!el) return;
    const clamped = Math.min(MAX_PPM, Math.max(MIN_PPM, next));
    if (Math.abs(clamped - ppm) < 0.001) return;
    const minute = (el.scrollTop + focalY - HEAD_PX) / ppm;
    ppm = clamped;
    await tick();
    el.scrollTop = Math.max(0, minute * clamped + HEAD_PX - focalY);
  }

  /** Pinch updates arrive faster than frames; apply the latest once a frame. */
  let pending: { ppm: number; focalY: number } | null = null;
  function scheduleZoom(next: number, focalY: number) {
    const first = pending === null;
    pending = { ppm: next, focalY };
    if (!first) return;
    requestAnimationFrame(() => {
      const p = pending;
      pending = null;
      if (p) void zoomTo(p.ppm, p.focalY);
    });
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === '+' || event.key === '=') void zoomTo(ppm * ZOOM_STEP, 0);
    else if (event.key === '-' || event.key === '_') void zoomTo(ppm / ZOOM_STEP, 0);
    else return;
    event.preventDefault();
  }

  // Two fingers pinch the time axis, vertically only; ctrl-scroll (a desktop
  // trackpad's pinch) does the same. One finger still scrolls both ways.
  $effect(() => {
    const el = scroller;
    if (!el) return;
    let start: { span: number; ppm: number; focalY: number } | null = null;
    const spanY = (t: TouchList) => Math.max(40, Math.abs(t[0]!.clientY - t[1]!.clientY));
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const top = el.getBoundingClientRect().top;
      start = {
        span: spanY(e.touches),
        ppm,
        focalY: (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2 - top,
      };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      scheduleZoom(start.ppm * (spanY(e.touches) / start.span), start.focalY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const top = el.getBoundingClientRect().top;
      scheduleZoom(ppm * Math.exp(-e.deltaY * 0.01), e.clientY - top);
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
    };
  });

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
      top: ((Date.parse(act.start!) - dayStartMs) / 60000) * ppm,
      height: Math.max(12, ((Date.parse(act.end!) - Date.parse(act.start!)) / 60000) * ppm),
      left: (lane / lanes) * 100,
      width: 100 / lanes,
    }));
  }

  const devroomNames = $derived(devroomTrackNames(bundle));

  /** The label bands: one per contiguous run of a devroom's sessions in a room. */
  function bands(
    acts: Activity[],
  ): { name: string; top: number; height: number; color: string | undefined }[] {
    return devroomBlocks(acts, devroomNames).map((block) => ({
      name: block.name,
      top: ((Date.parse(block.start) - dayStartMs) / 60000) * ppm,
      height: ((Date.parse(block.end) - Date.parse(block.start)) / 60000) * ppm,
      color: devroomColor(block.trackId, bundle.id),
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

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="timeline"
  bind:this={scroller}
  role="region"
  aria-label="Schedule by room and time; plus and minus to zoom"
  tabindex="0"
  onkeydown={onKeydown}
  style:--total-height="{totalHeight}px"
>
  <div class="ruler">
    {#each hours as hour (hour)}
      <div class="tick" style:top="{((Date.parse(hour) - dayStartMs) / 60000) * ppm + 36}px">
        <span>{hourLabel(hour)}</span>
      </div>
    {/each}
  </div>

  <div class="columns">
    {#if nowTop !== null}
      <div class="nowline" style:top="{nowTop + 36}px" aria-hidden="true"></div>
    {/if}
    {#each byLocation as [locId, acts] (locId)}
      {@const columnBands = bands(acts)}
      <div class="column" style:--column-width="{COLUMN_WIDTH}px">
        <h3 class="colhead">{locationName(locId) ?? locId}</h3>
        <div class="colbody" class:banded={columnBands.length > 0}>
          {#each columnBands as band (band.top)}
            <div
              class="band"
              data-testid="devroom-band"
              style:top="{band.top}px"
              style:height="{band.height}px"
              style:--devroom={band.color}
            >
              <span>{band.name}</span>
            </div>
          {/each}
          <div class="lanes">
            {#each layout(acts) as slot (slot.act.id)}
              {@const choice = choices.get(slot.act.id)}
              {@const label = `${slot.act.title}, ${formatTime(slot.act.start!)}–${formatTime(slot.act.end!)}, ${locationName(locId)}${choice === 'must' ? ', must go' : choice === 'yes' ? ', interested' : choice === 'no' ? ', not for me' : ''}`}
              {#if onSelect && selectable(slot.act)}
                <button
                  type="button"
                  class="cell choose"
                  class:planned={plannedIds.has(slot.act.id)}
                  class:cancelled={slot.act.cancelled}
                  class:yes={choice === 'yes'}
                  class:must={choice === 'must'}
                  class:no={choice === 'no'}
                  aria-label={label}
                  aria-pressed={choice !== undefined}
                  data-testid="grid-cell"
                  onclick={() => onSelect(slot.act)}
                  style:top="{slot.top}px"
                  style:height="{slot.height}px"
                  style:left="{slot.left}%"
                  style:width="{slot.width}%"
                  style:--devroom={activityDevroomColor(slot.act, bundle.id)}
                  title={slot.act.title}
                >
                  {#if choice === 'must'}<span class="planned-mark">Must go · </span>
                  {:else if choice === 'yes'}<span class="planned-mark">Interested · </span>
                  {:else if plannedIds.has(slot.act.id)}<span class="planned-mark"
                      >Planned ·
                    </span>{/if}
                  <strong>{slot.act.title}</strong>
                </button>
              {:else}
                <a
                  class="cell"
                  class:planned={plannedIds.has(slot.act.id)}
                  class:cancelled={slot.act.cancelled}
                  class:meal={slot.act.type === 'meal'}
                  aria-label={label}
                  href={resolve(`/activity/${slot.act.id}`)}
                  style:top="{slot.top}px"
                  style:height="{slot.height}px"
                  style:left="{slot.left}%"
                  style:width="{slot.width}%"
                  style:--devroom={activityDevroomColor(slot.act, bundle.id)}
                  title={slot.act.title}
                >
                  {#if plannedIds.has(slot.act.id)}<span class="planned-mark">Planned · </span>{/if}
                  <strong>{slot.act.title}</strong>
                </a>
              {/if}
            {/each}
          </div>
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
    /* One finger scrolls either way; a pinch is ours, not the page's zoom. */
    touch-action: pan-x pan-y;
    display: flex;
    gap: 0;
    overflow: auto;
    /* With the schedule header compact, the grid takes the rest of a phone. */
    max-height: calc(100dvh - 14rem);
    min-height: 20rem;
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
  .nowline {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--event-primary);
    z-index: 2;
    pointer-events: none;
  }
  .columns {
    position: relative;
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
    --band-width: 0px;
  }
  .colbody.banded {
    --band-width: 1.1rem;
  }
  /* The devroom's name runs down the column's edge for as long as it has
     the room, so a run of talks reads as one block rather than a stack of
     stripes. Cells step right to leave it the edge. */
  .band {
    position: absolute;
    left: 0;
    width: var(--band-width);
    box-sizing: border-box;
    overflow: hidden;
    border-radius: 4px 0 0 4px;
    /* The colour lifted 30% towards white with ink on it: 5.9:1 or better for
       all eight devrooms in both themes. Darkening it for light text fails
       the greens, the teal and the olive (measured 2.7:1 to 3.0:1). */
    background: color-mix(in srgb, var(--devroom, var(--event-primary)) 70%, var(--on-ink));
    color: var(--ink);
  }
  .band span {
    position: sticky;
    top: 2.4rem;
    display: block;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    padding: 0.3rem 0;
    margin: 0.3rem auto;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    white-space: nowrap;
    line-height: var(--band-width);
    width: var(--band-width);
    text-align: left;
  }
  .lanes {
    position: absolute;
    inset: 0 0 0 var(--band-width);
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
    /* A devroom talk wears its devroom's colour; everything else the event's. */
    --cell-hue: var(--devroom, var(--event-primary));
    background: color-mix(in srgb, var(--cell-hue) var(--devroom-tint), var(--surface));
    border: 1px solid color-mix(in srgb, var(--cell-hue) var(--devroom-edge), transparent);
    border-left: 3px solid color-mix(in srgb, var(--cell-hue) 85%, var(--text));
    border-radius: 6px;
    padding: 0.2rem 0.35rem;
    color: var(--text);
    text-decoration: none;
    text-align: left;
    font: inherit;
    font-size: 0.68rem;
    line-height: 1.25;
  }
  .cell.choose {
    cursor: pointer;
  }
  .cell.choose:focus-visible {
    outline: 2px solid var(--event-accent);
    outline-offset: 1px;
  }
  .cell.yes {
    background: var(--choice-want);
    color: var(--choice-want-text);
  }
  .cell.must {
    background: var(--choice-must);
    color: var(--choice-must-text);
  }
  .cell.no {
    background: var(--choice-no);
    color: var(--choice-no-text);
    opacity: 0.75;
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
