<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Activity } from '@indiafoss/model';
  import { activitiesForDay, formatDayLabel, formatTime, getEventDays } from '@indiafoss/schedule';
  import {
    applyComparison,
    pairKey,
    scheduleStability,
    selectNextComparison,
    type ComparisonCandidate,
    type ComparisonChoice,
  } from '@indiafoss/elo';
  import { CompanionStorage } from '@indiafoss/storage';
  import { comparisonsOf, dispositionOf, ratingOf, setRating } from '$lib/prefs.svelte';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';

  const bundle = $derived(eventState.bundle!);
  const days = $derived(bundle ? getEventDays(bundle) : []);

  let selectedDay = $state<string | null>(null);
  let dragX = $state(0);
  let pointerId = $state<number | null>(null);
  let swipeDirection = $state<'left' | 'right' | null>(null);
  let isAnimating = $state(false);
  let pointerStartX = 0;

  $effect(() => {
    if (selectedDay === null && days.length > 0) selectedDay = days[0]!;
  });

  const storage = new CompanionStorage();
  const comparedPairs = $state(new Set<string>());

  const pool = $derived(
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

  async function choose(choice: ComparisonChoice): Promise<void> {
    if (!candidate || isAnimating) return;
    const { activityA, activityB } = candidate;
    const result = applyComparison(activityA.rating, activityB.rating, choice);
    swipeDirection =
      choice.endsWith('a') || choice === 'definitely-a' || choice === 'slightly-a'
        ? 'right'
        : choice.endsWith('b') || choice === 'definitely-b' || choice === 'slightly-b'
          ? 'left'
          : null;
    isAnimating = true;

    await new Promise((resolve) => setTimeout(resolve, swipeDirection ? 220 : 120));
    await Promise.all([
      setRating(activityA.activity.id, result.ratingA, activityA.comparisons + 1),
      setRating(activityB.activity.id, result.ratingB, activityB.comparisons + 1),
    ]);
    await storage.saveComparison({
      id: `cmp-${Date.now()}`,
      activityA: activityA.activity.id,
      activityB: activityB.activity.id,
      scoreA: choice === 'neither' ? 0.5 : choice === 'tie' ? 0.5 : choice.startsWith('a') ? 1 : 0,
      createdAt: new Date().toISOString(),
    });
    comparedPairs.add(pairKey(activityA.activity.id, activityB.activity.id));
    dragX = 0;
    swipeDirection = null;
    isAnimating = false;
  }

  function startSwipe(event: PointerEvent): void {
    if (isAnimating || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointerId = event.pointerId;
    pointerStartX = event.clientX;
    dragX = 0;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveSwipe(event: PointerEvent): void {
    if (pointerId !== event.pointerId || isAnimating) return;
    dragX = event.clientX - pointerStartX;
  }

  function endSwipe(event: PointerEvent): void {
    if (pointerId !== event.pointerId || isAnimating) return;
    pointerId = null;
    const threshold = 96;
    if (dragX >= threshold) void choose('definitely-a');
    else if (dragX <= -threshold) void choose('definitely-b');
    else dragX = 0;
  }

  function cardStyle(): string {
    if (isAnimating) return '';
    const rotation = Math.max(-8, Math.min(8, dragX / 24));
    return `transform: translateX(${dragX}px) rotate(${rotation}deg);`;
  }

  const locationName = (a: Activity): string | undefined =>
    bundle.locations.find((l) => l.id === a.locationId)?.name;

  function formatTimeShort(iso: string): string {
    return formatTime(iso);
  }

  function pickReason(reason: string): string {
    switch (reason) {
      case 'conflict':
        return 'These sessions overlap.';
      case 'close-ratings':
        return 'Close call — this decision could matter.';
      case 'under-ranked':
        return 'One of these is under-ranked.';
      default:
        return 'New session.';
    }
  }
</script>

<EventGate>
  <div class="eyebrow">PERSONALIZE YOUR CONFERENCE</div>
  <h1>Rank your day</h1>
  <p class="muted lead">
    Swipe or tap through a few quick choices. Your Elo ranking turns them into a personal plan.
  </p>

  <div class="days">
    {#each days as day, i (day)}
      <button class:active={selectedDay === day} onclick={() => (selectedDay = day)}>
        Day {i + 1} <small>{formatDayLabel(day)}</small>
      </button>
    {/each}
  </div>

  <div class="stability" role="status">
    Your {formatDayLabel(selectedDay ?? '')} plan is {Math.round(stability * 100)}% resolved.
    {#if comparedPairs.size > 0}
      {comparedPairs.size} comparison{comparedPairs.size === 1 ? '' : 's'} so far.
    {/if}
  </div>

  {#if !candidate}
    <section class="done">
      <h2>All caught up 🎉</h2>
      <p class="muted">
        Every remaining choice is either settled or you've compared the pairs. Check back after new
        sessions appear.
      </p>
      <a href={resolve('/plan')}>Back to Plan</a>
    </section>
  {:else}
    <p class="reason">{pickReason(candidate.reason)}</p>

    <div
      class="arena"
      class:swipe-left={swipeDirection === 'left'}
      class:swipe-right={swipeDirection === 'right'}
      class:dragging={pointerId !== null}
      style={cardStyle()}
      role="group"
      aria-label="Swipe right for the left session, swipe left for the right session"
      onpointerdown={startSwipe}
      onpointermove={moveSwipe}
      onpointerup={endSwipe}
      onpointercancel={endSwipe}
    >
      <div class="card" data-testid="candidate-a">
        <div class="head">
          <TypeBadge type={candidate.activityA.activity.type} />
          <span class="rating">{Math.round(candidate.activityA.rating)}</span>
        </div>
        <h2>{candidate.activityA.activity.title}</h2>
        <p class="muted">
          {locationName(candidate.activityA.activity)}
          {#if candidate.activityA.activity.start}
            · {formatTimeShort(candidate.activityA.activity.start)}
          {/if}
        </p>
      </div>

      <div class="vs">vs</div>

      <div class="card" data-testid="candidate-b">
        <div class="head">
          <TypeBadge type={candidate.activityB.activity.type} />
          <span class="rating">{Math.round(candidate.activityB.rating)}</span>
        </div>
        <h2>{candidate.activityB.activity.title}</h2>
        <p class="muted">
          {locationName(candidate.activityB.activity)}
          {#if candidate.activityB.activity.start}
            · {formatTimeShort(candidate.activityB.activity.start)}
          {/if}
        </p>
      </div>
    </div>

    <p class="swipe-hint" aria-hidden="true">← swipe for B <span>·</span> swipe for A →</p>
    <div class="choices" role="group" aria-label="Your preference">
      <button class="def" onclick={() => choose('definitely-a')}>Definitely A</button>
      <button onclick={() => choose('slightly-a')}>Slightly A</button>
      <button onclick={() => choose('tie')}>Either / Tie</button>
      <button onclick={() => choose('slightly-b')}>Slightly B</button>
      <button class="def" onclick={() => choose('definitely-b')}>Definitely B</button>
      <button class="neither" onclick={() => choose('neither')}>Neither</button>
    </div>
  {/if}
</EventGate>

<style>
  .eyebrow {
    color: var(--event-primary-dark);
    font-family: 'Space Mono', ui-monospace, monospace;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    margin-bottom: 0.35rem;
  }
  .muted {
    color: var(--text-muted);
  }
  .lead {
    font-size: 1.05rem;
    max-width: 38rem;
  }
  .days {
    display: flex;
    gap: 0.4rem;
    margin: 0.8rem 0;
  }
  .days button {
    border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
    background: var(--surface);
    border-radius: 10px;
    padding: 0.45rem 0.8rem;
    cursor: pointer;
  }
  .days button.active {
    border-color: var(--event-primary);
    color: var(--event-primary);
    font-weight: 600;
  }
  .days small {
    color: var(--text-muted);
    font-weight: 400;
  }
  .stability {
    background: color-mix(in srgb, var(--event-primary) 8%, var(--surface-raised));
    border-radius: 10px;
    padding: 0.6rem 0.9rem;
    font-size: 0.9rem;
    margin-bottom: 0.8rem;
  }
  .reason {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin: 0.4rem 0;
  }
  .arena {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 0.6rem;
    align-items: stretch;
    touch-action: pan-y;
    cursor: grab;
    transition:
      transform 220ms ease,
      opacity 220ms ease;
    user-select: none;
  }
  .arena.dragging {
    cursor: grabbing;
    transition: none;
  }
  .arena.swipe-right {
    animation: swipe-right 220ms ease both;
  }
  .arena.swipe-left {
    animation: swipe-left 220ms ease both;
  }
  @keyframes swipe-right {
    to {
      transform: translateX(120%) rotate(8deg);
      opacity: 0;
    }
  }
  @keyframes swipe-left {
    to {
      transform: translateX(-120%) rotate(-8deg);
      opacity: 0;
    }
  }
  .card {
    background: var(--surface-raised);
    border: 1px solid color-mix(in srgb, var(--text-muted) 18%, transparent);
    border-radius: var(--radius);
    padding: 0.9rem;
    min-height: 8rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .card .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.4rem;
  }
  .card h2 {
    font-size: 1rem;
    margin: 0.4rem 0;
    line-height: 1.3;
  }
  .rating {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: var(--event-primary);
  }
  .vs {
    display: flex;
    align-items: center;
    color: var(--text-muted);
    font-weight: 700;
  }
  .swipe-hint {
    color: var(--text-muted);
    font-family: 'Space Mono', ui-monospace, monospace;
    font-size: 0.7rem;
    text-align: center;
    margin: 0.65rem 0 0;
  }
  .swipe-hint span {
    color: var(--event-accent);
    margin: 0 0.35rem;
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .choices button {
    border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
    background: var(--surface);
    border-radius: 10px;
    padding: 0.75rem 0.4rem;
    cursor: pointer;
    font-size: 0.85rem;
    min-height: 48px;
  }
  .choices button.def {
    border-color: var(--event-primary);
    color: var(--event-primary);
    font-weight: 600;
  }
  .choices button.neither {
    grid-column: span 3;
    color: var(--text-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .arena {
      transition: none;
    }
    .arena.swipe-left,
    .arena.swipe-right {
      animation: none;
    }
  }
  .done {
    text-align: center;
    padding: 2rem 0;
  }
  .done a {
    color: var(--event-primary);
  }
</style>
