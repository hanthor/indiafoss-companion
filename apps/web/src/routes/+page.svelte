<script lang="ts">
  import { resolve } from '$app/paths';
  import { formatDayLabel } from '@indiafoss/schedule';
  import { eventState } from '$lib/event.svelte';
  import EventGate from '$lib/components/EventGate.svelte';

  const bundle = $derived(eventState.bundle);

  const dateLine = $derived.by(() => {
    if (!bundle) return '';
    const start = formatDayLabel(bundle.start.slice(0, 10));
    const end = formatDayLabel(bundle.end.slice(0, 10));
    return start === end ? start : `${start} – ${end}`;
  });

  /** Days until doors open (negative during/after the event). */
  const daysToGo = $derived.by(() => {
    if (!bundle) return null;
    const ms = Date.parse(bundle.start) - Date.now();
    return Math.ceil(ms / 86_400_000);
  });
  const during = $derived(
    bundle ? Date.now() >= Date.parse(bundle.start) && Date.now() <= Date.parse(bundle.end) : false,
  );

  const counts = $derived({
    sessions: bundle?.activities.filter((a) => !a.flexible).length ?? 0,
    speakers: bundle?.people.length ?? 0,
    booths: bundle?.booths.length ?? 0,
    rooms: bundle?.locations.filter((l) => l.kind === 'room').length ?? 0,
  });
</script>

<EventGate>
  <section class="hero card">
    <span class="eyebrow">{dateLine}{bundle?.timezone ? ` · ${bundle.timezone}` : ''}</span>
    <h1>{bundle?.name ?? 'IndiaFOSS Companion'}</h1>
    <p class="lead">
      A festival of open source, in your pocket: schedule, personal ranking, itinerary and indoor
      navigation — all offline, no account needed.
    </p>
    <div class="row">
      {#if during}
        <span class="pill amber">Happening now</span>
      {:else if daysToGo !== null && daysToGo > 0}
        <span class="pill">{daysToGo} day{daysToGo === 1 ? '' : 's'} to go</span>
      {:else}
        <span class="pill">Archive</span>
      {/if}
      <a class="button ghost small" href={resolve('/now')}>What's on right now →</a>
    </div>
  </section>

  <a class="rank-hero" href={resolve('/plan/rank')}>
    <span class="rank-kicker">Make the most of your day</span>
    <strong>Rank your sessions</strong>
    <span class="rank-copy"
      >Tap or swipe through a few choices. We'll build your personal plan.</span
    >
    <span class="rank-action">Start ranking →</span>
  </a>

  <nav class="quick" aria-label="Quick actions">
    <a href={resolve('/now')}>
      <span class="ico" aria-hidden="true">◔</span>
      <strong>Now</strong>
      <span>What's happening right now</span>
    </a>
    <a href={resolve('/schedule')}>
      <span class="ico" aria-hidden="true">▤</span>
      <strong>Schedule</strong>
      <span>Browse the full programme</span>
    </a>
    <a href={resolve('/explore')}>
      <span class="ico" aria-hidden="true">⌕</span>
      <strong>Explore</strong>
      <span>Search talks, speakers, booths</span>
    </a>
    <a href={resolve('/map')}>
      <span class="ico" aria-hidden="true">⌖</span>
      <strong>Map</strong>
      <span>Venue navigation</span>
    </a>
    <a href={resolve('/connect')}>
      <span class="ico" aria-hidden="true">▣</span>
      <strong>Connect</strong>
      <span>Share your profile and contact card</span>
    </a>
    <a href={resolve('/scan')}>
      <span class="ico" aria-hidden="true">▦</span>
      <strong>Scan</strong>
      <span>Scan a location marker or contact card</span>
    </a>
    <a href={resolve('/chat')}>
      <span class="ico" aria-hidden="true">✉</span>
      <strong>Chat</strong>
      <span>Conference rooms and DMs on Matrix</span>
    </a>
    <a href={resolve('/settings')}>
      <span class="ico" aria-hidden="true">⚙</span>
      <strong>Settings</strong>
      <span>Routing profile, privacy, data</span>
    </a>
  </nav>

  {#if bundle}
    <section class="stats card flat" aria-label="Event at a glance">
      <div class="stat"><b>{counts.sessions}</b><span>sessions</span></div>
      <div class="stat"><b>{counts.speakers}</b><span>speakers</span></div>
      <div class="stat"><b>{counts.booths}</b><span>booths</span></div>
      <div class="stat"><b>{counts.rooms}</b><span>rooms</span></div>
    </section>
    <p class="muted small">
      {bundle.name} · {bundle.activities.length} sessions · {bundle.people.length} speakers ·
      {bundle.timezone}
    </p>
  {/if}
</EventGate>

<style>
  .hero {
    margin-top: 0.5rem;
    padding: 1.2rem 1.2rem 1rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--mint) 14%, var(--surface)),
      var(--surface) 55%
    );
  }
  .hero h1 {
    margin: 0.6rem 0 0.4rem;
    font-size: clamp(1.05rem, 3.6vw, 1.6rem);
  }
  .hero .lead {
    margin: 0 0 0.8rem;
  }

  .rank-hero {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 1.1rem 0 1.2rem;
    padding: 1.1rem 1.2rem;
    border: 2px solid var(--ink);
    border-radius: var(--radius);
    background: var(--mint);
    color: var(--ink);
    text-decoration: none;
    box-shadow: 6px 6px 0 var(--ink);
    transition:
      transform 0.08s ease,
      box-shadow 0.08s ease;
  }
  .rank-hero:hover {
    transform: translate(-2px, -2px);
    box-shadow: 8px 8px 0 var(--ink);
  }
  .rank-hero:active {
    transform: translate(3px, 3px);
    box-shadow: 2px 2px 0 var(--ink);
  }
  .rank-kicker {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .rank-hero strong {
    font-family: var(--font-display);
    font-size: clamp(0.95rem, 3vw, 1.25rem);
    line-height: 1.6;
    text-transform: uppercase;
  }
  .rank-copy {
    font-size: 0.88rem;
    max-width: 32rem;
  }
  .rank-action {
    margin-top: 0.4rem;
    font-weight: 800;
  }

  .quick {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.7rem;
    margin: 1.2rem 0;
  }
  .quick a {
    display: grid;
    gap: 0.15rem;
    background: var(--surface);
    border: 2px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-hard-sm);
    padding: 0.85rem 0.9rem;
    text-decoration: none;
    color: var(--text);
    transition:
      transform 0.08s ease,
      box-shadow 0.08s ease;
  }
  .quick a:hover {
    transform: translate(-1px, -1px);
    box-shadow: var(--shadow-hard);
  }
  .quick .ico {
    font-family: var(--font-mono);
    font-size: 1.1rem;
    color: var(--mint-ink);
    line-height: 1;
  }
  .quick a strong {
    display: block;
    font-size: 1rem;
    margin-top: 0.2rem;
  }
  .quick a span:not(.ico) {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    padding: 0.9rem 1rem;
  }
  @media (max-width: 420px) {
    .stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
