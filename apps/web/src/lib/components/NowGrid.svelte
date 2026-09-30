<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import type { Snippet } from 'svelte';
  import { tick, untrack } from 'svelte';
  import type { Activity, EventBundle } from '@indiafoss/model';
  import { resolve } from '$app/paths';
  import { formatTime } from '@indiafoss/schedule';
  import { activityDevroomColor } from '$lib/devroom-art';

  /**
   * Happening now as a time grid: one row per room, all rows sharing one
   * horizontal scroll so a column is a moment across the venue. By default a
   * 25-minute talk fills the visible width on a phone, and a wide screen
   * opens zoomed all the way out; pinch or ctrl-scroll (a
   * trackpad pinch) change that from 5 minutes (a lightning talk fills the view) to
   * three hours. The grid opens with its left edge at now: the first screen
   * is what is on, everything later is a scroll to the right.
   *
   * A card's text starts at the visible left edge while the card itself runs
   * off it, so a talk that started twenty minutes ago still shows its title.
   *
   * `goId` is the one card to go to, drawn in gold and labelled `goLabel`.
   */
  let {
    activities,
    bundle,
    scope,
    now,
    goId,
    goLabel,
    header,
  }: {
    activities: Activity[];
    bundle: EventBundle;
    /** Stable identity for the time range, used to reset the initial anchor. */
    scope: string;
    now: string;
    goId?: string;
    goLabel?: string;
    /** The heading row above the grid. */
    header?: Snippet;
  } = $props();

  /** Minutes of programme across the view: the default, and how far zoom goes. */
  const DEFAULT_WINDOW = 25;
  const MIN_WINDOW = 5;
  const MAX_WINDOW = 180;
  /** A desktop-wide view opens fully zoomed out: the whole morning at a glance. */
  const WIDE_LANE = 700;
  /** One press of a zoom button. */
  const ZOOM_STEP = 1.6;
  /** Re-anchor on now once it drifts this far across an untouched view. */
  const FOLLOW = 0.8;
  /** Space between back-to-back talks, so two cards never touch. */
  const GAP_PX = 4;
  /**
   * The text fits whatever of its card is visible, down to this sliver: a
   * talk about to end shows its time and what of its title fits, rather than
   * a wider block pushed off the left edge.
   */
  const MIN_TEXT_PX = 24;

  let scroller: HTMLDivElement | null = $state(null);
  let laneWidth = $state(0);
  /** Set by the first zoom; until then the view's width picks the span. */
  let chosenWindow = $state<number | null>(null);
  const windowMinutes = $derived(
    chosenWindow ?? (laneWidth >= WIDE_LANE ? MAX_WINDOW : DEFAULT_WINDOW),
  );
  /** The scroll offset, sampled once a frame, for the text offsets below. */
  let scrollX = $state(0);

  const nowMs = $derived(Date.parse(now));
  const pxPerMinute = $derived(laneWidth > 0 ? laneWidth / windowMinutes : 0);

  /** Fixed for the supplied programme, so cards never jump as the clock advances. */
  const span = $derived.by(() => {
    const all = activities.filter((a) => a.start && a.end);
    if (all.length === 0) return { origin: nowMs, end: nowMs + 60 * 60000 };
    return {
      origin: Math.min(...all.map((a) => Date.parse(a.start!))),
      end: Math.max(...all.map((a) => Date.parse(a.end!))),
    };
  });
  const canvasWidth = $derived(((span.end - span.origin) / 60000) * pxPerMinute);

  type Talk = {
    act: Activity;
    startMs: number;
    endMs: number;
    /** Minutes from the day's first start, so zoom is one multiplication. */
    startMin: number;
    lengthMin: number;
    lane: number;
    lanes: number;
    times: string;
    pill?: string;
    devroom?: string;
    speakers: string;
    label: string;
  };
  type Row = { locationId: string; name: string; talks: Talk[] };

  /**
   * Everything about a card that does not change with the clock, worked out
   * once per talk and kept while that talk is on the grid. The page's clock
   * ticks every second, and rebuilding every card each tick, or each time one
   * talk ended, was what made the day simulator's reminders late under load:
   * a stable object per talk lets the grid skip every card that did not move.
   * A schedule refresh brings new objects even for the same ids, so an edited
   * talk is never mistaken for its old self.
   */
  let talkCache = new WeakMap<Activity, Talk>();
  let cacheFor: { bundle: EventBundle; origin: number } | null = null;
  let rowsCache: { list: Activity[]; rows: Row[] } | null = null;
  const rows = $derived.by((): Row[] => {
    if (cacheFor?.bundle !== bundle || cacheFor.origin !== span.origin) {
      talkCache = new WeakMap();
      rowsCache = null;
      cacheFor = { bundle, origin: span.origin };
    }
    // Same objects in the same order: nothing to do on this tick.
    if (
      rowsCache &&
      rowsCache.list.length === activities.length &&
      rowsCache.list.every((a, i) => a === activities[i])
    )
      return rowsCache.rows;
    // Fresh Map per derivation — not reactive state, so SvelteMap is unnecessary.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const groups = new Map<string, Activity[]>();
    for (const a of activities) {
      if (!a.locationId || !a.start || !a.end || Date.parse(a.end) <= Date.parse(a.start)) continue;
      const list = groups.get(a.locationId) ?? [];
      list.push(a);
      groups.set(a.locationId, list);
    }
    const built = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([locationId, acts]) => {
        const name = bundle.locations.find((l) => l.id === locationId)?.name ?? locationId;
        return { locationId, name, talks: layout(acts, name) };
      });
    rowsCache = { list: activities, rows: built };
    return built;
  });

  /**
   * Talks in one room never overlap in the real programme, but if a revision
   * ever makes them, first-fit lanes split the row rather than paint one card
   * over another.
   */
  function layout(acts: Activity[], room: string): Talk[] {
    const sorted = [...acts].sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!));
    const laneEnds: number[] = [];
    const placed = sorted.map((act) => {
      const startMs = Date.parse(act.start!);
      const endMs = Date.parse(act.end!);
      let lane = laneEnds.findIndex((end) => end <= startMs);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[lane] = endMs;
      return { act, startMs, endMs, lane };
    });
    const lanes = Math.max(1, laneEnds.length);
    return placed.map(({ act, startMs, endMs, lane }) => {
      const kept = talkCache.get(act);
      if (kept && kept.lane === lane && kept.lanes === lanes) return kept;
      const times = `${formatTime(act.start!)}–${formatTime(act.end!)}`;
      const talk: Talk = {
        act,
        startMs,
        endMs,
        startMin: (startMs - span.origin) / 60000,
        lengthMin: (endMs - startMs) / 60000,
        lane,
        lanes,
        times,
        pill: pillName(act, room),
        devroom: activityDevroomColor(act, bundle.id),
        speakers: speakerNames(act),
        label: `${act.title}, ${times}, ${room}`,
      };
      talkCache.set(act, talk);
      return talk;
    });
  }

  /**
   * The pill names a devroom. A main-hall talk's track is just its room's
   * name, already on the row, so it gets none.
   */
  function pillName(activity: Activity, room: string): string | undefined {
    const name = (
      bundle.tracks.find((track) => track.id === activity.devroomId) ??
      bundle.tracks.find((track) => track.id === activity.trackId)
    )?.name;
    return name && name !== room ? name : undefined;
  }

  function speakerNames(activity: Activity): string {
    return activity.speakerIds
      .map((id) => bundle.people.find((p) => p.id === id)?.name)
      .filter((name): name is string => Boolean(name))
      .join(', ');
  }

  const leftOf = (t: Talk): number => t.startMin * pxPerMinute;
  const widthOf = (t: Talk): number => Math.max(2, t.lengthMin * pxPerMinute - GAP_PX);

  /**
   * A room with nothing on now would be a blank strip that reads as broken;
   * instead the stretch from now to its next talk says so.
   */
  const gaps = $derived(
    rows.map((row) => {
      if (row.talks.some((t) => t.startMs <= nowMs && t.endMs > nowMs)) return null;
      const next = row.talks.find((t) => t.startMs > nowMs);
      if (!next) return null;
      const left = ((nowMs - span.origin) / 60000) * pxPerMinute;
      const width = leftOf(next) - left - GAP_PX;
      return width > 24 ? { left, width, until: next.act.start! } : null;
    }),
  );

  /** Tick spacing on the ruler: the finest that leaves room for a time label. */
  const TICK_STEPS = [5, 10, 15, 30, 60, 120];
  const MIN_TICK_PX = 56;
  const tickStep = $derived(
    TICK_STEPS.find((m) => m * pxPerMinute >= MIN_TICK_PX) ?? TICK_STEPS.at(-1)!,
  );
  const ticks = $derived.by(() => {
    if (pxPerMinute <= 0) return [];
    const out: { left: number; label: string }[] = [];
    const five = 5 * 60000;
    // Venue time: the schedule's own strings carry its offset, a bare instant does not.
    const clock = new Intl.DateTimeFormat('en-GB', {
      timeZone: bundle.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    for (let t = Math.ceil(span.origin / five) * five; t <= span.end; t += five) {
      const label = clock.format(t);
      const [h, m] = label.split(':').map(Number) as [number, number];
      if ((h * 60 + m) % tickStep === 0) {
        out.push({ left: ((t - span.origin) / 60000) * pxPerMinute, label });
      }
    }
    return out;
  });
  const nowX = $derived(
    Number.isFinite(nowMs) && nowMs >= span.origin && nowMs <= span.end
      ? ((nowMs - span.origin) / 60000) * pxPerMinute
      : null,
  );
  /** Ticks that would sit under the now label step aside for it. */
  const NOW_LABEL_PX = 48;

  /**
   * How far a card's text moves right to start at the visible edge. CSS
   * sticky cannot do this: it slides text only by the card's width less the
   * text's own, which is not enough once a talk is well under way.
   */
  const textCut = (left: number, width: number): number =>
    Math.max(0, Math.min(scrollX - left, width - MIN_TEXT_PX));

  // ---- scrolling and following now -------------------------------------

  /** Where this component last put the scroll; anything else was the attendee. */
  let placedAt = -1;
  let touched = false;
  let anchoredFor = '';
  let frame = 0;
  function onScroll() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!scroller) return;
      scrollX = scroller.scrollLeft;
      if (Math.abs(scrollX - placedAt) > 2) touched = true;
    });
  }

  /**
   * Put now at the left edge on first paint, for a new programme or a resized
   * window, and again when now drifts most of the way across a view nobody
   * has touched. Never after the attendee has scrolled or zoomed: following
   * would pull the grid out from under their finger. Reads nothing from the
   * DOM on an ordinary tick, so the clock costs no layout.
   */
  $effect(() => {
    if (!scroller || pxPerMinute <= 0 || !Number.isFinite(nowMs)) return;
    const target = Math.max(0, ((nowMs - span.origin) / 60000) * pxPerMinute);
    const key = `${scope}|${laneWidth}`;
    const width = canvasWidth;
    untrack(() => {
      if (key !== anchoredFor) {
        touched = false;
        anchoredFor = key;
      } else if (touched || target <= placedAt + laneWidth * FOLLOW) {
        return;
      }
      placeScroll(scroller!, target, width);
    });
  });

  /**
   * The canvas can still be laid out at its old width when this runs, and a
   * scroll past the end is silently clamped to it; so wait until the DOM has
   * the width the scale asks for.
   */
  function placeScroll(el: HTMLElement, target: number, width: number, attempt = 0) {
    if (el.scrollWidth >= Math.min(width, target + el.clientWidth) - 1) {
      el.scrollLeft = target;
      placedAt = el.scrollLeft;
      scrollX = placedAt;
    } else if (attempt < 30) {
      requestAnimationFrame(() => placeScroll(el, target, width, attempt + 1));
    }
  }

  // ---- zoom ---------------------------------------------------------------

  /**
   * Zoom so `focalX` pixels from the view's left keep showing the same moment:
   * the time under the fingers, the pointer, or the left edge for a button.
   */
  async function zoomTo(next: number, focalX: number) {
    const el = scroller;
    if (!el || pxPerMinute <= 0) return;
    // Snap to a limit when a step lands close to it, so the label never reads
    // "5 min" while zoom-in is still enabled at 5.2.
    const clamped =
      next < MIN_WINDOW * 1.15 ? MIN_WINDOW : next > MAX_WINDOW / 1.15 ? MAX_WINDOW : next;
    if (Math.abs(clamped - windowMinutes) < 0.01) return;
    const focalMinute = (el.scrollLeft + focalX) / pxPerMinute;
    touched = true;
    chosenWindow = clamped;
    await tick();
    const target = Math.max(0, focalMinute * (laneWidth / clamped) - focalX);
    placeScroll(el, target, ((span.end - span.origin) / 60000) * (laneWidth / clamped));
  }

  /** Pinch updates arrive faster than frames; apply the latest once a frame. */
  let pending: { window: number; focalX: number } | null = null;
  function scheduleZoom(window: number, focalX: number) {
    const first = pending === null;
    pending = { window, focalX };
    if (!first) return;
    requestAnimationFrame(() => {
      const p = pending;
      pending = null;
      if (p) void zoomTo(p.window, p.focalX);
    });
  }

  const zoomIn = () => void zoomTo(windowMinutes / ZOOM_STEP, 0);
  const zoomOut = () => void zoomTo(windowMinutes * ZOOM_STEP, 0);
  const spanLabel = $derived(
    windowMinutes < 60
      ? `${Math.round(windowMinutes)} min`
      : `${(Math.round((windowMinutes / 60) * 10) / 10).toString()} h`,
  );

  function onKeydown(event: KeyboardEvent) {
    if (event.key === '+' || event.key === '=') zoomIn();
    else if (event.key === '-' || event.key === '_') zoomOut();
    else return;
    event.preventDefault();
  }

  /**
   * Two fingers pinch the time axis, horizontally only, like a calendar's
   * day view turned on its side; ctrl-scroll, which is also what a desktop
   * trackpad's pinch sends, does the same. One finger still scrolls both
   * ways, so the page keeps moving between rooms.
   */
  $effect(() => {
    const el = scroller;
    if (!el) return;
    let start: { span: number; window: number; focalX: number } | null = null;
    const spanX = (t: TouchList) => Math.max(40, Math.abs(t[0]!.clientX - t[1]!.clientX));
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const left = el.getBoundingClientRect().left;
      start = {
        span: spanX(e.touches),
        window: windowMinutes,
        focalX: (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2 - left,
      };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      scheduleZoom(start.window / (spanX(e.touches) / start.span), start.focalX);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const left = el.getBoundingClientRect().left;
      scheduleZoom(windowMinutes * Math.exp(e.deltaY * 0.01), e.clientX - left);
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
</script>

<div class="toolbar">
  <div class="header">{@render header?.()}</div>
  <!-- Pinch is the only zoom on screen; the span is said aloud, not shown. -->
  <span class="sr-only" aria-live="polite" data-testid="now-grid-span">{spanLabel}</span>
</div>

<div class="nowgrid" data-testid="now-grid" style:--view-w="{laneWidth}px">
  <!-- The names are drawn here, frozen; each lane below carries its own for assistive tech. -->
  <div class="heads" aria-hidden="true">
    <div class="rulerhead"></div>
    {#each rows as row (row.locationId)}
      <div class="rowhead"><span>{row.name}</span></div>
    {/each}
  </div>
  <!-- A scrollable region needs to be reachable by keyboard to be scrollable by
       keyboard, and once focused, + and − zoom it: the keyboard's pinch. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="scroller"
    role="region"
    aria-label="Sessions by room; scroll right for later, plus and minus to zoom"
    tabindex="0"
    bind:this={scroller}
    bind:clientWidth={laneWidth}
    onscroll={onScroll}
    onkeydown={onKeydown}
  >
    <div class="canvas" style:width="{canvasWidth}px">
      <!-- The scale comes from the measured width: drawing the cards before it
           is known would lay out every card twice on the page's first paint. -->
      {#if pxPerMinute > 0}
        <div class="ruler" aria-hidden="true" data-testid="now-grid-ruler">
          {#each ticks as tick (tick.left)}
            {#if nowX === null || tick.left + NOW_LABEL_PX < nowX || tick.left > nowX + NOW_LABEL_PX}
              <span class="tick" style:left="{tick.left}px">{tick.label}</span>
            {/if}
          {/each}
          {#if nowX !== null}
            <span class="nowtime" style:left="{nowX}px">{formatTime(now)}</span>
          {/if}
        </div>
        {#if nowX !== null}
          <div class="nowline" style:left="{nowX}px" data-testid="now-line"></div>
        {/if}
        {#each rows as row, i (row.locationId)}
          {@const gap = gaps[i]}
          <div class="lane" role="group" aria-label={row.name}>
            {#if gap}
              <div
                class="gap"
                style:left="{gap.left}px"
                style:width="{gap.width}px"
                style:--cut="{textCut(gap.left, gap.width)}px"
              >
                <span class="inner"
                  ><span class="free">{t('now.freeUntil', { time: formatTime(gap.until) })}</span
                  ></span
                >
              </div>
            {/if}
            {#each row.talks as talk (talk.act.id)}
              {@const left = leftOf(talk)}
              {@const width = widthOf(talk)}
              {@const running = talk.startMs <= nowMs && talk.endMs > nowMs}
              {@const go = talk.act.id === goId}
              <a
                class="talk"
                class:running
                class:go
                class:devroom={Boolean(talk.devroom)}
                class:cancelled={talk.act.cancelled}
                href={resolve(`/activity/${talk.act.id}`)}
                aria-label="{go && goLabel ? `${goLabel}: ` : ''}{talk.label}"
                data-go={go}
                style:left="{left}px"
                style:width="{width}px"
                style:top="calc({talk.lane} * var(--row-h) / {talk.lanes})"
                style:height="calc(var(--row-h) / {talk.lanes} - var(--row-gap))"
                style:--devroom={talk.devroom}
                style:--cut="{textCut(left, width)}px"
              >
                <span class="inner">
                  {#if go && goLabel}<span class="kicker">{goLabel}</span>{/if}
                  <span class="meta">{running ? `${t('now.now')} · ` : ''}{talk.times}</span>
                  <strong class="title">{talk.act.title}</strong>
                  {#if talk.pill}<span class="pill">{talk.pill}</span>{/if}
                  {#if talk.speakers}<span class="speakers">{talk.speakers}</span>{/if}
                </span>
              </a>
            {/each}
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .nowgrid {
    --row-h: 7rem;
    --ruler-h: 1.2rem;
    --row-gap: 0.35rem;
    --head-w: 1.3rem;
    display: grid;
    grid-template-columns: var(--head-w) minmax(0, 1fr);
    column-gap: 0.3rem;
  }
  .heads {
    display: flex;
    flex-direction: column;
  }
  /* Frozen in the left margin: the grid scrolls past it, the name stays. */
  .rowhead {
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--row-h);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  .rowhead span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    max-height: calc(var(--row-h) - 0.5rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .scroller {
    overflow-x: auto;
    overscroll-behavior-x: contain;
    /* One finger scrolls either way; a pinch is ours, not the page's zoom. */
    touch-action: pan-x pan-y;
  }
  .scroller:focus-visible {
    outline: 2px solid var(--event-primary);
    outline-offset: 2px;
  }
  .canvas {
    position: relative;
  }
  /* The time scale: minimal labels that follow the zoom. */
  .rulerhead,
  .ruler {
    flex: none;
    height: var(--ruler-h);
    margin-bottom: 0.25rem;
  }
  .ruler {
    position: relative;
    border-bottom: 1px solid var(--line);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: var(--text-muted);
  }
  /* Left-aligned on its tick, so a label at the scroll edge is never cut in half. */
  .tick {
    position: absolute;
    bottom: 0.15rem;
    padding-left: 3px;
    border-left: 1px solid var(--line);
    line-height: 1;
    white-space: nowrap;
  }
  .nowtime {
    position: absolute;
    bottom: 0.05rem;
    /* Starting on the line: the grid opens with now at its left edge. */
    margin-left: -1px;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    padding: 0.05rem 0.3rem;
    border-radius: 999px;
    background: var(--event-primary);
    color: var(--on-strong);
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    z-index: 2;
  }
  .nowline {
    position: absolute;
    top: var(--ruler-h);
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--event-primary);
    pointer-events: none;
    z-index: 2;
  }
  .lane {
    position: relative;
    height: var(--row-h);
  }
  .talk {
    /* A devroom talk wears its devroom's colour, the rest the event's: the
       same rule and tint as the schedule grid (issue 469). */
    --hue: var(--devroom, var(--event-primary));
    position: absolute;
    box-sizing: border-box;
    overflow: clip;
    display: block;
    background: color-mix(in srgb, var(--hue) var(--devroom-tint), var(--surface-raised));
    border: 1px solid var(--line);
    border-left: 4px solid var(--hue);
    border-radius: 6px;
    color: var(--text);
    text-decoration: none;
    font-size: 0.74rem;
    line-height: 1.25;
  }
  .talk:hover {
    border-color: var(--event-accent);
    border-left-color: var(--hue);
  }
  .talk.cancelled {
    opacity: 0.75;
    text-decoration: line-through;
  }
  /* The one card to go to. The devroom edge stays so the branding holds. */
  .talk.go {
    background: color-mix(in srgb, var(--amber-soft) 85%, var(--surface-raised));
    border-color: var(--amber);
    box-shadow: inset 0 0 0 2px var(--amber);
  }
  /* Moved right by --cut to start at the visible edge, and never wider than
     the view, so a long card's title wraps where it can be read. Block flow,
     not flex: a flex column shrinks its lines until they are cut in half. */
  /* The container is the visible text, not the card: a long talk that is
     mostly scrolled off the left is as cramped as a lightning talk. */
  .inner {
    position: relative;
    container-type: inline-size;
    display: block;
    box-sizing: border-box;
    margin-left: var(--cut, 0px);
    width: min(calc(100% - var(--cut, 0px)), var(--view-w));
    height: 100%;
    padding: 0.3rem 0.5rem 0.4rem;
    overflow: hidden;
  }
  .inner > * {
    display: block;
  }
  .kicker {
    font-size: 0.6rem;
    line-height: 1.3;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--amber-ink);
    white-space: nowrap;
  }
  .meta {
    font-size: 0.66rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .running .meta {
    color: var(--event-primary-text);
    font-weight: 700;
  }
  .inner > .title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-block: 0.08rem 0.12rem;
    font-size: 0.8rem;
    overflow-wrap: break-word;
    hyphens: auto;
  }
  /* The devroom pill: the schedule grid's band colour, lifted 30% towards
     white with ink on it, which holds 5.9:1 or better for all eight
     devrooms in both themes. Other tracks get a plain pill. */
  .inner > .pill {
    display: inline-block;
    max-width: 100%;
    box-sizing: border-box;
    margin-bottom: 0.1rem;
    vertical-align: top;
    padding: 0.02rem 0.4rem;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-size: 0.6rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .devroom .pill {
    border-color: transparent;
    background: color-mix(in srgb, var(--devroom) 70%, var(--on-ink));
    color: var(--ink);
  }
  .speakers {
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gap {
    position: absolute;
    top: 0;
    height: calc(var(--row-h) - var(--row-gap));
    box-sizing: border-box;
    overflow: clip;
    border: 1px dashed var(--line);
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 0.72rem;
  }
  .gap .inner {
    display: flex;
    align-items: center;
  }
  .gap .free {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
    /* Off the screen's edge, where the grid below runs. */
    padding-right: 0.5rem;
  }
  /* Zoomed out, a short talk is a sliver: its colour says it is there. */
  @container (max-width: 2.5rem) {
    .inner > * {
      visibility: hidden;
    }
  }
  /* A five-minute lightning talk is a fifth of the view: time and title
     only, so neither is cut to nothing. */
  @container (max-width: 7.5rem) {
    .inner > .speakers,
    .inner > .pill {
      display: none;
    }
    .inner > .title {
      -webkit-line-clamp: 4;
      line-clamp: 4;
    }
  }
</style>
