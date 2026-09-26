<script lang="ts">
  import { t, dayLabel } from '$lib/i18n.svelte';
  import ScheduleViews from '$lib/components/ScheduleViews.svelte';
  import { livePlanState } from '$lib/resolved-plan.svelte';
  import { eventDay, nextPlannedItem } from '$lib/resolved-plan';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { activitiesForDay, getEventDays, computeNowState, formatTime } from '@indiafoss/schedule';
  import NowGrid from '$lib/components/NowGrid.svelte';
  import { clockFromParams, isFixedClock } from '$lib/clock';
  import { tickInterval } from '$lib/simulator.svelte';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import GettingThere from '$lib/components/GettingThere.svelte';
  import { goTarget, GOING_LABEL, showGettingThere } from '$lib/now-page';

  const clock = $derived(
    clockFromParams(page.url.searchParams.get('now'), page.url.searchParams.get('speed')),
  );
  let now = $state('');

  $effect(() => {
    now = clock.now();
    if (isFixedClock(clock)) return;
    const timer = setInterval(() => {
      now = clock.now();
    }, tickInterval(1000));
    return () => clearInterval(timer);
  });

  const bundle = $derived(eventState.bundle);
  const nowState = $derived(bundle && now ? computeNowState(bundle, now) : null);

  const day = $derived(bundle && now ? eventDay(now, bundle.timezone) : null);
  const days = $derived(bundle ? getEventDays(bundle) : []);
  const before = $derived(nowState?.phase === 'before');
  /** One continuous timeline: every conference day, including the overnight gap. */
  const gridActivities = $derived(
    bundle ? days.flatMap((conferenceDay) => activitiesForDay(bundle, conferenceDay)) : [],
  );
  const gridScope = $derived(`${days[0] ?? ''}..${days.at(-1) ?? ''}`);
  /** The first session of the conference: before the event, when it starts. */
  const firstStart = $derived(gridActivities.map((a) => a.start!).sort()[0] ?? bundle?.start ?? '');
  const planDay = $derived(
    day && days.includes(day) ? day : before ? (days[0] ?? null) : (days.at(-1) ?? null),
  );
  const currentPlan = $derived(livePlanState.bundle === bundle && livePlanState.day === planDay);
  const personalPlan = $derived(currentPlan ? livePlanState.result : null);
  const planStatus = $derived(currentPlan ? livePlanState.status : 'loading');
  const planConflicted = $derived(
    Boolean(
      personalPlan &&
      (!personalPlan.edited.feasible || personalPlan.mustAttendConflicts.length > 0),
    ),
  );
  const personalNext = $derived(
    personalPlan && !planConflicted ? nextPlannedItem(personalPlan.edited, now) : null,
  );
  const gridIds = $derived(new Set(gridActivities.map((a) => a.id)));
  /** The card drawn in gold: your plan's talk, else the programme's next (#221). */
  const go = $derived(
    goTarget({
      planStatus,
      planConflicted,
      planItemId: personalNext?.id,
      gridIds,
      programmeNextId: nowState?.next?.id,
    }),
  );
  /** Your plan's item when it has no card to light: a personal block, lunch. */
  const planBlock = $derived(personalNext && !gridIds.has(personalNext.id) ? personalNext : null);
</script>

