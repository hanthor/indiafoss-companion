<script lang="ts">
  import { base, resolve } from '$app/paths';
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
  <section class="hero" aria-labelledby="hero-title">
    <span class="tagline">From the FOSS United community</span>
    <h1 class="hero-title">
      <img class="wordmark" src="{base}/branding/indiafoss-2026-white.svg" alt="" />
      <span class="sr-only">{bundle?.name ?? 'IndiaFOSS Companion'}</span>
    </h1>
    <p class="hero-meta">
      {dateLine}
      <span aria-hidden="true">|</span>
      Bengaluru
      {#if during}
        <span aria-hidden="true">|</span> Happening now
      {:else if daysToGo !== null && daysToGo > 0}
        <span aria-hidden="true">|</span> {daysToGo} day{daysToGo === 1 ? '' : 's'} to go
      {/if}
    </p>
    <p id="hero-title" class="hero-desc">
      A festival of open source, in your pocket: schedule, personal ranking, itinerary and indoor
      navigation — all offline, no account needed.
    </p>
    <div class="hero-actions" role="group" aria-label="Primary actions">
      <a class="button light" href={resolve('/plan/rank')}>Rank your sessions</a>
      <a class="button gray" href={resolve('/now')}>What's on now</a>
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
  /* Mirrors .if-hero on the IndiaFOSS 2026 landing page: dark, centred, rounded. */
  .hero {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.1rem;
    text-align: center;
    margin-top: 0.5rem;
    padding: 2rem 1.25rem 2.25rem;
    border-radius: var(--radius-lg);
    background:
      radial-gradient(
        60% 80% at 50% 100%,
        color-mix(in srgb, var(--mint) 28%, transparent),
        transparent 70%
      ),
      var(--ink-2);
    color: #fafafa;
    user-select: none;
  }
  .tagline {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #fff;
  }
  .hero-title {
    margin: 0;
    display: flex;
    justify-content: center;
    width: 100%;
  }
  .wordmark {
    width: min(18rem, 70%);
    height: auto;
    display: block;
  }
  .hero-meta {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #fafafa;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
  .hero-desc {
    margin: 0;
    max-width: 34rem;
    color: #f4f4f4;
    font-size: 0.9rem;
    line-height: 1.6;
  }
  .hero-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  .hero .button.light,
  .hero .button.light:hover {
    background: #fafafa;
    color: #141414;
    border-color: #fafafa;
  }
  .hero .button.gray,
  .hero .button.gray:hover {
    background: hsl(0 0% 29%);
    color: #fafafa;
    border-color: hsl(0 0% 29%);
  }

  .rank-hero {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 1.1rem 0 1.2rem;
    padding: 1.25rem 1.4rem;
    border: 1px solid color-mix(in srgb, var(--mint) 40%, transparent);
    border-radius: var(--radius-lg);
    background: var(--mint-soft);
    color: var(--mint-dark);
    text-decoration: none;
    box-shadow: var(--shadow-soft);
    transition: background 0.15s ease;
  }
  .rank-hero:hover {
    background: color-mix(in srgb, var(--mint-soft) 80%, #fff);
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
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-hard-sm);
    padding: 1rem 1.05rem;
    text-decoration: none;
    color: var(--text);
    transition: background 0.15s ease;
  }
  .quick a:hover {
    background: var(--surface-raised);
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
