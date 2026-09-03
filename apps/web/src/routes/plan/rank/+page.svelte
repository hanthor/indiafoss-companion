<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { SvelteSet } from 'svelte/reactivity';
  import type { Activity, Person } from '@indiafoss/model';
  import { activitiesForDay, formatDayLabel, formatTime, getEventDays } from '@indiafoss/schedule';
  import {
    applyComparison,
    applyPriors,
    conflictProgress,
    conflictSlots,
    overlaps,
    pairKey,
    pairKScale,
    pairOpen as isPairOpen,
    scheduleStability,
    type AffinityModel,
    type ConflictSlot,
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
    devrooms,
    hydrateRoomPrefs,
    markRoomsDecided,
    roomPreference,
    roomPrefsState,
    setRoomPreference,
  } from '$lib/roomPrefs.svelte';
  import { roomSummary } from '$lib/roomInfo';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';
  import TypeBadge from '$lib/components/TypeBadge.svelte';

  const bundle = $derived(eventState.bundle!);
  const days = $derived(bundle ? getEventDays(bundle) : []);

  /** The three steps (#108): devrooms, one talk at a time, then each slot's overlaps. */
  type Mode = 'rooms' | 'cards' | 'slots';

  let selectedDay = $state<string | null>(null);
  let busy = $state(false);
  let entering = $state(false);
  let ready = $state(false);
  /** Answered talks are folded away; this unfolds them to change an answer. */
  let showAnswered = $state(false);

  $effect(() => {
    if (selectedDay === null && days.length > 0) selectedDay = days[0]!;
  });

  $effect(() => {
    // The page mounts before the bundle is in on a direct visit; the gate
    // renders nothing until then, but this effect still runs.
    const eventId = eventState.bundle?.id;
    if (!eventId) return;
    void Promise.all([hydratePreferences(), hydrateComparisons(), hydrateRoomPrefs(eventId)]).then(
      () => (ready = true),
    );
  });

  // ---------- Step 1: devrooms ----------
  const rooms = $derived(devrooms(bundle));
  const roomsOut = $derived(rooms.filter((r) => roomPreference(r.track.id) === 'skip').length);
  const roomsMust = $derived(rooms.filter((r) => roomPreference(r.track.id) === 'love').length);
  /** Which devroom's programme is unfolded. */
  let openRoom = $state<string | null>(null);
  async function roomsDone(): Promise<void> {
    await markRoomsDecided(bundle.id);
    chosenMode = 'cards';
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

  // ---------- Step 2: one talk at a time ----------
  const untriaged = $derived(daySessions.filter((a) => !triageOf(a.id)));
  const triaged = $derived(daySessions.filter((a) => !!triageOf(a.id)));
  const keptCount = $derived(daySessions.filter((a) => triageOf(a.id) === 'yes').length);
  const droppedCount = $derived(daySessions.filter((a) => triageOf(a.id) === 'no').length);
  const card = $derived<Activity | undefined>(untriaged[0]);
  const nextCard = $derived<Activity | undefined>(untriaged[1]);
  /** Whether the abstract on the current card is unfolded. */
  let readMore = $state(false);

  /** Swipe state: where the card is being dragged, and which way it is leaving. */
  let dragX = $state(0);
  let dragging = $state(false);
  let leaving = $state<'left' | 'right' | null>(null);
  const SWIPE_COMMIT = 90;
  let pointerStartX = 0;

  function onCardDown(event: PointerEvent): void {
    if (busy || !card) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a')) return; // reading about a talk is not an answer
    pointerStartX = event.clientX;
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function onCardMove(event: PointerEvent): void {
    if (!dragging) return;
    dragX = event.clientX - pointerStartX;
  }
  function onCardUp(): void {
    if (!dragging) return;
    dragging = false;
    if (dragX > SWIPE_COMMIT) void answerCard('yes');
    else if (dragX < -SWIPE_COMMIT) void answerCard('no');
    else dragX = 0;
  }

  /**
   * One answer about the talk on top: "no" rules it out, "yes" keeps it,
   * "must" keeps it and marks it must-attend. The card flies off first so a
   * button tap gets the same motion as a swipe.
   */
  async function answerCard(answer: 'yes' | 'no' | 'must'): Promise<void> {
    if (!card || busy) return;
    busy = true;
    chosenMode = 'cards';
    const id = card.id;
    leaving = answer === 'no' ? 'left' : 'right';
    await new Promise((r) => setTimeout(r, 180));
    await setTriage(id, answer === 'no' ? 'no' : 'yes');
    if (answer === 'must') await setDisposition(id, 'must-attend');
    leaving = null;
    dragX = 0;
    readMore = false;
    busy = false;
  }
  async function clearAnswer(activity: Activity): Promise<void> {
    chosenMode = 'cards';
    await setTriage(activity.id, undefined);
  }

  /** Sessions that clash with a given one, for the card's hint. */
  const clashCount = (a: Activity): number =>
    daySessions.filter(
      (b) => b.id !== a.id && dispositionOf(b.id) !== 'not-interested' && overlaps(a, b),
    ).length;

  // ---------- Step 3: overlaps, one slot at a time ----------
  const slots = $derived<ConflictSlot[]>(
    ready ? conflictSlots({ activities: pool, alreadyCompared: answered }) : [],
  );
  const openSlots = $derived(slots.filter((s) => s.open > 0));
  /** Slots put off for later this visit. */
  const skippedSlots = new SvelteSet<string>();
  const slot = $derived<ConflictSlot | undefined>(
    openSlots.find((s) => !skippedSlots.has(s.key)) ?? openSlots[0],
  );
  const slotIndex = $derived(slot ? openSlots.findIndex((s) => s.key === slot.key) + 1 : 0);
  const pairOpen = (a: RankedActivity, b: RankedActivity): boolean => isPairOpen(a, b, answered);
  /** The members still in the running: every member is in at least one open pair. */
  const remaining = $derived<RankedActivity[]>(slot?.members ?? []);
  /** A pick already made in this window leaves the rest as the backup question. */
  const isBackup = $derived(
    !!slot &&
      slot.members.some((m) =>
        slot.members.some((o) => o !== m && answered.has(pairKey(m.activity.id, o.activity.id))),
      ),
  );

  /** One reversible answer, captured before the Elo updates were applied. */
  interface UndoEntry {
    comparisonIds: string[];
    before: { id: string; rating: number; comparisons: number; disposition: Disposition }[];
  }
  const undoStack = $state<UndoEntry[]>([]);
  const canUndo = $derived(undoStack.length > 0);

  const snapshot = (id: string) => ({
    id,
    rating: ratingOf(id),
    comparisons: comparisonsOf(id),
    disposition: dispositionOf(id),
  });

  /**
   * Tap the session you would go to: it beats every other open member of the
   * slot in one go. Ratings move on the stored values, never the prior view,
   * and each pair is recorded so it is never asked again.
   */
  async function pickInSlot(winner: RankedActivity): Promise<void> {
    if (!slot || busy) return;
    const losers = remaining.filter((o) => o !== winner && pairOpen(winner, o));
    if (losers.length === 0) return;
    busy = true;
    const ids = [winner.activity.id, ...losers.map((l) => l.activity.id)];
    const before = ids.map(snapshot);
    const live = new Map(
      before.map((b) => [b.id, { rating: b.rating, comparisons: b.comparisons }]),
    );
    const comparisonIds: string[] = [];
    for (const loser of losers) {
      const w = live.get(winner.activity.id)!;
      const l = live.get(loser.activity.id)!;
      const result = applyComparison(
        w.rating,
        l.rating,
        'definitely-a',
        pairKScale(w.comparisons, l.comparisons),
      );
      w.rating = result.ratingA;
      w.comparisons += 1;
      l.rating = result.ratingB;
      l.comparisons += 1;
      const comparisonId = `cmp-${Date.now()}-${comparisonIds.length}`;
      comparisonIds.push(comparisonId);
      await recordComparison({
        id: comparisonId,
        activityA: winner.activity.id,
        activityB: loser.activity.id,
        scoreA: 1,
        createdAt: new Date().toISOString(),
      });
    }
    await Promise.all([...live].map(([id, r]) => setRating(id, r.rating, r.comparisons)));
    undoStack.push({ comparisonIds, before });
    busy = false;
    entering = true;
    setTimeout(() => (entering = false), 200);
  }

  /** "Any of these": every open pair in the slot is a tie. */
  async function tieSlot(): Promise<void> {
    if (!slot || busy) return;
    busy = true;
    const before = remaining.map((m) => snapshot(m.activity.id));
    const live = new Map(
      before.map((b) => [b.id, { rating: b.rating, comparisons: b.comparisons }]),
    );
    const comparisonIds: string[] = [];
    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const a = remaining[i]!;
        const b = remaining[j]!;
        if (!pairOpen(a, b)) continue;
        const ra = live.get(a.activity.id)!;
        const rb = live.get(b.activity.id)!;
        const result = applyComparison(
          ra.rating,
          rb.rating,
          'tie',
          pairKScale(ra.comparisons, rb.comparisons),
        );
        ra.rating = result.ratingA;
        ra.comparisons += 1;
        rb.rating = result.ratingB;
        rb.comparisons += 1;
        const comparisonId = `cmp-${Date.now()}-${comparisonIds.length}`;
        comparisonIds.push(comparisonId);
        await recordComparison({
          id: comparisonId,
          activityA: a.activity.id,
          activityB: b.activity.id,
          scoreA: 0.5,
          createdAt: new Date().toISOString(),
        });
      }
    }
    await Promise.all([...live].map(([id, r]) => setRating(id, r.rating, r.comparisons)));
    undoStack.push({ comparisonIds, before });
    busy = false;
  }

  /** "None of these": the whole slot leaves the day. */
  async function dropSlot(): Promise<void> {
    if (!slot || busy) return;
    busy = true;
    const before = remaining.map((m) => snapshot(m.activity.id));
    await Promise.all(before.map((b) => setDisposition(b.id, 'not-interested')));
    undoStack.push({ comparisonIds: [], before });
    busy = false;
  }

  function skipSlot(): void {
    if (!slot) return;
    if (openSlots.every((s) => s.key === slot.key || skippedSlots.has(s.key))) skippedSlots.clear();
    skippedSlots.add(slot.key);
  }

  async function undoLast(): Promise<void> {
    if (busy) return;
    const last = undoStack.pop();
    if (!last) return;
    await Promise.all(
      last.before.flatMap((b) => [
        setRating(b.id, b.rating, b.comparisons),
        setDisposition(b.id, b.disposition),
      ]),
    );
    for (const id of last.comparisonIds) await forgetComparison(id);
  }

  /**
   * Which step to show. Devrooms first, once per event; then the talks while
   * there are unanswered ones and no slot answered yet; then the overlaps.
   * `?mode=` forces a step, for links and tests (`quick` and `pairs` are the
   * old names and still work).
   */
  const forcedMode = $derived<Mode | null>(
    (
      {
        rooms: 'rooms',
        cards: 'cards',
        quick: 'cards',
        slots: 'slots',
        pairs: 'slots',
      } as Record<string, Mode>
    )[page.url.searchParams.get('mode') ?? ''] ?? null,
  );
  let chosenMode = $state<Mode | null>(null);
  // Decided once the stored answers are in, then only by the attendee: the
  // first answer must not flip the screen to the next step.
  $effect(() => {
    if (!ready || chosenMode !== null || daySessions.length === 0) return;
    chosenMode =
      forcedMode ??
      (!roomPrefsState.decided && rooms.length > 0
        ? 'rooms'
        : untriaged.length > 0 && choicesMade === 0
          ? 'cards'
          : 'slots');
  });
  const mode = $derived<Mode>(chosenMode ?? forcedMode ?? 'slots');

  // Keyboard: the cards are buttons, so Tab + Enter already works; these are shortcuts.
  function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (busy) return;
    if (mode === 'cards') {
      switch (event.key) {
        case 'ArrowRight':
        case 'y':
        case 'Y':
          event.preventDefault();
          void answerCard('yes');
          break;
        case 'ArrowLeft':
        case 'n':
        case 'N':
          event.preventDefault();
          void answerCard('no');
          break;
        case 'm':
        case 'M':
          void answerCard('must');
          break;
        default:
          break;
      }
      return;
    }
    if (mode !== 'slots') return;
    if (/^[1-9]$/.test(event.key)) {
      const pick = remaining[Number(event.key) - 1];
      if (pick) {
        event.preventDefault();
        void pickInSlot(pick);
      }
      return;
    }
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        if (remaining[0]) void pickInSlot(remaining[0]);
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (remaining[1]) void pickInSlot(remaining[1]);
        break;
      case 'e':
      case 'E':
        void tieSlot();
        break;
      case '0':
        void dropSlot();
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

  // ---------- Presentation ----------
  const locationName = (a: Activity): string =>
    bundle.locations.find((l) => l.id === a.locationId)?.name ?? '';
  const speakersOf = (a: Activity): Person[] =>
    a.speakerIds.map((id) => bundle.people.find((p) => p.id === id)).filter((p) => !!p);
  const speakerNames = (a: Activity): string =>
    speakersOf(a)
      .map((p) => p.name)
      .join(', ');
  const speakerLine = (p: Person): string =>
    [p.designation, p.organization].filter(Boolean).join(' · ');
  const timeRange = (a: Activity): string =>
    a.start && a.end ? `${formatTime(a.start)}–${formatTime(a.end)}` : '';
  const letters = 'abcdefghij';
  /** Tags worth a chip: not the session type again, not a CFP category pasted whole. */
  const topicTags = (a: Activity): string[] =>
    a.tags
      .filter(
        (t) => t.length <= 24 && !/^(talk|lightning talk|keynote|workshop|panel|bof)$/i.test(t),
      )
      .slice(0, 6);

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

  <!-- Three steps: the devrooms, then every talk once, then only the overlaps, slot by slot. -->
  <div class="modes" role="tablist" aria-label="Step">
    <button
      role="tab"
      aria-selected={mode === 'rooms'}
      class:active={mode === 'rooms'}
      onclick={() => (chosenMode = 'rooms')}
    >
      1 · Devrooms
      {#if roomsOut + roomsMust > 0}<span class="count">{roomsOut + roomsMust}</span>{/if}
    </button>
    <button
      role="tab"
      aria-selected={mode === 'cards'}
      class:active={mode === 'cards'}
      onclick={() => (chosenMode = 'cards')}
    >
      2 · Talks
      {#if untriaged.length > 0}<span class="count">{untriaged.length}</span>{/if}
    </button>
    <button
      role="tab"
      aria-selected={mode === 'slots'}
      class:active={mode === 'slots'}
      onclick={() => (chosenMode = 'slots')}
    >
      3 · Overlaps
      <!-- The count means little before the talks step has thinned the day. -->
      {#if openSlots.length > 0 && (untriaged.length === 0 || choicesMade > 0)}
        <span class="count">{openSlots.length}</span>
      {/if}
    </button>
  </div>

  {#if mode === 'rooms'}
    <p class="muted small lead">
      Which devrooms are for you? <b>Not interested</b> takes a room's talks out of the day,
      <b>Must go</b> puts them ahead of the rest. The main halls are always in.
    </p>
    {#if rooms.length === 0}
      <section class="done" aria-live="polite">
        <div class="donetitle">NO DEVROOMS</div>
        <p>This programme runs in the main halls only, so there is nothing to choose here.</p>
        <button class="button dark" onclick={roomsDone}>On to the talks →</button>
      </section>
    {:else}
      <ul class="roomlist" aria-label="Devrooms">
        {#each rooms as r (r.track.id)}
          {@const pref = roomPreference(r.track.id)}
          {@const info = roomSummary(bundle, r.sessions)}
          <li class="roomrow" data-testid="room-row" class:out={pref === 'skip'}>
            <div class="roomtext">
              <span class="roomname">{r.track.name}</span>
              {#if r.track.description}
                <span class="roomabout">{r.track.description}</span>
              {/if}
              <span class="muted small">{info.line}</span>
              {#if info.tags.length > 0}
                <span class="tags" aria-label="Topics">
                  {#each info.tags as tag (tag)}<span class="tag">{tag}</span>{/each}
                </span>
              {/if}
              {#if info.speakers.length > 0}
                <span class="muted small speakers"
                  >{info.speakers
                    .slice(0, 3)
                    .map((p) => p.name)
                    .join(', ')}{info.speakers.length > 3
                    ? ` and ${info.speakers.length - 3} more`
                    : ''}</span
                >
              {/if}
              <button
                class="linkbtn small"
                aria-expanded={openRoom === r.track.id}
                onclick={() => (openRoom = openRoom === r.track.id ? null : r.track.id)}
              >
                {openRoom === r.track.id ? 'Hide the talks ▴' : "What's on ▾"}
              </button>
              {#if openRoom === r.track.id}
                <ul class="roomtalks">
                  {#each r.sessions as act (act.id)}
                    <li>
                      <span class="when">{act.start ? formatTime(act.start) : ''}</span>
                      <a href={resolve(`/activity/${act.id}`)}>{act.title}</a>
                      {#if speakerNames(act)}<span class="muted small">{speakerNames(act)}</span
                        >{/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
            <div class="roomchoice" role="group" aria-label={`${r.track.name} interest`}>
              <button
                class:on={pref === 'skip'}
                class="skip"
                aria-pressed={pref === 'skip'}
                onclick={() =>
                  setRoomPreference(bundle, r.track.id, pref === 'skip' ? undefined : 'skip')}
                >Not interested</button
              >
              <button
                class:on={!pref}
                aria-pressed={!pref}
                onclick={() => setRoomPreference(bundle, r.track.id, undefined)}>Interested</button
              >
              <button
                class:on={pref === 'love'}
                class="love"
                aria-pressed={pref === 'love'}
                onclick={() =>
                  setRoomPreference(bundle, r.track.id, pref === 'love' ? undefined : 'love')}
                >Must go</button
              >
            </div>
          </li>
        {/each}
      </ul>
      <div class="roomsdone">
        <button class="button dark" onclick={roomsDone}>
          {roomsOut > 0 || roomsMust > 0
            ? `Done · ${roomsOut} out, ${roomsMust} must go →`
            : 'All devrooms are fine →'}
        </button>
      </div>
    {/if}
  {:else if mode === 'cards'}
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

    {#if !ready}
      <p class="muted" role="status">Loading your picks…</p>
    {:else if !card}
      <section class="done" aria-live="polite">
        <div class="donetitle">TALKS SORTED</div>
        <p>
          {keptCount} in, {droppedCount} out.
          {#if openSlots.length > 0}
            {openSlots.length} time slot{openSlots.length === 1 ? '' : 's'} still
            {openSlots.length === 1 ? 'has' : 'have'} talks you kept that overlap.
          {:else}
            Nothing you kept overlaps — your plan is ready.
          {/if}
        </p>
        {#if openSlots.length > 0}
          <button class="button dark" onclick={() => (chosenMode = 'slots')}
            >Settle {openSlots.length} slot{openSlots.length === 1 ? '' : 's'} →</button
          >
        {:else}
          <a class="button dark" href={resolve('/plan')}>See my plan</a>
        {/if}
      </section>
    {:else}
      {@const clashes = clashCount(card)}
      <p class="muted small lead center">
        Swipe right if you might go, left if not. Only the Yeses that overlap need settling
        afterwards.
      </p>
      <div class="stack" aria-live="polite">
        {#if nextCard}
          <article class="talkcard behind" aria-hidden="true">
            <span class="talkhead">
              <TypeBadge type={nextCard.type} />
              <span class="when">{timeRange(nextCard)}</span>
            </span>
            <span class="title">{nextCard.title}</span>
          </article>
        {/if}
        {#key card.id}
          <!-- The buttons below are the keyboard and screen-reader path; the drag is a shortcut. -->
          <article
            class="talkcard"
            class:dragging
            class:leaving-left={leaving === 'left'}
            class:leaving-right={leaving === 'right'}
            data-testid="talk-card"
            aria-label={card.title}
            style="--dx:{dragX}px;--rot:{dragX / 18}deg"
            onpointerdown={onCardDown}
            onpointermove={onCardMove}
            onpointerup={onCardUp}
            onpointercancel={onCardUp}
          >
            <span
              class="stamp yes"
              aria-hidden="true"
              style="opacity:{Math.min(1, Math.max(0, dragX) / SWIPE_COMMIT)}">INTERESTED</span
            >
            <span
              class="stamp no"
              aria-hidden="true"
              style="opacity:{Math.min(1, Math.max(0, -dragX) / SWIPE_COMMIT)}">NOT FOR ME</span
            >
            <span class="talkhead">
              <TypeBadge type={card.type} />
              <span class="when"
                >{timeRange(card)}{locationName(card) ? ` · ${locationName(card)}` : ''}</span
              >
            </span>
            <h2 class="title">{card.title}</h2>
            {#if card.subtitle && !/^(talk|lightning talk|keynote|workshop|panel|bof)$/i.test(card.subtitle)}<p
                class="subtitle"
              >
                {card.subtitle}
              </p>{/if}
            {#each speakersOf(card) as p (p.id)}
              <div class="speakerrow">
                {#if p.avatarUrl}
                  <img class="avatar" src={p.avatarUrl} alt="" loading="lazy" />
                {:else}
                  <span class="avatar initials" aria-hidden="true"
                    >{p.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join('')}</span
                  >
                {/if}
                <span class="speakertext">
                  <a class="speakername" href={resolve(`/speaker/${p.id}`)}>{p.name}</a>
                  {#if speakerLine(p)}<span class="muted small">{speakerLine(p)}</span>{/if}
                </span>
              </div>
            {/each}
            {#if card.description}
              <div class="abstract" class:open={readMore}>
                <p>{card.description}</p>
              </div>
              <button
                class="more"
                type="button"
                aria-expanded={readMore}
                onclick={() => (readMore = !readMore)}
              >
                {readMore ? 'Less ▴' : 'Read more ▾'}
              </button>
            {:else}
              <p class="muted small">No abstract for this one yet.</p>
            {/if}
            {#if card.tags.length > 0}
              <span class="tags">
                {#each topicTags(card) as tag (tag)}<span class="tag">{tag}</span>{/each}
              </span>
            {/if}
            {#if clashes > 0}
              <span class="clash">Overlaps {clashes} other{clashes === 1 ? '' : 's'}</span>
            {/if}
          </article>
        {/key}
      </div>
      <div class="cardbtns">
        <button
          class="button secondary no"
          aria-label={`Not for me: ${card.title}`}
          onclick={() => answerCard('no')}
          disabled={busy}>✕ Not for me</button
        >
        <button
          class="button secondary yes"
          aria-label={`Interested: ${card.title}`}
          onclick={() => answerCard('yes')}
          disabled={busy}>✓ Interested</button
        >
        <button
          class="button dark must"
          aria-label={`Must go: ${card.title}`}
          onclick={() => answerCard('must')}
          disabled={busy}>★ Must go</button
        >
      </div>
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
                  >{triageOf(act.id) === 'no'
                    ? 'OUT'
                    : dispositionOf(act.id) === 'must-attend'
                      ? 'MUST'
                      : 'IN'}</span
                >
                <button class="linkbtn small" onclick={() => clearAnswer(act)}>Undo</button>
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
    {:else if !slot}
      <section class="done" aria-live="polite">
        <div class="donetitle">ALL SETTLED</div>
        <p>
          {#if progress.conflicts === 0 && untriaged.length > 0}
            Nothing overlaps yet. Sorting the talks first tells the app what you would skip.
          {:else}
            Every overlap for this day has a winner. Your plan is built around them.
          {/if}
        </p>
        {#if progress.conflicts === 0 && untriaged.length > 0}
          <button class="button dark" onclick={() => (chosenMode = 'cards')}>Sort the talks</button>
        {:else}
          <a class="button dark" href={resolve('/plan')}>See my plan</a>
        {/if}
      </section>
    {:else}
      <section class="pair" class:entering aria-label="Which session would you go to?">
        <div class="reason">
          <span class="pill amber"
            >SLOT {slotIndex} OF {openSlots.length} · {formatTime(slot.start)}–{formatTime(
              slot.end,
            )}</span
          >
          <span class="reasontext">
            {isBackup ? 'And if that falls through?' : 'Which one would you go to?'}
          </span>
        </div>

        {#each remaining as r, i (r.activity.id)}
          {@const act = r.activity}
          <article class="talk">
            <button
              class="pick"
              data-testid={`candidate-${letters[i] ?? i}`}
              onclick={() => pickInSlot(r)}
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
              {#if r.disposition === 'must-attend'}<span class="mustpill">★ MUST GO</span>{/if}
            </button>
            <a class="more" href={resolve(`/activity/${act.id}`)}>About this talk ↗</a>
          </article>
        {/each}

        <div class="secondary">
          <button class="button secondary" onclick={tieSlot} disabled={busy}>Any of these</button>
          <button
            class="button secondary muted"
            onclick={dropSlot}
            disabled={busy}
            title="Drops them all from your day">None of these</button
          >
        </div>
        {#if openSlots.length > 1}
          <button class="linkbtn small center" onclick={skipSlot}>Decide this slot later →</button>
        {/if}
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
  /* Steps */
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

  /* Step 1: devrooms */
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
    flex-direction: column;
    gap: 0.6rem;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 0.8rem 0.9rem;
    transition: opacity 0.15s;
  }
  .roomrow.out {
    opacity: 0.7;
  }
  .roomtext {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .roomname {
    font-weight: 700;
    font-size: 1rem;
  }
  .roomabout {
    font-size: 0.85rem;
    line-height: 1.45;
    text-wrap: pretty;
  }
  .roomtext .linkbtn {
    align-self: flex-start;
    margin-top: 0.2rem;
  }
  .roomtalks {
    list-style: none;
    padding: 0.5rem 0 0;
    margin: 0.2rem 0 0;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .roomtalks li {
    display: grid;
    grid-template-columns: 2.6rem 1fr;
    column-gap: 0.5rem;
    font-size: 0.85rem;
    line-height: 1.35;
  }
  .roomtalks li .when {
    text-align: left;
    padding-top: 0.1rem;
  }
  .roomtalks li a {
    color: var(--text);
    text-decoration: none;
    font-weight: 600;
  }
  .roomtalks li .muted {
    grid-column: 2;
  }
  .roomchoice {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.3rem;
  }
  .roomchoice button {
    min-height: 2.4rem;
    padding: 0 0.4rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text-muted);
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
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
  .lead.center {
    text-align: center;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .tag {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    letter-spacing: 0.04em;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text-muted) 12%, transparent);
    color: var(--text-muted);
  }

  /* Step 2: the card stack */
  .stack {
    display: grid;
    margin: 0 0 0.8rem;
    touch-action: pan-y;
  }
  .stack > * {
    grid-area: 1 / 1;
  }
  .talkcard {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 1rem 1rem 0.9rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
    transform: translateX(var(--dx, 0)) rotate(var(--rot, 0));
    transition: transform 0.2s ease;
    user-select: none;
    cursor: grab;
    overflow: hidden;
  }
  .talkcard.dragging {
    transition: none;
    cursor: grabbing;
  }
  .talkcard.leaving-left {
    transform: translateX(-120%) rotate(-12deg);
    opacity: 0;
    transition:
      transform 0.18s ease-in,
      opacity 0.18s;
  }
  .talkcard.leaving-right {
    transform: translateX(120%) rotate(12deg);
    opacity: 0;
    transition:
      transform 0.18s ease-in,
      opacity 0.18s;
  }
  .talkcard.behind {
    transform: translateY(10px) scale(0.96);
    opacity: 0.6;
    box-shadow: none;
    pointer-events: none;
  }
  .stamp {
    position: absolute;
    top: 0.9rem;
    font-family: var(--font-display, var(--font-mono));
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    padding: 0.35rem 0.6rem;
    border: 2px solid;
    border-radius: 8px;
    pointer-events: none;
    opacity: 0;
  }
  .stamp.yes {
    left: 0.9rem;
    color: var(--mint-ink);
    border-color: var(--mint-ink);
    transform: rotate(-12deg);
  }
  .stamp.no {
    right: 0.9rem;
    color: var(--amber-ink);
    border-color: var(--amber-ink);
    transform: rotate(12deg);
  }
  .talkcard .title {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.01em;
    text-wrap: pretty;
  }
  .subtitle {
    margin: -0.2rem 0 0;
    font-size: 0.9rem;
    color: var(--text-muted);
  }
  .speakerrow {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .avatar {
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    object-fit: cover;
    flex: none;
    background: var(--mint-soft, #bafcd5);
  }
  .avatar.initials {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--mint-ink);
  }
  .speakertext {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .speakername {
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
  }
  .talkcard .abstract {
    border-top: 0;
    padding-top: 0;
    max-height: 5.6rem;
    overflow: hidden;
    position: relative;
  }
  .talkcard .abstract.open {
    max-height: none;
  }
  .talkcard .abstract:not(.open)::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 2rem;
    background: linear-gradient(transparent, var(--surface-raised));
  }
  .talkcard .more {
    align-self: flex-start;
    margin: -0.4rem 0 0 -0.5rem;
  }
  /* Stay reachable while a long card scrolls under them. */
  .cardbtns {
    position: sticky;
    bottom: calc(var(--tabbar-height) + var(--safe-bottom, 0px) + 0.5rem);
    z-index: 2;
    display: grid;
    grid-template-columns: 1fr 1fr 1.1fr;
    gap: 0.4rem;
    padding: 0.4rem 0;
    background: linear-gradient(transparent, var(--surface) 30%);
  }
  .cardbtns .button {
    white-space: nowrap;
    font-size: 0.82rem;
    padding-inline: 0.5rem;
  }
  .cardbtns .yes {
    border-color: var(--mint);
    background: var(--mint-soft, #bafcd5);
    color: var(--mint-ink);
  }
  .cardbtns .no:hover,
  .cardbtns .no:focus-visible {
    background: var(--amber-soft);
    color: var(--amber-ink);
  }

  /* Answered list under the cards */
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
    align-items: center;
    gap: 0.6rem;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 0.45rem 0.8rem;
  }
  .quicktext {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .quicktitle {
    font-size: 0.85rem;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text);
    text-wrap: pretty;
  }
  .clash {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    color: var(--amber-ink);
  }
  .quickbtns {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.35rem;
    flex: none;
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

  /* Step 3: the slot */
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
  @media (prefers-reduced-motion: reduce) {
    .talkcard,
    .talkcard.leaving-left,
    .talkcard.leaving-right {
      transition: none;
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
  .reasontext {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .talk {
    position: relative;
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 0 1rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
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
    gap: 0.5rem;
    width: calc(100% + 2rem);
    margin: 0 -1rem;
    padding: 0.9rem 1rem 0.2rem;
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
  .mustpill {
    align-self: flex-start;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--amber-ink);
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
    text-decoration: none;
  }
  .more:hover,
  .more:focus-visible {
    background: var(--mint-soft, #bafcd5);
    outline: none;
  }
  .abstract {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.88rem;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .abstract p {
    margin: 0;
    white-space: pre-line;
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
  .linkbtn.center {
    align-self: center;
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