<EventGate>
  <!-- The view switch is the page's visible title; the heading stays for assistive tech. -->
  <h1 class="sr-only">Schedule</h1>
  <div class="titlebar">
    <ScheduleViews current="timeline" />
    {#if planDay}<a href={resolve(`/plan?day=${planDay}`)}>{t('now.yourPlan')}</a>{/if}
  </div>

  {#if isFixedClock(clock)}
    <p class="devtime"><span class="devtag">DEV CLOCK</span> {now}</p>
  {/if}

  {#if !nowState}
    <p>Loading…</p>
  {:else}
    {#if nowState.phase === 'after'}
      <section class="card wrap">
        <h2>That's a wrap</h2>
        <p>The conference has ended. The full programme remains available below.</p>
      </section>
    {/if}

    <!-- Your plan speaks through the grid: its talk is the gold card. Only what
         the grid cannot show gets a line here, and only one. -->
    {#if planConflicted}
      <p class="notice" role="status">
        Your plan has conflicting choices.
        <a href={resolve(`/plan?day=${planDay}`)}>Resolve them</a> to see where to go.
      </p>
    {:else if planStatus === 'error'}
      <p class="notice" role="status">Your plan could not be loaded. Open Plan to try again.</p>
    {:else if planBlock}
      <p class="goline">
        <span class="kicker">{t('go.going')}</span>
        <strong>{planBlock.label ?? 'Personal time'}</strong>
        <span class="muted"
          >{Date.parse(planBlock.start) <= Date.parse(now) ? `${t('now.now')} · ` : ''}{formatTime(
            planBlock.start,
          )}–{formatTime(planBlock.end)}</span
        >
        {#if planBlock.locationId}
          · <a href={resolve(`/map/to/${planBlock.locationId}`)}
            >{bundle?.locations.find((l) => l.id === planBlock.locationId)?.name ??
              planBlock.locationId}</a
          >
        {/if}
      </p>
    {/if}

    <!-- No card around it: the grid is the page, edge to edge on a phone. -->
    <section class="happening" aria-labelledby="now-heading">
      {#snippet heading()}
        <h2 id="now-heading">
          {before
            ? t('now.starts', { when: `${dayLabel(days[0]!)} · ${formatTime(firstStart)}` })
            : nowState.phase === 'after'
              ? 'Full programme'
              : t('now.happening')}
        </h2>
      {/snippet}
      {#if gridActivities.length === 0}
        {@render heading()}
        <p class="muted">No scheduled sessions on this day.</p>
      {:else}
        <NowGrid
          activities={gridActivities}
          bundle={bundle!}
          scope={gridScope}
          {now}
          goId={go?.id}
          goLabel={go ? (go.label === GOING_LABEL ? t('go.going') : t('go.upNext')) : undefined}
        >
          {#snippet header()}{@render heading()}{/snippet}
        </NowGrid>
      {/if}
    </section>

    <!-- For arriving: gone once the first morning is under way. -->
    {#if bundle?.venue && showGettingThere(bundle, now)}
      <GettingThere venue={bundle.venue} compact />
    {/if}
  {/if}
</EventGate>

<style>
  /* Density (issue 685): the grid is the page, so the chrome above it stays small. */
  .titlebar {
    display: flex;
    align-items: center;
    margin-block: 0.5rem;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .titlebar a {
    font-size: 0.85rem;
  }
  .devtime {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0 0 0.5rem;
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
  .card.wrap {
    padding: 0.65rem 0.8rem;
    margin-bottom: 0.6rem;
  }
  .card.wrap h2,
  .card.wrap p {
    margin: 0;
  }
  /* Out past the page's side padding (1rem below 1024px, in +layout.svelte),
     so on a phone the grid runs from edge to edge. */
  .happening {
    margin-inline: -1rem;
    padding-left: 0.25rem;
  }
  .happening h2 {
    margin: 0 0 0 0.35rem;
    font-size: 0.95rem;
  }
  @media (min-width: 1024px) {
    .happening {
      margin-inline: 0;
      padding-left: 0;
    }
  }
  .notice,
  .goline {
    margin: 0 0 0.6rem;
    padding: 0.45rem 0.7rem;
    border-radius: var(--radius);
    font-size: 0.85rem;
    line-height: 1.35;
  }
  .notice {
    border: 1px solid var(--danger);
    background: color-mix(in srgb, var(--danger) 8%, var(--surface-raised));
  }
  /* The same gold as the card it stands in for. */
  .goline {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.15rem 0.45rem;
    background: color-mix(in srgb, var(--amber-soft) 85%, var(--surface-raised));
    box-shadow: inset 0 0 0 2px var(--amber);
  }
  .kicker {
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--amber-ink);
  }
  .muted {
    color: var(--text-muted);
    margin: 0.3rem 0;
  }
  .goline .muted {
    margin: 0;
  }
</style>
