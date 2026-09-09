<script lang="ts">
  import NativeDownload from '$lib/components/NativeDownload.svelte';
  import ContributeNotice from '$lib/components/ContributeNotice.svelte';
  import { base, resolve } from '$app/paths';
  import { formatDayLabel } from '@indiafoss/schedule';
  import { eventState } from '$lib/event.svelte';
  import DevroomBanner from '$lib/components/DevroomBanner.svelte';
  import { devroomArt } from '$lib/devroom-art';
  import EventGate from '$lib/components/EventGate.svelte';
  import GettingThere from '$lib/components/GettingThere.svelte';

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
  <section
    class="hero"
    class:illustrated={bundle?.id === 'indiafoss-2026'}
    aria-labelledby="hero-title"
  >
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
      A festival of open source, in your pocket: schedule, talk discovery, itinerary and indoor
      navigation — all offline, no account needed.
    </p>
    <div class="hero-actions" role="group" aria-label="Primary actions">
      <a class="button light" href={resolve('/plan/rank')}>Find talks for you</a>
      <a class="button gray" href={resolve('/now')}>What's on now</a>
    </div>
  </section>

  <NativeDownload />

  <a class="rank-hero" href={resolve('/plan/rank')}>
    <span class="rank-kicker">Make the most of your day</span>
    <strong>Find talks for you</strong>
    <span class="rank-copy"
      >Tap or swipe through a few choices. We'll build your personal plan.</span
    >
    <span class="rank-action">Find talks for you →</span>
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
    <a href={resolve('/settings')}>
      <span class="ico" aria-hidden="true">⚙</span>
      <strong>Settings</strong>
      <span>Routing profile, privacy, data</span>
    </a>
  </nav>

  {#if bundle?.venue}
    <GettingThere venue={bundle.venue} />
  {/if}

  {#if bundle?.id === 'indiafoss-2026'}
    <section class="devrooms" aria-labelledby="devrooms-heading">
      <div class="section-heading">
        <h2 id="devrooms-heading">Find your devroom</h2>
        <a href={resolve('/plan/rank?mode=rooms')}>Choose your devrooms →</a>
      </div>
      <p class="muted">
        Half-day tracks curated by their communities. Pick a few talks, or stay for a whole devroom.
      </p>
      <div class="devroom-grid">
        {#each bundle.tracks.filter((track) => devroomArt[track.id]) as track (track.id)}
          <a class="devroom-link" href={resolve(`/plan/rank?mode=rooms#devroom-${track.id}`)}>
            <DevroomBanner trackId={track.id} eventId={bundle.id} />
            <strong>{track.name}</strong>
          </a>
        {/each}
      </div>
    </section>
  {/if}

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
  <ContributeNotice />
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
    padding: 3rem 1.25rem 5rem;
    min-height: 440px;
    border-radius: var(--radius-lg);
    background: var(--ink-2);
    color: var(--on-ink);
    user-select: none;
  }
  .hero.illustrated {
    background-image: url('/branding/2026/if26-hero.webp');
    background-position: center;
    background-size: cover;
  }
  @media (max-width: 600px) {
    .hero.illustrated {
      background-image: url('/branding/2026/if26-hero-mobile.webp');
      min-height: 500px;
      padding-bottom: 5rem;
    }
  }
  .tagline {
    font-family: var(--font-body);
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--on-ink);
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
    color: var(--on-ink);
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }
  .hero-desc {
    margin: 0;
    max-width: 34rem;
    color: var(--on-ink);
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
    background: var(--on-ink);
    color: var(--ink);
    border-color: var(--on-ink);
  }
  .hero .button.gray,
  .hero .button.gray:hover {
    background: hsl(0 0% 29%);
    color: var(--on-ink);
    border-color: hsl(0 0% 29%);
  }

  .rank-hero {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 1.1rem 0 1.2rem;
    padding: 1.25rem 1.4rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    box-shadow: var(--shadow-soft);
    transition: background 0.15s ease;
  }
  .rank-hero:hover {
    background: var(--surface-raised);
  }
  .rank-kicker {
    font-family: var(--font-body);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .rank-hero strong {
    font-family: var(--font-display);
    font-size: clamp(1.4rem, 3vw, 1.75rem);
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1.25;
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
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.7rem;
    margin: 1.2rem 0;
  }
  @media (max-width: 800px) {
    .quick {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
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
    font-family: var(--font-body);
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

  .devrooms {
    margin: 2.5rem 0;
  }
  .section-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .devroom-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.75rem 2rem;
    background: var(--surface);
    padding: 1rem;
    border-radius: var(--radius-lg);
  }
  .devroom-link {
    color: var(--text);
    text-decoration: none;
    min-width: 0;
  }
  .devroom-link strong {
    display: block;
    margin-top: 0.75rem;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .devroom-link:hover strong {
    text-decoration: underline;
  }
  @media (max-width: 800px) {
    .devroom-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 480px) {
    .devroom-grid {
      grid-template-columns: 1fr;
    }
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
