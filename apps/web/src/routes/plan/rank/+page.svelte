<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Activity } from '@indiafoss/model';
  import {
    activitiesForDay,
    formatDayLabel,
    formatInstant,
    formatTime,
    getEventDays,
    offsetMinutesOf,
  } from '@indiafoss/schedule';
  import {
    applyComparison,
    pairKey,
    scheduleStability,
    selectNextComparison,
    type ComparisonCandidate,
    type ComparisonChoice,
    type RankedActivity,
  } from '@indiafoss/elo';
  import { CompanionStorage } from '@indiafoss/storage';
  import { SvelteSet } from 'svelte/reactivity';
  import { comparisonsOf, dispositionOf, ratingOf, setRating } from '$lib/prefs.svelte';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';

  const bundle = $derived(eventState.bundle!);
  const days = $derived(bundle ? getEventDays(bundle) : []);

  let selectedDay = $state<string | null>(null);
  let busy = $state(false);
  let entering = $state(false);
  /** Which card's abstract is open; collapses when the next pair loads. */
  let openMore = $state<'a' | 'b' | null>(null);

  /** One reversible comparison, captured before the Elo update is applied. */
  interface UndoEntry {
    comparisonId: string;
    pairKey: string;
    a: { id: string; rating: number; comparisons: number };
    b: { id: string; rating: number; comparisons: number };
  }
  const undoStack = $state<UndoEntry[]>([]);
  const canUndo = $derived(undoStack.length > 0);

  $effect(() => {
    if (selectedDay === null && days.length > 0) selectedDay = days[0]!;
  });

  const storage = new CompanionStorage();
  const comparedPairs = new SvelteSet<string>();

  const pool = $derived<RankedActivity[]>(
    (selectedDay ? activitiesForDay(bundle, selectedDay) : [])
      .filter((a) => !a.cancelled && a.type !== 'meal')
      .map((a) => ({
        activity: a,
        rating: ratingOf(a.id),
        comparisons: comparisonsOf(a.id),
        disposition: dispositionOf(a.id),
      })),
  );

  const candidate = $derived<ComparisonCandidate | null>(
    selectNextComparison({ activities: pool, alreadyCompared: comparedPairs }),
  );

  const stability = $derived(
    pool.length >= 2 ? scheduleStability({ activities: pool, alreadyCompared: comparedPairs }) : 1,
  );

  const overlaps = (a: Activity, b: Activity): boolean =>
    !!a.start &&
    !!a.end &&
    !!b.start &&
    !!b.end &&
    Date.parse(a.start) < Date.parse(b.end) &&
    Date.parse(b.start) < Date.parse(a.end);

  /** Choices made today, out of the overlapping pairs that need a winner plus any extras answered. */
  const progress = $derived.by(() => {
    const live = pool.filter((r) => r.disposition !== 'not-interested');
    let conflicts = 0;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        if (overlaps(live[i]!.activity, live[j]!.activity)) conflicts++;
      }
    }
    const done = comparedPairs.size;
    return { done, total: Math.max(conflicts, done) };
  });

  // ---------- Choosing ----------
  async function choose(choice: ComparisonChoice): Promise<void> {
    if (!candidate || busy) return;
    busy = true;
    const { activityA, activityB } = candidate;
    const result = applyComparison(activityA.rating, activityB.rating, choice);
    await Promise.all([
      setRating(activityA.activity.id, result.ratingA, activityA.comparisons + 1),
      setRating(activityB.activity.id, result.ratingB, activityB.comparisons + 1),
    ]);
    const comparisonId = `cmp-${Date.now()}`;
    await storage.saveComparison({
      id: comparisonId,
      activityA: activityA.activity.id,
      activityB: activityB.activity.id,
      scoreA: choice === 'neither' || choice === 'tie' ? 0.5 : choice.startsWith('a') ? 1 : 0,
      createdAt: new Date().toISOString(),
    });
    const key = pairKey(activityA.activity.id, activityB.activity.id);
    comparedPairs.add(key);
    undoStack.push({
      comparisonId,
      pairKey: key,
      a: {
        id: activityA.activity.id,
        rating: activityA.rating,
        comparisons: activityA.comparisons,
      },
      b: {
        id: activityB.activity.id,
        rating: activityB.rating,
        comparisons: activityB.comparisons,
      },
    });
    openMore = null;
    busy = false;
    entering = true;
    setTimeout(() => (entering = false), 200);
  }

  async function undoLast(): Promise<void> {
    if (busy) return;
    const last = undoStack.pop();
    if (!last) return;
    await Promise.all([
      setRating(last.a.id, last.a.rating, last.a.comparisons),
      setRating(last.b.id, last.b.rating, last.b.comparisons),
    ]);
    await storage.deleteComparison(last.comparisonId);
    comparedPairs.delete(last.pairKey);
    openMore = null;
  }

  // Keyboard: the cards are buttons, so Tab + Enter already works; these are shortcuts.
  function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (busy) return;
    switch (event.key) {
      case '1':
      case 'ArrowUp':
        event.preventDefault();
        void choose('definitely-a');
        break;
      case '2':
      case 'ArrowDown':
        event.preventDefault();
        void choose('definitely-b');
        break;
      case '3':
      case 'e':
      case 'E':
        void choose('tie');
        break;
      case 'n':
      case 'N':
      case '0':
        void choose('neither');
        break;
      case 'u':
      case 'U':
      case 'Backspace':
        event.preventDefault();
        void undoLast();
        break;
      default:
        break;
    }
  }

  function toggleMore(which: 'a' | 'b', event: Event): void {
    // Reading about a talk is not a pick.
    event.stopPropagation();
    event.preventDefault();
    openMore = openMore === which ? null : which;
  }

  // ---------- Presentation ----------
  const locationName = (a: Activity): string =>
    bundle.locations.find((l) => l.id === a.locationId)?.name ?? '';
  const speakerNames = (a: Activity): string =>
    a.speakerIds
      .map((id) => bundle.people.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  const timeRange = (a: Activity): string =>
    a.start && a.end ? `${formatTime(a.start)}–${formatTime(a.end)}` : '';

  /** The pair's shared time window, so both bars line up. */
  const window = $derived.by(() => {
    if (!candidate) return null;
    const A = candidate.activityA.activity;
    const B = candidate.activityB.activity;
    const starts = [A.start, B.start].filter(Boolean).map((s) => Date.parse(s!));
    const ends = [A.end, B.end].filter(Boolean).map((s) => Date.parse(s!));
    if (starts.length < 2 || ends.length < 2) return null;
    const lo = Math.min(...starts);
    const hi = Math.max(...ends);
    return hi > lo ? { lo, hi } : null;
  });
  const bar = (a: Activity): { left: number; width: number } | null => {
    if (!window || !a.start || !a.end) return null;
    const span = window.hi - window.lo;
    const left = ((Date.parse(a.start) - window.lo) / span) * 100;
    const width = ((Date.parse(a.end) - Date.parse(a.start)) / span) * 100;
    return { left: Math.max(0, left), width: Math.max(4, Math.min(100 - left, width)) };
  };

  const reason = $derived.by(() => {
    if (!candidate) return null;
    const A = candidate.activityA.activity;
    const B = candidate.activityB.activity;
    const clash =
      A.start && B.start && A.end && B.end
        ? `${formatTime(formatInstant(Math.max(Date.parse(A.start), Date.parse(B.start)), offsetMinutesOf(A.start)))}–${formatTime(formatInstant(Math.min(Date.parse(A.end), Date.parse(B.end)), offsetMinutesOf(A.start)))}`
        : '';
    switch (candidate.reason) {
      case 'conflict':
        return {
          tone: 'amber',
          pill: `OVERLAP${clash ? ` · ${clash}` : ''}`,
          text: 'You can only be in one',
        };
      case 'close-ratings':
        return {
          tone: 'mint',
          pill: 'CLOSE CALL',
          text: clash ? `Both at ${clash}` : 'Rated almost the same',
        };
      default:
        return { tone: 'grey', pill: 'NEW TO YOU', text: 'Not ranked yet' };
    }
  });

  const leaderboard = $derived(
    [...pool]
      .filter((r) => r.disposition !== 'not-interested')
      .sort((x, y) => y.rating - x.rating)
      .slice(0, 4),
  );
</script>

<svelte:window onkeydown={onKeydown} />

<EventGate>
  <div class="head">
    <div>
      <a class="eyebrow back" href={resolve('/plan')}>← PLAN</a>
      <h1>Rank your day</h1>
    </div>
    <div class="days" role="tablist" aria-label="Day">
      {#each days as day, i (day)}
        <button
          role="tab"
          aria-selected={selectedDay === day}
          class:active={selectedDay === day}
          onclick={() => (selectedDay = day)}
        >
          Day {i + 1} · {formatDayLabel(day).slice(0, 3)}
        </button>
      {/each}
    </div>
  </div>

  <div class="progress" role="status">
    <div class="progresstext">
      <span class="ok">{Math.round(stability * 100)}% RESOLVED</span>
      <span>{progress.done} / {progress.total} CHOICES</span>
    </div>
    <div class="track"><div class="fill" style="width:{Math.round(stability * 100)}%"></div></div>
  </div>

  {#if !candidate}
    <section class="done" aria-live="polite">
      <div class="donetitle">ALL SETTLED</div>
      <p>Every overlap for this day has a winner. Your plan is built around them.</p>
      <a class="button dark" href={resolve('/plan')}>See my plan</a>
    </section>
  {:else}
    {@const A = candidate.activityA.activity}
    {@const B = candidate.activityB.activity}
    {@const barA = bar(A)}
    {@const barB = bar(B)}
    <section class="pair" class:entering aria-label="Which session would you rather be in?">
      {#if reason}
        <div class="reason">
          <span class="pill {reason.tone}">{reason.pill}</span>
          <span class="reasontext">{reason.text}</span>
        </div>
      {/if}

      {#each [['a', A, barA], ['b', B, barB]] as const as [which, act, b] (which)}
        {#if which === 'b'}
          <div class="vs" aria-hidden="true"><span></span>VS<span></span></div>
        {/if}
        <article class="talk" class:open={openMore === which}>
          <button
            class="pick"
            data-testid={`candidate-${which}`}
            onclick={() => choose(which === 'a' ? 'definitely-a' : 'definitely-b')}
            disabled={busy}
            aria-label={`Pick ${act.title}`}
          >
            <span class="talkhead">
              <TypeBadge type={act.type} />
              <span class="when"
                >{timeRange(act)}{locationName(act) ? ` · ${locationName(act)}` : ''}</span
              >
            </span>
            <span class="title">{act.title}</span>
            {#if speakerNames(act)}<span class="speaker">{speakerNames(act)}</span>{/if}
          </button>
          {#if act.description || act.sourceUrl}
            <button
              class="more"
              type="button"
              aria-expanded={openMore === which}
              onclick={(e) => toggleMore(which, e)}
            >
              {openMore === which ? 'Less ▴' : 'More info ▾'}
            </button>
          {/if}
          {#if openMore === which}
            <div class="abstract">
              {#if act.description}<p>{act.description}</p>{/if}
              {#if act.sourceUrl}
                <!-- eslint-disable svelte/no-navigation-without-resolve -- external talk page -->
                <a href={act.sourceUrl} target="_blank" rel="noreferrer"
                  >Full talk page on fossunited.org ↗</a
                >
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
              {/if}
            </div>
          {/if}
          {#if b}
            <div class="timebar" aria-hidden="true">
              <div class="span" style="left:{b.left}%;width:{b.width}%"></div>
            </div>
          {/if}
        </article>
      {/each}

      <div class="secondary">
        <button class="button secondary" onclick={() => choose('tie')} disabled={busy}
          >Either is fine</button
        >
        <button class="button secondary muted" onclick={() => choose('neither')} disabled={busy}
          >Skip both</button
        >
      </div>
    </section>
  {/if}

  <div class="controls">
    <button class="button secondary" onclick={undoLast} disabled={!canUndo}>↶ Undo last</button>
    <p class="muted small">Your picks update a local Elo rating. Nothing is sent anywhere.</p>
  </div>

  {#if leaderboard.length > 0}
    <section class="top" aria-labelledby="top-title">
      <div class="eyebrow" id="top-title">TOP OF YOUR LIST</div>
      <ol class="board">
        {#each leaderboard as r, i (r.activity.id)}
          <li>
            <span class="rank">{i + 1}</span>
            <span class="boardtext">
              <a href={resolve(`/activity/${r.activity.id}`)}>{r.activity.title}</a>
              <span class="when"
                >{timeRange(r.activity)}{locationName(r.activity)
                  ? ` · ${locationName(r.activity)}`
                  : ''}</span
              >
            </span>
            <span class="rating">{Math.round(r.rating)}</span>
          </li>
        {/each}
      </ol>
    </section>
  {/if}
</EventGate>

<style>
  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.9rem;
  }
  .head h1 {
    margin: 0.35rem 0 0;
  }
  .back {
    text-decoration: none;
  }
  .days {
    display: flex;
    gap: 0.25rem;
    padding: 3px;
    background: color-mix(in srgb, var(--text-muted) 14%, transparent);
    border-radius: 8px;
    flex: none;
  }
  .days button {
    border: 0;
    border-radius: 6px;
    padding: 0.45rem 0.65rem;
    font-size: 0.78rem;
    font-weight: 600;
    background: transparent;
    color: var(--text-muted);
    white-space: nowrap;
    min-height: 0;
    cursor: pointer;
  }
  .days button.active {
    background: var(--ink);
    color: #fff;
  }

  .progress {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 1rem;
  }
  .progresstext {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .progresstext .ok {
    color: var(--mint-ink);
    font-weight: 700;
  }
  .track {
    height: 6px;
    background: color-mix(in srgb, var(--text-muted) 22%, transparent);
    border-radius: 3px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--mint);
    transition: width 0.25s;
  }

  .pair {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  @media (prefers-reduced-motion: no-preference) {
    .pair.entering {
      animation: enter 200ms ease both;
    }
    @keyframes enter {
      from {
        transform: translateY(10px);
        opacity: 0;
      }
      to {
        transform: none;
        opacity: 1;
      }
    }
  }
  .reason {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .pill {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
  }
  .pill.amber {
    background: var(--amber-soft);
    color: var(--amber-ink);
  }
  .pill.mint {
    background: var(--mint-soft, #bafcd5);
    color: var(--mint-ink);
  }
  .pill.grey {
    background: color-mix(in srgb, var(--text-muted) 16%, transparent);
    color: var(--text-muted);
  }
  .reasontext {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .talk {
    position: relative;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 0 1rem 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    box-shadow: 0 4px 32px rgba(0, 0, 0, 0.06);
    transition:
      border-color 0.12s,
      box-shadow 0.12s;
  }
  .talk:has(.pick:hover),
  .talk:has(.pick:focus-visible) {
    border-color: var(--mint);
    box-shadow: 0 0 0 3px var(--mint-soft, #bafcd5);
  }
  .talk:has(.pick:active) {
    transform: scale(0.985);
  }
  /* The whole top of the card is the pick; secondary controls sit below it. */
  .pick {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    width: calc(100% + 2rem);
    margin: 0 -1rem;
    padding: 1rem 1rem 0.2rem;
    border: 0;
    background: transparent;
    text-align: left;
    color: var(--text);
    font: inherit;
    cursor: pointer;
    min-height: 0;
    border-radius: 16px 16px 0 0;
  }
  .pick:focus-visible {
    outline: none;
  }
  .pick:disabled {
    cursor: default;
    opacity: 0.85;
  }
  .talkhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .when {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-muted);
    text-align: right;
  }
  .title {
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: -0.01em;
    text-wrap: pretty;
  }
  .speaker {
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .more {
    align-self: flex-end;
    border: 0;
    background: transparent;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--mint-ink);
    padding: 0.4rem 0.5rem;
    margin: -0.3rem -0.5rem 0 0;
    border-radius: 6px;
    white-space: nowrap;
    min-height: 0;
    cursor: pointer;
  }
  .more:hover,
  .more:focus-visible {
    background: var(--mint-soft, #bafcd5);
    outline: none;
  }
  .abstract {
    border-top: 1px solid var(--border);
    padding-top: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .abstract p {
    margin: 0;
    white-space: pre-line;
  }
  .abstract a {
    font-size: 0.8rem;
    font-weight: 600;
    align-self: flex-start;
  }
  .timebar {
    height: 6px;
    background: color-mix(in srgb, var(--text-muted) 12%, transparent);
    border-radius: 3px;
    position: relative;
    margin-top: 0.1rem;
  }
  .timebar .span {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 3px;
    background: var(--ink);
  }
  .vs {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-family: var(--font-display, var(--font-mono));
    font-size: 0.6rem;
    color: var(--text-muted);
  }
  .vs span {
    flex: 1;
    height: 1px;
    background: color-mix(in srgb, var(--text-muted) 35%, transparent);
  }
  .secondary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-top: 0.2rem;
  }
  .secondary .muted {
    color: var(--text-muted);
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 1rem 0;
  }
  .controls p {
    margin: 0;
    text-align: right;
    line-height: 1.4;
    text-wrap: pretty;
  }

  .done {
    background: var(--mint-soft, #bafcd5);
    border-radius: 16px;
    padding: 1.6rem 1.2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    text-align: center;
    color: var(--mint-ink);
  }
  .donetitle {
    font-family: var(--font-display, var(--font-mono));
    font-size: 0.75rem;
    line-height: 1.6;
    letter-spacing: 0.04em;
  }
  .done p {
    margin: 0;
    line-height: 1.5;
    text-wrap: pretty;
  }
  .button.dark {
    background: var(--ink);
    color: #fafafa;
    border-color: var(--ink);
  }

  .top {
    margin-top: 0.4rem;
  }
  .board {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
  }
  .board li {
    display: grid;
    grid-template-columns: 1.4rem 1fr auto;
    gap: 0.6rem;
    align-items: center;
    padding: 0.6rem 0.9rem;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .board li:last-child {
    border-bottom: 0;
  }
  .rank {
    font-family: var(--font-display, var(--font-mono));
    font-size: 0.6rem;
    color: var(--mint-ink);
  }
  .boardtext {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
    min-width: 0;
  }
  .boardtext a {
    font-size: 0.88rem;
    font-weight: 600;
    text-decoration: none;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .boardtext .when {
    text-align: left;
    font-size: 0.64rem;
  }
  .rating {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
