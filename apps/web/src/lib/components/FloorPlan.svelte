<script lang="ts">
  import { page } from '$app/state';
  import type { Activity } from '@indiafoss/model';
  import { activityProgress, formatTime, parseInstant } from '@indiafoss/schedule';
  import { clockFromParams, isFixedClock } from '$lib/clock';
  import { tickInterval } from '$lib/simulator.svelte';
  import { eventState } from '$lib/event.svelte';
  import { journeyRoute, ROUTING_LABELS } from '$lib/journey';
  import { routingPrefs, setRoutingProfile } from '$lib/routingPrefs.svelte';
  import type { RoutingProfile } from '@indiafoss/venue';
  import { eventDay } from '$lib/resolved-plan';
  import { livePlanState } from '$lib/resolved-plan.svelte';
  import { bookmarked } from '$lib/prefs.svelte';
  import {
    currentLocation,
    hydrateLocation,
    locationIdFromDeepLink,
    setCurrentLocation,
  } from '$lib/location.svelte';
  import { loadVenue, venueKeyForEvent } from '$lib/venue.svelte';
  import { FLOORS, FLOOR_ORDER, anchorPercent } from '$lib/venue-floors';
  import type { FloorId, FloorRoom } from '$lib/venue-floors';
  import { floorOfRoom, locationsForRoom, roomForLocation } from '$lib/venue-rooms';
  import { DEFAULT_NOTIFICATION_WINDOW } from '$lib/notifications';
  import { computeNextUp } from '$lib/nextup';
  import { devroomTrackNames, labelHeadingFor } from '$lib/devrooms';
  import { routeEvidence, routeSteps } from '$lib/route-steps';

  /** Destination location id (`/map/to/[location]`): highlighted and opened in the sheet. */
  let { initialTo = '' }: { initialTo?: string } = $props();

  const BUFFER_SECONDS = DEFAULT_NOTIFICATION_WINDOW.leaveBufferMinutes * 60;

  const clock = $derived(
    clockFromParams(page.url.searchParams.get('now'), page.url.searchParams.get('speed')),
  );
  let now = $state('');
  $effect(() => {
    now = clock.now();
    if (isFixedClock(clock)) return;
    const timer = setInterval(() => {
      now = clock.now();
    }, tickInterval(15_000));
    return () => clearInterval(timer);
  });

  const bundle = $derived(eventState.bundle);
  const venueKey = $derived(venueKeyForEvent(bundle?.id ?? 'indiafoss-2026'));
  let venue = $state<Awaited<ReturnType<typeof loadVenue>> | null>(null);
  let venueError: string | null = $state(null);

  $effect(() => {
    const at = page.url.searchParams.get('at');
    void (async () => {
      await hydrateLocation();
      if (at) await setCurrentLocation(locationIdFromDeepLink(at) ?? at);
    })();
    void loadVenue(venueKey)
      .then((v) => {
        venue = v;
      })
      .catch((e) => {
        venueError = e instanceof Error ? e.message : String(e);
      });
  });

  // ---- rooms ↔ locations -------------------------------------------------

  const roomOf = $derived.by<Map<string, string>>(() => {
    // Rebuilt per venue; not reactive state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<string, string>();
    if (!venue) return map;
    for (const id of Object.keys(venue.metadata.locations)) {
      const room = roomForLocation(venue, id);
      if (room) map.set(id, room);
    }
    return map;
  });

  const allRooms = $derived(FLOOR_ORDER.flatMap((f) => FLOORS[f].rooms));

  /** The schedule's own name for a room (a devroom name on the 2025 programme), else the plan's. */
  function roomTitle(room: FloorRoom): string {
    if (!venue || !bundle) return room.name;
    const primary = locationsForRoom(venue, room.id)[0];
    return (primary && bundle.locations.find((l) => l.id === primary)?.name) || room.name;
  }

  function primaryLocation(roomId: string): string | null {
    return venue ? (locationsForRoom(venue, roomId)[0] ?? null) : null;
  }

  // ---- what's on ---------------------------------------------------------

  const nowMs = $derived(now ? parseInstant(now) : 0);

  const liveByRoom = $derived.by<Map<string, Activity[]>>(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<string, Activity[]>();
    if (!bundle) return map;
    for (const a of bundle.activities) {
      if (a.cancelled || !a.start || !a.end || !a.locationId) continue;
      if (parseInstant(a.start) > nowMs || parseInstant(a.end) <= nowMs) continue;
      const room = roomOf.get(a.locationId);
      if (!room) continue;
      map.set(room, [...(map.get(room) ?? []), a]);
    }
    return map;
  });

  const nextByRoom = $derived.by<Map<string, Activity>>(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const map = new Map<string, Activity>();
    if (!bundle) return map;
    const upcoming = bundle.activities
      .filter((a) => !a.cancelled && a.start && a.locationId && parseInstant(a.start) > nowMs)
      .sort((a, b) => parseInstant(a.start!) - parseInstant(b.start!));
    for (const a of upcoming) {
      const room = roomOf.get(a.locationId!);
      if (room && !map.has(room)) map.set(room, a);
    }
    return map;
  });

  const liveCount = $derived([...liveByRoom.values()].reduce((n, list) => n + list.length, 0));

  /**
   * Tracks that are devrooms: a room with its own programme rather than a main
   * hall (#117). A main hall is the one a keynote runs in, as ranking decides
   * it (`isMainRoom`), so the two screens agree on what a devroom is.
   */
  const devroomTracks = $derived(devroomTrackNames(bundle));

  /**
   * What to head a room's label with: the devroom's own name when what is on
   * is a devroom session, otherwise the room's name. In a devroom the
   * programme is the identity — "Rust" tells you more than "HALL 3".
   */
  function labelHeading(room: FloorRoom): { text: string; devroom: boolean } {
    const heading = labelHeadingFor(
      roomTitle(room),
      liveByRoom.get(room.id)?.[0]?.trackId,
      devroomTracks,
    );
    return heading.text === roomTitle(room) ? { text: heading.text, devroom: false } : heading;
  }

  const nextUp = $derived(
    bundle && now && routingPrefs.loaded
      ? computeNextUp({
          bundle,
          now,
          bookmarked,
          plannedIds: new Set(
            livePlanState.bundle === bundle && livePlanState.day === eventDay(now, bundle.timezone)
              ? livePlanState.activityIds
              : [],
          ),
          venue,
          currentLocation: currentLocation.value,
          profile: routingPrefs.profile,
          bufferSeconds: BUFFER_SECONDS,
        })
      : null,
  );
  const nextRoom = $derived(
    nextUp?.activity.locationId ? (roomOf.get(nextUp.activity.locationId) ?? null) : null,
  );
  const hereRoom = $derived(
    currentLocation.value ? (roomOf.get(currentLocation.value) ?? null) : null,
  );
  const destinationRoom = $derived(initialTo ? (roomOf.get(initialTo) ?? null) : null);

  // ---- from / to (#223) --------------------------------------------------
  // The journey is explicit: From is the manually set location, To is the
  // next planned talk, a `/map/to/` link, or a room the attendee picks. The
  // selects are the keyboard and large-text equivalent of tapping the plan.

  /** `undefined` follows the plan or deep link; `'plan'`, a room id or `''` is a choice. */
  let toChoice = $state<string | undefined>(undefined);
  const autoTo = $derived(destinationRoom ?? (nextRoom ? 'plan' : ''));
  const toValue = $derived(toChoice ?? autoTo);
  const toIsPlan = $derived(toValue === 'plan');
  const toRoom = $derived(toIsPlan ? nextRoom : toValue || null);
  const toRoomObj = $derived(allRooms.find((r) => r.id === toRoom) ?? null);
  const hereRoomObj = $derived(allRooms.find((r) => r.id === hereRoom) ?? null);
  /** Where the attendee said they are, even when that location is not drawn. */
  const hereName = $derived(
    hereRoomObj
      ? roomTitle(hereRoomObj)
      : currentLocation.value
        ? (bundle?.locations.find((l) => l.id === currentLocation.value)?.name ??
          currentLocation.value)
        : null,
  );

  // ---- floor + selection -------------------------------------------------

  let floorChoice = $state<FloorId | null>(null);
  const floor = $derived.by<FloorId>(() => {
    if (floorChoice) return floorChoice;
    const preferred = destinationRoom ?? hereRoom ?? toRoom;
    return (preferred && floorOfRoom(preferred)) || 'ground';
  });
  const plan = $derived(FLOORS[floor]);

  let selectedChoice = $state<string | null | undefined>(undefined);
  const selected = $derived(selectedChoice === undefined ? destinationRoom : selectedChoice);
  const selectedRoom = $derived(allRooms.find((r) => r.id === selected) ?? null);

  function floorHasLive(id: FloorId): boolean {
    return FLOORS[id].rooms.some((r) => (liveByRoom.get(r.id)?.length ?? 0) > 0);
  }

  const otherFloorHint = $derived.by(() => {
    const other = (room: string | null) => {
      const f = room ? floorOfRoom(room) : null;
      return f && f !== floor ? f : null;
    };
    const here = other(hereRoom);
    if (here) return here === 'first' ? "YOU'RE UPSTAIRS ↑" : "YOU'RE DOWNSTAIRS ↓";
    const next = other(toRoom);
    const what = toIsPlan ? 'NEXT TALK' : 'DESTINATION';
    if (next) return next === 'first' ? `${what} UPSTAIRS ↑` : `${what} DOWNSTAIRS ↓`;
    return '';
  });

  function roomState(id: string): 'live' | 'next' | '' {
    if ((liveByRoom.get(id)?.length ?? 0) > 0) return 'live';
    if (id === toRoom) return 'next';
    return '';
  }

  async function chooseFrom(roomId: string) {
    await setCurrentLocation(roomId ? primaryLocation(roomId) : null);
  }

  function chooseTo(value: string) {
    toChoice = value;
    const room = value === 'plan' ? nextRoom : value || null;
    const f = room ? floorOfRoom(room) : null;
    if (f) floorChoice = f;
  }

  let sheetExpanded = $state(false);

  function select(id: string) {
    const next = selected === id ? null : id;
    selectedChoice = next;
    sheetExpanded = false;
    const room = next ? allRooms.find((r) => r.id === next) : null;
    if (room) focusRoom(room);
  }

  // ---- overlay geometry --------------------------------------------------

  let boxW = $state(0);
  let boxH = $state(0);
  /** Where the letterboxed drawing sits inside the container, as CSS pixels. */
  /** The drawing's viewBox with breathing room so no wing is clipped at any aspect ratio. */
  const paddedViewBox = $derived.by(() => {
    const [x, y, w, h] = plan.viewBox.split(' ').map(Number) as [number, number, number, number];
    const px = w * 0.06;
    const py = h * 0.06;
    return `${x - px} ${y - py} ${w + 2 * px} ${h + 2 * py}`;
  });
  const content = $derived.by(() => {
    const [, , vw, vh] = paddedViewBox.split(' ').map(Number) as [number, number, number, number];
    if (!boxW || !boxH) return { x: 0, y: 0, w: boxW, h: boxH };
    const scale = Math.min(boxW / vw, boxH / vh);
    const w = vw * scale;
    const h = vh * scale;
    return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
  });

  // ---- pan + zoom ---------------------------------------------------------
  // The drawing is transformed as a whole; labels are positioned in screen
  // space from the same transform so they never scale with it.

  const MIN_SCALE = 1;
  const MAX_SCALE = 5;
  let view = $state({ scale: 1, tx: 0, ty: 0 });
  const zoomed = $derived(view.scale >= 1.6);

  function clampView(next: { scale: number; tx: number; ty: number }) {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    // Keep at least a quarter of the drawing on screen in each direction.
    const slackX = boxW * 0.75;
    const slackY = boxH * 0.75;
    const minTx = boxW - boxW * scale - slackX;
    const minTy = boxH - boxH * scale - slackY;
    return {
      scale,
      tx: Math.min(slackX, Math.max(minTx, next.tx)),
      ty: Math.min(slackY, Math.max(minTy, next.ty)),
    };
  }

  /** Zoom by `factor` keeping the screen point (px, py) fixed. */
  function zoomAt(factor: number, px: number, py: number) {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
    const k = scale / view.scale;
    view = clampView({ scale, tx: px - (px - view.tx) * k, ty: py - (py - view.ty) * k });
  }

  function zoomStep(factor: number) {
    zoomAt(factor, boxW / 2, boxH / 2);
  }

  function resetView() {
    view = { scale: 1, tx: 0, ty: 0 };
  }

  // Reset when the floor changes: the other floor has its own extent.
  $effect(() => {
    void floor;
    resetView();
  });

  // Gesture bookkeeping only; nothing renders from it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: {
    tx: number;
    ty: number;
    scale: number;
    dist: number;
    mx: number;
    my: number;
  } | null = null;
  let moved = $state(false);

  function localPoint(e: PointerEvent, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    // No capture yet: capturing here would redirect the tap's click to the
    // container and room buttons would never receive it.
    pointers.set(e.pointerId, localPoint(e, el));
    moved = false;
    startGesture();
  }

  function startGesture() {
    const pts = [...pointers.values()];
    if (pts.length === 0) {
      gesture = null;
      return;
    }
    const mx = pts.reduce((n, p) => n + p.x, 0) / pts.length;
    const my = pts.reduce((n, p) => n + p.y, 0) / pts.length;
    const dist = pts.length >= 2 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0;
    gesture = { tx: view.tx, ty: view.ty, scale: view.scale, dist, mx, my };
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId) || !gesture) return;
    const el = e.currentTarget as HTMLElement;
    pointers.set(e.pointerId, localPoint(e, el));
    const pts = [...pointers.values()];
    const mx = pts.reduce((n, p) => n + p.x, 0) / pts.length;
    const my = pts.reduce((n, p) => n + p.y, 0) / pts.length;
    let scale = gesture.scale;
    if (pts.length >= 2 && gesture.dist > 0) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, gesture.scale * (dist / gesture.dist)));
    }
    const dx = mx - gesture.mx;
    const dy = my - gesture.my;
    if (!moved && Math.hypot(dx, dy) > 6) {
      moved = true;
      for (const id of pointers.keys()) el.setPointerCapture(id);
    }
    if (!moved && scale === gesture.scale) return;
    const k = scale / gesture.scale;
    view = clampView({
      scale,
      tx: gesture.mx + dx - (gesture.mx - gesture.tx) * k,
      ty: gesture.my + dy - (gesture.my - gesture.ty) * k,
    });
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    startGesture();
  }

  /** A drag must not count as a tap on whatever ends up under the finger. */
  function onClickCapture(e: MouseEvent) {
    if (moved) {
      e.stopPropagation();
      e.preventDefault();
      moved = false;
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002));
    zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
  }

  const drawingStyle = $derived(
    `transform:translate(${view.tx.toFixed(1)}px,${view.ty.toFixed(1)}px) scale(${view.scale.toFixed(3)})`,
  );

  /** Screen position of a room's label anchor under the current view. */
  function labelPoint(room: FloorRoom): { x: number; y: number } {
    const p = anchorPercent(plan, room);
    return {
      x: view.tx + (content.x + (p.x / 100) * content.w) * view.scale,
      y: view.ty + (content.y + (p.y / 100) * content.h) * view.scale,
    };
  }

  function labelStyle(room: FloorRoom): string {
    const { x, y } = labelPoint(room);
    // Labels that leave the plan are hidden rather than left dangling off-screen.
    if (x < -40 || x > boxW + 40 || y < -20 || y > boxH + 20) return 'display:none';
    const cx = Math.min(boxW - 44, Math.max(44, x));
    const cy = Math.min(boxH - 20, Math.max(20, y));
    return `left:${cx.toFixed(1)}px;top:${cy.toFixed(1)}px`;
  }

  /** Height the room sheet takes at the bottom, so a selected room is panned above it. */
  const SHEET_PEEK = 150;

  /** Pan so `room` sits in the strip that stays visible above the sheet. */
  function focusRoom(room: FloorRoom) {
    const { x, y } = labelPoint(room);
    const visibleH = Math.max(120, boxH - SHEET_PEEK);
    const targetX = boxW / 2;
    const targetY = visibleH / 2;
    const inside = x > 60 && x < boxW - 60 && y > 40 && y < visibleH - 20;
    if (inside) return;
    view = clampView({
      scale: view.scale,
      tx: view.tx + (targetX - x),
      ty: view.ty + (targetY - y),
    });
  }

  function minutesLeft(a: Activity): number {
    return Math.max(0, Math.ceil((parseInstant(a.end!) - nowMs) / 60_000));
  }
  function minutesUntil(a: Activity): number {
    return Math.max(0, Math.ceil((parseInstant(a.start!) - nowMs) / 60_000));
  }
  function speakerName(a: Activity): string | undefined {
    const id = a.speakerIds[0];
    return id ? bundle?.people.find((p) => p.id === id)?.name : undefined;
  }
  function truncate(text: string, max = 22): string {
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
  }

  const selectedRoute = $derived(
    routingPrefs.loaded && selectedRoom
      ? journeyRoute(
          venue,
          currentLocation.value,
          primaryLocation(selectedRoom.id),
          routingPrefs.profile,
        )
      : null,
  );
  const isHere = $derived(selectedRoom !== null && hereRoom === selectedRoom.id);
  const isDestination = $derived(selectedRoom !== null && toRoom === selectedRoom.id);

  async function toggleHere() {
    if (!selectedRoom) return;
    await setCurrentLocation(isHere ? null : primaryLocation(selectedRoom.id));
  }

  function toggleDestination() {
    if (!selectedRoom) return;
    chooseTo(isDestination ? '' : selectedRoom.id);
  }

  /** The devroom whose programme is running in a room right now, if any. */
  function devroomOf(room: FloorRoom): string | null {
    const track = liveByRoom.get(room.id)?.[0]?.trackId;
    return track ? (devroomTracks.get(track) ?? null) : null;
  }

  // ---- the journey itself ------------------------------------------------

  const journey = $derived(
    routingPrefs.loaded && toRoom
      ? journeyRoute(venue, currentLocation.value, primaryLocation(toRoom), routingPrefs.profile)
      : null,
  );
  const journeySteps = $derived(
    journey && venue && toRoomObj ? routeSteps(venue, journey, { to: roomTitle(toRoomObj) }) : null,
  );
  const evidence = $derived(venue ? routeEvidence(venue) : null);
  const floorChangeText = $derived.by(() => {
    const n = journeySteps?.floorChanges ?? 0;
    return n === 0 ? 'same floor' : `${n} floor ${n === 1 ? 'change' : 'changes'}`;
  });
  let stepsOpen = $state(false);
