<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { base, resolve } from '$app/paths';
  import { registerSW } from 'virtual:pwa-register';
  import { hydratePreferences } from '$lib/prefs.svelte';
  import { applyUpdate, checkForUpdates, updateState } from '$lib/updates.svelte';
  import {
    armNotifications,
    disarmNotifications,
    hydrateNotifications,
    notificationsEnabled,
  } from '$lib/notifications.svelte';
  import { untrack } from 'svelte';
  import { DEFAULT_EVENT_ID, eventState } from '$lib/event.svelte';
  import { installNativeDeepLinks } from '$lib/native';
  import LeaveByBanner from '$lib/components/LeaveByBanner.svelte';
  import SimulatorStrip from '$lib/components/SimulatorStrip.svelte';
  import { goto } from '$app/navigation';
  import {
    hydrateSimulator,
    logSimEvent,
    simState,
    startSimulationFromParams,
    tickInterval,
  } from '$lib/simulator.svelte';
  import { simulationSpeed } from '$lib/clock';
  import { hydrateOnboarding, markOnboardingDone, onboardingState } from '$lib/onboarding.svelte';

  let { children }: { children: import('svelte').Snippet } = $props();

  const brandHref = resolve('/');
  const logoSrc = `${base}/branding/indiafoss-2026-white.svg`;

  registerSW({ immediate: true });

  onMount(() => {
    void hydratePreferences();
    void hydrateNotifications();
    // Deep-link targets are validated in routeForDeepLink() before navigation.
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    void installNativeDeepLinks(base, (path) => goto(path)).catch(() => {});
    hydrateSimulator();
    // `?setup=done` skips the welcome wizard (links, automation).
    if (page.url.searchParams.get('setup') === 'done') void markOnboardingDone();
    else void hydrateOnboarding();
  });

  // First run (#107): the home screen hands over to the welcome wizard once.
  // Only a plain visit to `/` does; deep links and parameterised URLs never.
  $effect(() => {
    const path = page.url.pathname.replace(base, '') || '/';
    if (path !== '/' || page.url.search) return;
    if (eventState.status !== 'ready' || !onboardingState.loaded || onboardingState.done) return;
    void goto(resolve('/welcome'));
  });

  // Reminders are re-armed once a minute of app time: every real minute, or
  // much more often while the day simulator runs the clock fast. A run
  // starting or stopping moves the clock, so everything armed is dropped and
  // re-armed on the new one.
  $effect(() => {
    const run = simState.run;
    // Dependencies, not incidental reads. Arming does nothing at all until the
    // schedule is loaded and the stored preference says reminders are wanted,
    // and both arrive asynchronously after the first paint. Without these the
    // effect would not re-run when they land, so the first alerts would wait
    // out the rest of the interval — a whole minute of a conference day in
    // which nothing can fire (#159).
    void eventState.bundle;
    void notificationsEnabled.value;
    const every = run ? untrack(() => tickInterval(60_000)) : 60_000;
    const timer = setInterval(() => {
      void armNotifications();
    }, every);
    void disarmNotifications().then(() => armNotifications());
    return () => clearInterval(timer);
  });

  // `?now=<iso>&speed=<n>` starts the day simulator from a link (#93). Only
  // the URL is a dependency: stopping the run must not start it again.
  $effect(() => {
    const now = page.url.searchParams.get('now');
    const speed = simulationSpeed(page.url.searchParams.get('speed'));
    if (now && speed !== null) untrack(() => startSimulationFromParams(now, speed));
  });

  // The simulator log records which screen was open when, for the walk-through.
  let loggedPath = '';
  $effect(() => {
    const path = page.url.pathname.replace(base, '') || '/';
    if (!simState.run || path === loggedPath) return;
    loggedPath = path;
    untrack(() => logSimEvent('screen', path));
  });

  $effect(() => {
    if (eventState.status === 'ready' && eventState.bundle) {
      void checkForUpdates(DEFAULT_EVENT_ID);
    }
  });

  // The map fills the screen edge to edge; every other route keeps the gutter.
  const fullbleed = $derived(isActive(resolve('/map')));

  function isActive(href: string): boolean {
    const path = page.url.pathname;
    return path === href || path.startsWith(`${href}/`);
  }

  // Accessible, descriptive document title per route (§53 a11y: document-title).
  const pageTitle = $derived.by(() => {
    const path = page.url.pathname.replace(base, '') || '/';
    const names: Record<string, string> = {
      '/': 'Home',
      '/now': 'Now',
      '/plan': 'Plan',
      '/plan/rank': 'Rank sessions',
      '/schedule': 'Schedule',
      '/map': 'Map',
      '/explore': 'Explore',
      '/connect': 'Share contact',
      '/connect/compare': 'Compare key badges',
      '/connect/recap': 'Who I met',
      '/scan': 'Scan',
      '/settings': 'Settings',
      '/welcome': 'Welcome',
    };
    const match =
      names[path] ??
      (path.startsWith('/activity/')
        ? 'Session'
        : path.startsWith('/speaker/')
          ? 'Speaker'
          : path.startsWith('/explore/booths')
            ? 'Booths'
            : null);
    return match ? `${match} · IndiaFOSS Companion` : 'IndiaFOSS Companion';
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="shell">
  <header class="app-bar">
    <a class="brand" href={brandHref} aria-label="IndiaFOSS Companion home">
      <img src={logoSrc} alt="IndiaFOSS 2026" />
      <span class="brand-sub">Companion</span>
    </a>
    <nav class="toplinks" aria-label="Account">
      <a
        class="scancta"
        href={resolve('/scan')}
        aria-current={isActive('/scan') ? 'page' : undefined}
        title="Scan a code — opens the camera straight away"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path
            d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v4h-4v-2h2v-2zm-6 2h2v2h-2v-2z"
          /></svg
        >
        <span>Scan</span>
      </a>
      <a
        href={resolve('/connect')}
        aria-current={isActive('/connect') ? 'page' : undefined}
        title="Your contact card"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><path
            d="M12 4a4 4 0 110 8 4 4 0 010-8zm0 2a2 2 0 100 4 2 2 0 000-4zM5 20a7 7 0 0114 0h-2a5 5 0 00-10 0H5z"
          /></svg
        >
        <span>Connect</span>
      </a>
    </nav>
  </header>
  <div class="pixelstripe" aria-hidden="true"></div>
  <SimulatorStrip />
  <LeaveByBanner />

  <main class="content" class:fullbleed>
    {@render children()}
  </main>

  {#if updateState.available}
    <section class="updatebanner card accent" role="status" aria-label="Schedule update available">
      <div class="updatebody">
        <strong>Schedule changed</strong>
        <span>
          {#each Object.entries(updateState.summary) as [type, count] (type)}
            {count}
            {type}{count === 1 ? '' : 's'}
            {#if type === 'room-changed'}
              — your route will be recalculated.
            {/if}
          {/each}
        </span>
      </div>
      <button class="button primary small" onclick={() => applyUpdate(DEFAULT_EVENT_ID)}
        >Update</button
      >
    </section>
  {/if}

  <nav class="tabbar" aria-label="Primary">
    <a href={resolve('/now')} aria-current={isActive('/now') ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path
          d="M12 3a9 9 0 110 18 9 9 0 010-18zm0 2a7 7 0 100 14 7 7 0 000-14zm-1 3h2v4.6l3 1.8-1 1.7-4-2.4V8z"
        /></svg
      >
      <span>Now</span>
    </a>
    <a href={resolve('/plan')} aria-current={isActive('/plan') ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M5 4h14v16H5V4zm2 2v12h10V6H7zm2 2h6v2H9V8zm0 4h6v2H9v-2zm0 4h4v2H9v-2z" /></svg
      >
      <span>Plan</span>
    </a>
    <a href={resolve('/schedule')} aria-current={isActive('/schedule') ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path d="M7 2h2v2h6V2h2v2h3v17H4V4h3V2zM6 9v10h12V9H6zm2 2h3v3H8v-3z" /></svg
      >
      <span>Schedule</span>
    </a>
    <a href={resolve('/map')} aria-current={isActive('/map') ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path
          d="M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7zm0 2a5 5 0 00-5 5c0 3 3.6 8.2 5 10.1 1.4-1.9 5-7.1 5-10.1a5 5 0 00-5-5zm0 2.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z"
        /></svg
      >
      <span>Map</span>
    </a>
    <a href={resolve('/explore')} aria-current={isActive('/explore') ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><path
          d="M10 3a7 7 0 015.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z"
        /></svg
      >
      <span>Explore</span>
    </a>
  </nav>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
  }

  .app-bar {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: calc(0.55rem + var(--safe-top)) 0.9rem 0.55rem;
    background: var(--ink-2);
    color: var(--on-ink);
  }

  .brand {
    display: inline-flex;
    align-items: baseline;
    gap: 0.6rem;
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }
  .brand img {
    display: block;
    width: min(7.5rem, 36vw);
    height: auto;
  }
  .brand-sub {
    font-family: var(--font-display);
    font-size: 0.5rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--amber);
  }
  @media (max-width: 480px) {
    .brand-sub {
      display: none;
    }
  }

  .toplinks {
    display: flex;
    gap: 0.15rem;
  }
  .toplinks a {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.05rem;
    min-width: 44px;
    min-height: 44px;
    padding: 0.25rem 0.45rem;
    border-radius: var(--radius);
    color: var(--on-ink);
    text-decoration: none;
    font-family: var(--font-mono);
    font-size: 0.56rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .toplinks svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: currentColor;
  }
  .toplinks a:hover {
    background: hsl(0 0% 20%);
  }
  .toplinks a[aria-current='page'] {
    background: hsl(0 0% 29%);
    color: var(--on-ink);
  }
  /* Scanning is the most frequent in-person action, so it gets the one
     high-contrast control in the bar rather than another grey icon. */
  .toplinks a.scancta {
    flex-direction: row;
    gap: 0.35rem;
    padding: 0 0.7rem;
    background: var(--amber);
    color: var(--ink);
    font-weight: 700;
  }
  .toplinks a.scancta:hover,
  .toplinks a.scancta[aria-current='page'] {
    background: color-mix(in srgb, var(--amber) 82%, var(--on-ink));
    color: var(--ink);
  }
  .pixelstripe {
    position: sticky;
    top: calc(60px + var(--safe-top));
    z-index: 3;
  }

  .content {
    flex: 1;
    padding: 0.75rem 1rem 1.25rem;
    max-width: 72rem;
    width: 100%;
    margin: 0 auto;
  }

  .content.fullbleed {
    display: flex;
    flex-direction: column;
    padding: 0;
    max-width: none;
  }

  .tabbar {
    position: sticky;
    bottom: 0;
    z-index: 3;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    background: var(--surface);
    border-top: 1px solid var(--line);
    padding-bottom: var(--safe-bottom);
  }
  .tabbar a {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    min-height: var(--tabbar-height);
    padding: 0.35rem 0.2rem;
    color: var(--text-muted);
    text-decoration: none;
    font-family: var(--font-mono);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .tabbar svg {
    width: 1.35rem;
    height: 1.35rem;
    fill: currentColor;
  }
  .tabbar a[aria-current='page'] {
    color: var(--mint-ink);
  }
  .tabbar a[aria-current='page']::before {
    content: '';
    position: absolute;
    top: -1px;
    left: 18%;
    right: 18%;
    height: 3px;
    background: var(--mint);
  }

  .updatebanner {
    position: sticky;
    bottom: calc(var(--tabbar-height) + var(--safe-bottom) + 0.5rem);
    margin: 0 auto 0.5rem;
    max-width: 40rem;
    display: flex;
    gap: 0.8rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.9rem;
  }
  .updatebody {
    display: flex;
    flex-direction: column;
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  .updatebody strong {
    color: var(--text);
  }
</style>
