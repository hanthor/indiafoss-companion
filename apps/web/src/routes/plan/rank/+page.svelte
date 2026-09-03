<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
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
    applyPriors,
    conflictProgress,
    pairKScale,
    scheduleStability,
    selectNextComparison,
    type AffinityModel,
    type ComparisonCandidate,
    type ComparisonChoice,
    type RankedActivity,
  } from '@indiafoss/elo';
  import type { Disposition } from '@indiafoss/storage';
  import {
    comparedPairs,
    comparisonsOf,
    dispositionOf,
    forgetComparison,
    hydrateComparisons,
    hydratePreferences,
    ratingOf,
    recordComparison,
    setDisposition,
    setRating,
    setTriage,
    triageOf,
  } from '$lib/prefs.svelte';
  import { affinityModel } from '$lib/priors.svelte';
  import {
    hydrateRoomPrefs,
    markRoomsDecided,
    rankableRooms,
    roomPreference,
    roomPrefsState,
    setRoomPreference,
  } from '$lib/roomPrefs.svelte';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';

  const bundle = $derived(eventState.bundle!);
  const days = $derived(bundle ? getEventDays(bundle) : []);

  type Mode = 'rooms' | 'quick' | 'pairs';

  let selectedDay = $state<string | null>(null);
  let busy = $state(false);
  let entering = $state(false);
  /** Which card's abstract is open; collapses when the next pair loads. */
  let openMore = $state<'a' | 'b' | null>(null);
  let ready = $state(false);
  /** Answered quick-pass rows are folded away; this unfolds them to change an answer. */
  let showAnswered = $state(false);

  /** One reversible comparison, captured before the Elo update is applied. */
  interface UndoEntry {
    comparisonId: string;
    a: { id: string; rating: number; comparisons: number; disposition: Disposition };
    b: { id: string; rating: number; comparisons: number; disposition: Disposition };
  }
  const undoStack = $state<UndoEntry[]>([]);
  const canUndo = $derived(undoStack.length > 0);

  $effect(() => {
    if (selectedDay === null && days.length > 0) selectedDay = days[0]!;
  });

  $effect(() => {
    void Promise.all([
      hydratePreferences(),
      hydrateComparisons(),
      hydrateRoomPrefs(bundle.id),
    ]).then(() => (ready = true));
  });

  // ---------- Rooms ----------
  const rooms = $derived(rankableRooms(bundle));
  const roomsSkipped = $derived(rooms.filter((r) => roomPreference(r.track.id) === 'skip').length);
  const roomsLoved = $derived(rooms.filter((r) => roomPreference(r.track.id) === 'love').length);
  async function roomsDone(): Promise<void> {
    await markRoomsDecided(bundle.id);
    chosenMode = 'quick';
  }

  // ---------- The day's sessions ----------
  const daySessions = $derived<Activity[]>(
    (selectedDay ? activitiesForDay(bundle, selectedDay) : []).filter(
      (a) => !a.cancelled && a.type !== 'meal',
    ),
  );

  /** Stored ratings, the source of truth for updates. */
  const stored = $derived<RankedActivity[]>(
    daySessions.map((a) => ({
      activity: a,
      rating: ratingOf(a.id),
      comparisons: comparisonsOf(a.id),
      disposition: dispositionOf(a.id),
    })),
  );

  /** What the attendee keeps picking, learnt from every answer so far (#90). */
  const model = $derived<AffinityModel>(affinityModel(bundle));

  /** The pool the questions are chosen from: stored ratings with the taste prior blended in. */
  const pool = $derived<RankedActivity[]>(applyPriors(stored, model));

  const answered = $derived(comparedPairs());

  const candidate = $derived<ComparisonCandidate | null>(
    ready ? selectNextComparison({ activities: pool, alreadyCompared: answered }) : null,
  );

  const progress = $derived(conflictProgress({ activities: pool, alreadyCompared: answered }));
  const stability = $derived(
    pool.length >= 2 ? scheduleStability({ activities: pool, alreadyCompared: answered }) : 1,
  );

  /** Choices made on this day's sessions, for the readout. */
  const choicesMade = $derived.by(() => {
    const ids = new Set(daySessions.map((a) => a.id));
    let n = 0;
    for (const key of answered) {
      const [x, y] = key.split('|');
      if (x && y && ids.has(x) && ids.has(y)) n++;
    }
    return n;
  });

  // ---------- Quick pass ----------
  const untriaged = $derived(daySessions.filter((a) => !triageOf(a.id)));
  const triaged = $derived(daySessions.filter((a) => !!triageOf(a.id)));
  const keptCount = $derived(daySessions.filter((a) => triageOf(a.id) === 'yes').length);
  const droppedCount = $derived(daySessions.filter((a) => triageOf(a.id) === 'no').length);

  /**
   * Which round to show. A day nobody has touched starts with the quick pass;
   * once it is done, or the attendee has started answering pairs, head to head.
   * `?mode=` forces either, for links and tests.
   */
  const forcedMode = $derived<Mode | null>(
    page.url.searchParams.get('mode') === 'pairs'
      ? 'pairs'
      : page.url.searchParams.get('mode') === 'quick'
        ? 'quick'
        : page.url.searchParams.get('mode') === 'rooms'
          ? 'rooms'
          : null,
  );
  let chosenMode = $state<Mode | null>(null);
  // Decided once the stored answers are in, then only by the attendee: the
  // first quick-pass answer must not flip the screen to head to head.
  $effect(() => {
    if (!ready || chosenMode !== null || daySessions.length === 0) return;
    // Rooms first, once per event; then keep sorting while there is a list
    // left to sort and no pair answered yet.
    chosenMode =
      forcedMode ??
      (!roomPrefsState.decided && rooms.length > 1
        ? 'rooms'
        : untriaged.length > 0 && choicesMade === 0
          ? 'quick'
          : 'pairs');
  });
  const mode = $derived<Mode>(chosenMode ?? forcedMode ?? 'pairs');

  async function answerQuick(activity: Activity, answer: 'yes' | 'no'): Promise<void> {
    chosenMode = 'quick';
    await setTriage(activity.id, answer);
  }
  async function clearQuick(activity: Activity): Promise<void> {
    chosenMode = 'quick';
    await setTriage(activity.id, undefined);
  }

  const overlaps = (a: Activity, b: Activity): boolean =>
    !!a.start &&
    !!a.end &&
    !!b.start &&
    !!b.end &&
    Date.parse(a.start) < Date.parse(b.end) &&
    Date.parse(b.start) < Date.parse(a.end);

  /** Sessions that clash with a given one, for the quick-pass hint. */
  const clashCount = (a: Activity): number =>
    daySessions.filter(
      (b) => b.id !== a.id && dispositionOf(b.id) !== 'not-interested' && overlaps(a, b),
    ).length;

  // ---------- Choosing ----------
  async function choose(choice: ComparisonChoice): Promise<void> {
    if (!candidate || busy) return;
    busy = true;
    const idA = candidate.activityA.activity.id;
    const idB = candidate.activityB.activity.id;
    const before = {
      a: {
        id: idA,
        rating: ratingOf(idA),
        comparisons: comparisonsOf(idA),
        disposition: dispositionOf(idA),
      },
      b: {
        id: idB,
        rating: ratingOf(idB),
        comparisons: comparisonsOf(idB),
        disposition: dispositionOf(idB),
      },
    };
    // The Elo update works on the stored ratings, never the prior-adjusted view;
    // sessions answered about for the first time move further (provisional K).
    const result = applyComparison(
      before.a.rating,
      before.b.rating,
      choice,
      pairKScale(before.a.comparisons, before.b.comparisons),
    );
    await Promise.all([
      setRating(idA, result.ratingA, before.a.comparisons + 1),
      setRating(idB, result.ratingB, before.b.comparisons + 1),
    ]);
    if (choice === 'neither') {
      // "Neither" means neither: both drop out of the running, which is what
      // makes the day converge instead of asking about them again.
      await Promise.all([
        setDisposition(idA, 'not-interested'),
        setDisposition(idB, 'not-interested'),
      ]);
    }
    const comparisonId = `cmp-${Date.now()}`;
    await recordComparison({
      id: comparisonId,
      activityA: idA,
      activityB: idB,
      scoreA: choice === 'neither' || choice === 'tie' ? 0.5 : choice.startsWith('a') ? 1 : 0,
      createdAt: new Date().toISOString(),
    });
    undoStack.push({ comparisonId, ...before });
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
      setDisposition(last.a.id, last.a.disposition),
      setDisposition(last.b.id, last.b.disposition),
    ]);
    await forgetComparison(last.comparisonId);
    openMore = null;
  }

  // Keyboard: the cards are buttons, so Tab + Enter already works; these are shortcuts.
  function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (busy || mode !== 'pairs') return;
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
        return {
          tone: 'grey',
          pill: `NEW TO YOU${clash ? ` · ${clash}` : ''}`,
          text: 'Neither ranked yet',
        };
    }
  });

  /** The learnt taste, as a short line: the tracks pulling up or down. */
  const tasteLine = $derived.by(() => {
    const names = new Map(bundle.tracks.map((t) => [`track:${t.id}`, t.name]));
    const rows = [...model.affinity.entries()]
      .filter(([key]) => names.has(key) && (model.evidence.get(key) ?? 0) >= 2)
      .map(([key, value]) => ({ name: names.get(key)!, value }))
      .filter((r) => Math.abs(r.value) >= 0.2)
      .sort((x, y) => Math.abs(y.value) - Math.abs(x.value))
      .slice(0, 3);
    return rows.map((r) => `${r.name} ${r.value > 0 ? '↑' : '↓'}`).join(' · ');
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

  <!-- Two rounds: a quick yes/no sweep, then only the overlaps that are still open. -->
  <div class="modes" role="tablist" aria-label="Round">
    <button
      role="tab"
      aria-selected={mode === 'rooms'}
      class:active={mode === 'rooms'}
      onclick={() => (chosenMode = 'rooms')}
    >
      1 · Rooms
      {#if roomsSkipped + roomsLoved > 0}<span class="count">{roomsSkipped + roomsLoved}</span>{/if}
    </button>
    <button
      role="tab"
      aria-selected={mode === 'quick'}
      class:active={mode === 'quick'}
      onclick={() => (chosenMode = 'quick')}
    >
      2 · Quick pass
      {#if untriaged.length > 0}<span class="count">{untriaged.length}</span>{/if}
    </button>
    <button
      role="tab"
      aria-selected={mode === 'pairs'}
      class:active={mode === 'pairs'}
      onclick={() => (chosenMode = 'pairs')}
    >
      3 · Head to head
      <!-- The count means little before the quick pass has thinned the day. -->
      {#if progress.open > 0 && (untriaged.length === 0 || choicesMade > 0)}
        <span class="count">{progress.open}</span>
      {/if}
    </button>
  </div>

  {#if mode === 'rooms'}
    <p class="muted small lead">
      Which rooms are for you? <b>Skip</b> a room and none of its talks are shown again;
      <b>Love</b> one and its talks start a little higher. The main halls are always in.
    </p>
    <ul class="roomlist" aria-label="Rooms">
      {#each rooms as r (r.track.id)}
        {@const pref = roomPreference(r.track.id)}
        <li class="roomrow" data-testid="room-row">
          <div class="roomtext">
            <span class="roomname">{r.track.name}</span>
            <span class="muted small"
              >{r.sessions.length} session{r.sessions.length === 1 ? '' : 's'}{r.main
                ? ' · main hall'
                : ''}</span
            >
          </div>
          <div class="roomchoice" role="group" aria-label={`${r.track.name} preference`}>
            {#if !r.main}
              <button
                class:on={pref === 'skip'}
                class="skip"
                aria-pressed={pref === 'skip'}
                onclick={() =>
                  setRoomPreference(bundle, r.track.id, pref === 'skip' ? undefined : 'skip')}
                >Skip</button
              >
            {/if}
            <button
              class:on={!pref}
              aria-pressed={!pref}
              onclick={() => setRoomPreference(bundle, r.track.id, undefined)}>OK</button
            >
            <button
              class:on={pref === 'love'}
              class="love"
              aria-pressed={pref === 'love'}
              onclick={() =>
                setRoomPreference(bundle, r.track.id, pref === 'love' ? undefined : 'love')}
              >Love</button
            >
          </div>
        </li>
      {/each}
    </ul>
    <div class="roomsdone">
      <button class="button dark" onclick={roomsDone}>
        {roomsSkipped > 0 || roomsLoved > 0
          ? `Done · ${roomsSkipped} skipped, ${roomsLoved} loved →`
          : 'All rooms are fine →'}
      </button>
    </div>
  {:else if mode === 'quick'}
    <p class="muted small lead">
      Tap <b>Yes</b> for anything you might go to and <b>No</b> for what you would not. Only the Yeses
      that overlap need settling afterwards, so this is the fast way through a long day.
    </p>
    <div class="progress" role="status">
      <div class="progresstext">
        <span class="ok">{keptCount} IN · {droppedCount} OUT</span>
        <span>{untriaged.length} TO GO</span>
      </div>
      <div class="track">
        <div
          class="fill"
          style="width:{daySessions.length
            ? Math.round((triaged.length / daySessions.length) * 100)
            : 0}%"
        ></div>
      </div>
    </div>

    {#if untriaged.length === 0}
      <section class="done" aria-live="polite">
        <div class="donetitle">QUICK PASS DONE</div>
        <p>
          {keptCount} in, {droppedCount} out.
          {#if progress.open > 0}
            {progress.open} overlap{progress.open === 1 ? '' : 's'} among your Yeses still need a winner.
          {:else}
            Nothing you kept overlaps — your plan is ready.
          {/if}
        </p>
        {#if progress.open > 0}
          <button class="button dark" onclick={() => (chosenMode = 'pairs')}
            >Settle {progress.open} overlap{progress.open === 1 ? '' : 's'} →</button
          >
        {:else}
          <a class="button dark" href={resolve('/plan')}>See my plan</a>
        {/if}
      </section>
    {:else}
      <ul class="quicklist" aria-label="Sessions to sort">
        {#each untriaged as act (act.id)}
          {@const clashes = clashCount(act)}
          <li class="quickrow" data-testid="quick-row">
            <div class="quicktext">
              <span class="talkhead">
                <TypeBadge type={act.type} />
                <span class="when"
                  >{timeRange(act)}{locationName(act) ? ` · ${locationName(act)}` : ''}</span
                >
              </span>
              <a class="quicktitle" href={resolve(`/activity/${act.id}`)}>{act.title}</a>
              {#if speakerNames(act)}<span class="speaker">{speakerNames(act)}</span>{/if}
              {#if clashes > 0}
                <span class="clash">Overlaps {clashes} other{clashes === 1 ? '' : 's'}</span>
              {/if}
            </div>
            <div class="quickbtns">
              <button
                class="yes tap-target"
                aria-label={`Yes to ${act.title}`}
                onclick={() => answerQuick(act, 'yes')}>Yes</button
              >
              <button
                class="no tap-target"
                aria-label={`No to ${act.title}`}
                onclick={() => answerQuick(act, 'no')}>No</button
              >
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    {#if triaged.length > 0}
      <button class="linkbtn answered" onclick={() => (showAnswered = !showAnswered)}>
        {showAnswered ? 'Hide' : 'Change'} answered ({triaged.length})
      </button>
      {#if showAnswered}
        <ul class="quicklist compact" aria-label="Answered">
          {#each triaged as act (act.id)}
            <li class="quickrow">
              <div class="quicktext">
                <span class="quicktitle plain">{act.title}</span>
                <span class="when">{timeRange(act)}</span>
              </div>
              <div class="quickbtns">
                <span class="answer" class:out={triageOf(act.id) === 'no'}
                  >{triageOf(act.id) === 'no' ? 'OUT' : 'IN'}</span
                >
                <button class="linkbtn small" onclick={() => clearQuick(act)}>Undo</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {:else}
    <div class="progress" role="status">
      <div class="progresstext">
        <span class="ok">{Math.round(stability * 100)}% RESOLVED</span>
        <span
          >{`${choicesMade} ${choicesMade === 1 ? 'CHOICE' : 'CHOICES'} · ${progress.open} ${progress.open === 1 ? 'OVERLAP' : 'OVERLAPS'} OPEN`}</span
        >
      </div>
      <div class="track"><div class="fill" style="width:{Math.round(stability * 100)}%"></div></div>
    </div>

    {#if !ready}
      <p class="muted" role="status">Loading your picks…</p>
    {:else if !candidate}
      <section class="done" aria-live="polite">
        <div class="donetitle">ALL SETTLED</div>
        <p>
          {#if progress.conflicts === 0 && untriaged.length > 0}
            Nothing overlaps yet. A quick pass first tells the app what you would skip.
          {:else}
            Every overlap for this day has a winner. Your plan is built around them.
          {/if}
        </p>
        {#if progress.conflicts === 0 && untriaged.length > 0}
          <button class="button dark" onclick={() => (chosenMode = 'quick')}
            >Do the quick pass</button
          >
        {:else}
          <a class="button dark" href={resolve('/plan')}>See my plan</a>
        {/if}
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
          <button
            class="button secondary muted"
            onclick={() => choose('neither')}
            disabled={busy}
            title="Drops both from your day">Neither, skip both</button
          >
        </div>
      </section>
    {/if}

    <div class="controls">
      <button class="button secondary" onclick={undoLast} disabled={!canUndo}>↶ Undo last</button>
      <p class="muted small">
        {#if tasteLine}
          Learning your taste: {tasteLine}. Unranked sessions borrow it.
        {:else}
          Your picks update a local Elo rating. Nothing is sent anywhere.
        {/if}
      </p>
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
  {/if}
</EventGate>

<style>
  /* Rounds */
  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.35rem;
    margin-bottom: 0.8rem;
  }
  .modes button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.5rem 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    background: var(--surface-raised);
    color: var(--text-muted);
    cursor: pointer;
    min-height: 0;
  }
  .modes button.active {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }
  .modes .count {
    background: var(--amber);
    color: var(--ink);
    border-radius: 999px;
    padding: 0 0.45rem;
    font-size: 0.62rem;
    line-height: 1.1rem;
  }
  /* Rooms */
  .roomlist {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .roomrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 0.6rem 0.8rem;
  }
  .roomtext {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .roomname {
    font-weight: 700;
    font-size: 0.95rem;
  }
  .roomchoice {
    display: flex;
    gap: 0.25rem;
    flex: none;
  }
  .roomchoice button {
    min-height: 2.2rem;
    padding: 0 0.6rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text-muted);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
  }
  .roomchoice button.on {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }
  .roomchoice button.love.on {
    background: var(--mint);
    border-color: var(--mint);
    color: var(--ink);
  }
  .roomchoice button.skip.on {
    background: var(--amber-soft);
    border-color: var(--amber-ink);
    color: var(--amber-ink);
  }
  .roomsdone {
    margin-top: 0.9rem;
    display: flex;
    justify-content: center;
  }
  .lead {
    margin: 0 0 0.8rem;
    line-height: 1.5;
    text-wrap: pretty;
  }

  /* Quick pass */
  .quicklist {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .quickrow {
    display: flex;
    align-items: stretch;
    gap: 0.6rem;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 0.7rem 0.8rem;
  }
  .quicklist.compact .quickrow {
    padding: 0.45rem 0.8rem;
    align-items: center;
  }
  .quicktext {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .quicktitle {
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.3;
    color: var(--text);
    text-decoration: none;
    text-wrap: pretty;
  }
  .quicktitle.plain {
    font-size: 0.85rem;
    font-weight: 600;
  }
  .clash {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    color: var(--amber-ink);
  }
  .quickbtns {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.35rem;
    flex: none;
  }
  .quicklist.compact .quickbtns {
    flex-direction: row;
    align-items: center;
  }
  .quickbtns .yes,
  .quickbtns .no {
    min-width: 3.6rem;
    min-height: 2.4rem;
    border-radius: 10px;
    border: 1px solid var(--border);
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    background: var(--surface);
    color: var(--text);
  }
  .quickbtns .yes {
    background: var(--mint);
    border-color: var(--mint);
    color: var(--ink);
  }
  .quickbtns .no:hover,
  .quickbtns .no:focus-visible {
    background: var(--amber-soft);
    color: var(--amber-ink);
  }
  .answer {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--mint-ink);
  }
  .answer.out {
    color: var(--text-muted);
  }
  .answered {
    margin-top: 0.7rem;
  }

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