</script>

{#if venueError}
  <section class="empty" role="alert">
    <p>The venue map could not be loaded.</p>
    <p class="small">{venueError}</p>
  </section>
{:else if !venue || !bundle}
  <p class="loading" role="status">Loading venue…</p>
{:else}
  <section class="journey-panel" aria-label="Journey">
    <div class="row">
      <label class="from-to" for="map-from">From</label>
      <select
        id="map-from"
        value={hereRoom ?? ''}
        onchange={(event) => void chooseFrom(event.currentTarget.value)}
      >
        <option value="">Set where I am…</option>
        {#if currentLocation.value && !hereRoom}
          <option value="" disabled>{hereName} (not on the plan)</option>
        {/if}
        {#each FLOOR_ORDER as id (id)}
          <optgroup label="{FLOORS[id].label} floor">
            {#each FLOORS[id].rooms as room (room.id)}
              {#if primaryLocation(room.id)}
                <option value={room.id}>{roomTitle(room)}</option>
              {/if}
            {/each}
          </optgroup>
        {/each}
      </select>
      {#if currentLocation.value}
        <span class="tag">MANUALLY SET</span>
        <button class="ghost" onclick={() => void chooseFrom('')}>Clear</button>
      {/if}
    </div>
    <div class="row">
      <label class="from-to" for="map-to">To</label>
      <select id="map-to" value={toValue} onchange={(event) => chooseTo(event.currentTarget.value)}>
        <option value="">Choose a room…</option>
        {#if nextRoom}
          <option value="plan"
            >Next planned talk · {roomTitle(allRooms.find((r) => r.id === nextRoom)!)}</option
          >
        {/if}
        {#each FLOOR_ORDER as id (id)}
          <optgroup label="{FLOORS[id].label} floor">
            {#each FLOORS[id].rooms as room (room.id)}
              {#if primaryLocation(room.id)}
                <option value={room.id}>{roomTitle(room)}</option>
              {/if}
            {/each}
          </optgroup>
        {/each}
      </select>
      {#if toIsPlan && nextUp}
        <span class="tag next">NEXT IN YOUR PLAN</span>
      {:else if toRoom && toRoom === destinationRoom && toChoice === undefined}
        <span class="tag next">FROM LINK</span>
      {/if}
    </div>
    {#if toIsPlan && nextUp}
      <p class="planned">
        <span class="title">{nextUp.activity.title}</span>
        <span class="muted">
          · {formatTime(nextUp.activity.start!)}{#if nextUp.leaveBy}
            · leave by {formatTime(nextUp.leaveBy)}{/if}
        </span>
      </p>
    {:else if !nextRoom && !toChoice && !destinationRoom}
      <p class="muted small">No upcoming talk in your plan. Pick a room to route to it.</p>
    {/if}
    <div class="row">
      <label class="from-to" for="map-routing-profile">Routing profile</label>
      <select
        id="map-routing-profile"
        value={routingPrefs.profile}
        disabled={!routingPrefs.loaded}
        onchange={(event) => void setRoutingProfile(event.currentTarget.value as RoutingProfile)}
      >
        {#each Object.entries(ROUTING_LABELS) as [value, label] (value)}<option {value}
            >{label}</option
          >{/each}
      </select>
    </div>
    <div class="summary" aria-live="polite" data-testid="journey-summary">
      {#if !currentLocation.value}
        <p class="muted small">Set where you are to get a walking estimate and route steps.</p>
      {:else if !toRoom}
        <p class="muted small">Choose a destination to see the walk.</p>
      {:else if !routingPrefs.loaded}
        <p class="muted small">Loading your routing preference…</p>
      {:else if journey && journeySteps?.sameSpot}
        <p class="small">You are already at {roomTitle(toRoomObj!)}.</p>
      {:else if journey && journeySteps}
        <p class="estimate">
          <strong>≈ {journeySteps.minutes} min walk</strong> · {floorChangeText} · {ROUTING_LABELS[
            routingPrefs.profile
          ]}
        </p>
        {#if evidence}
          <p class="evidence" class:validated={evidence.validated}>{evidence.label}</p>
        {/if}
        <button
          class="ghost steps-toggle"
          aria-expanded={stepsOpen}
          aria-controls="map-route-steps"
          onclick={() => (stepsOpen = !stepsOpen)}
        >
          {stepsOpen ? 'Hide' : 'Show'} route steps ({journeySteps.steps.length})
        </button>
        {#if stepsOpen}
          <ol id="map-route-steps" class="steps" aria-label="Route steps">
            {#each journeySteps.steps as step, i (i)}
              <li class={step.kind}>
                <span>{step.text}</span>
                <span class="muted small">{Math.max(1, Math.ceil(step.seconds / 60))} min</span>
              </li>
            {/each}
          </ol>
        {/if}
      {:else}
        <p class="small">
          No {ROUTING_LABELS[routingPrefs.profile].toLowerCase()} route is available on this map from
          {hereName} to {roomTitle(toRoomObj!)}. Ask the venue team for directions.
        </p>
      {/if}
    </div>
  </section>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="plan"
    class:dragging={moved}
    bind:clientWidth={boxW}
    bind:clientHeight={boxH}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onwheel={onWheel}
    onclickcapture={onClickCapture}
  >
    <svg
      viewBox={paddedViewBox}
      preserveAspectRatio="xMidYMid meet"
      class="drawing"
      style={drawingStyle}
      aria-hidden="true"
    >
      <path class="fill" d={plan.fill} />
      <path class="outline" d={plan.outline} />
      {#each plan.rooms as room (room.id)}
        <!-- The labelled buttons over the drawing are the accessible controls;
             the shapes are a larger tap target under an aria-hidden svg. -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <path
          class="room {roomState(room.id)}"
          class:selected={selected === room.id}
          d={room.d}
          onclick={() => select(room.id)}
        />
      {/each}
      {#each plan.podiums as d, i (i)}
        <path class="podium" {d} />
      {/each}
      {#each plan.stairs as s, i (i)}
        <path class="stairs" d={s.d} />
      {/each}
      {#each plan.walls as w, i (i)}
        <path class="wall" d={w.d} style="stroke:{w.s};stroke-width:{w.w}" />
      {/each}
    </svg>

    <div class="labels">
      {#each plan.rooms as room (room.id)}
        {@const live = liveByRoom.get(room.id) ?? []}
        {@const first = live[0]}
        {@const heading = labelHeading(room)}
        <button
          class="roomlabel {roomState(room.id)}"
          data-planned-destination={room.id === nextRoom}
          class:compact={!zoomed}
          class:selected={selected === room.id}
          style={labelStyle(room)}
          aria-label="{roomTitle(room)}{first
            ? `${heading.devroom ? `, ${heading.text} devroom` : ''}, live: ${first.title}, ${minutesLeft(first)} min left`
            : ''}{room.id === nextRoom ? ', next in your plan' : ''}{room.id === hereRoom
            ? ', you are here'
            : ''}"
          aria-pressed={selected === room.id}
          onclick={() => select(room.id)}
        >
          <span class="name">{roomTitle(room)}</span>
          {#if room.id === nextRoom}<span class="talk">Next in your plan</span
            >{:else if room.id === toRoom}<span class="talk">Destination</span>{/if}
          {#if heading.devroom}<span class="talk devroom">{heading.text}</span>{/if}
          {#if first}
            <!-- The talk itself, so the map answers "what is on in there" without a tap (#117). -->
            {#if !heading.devroom || zoomed}<span class="talk"
                >{truncate(first.title, zoomed ? 34 : 26)}</span
              >{/if}
            <span class="left">{minutesLeft(first)} MIN LEFT</span>
          {/if}
          {#if room.id === hereRoom}<span class="you" aria-hidden="true"></span>{/if}
        </button>
      {/each}
    </div>

    <div class="chips" role="group" aria-label="Floor">
      {#each FLOOR_ORDER as id (id)}
        <button
          class="chip"
          class:active={floor === id}
          aria-pressed={floor === id}
          onclick={() => (floorChoice = id)}
        >
          {FLOORS[id].label}
          {#if floorHasLive(id)}<span class="dot" aria-label="live sessions"></span>{/if}
        </button>
      {/each}
    </div>

    <div class="clock" aria-live="off">
      <span>{formatTime(now)}</span>
      <span class="livecount">{liveCount} LIVE</span>
    </div>

    {#if otherFloorHint}
      <p class="hint">{otherFloorHint}</p>
    {/if}

    <div class="zoom" role="group" aria-label="Zoom">
      <button aria-label="Zoom in" onclick={() => zoomStep(1.5)}>+</button>
      <button aria-label="Zoom out" onclick={() => zoomStep(1 / 1.5)} disabled={view.scale <= 1}
        >−</button
      >
      <button aria-label="Reset view" onclick={resetView} disabled={view.scale <= 1}>⌖</button>
    </div>

    <ul class="legend" aria-label="Legend">
      <li><span class="sw live"></span>LIVE</li>
      <li><span class="sw next"></span>TO</li>
      <li><span class="sw sw-you"></span>YOU</li>
    </ul>
  </div>

  {#if selectedRoom}
    {@const live = liveByRoom.get(selectedRoom.id) ?? []}
    {@const next = nextByRoom.get(selectedRoom.id)}
    <section class="sheet" class:expanded={sheetExpanded} aria-label="Room details">
      <button
        class="grabber"
        aria-expanded={sheetExpanded}
        aria-label={sheetExpanded ? 'Show less' : 'Show more'}
        onclick={() => (sheetExpanded = !sheetExpanded)}><span></span></button
      >
      <header>
        <div>
          <h2>{roomTitle(selectedRoom)}</h2>
          <p class="meta">
            {#if roomTitle(selectedRoom) !== selectedRoom.name}{selectedRoom.name} ·
            {/if}
            {FLOORS[floorOfRoom(selectedRoom.id) ?? floor].label} floor{#if selectedRoom.cap}
              · {selectedRoom.cap} seats{/if}
            {#if isDestination}
              · <span class="tag">DESTINATION</span>{/if}
          </p>
          {#if devroomOf(selectedRoom)}
            <p class="devroom-line">Devroom now: <strong>{devroomOf(selectedRoom)}</strong></p>
          {/if}
        </div>
        <button
          class="close"
          aria-label="Close room details"
          onclick={() => select(selectedRoom.id)}>×</button
        >
      </header>

      <div class="actions">
        {#if primaryLocation(selectedRoom.id)}
          <button class="here" class:clear={isHere} onclick={toggleHere}>
            {isHere ? 'Clear location' : "I'm here"}
          </button>
          <button class="here go" class:clear={isDestination} onclick={toggleDestination}>
            {isDestination ? 'Clear destination' : 'Go here'}
          </button>
        {/if}
      </div>

      <div class="journey" aria-label="Walking route">
        {#if !currentLocation.value}
          <p>Set where you are (From, or “I'm here”) to estimate the walk.</p>
        {:else if !routingPrefs.loaded}
          <p>Loading your routing preference…</p>
        {:else if selectedRoute}
          <p>
            {Math.ceil(selectedRoute.durationSeconds / 60)} min estimated walk · {ROUTING_LABELS[
              routingPrefs.profile
            ]}
          </p>
        {:else}
          <p>
            No {ROUTING_LABELS[routingPrefs.profile].toLowerCase()} route is available on this map from
            your starting location. Ask the venue team for directions.
          </p>
        {/if}
      </div>

      {#each live as a (a.id)}
        <div class="block">
          <span class="kicker live">ON NOW</span>
          <strong>{a.title}</strong>
          {#if speakerName(a)}<span class="muted">{speakerName(a)}</span>{/if}
          <div
            class="progress"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round(activityProgress(a, now) * 100)}
            aria-label="Session progress"
          >
            <span style="width:{Math.round(activityProgress(a, now) * 100)}%"></span>
          </div>
          <span class="muted">ends in {minutesLeft(a)} min · {formatTime(a.end!)}</span>
        </div>
      {/each}
      {#if next}
        <div class="block">
          <span class="kicker next">NEXT HERE</span>
          <strong>{next.title}</strong>
          <span class="muted">starts in {minutesUntil(next)} min · {formatTime(next.start!)}</span>
        </div>
      {:else if live.length === 0}
        <p class="muted">Nothing scheduled here right now.</p>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .journey {
    padding: 0.25rem 0;
    font-size: 0.85rem;
  }
  .journey p {
    margin: 0;
  }

  /* From / To panel: rows wrap so large text and narrow phones still fit. */
  .journey-panel {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--line);
    background: var(--surface-raised);
    font-size: 0.85rem;
  }
  .journey-panel .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.6rem;
  }
  .from-to {
    flex: 0 0 auto;
    min-width: 3rem;
    font-family: var(--font-mono);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .journey-panel select {
    flex: 1 1 10rem;
    min-width: 0;
    min-height: 44px;
    max-width: 100%;
    font: inherit;
  }
  .journey-panel .tag {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    letter-spacing: 0.08em;
  }
  .journey-panel .tag.next {
    color: var(--amber-ink);
  }
  .ghost {
    min-height: 44px;
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  .planned {
    margin: 0;
    font-size: 0.82rem;
  }
  .planned .title {
    font-weight: 600;
  }
  .summary p {
    margin: 0;
  }
  .estimate {
    font-size: 0.95rem;
  }
  .evidence {
    color: var(--amber-ink);
    font-size: 0.78rem;
  }
  .evidence.validated {
    color: var(--mint-ink);
  }
  .steps-toggle {
    margin-top: 0.3rem;
  }
  .steps {
    margin: 0.4rem 0 0;
    padding-left: 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .steps li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 0.75rem;
  }
  .steps li.stairs,
  .steps li.lift {
    font-weight: 600;
  }
  .small {
    font-size: 0.82rem;
  }
  .loading,
  .empty {
    padding: 1rem;
    color: var(--text-muted);
  }

  .plan {
    position: relative;
    flex: 1;
    min-height: 60vh;
    background: var(--paper);
    overflow: hidden;
    touch-action: none;
    cursor: grab;
  }
  .plan.dragging {
    cursor: grabbing;
  }
  .drawing {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform-origin: 0 0;
    will-change: transform;
  }
  .fill {
    fill: var(--surface-raised);
    stroke: none;
  }
  .outline {
    fill: none;
    stroke: var(--ink);
    stroke-width: 22;
    stroke-linejoin: round;
  }
  .room {
    fill: var(--surface);
    stroke: var(--line);
    stroke-width: 10;
    cursor: pointer;
    transition: fill 0.2s;
  }
  .room.live {
    fill: var(--mint-soft);
    stroke: var(--mint);
  }
  .room.next {
    fill: var(--amber-soft);
    stroke: var(--amber);
  }
  .room.selected {
    stroke: var(--ink);
    stroke-width: 28;
  }
  .podium {
    fill: var(--line);
  }
  .stairs {
    fill: none;
    stroke: var(--text-faint);
    stroke-width: 8;
  }
  .wall {
    fill: none;
    stroke-linecap: round;
  }
  @media (prefers-color-scheme: dark) {
    .wall {
      stroke: var(--text-faint) !important;
    }
  }

  .labels {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .roomlabel {
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    min-width: 44px;
    min-height: 44px;
    padding: 0.3rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: var(--shadow-hard-sm);
    cursor: pointer;
    font: inherit;
  }
  .roomlabel.compact {
    min-height: 32px;
    padding: 0.15rem 0.35rem;
    gap: 0;
  }
  .roomlabel.compact .name {
    font-size: 0.55rem;
  }
  .roomlabel.compact .name.devroom {
    font-size: 0.7rem;
  }
  .roomlabel.compact .talk {
    font-size: 0.55rem;
    max-width: 8.5rem;
  }
  .roomlabel.compact .left {
    font-size: 0.5rem;
  }
  .roomlabel .name {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  /* A devroom leads with its own name, larger than the talk under it (issue 117). */
  .roomlabel .name.devroom {
    font-family: inherit;
    font-size: 0.82rem;
    letter-spacing: 0.01em;
    text-transform: none;
    max-width: 9rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .roomlabel.live {
    border-color: var(--mint);
    background: var(--mint-ink);
    color: var(--on-strong);
  }
  .roomlabel.next {
    border-color: var(--amber);
    background: var(--amber);
    color: var(--ink);
  }
  .roomlabel.selected {
    outline: 2px solid var(--ink);
    outline-offset: 1px;
  }
  .roomlabel .talk {
    font-size: 0.62rem;
    max-width: 9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.95;
  }
  /* A devroom's name is its identity: wrap to two lines rather than cut it (issue 223). */
  .roomlabel .talk.devroom {
    white-space: normal;
    text-align: center;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .roomlabel .left {
    font-family: var(--font-mono);
    font-size: 0.55rem;
    letter-spacing: 0.08em;
    opacity: 0.85;
  }
  .you {
    position: absolute;
    top: -0.45rem;
    right: -0.45rem;
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 999px;
    background: var(--mint);
    border: 2px solid var(--on-ink);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--mint) 35%, transparent);
  }

  .chips {
    position: absolute;
    top: 0.6rem;
    left: 0.75rem;
    /* Keep the chips above the clock: in the desktop layout the canvas is
       narrow enough for the two to meet, and the clock must never take a tap. */
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    max-width: calc(100% - 1.5rem);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 44px;
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface-raised);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .chip.active {
    background: var(--ink);
    color: var(--on-ink);
    border-color: var(--ink);
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: var(--mint);
  }

  .clock {
    position: absolute;
    top: 0.6rem;
    right: 0.75rem;
    /* Read-only readout; it sits over the canvas and must not intercept taps
       meant for the floor chips or rooms beneath it. */
    pointer-events: none;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
    font-family: var(--font-mono);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .livecount {
    color: var(--mint-ink);
  }

  .hint {
    position: absolute;
    top: 3.2rem;
    right: 0.75rem;
    margin: 0;
    padding: 0.25rem 0.5rem;
    background: var(--amber);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .zoom {
    position: absolute;
    right: 0.75rem;
    bottom: 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .zoom button {
    width: 44px;
    height: 44px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface-raised);
    color: var(--text);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }
  .zoom button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .legend {
    position: absolute;
    bottom: 0.6rem;
    left: 0.75rem;
    display: flex;
    gap: 0.7rem;
    margin: 0;
    padding: 0.3rem 0.55rem;
    list-style: none;
    background: var(--surface-raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font-family: var(--font-mono);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .sw {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 2px;
  }
  .sw.live {
    background: var(--mint-soft);
    border: 1px solid var(--mint);
  }
  .sw.next {
    background: var(--amber-soft);
    border: 1px solid var(--amber);
  }
  .sw-you {
    background: var(--mint);
    border-radius: 999px;
  }

  .grabber {
    display: block;
    width: 100%;
    padding: 0.35rem 0 0.1rem;
    border: none;
    background: none;
    cursor: pointer;
  }
  .grabber span {
    display: block;
    width: 2.5rem;
    height: 4px;
    margin: 0 auto;
    border-radius: 999px;
    background: var(--line-strong);
    opacity: 0.4;
  }
  /* Keep the map visible while allowing every room action to remain reachable. */
  .sheet:not(.expanded) {
    max-height: 38dvh;
  }
  .sheet {
    max-height: 65dvh;
    overflow-y: auto;
    position: sticky;
    bottom: calc(var(--tabbar-height) + var(--safe-bottom));
    z-index: 2;
    margin: 0;
    padding: 0.8rem 1rem 1rem;
    background: var(--surface-raised);
    border-top: 2px solid var(--ink);
    box-shadow: 0 -8px 24px rgb(0 0 0 / 0.08);
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .sheet > * {
    flex-shrink: 0;
  }
  /* Desktop (issue 205): the plan fills the height beside the rail and the room
     sheet stands to its right as a panel, so opening a room hides no map. */
  @media (min-width: 1024px) {
    .sheet,
    .sheet:not(.expanded) {
      position: static;
      flex: 0 0 24rem;
      max-height: calc(100dvh - var(--appbar-height) - var(--safe-top));
      border-top: none;
      border-left: 2px solid var(--ink);
      box-shadow: none;
      padding-top: 1rem;
    }
    .grabber {
      display: none;
    }
  }
  .sheet header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .sheet h2 {
    margin: 0;
    font-family: var(--font-display, var(--font-mono));
    font-size: 0.85rem;
    line-height: 1.5;
  }
  .meta {
    margin: 0.15rem 0 0;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .tag {
    color: var(--amber-ink);
    font-weight: 700;
  }
  .devroom-line {
    margin: 0.2rem 0 0;
    font-size: 0.82rem;
    overflow-wrap: anywhere;
  }
  .close {
    flex: none;
    width: 44px;
    height: 44px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    font-size: 1.3rem;
    line-height: 1;
    cursor: pointer;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
  }
  .kicker {
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--text-muted);
  }
  .kicker.live {
    color: var(--mint-ink);
  }
  .kicker.next {
    color: var(--amber-ink);
  }
  .muted {
    color: var(--text-muted);
    font-size: 0.82rem;
  }
  .progress {
    height: 5px;
    background: var(--line);
    border-radius: 999px;
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--mint);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .here {
    min-height: 44px;
    padding: 0.5rem 1rem;
    border: 1px solid var(--mint);
    border-radius: var(--radius);
    background: var(--mint);
    color: var(--ink);
    font-weight: 700;
    cursor: pointer;
  }
  .here.clear {
    background: var(--surface);
    border-color: var(--line);
    color: var(--text);
  }
  .here.go {
    background: var(--amber);
    border-color: var(--amber);
  }
  .here.go.clear {
    background: var(--surface);
    border-color: var(--line);
  }
</style>
