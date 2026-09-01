<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { registerSW } from 'virtual:pwa-register';
  import { hydratePreferences } from '$lib/prefs.svelte';
  import { applyUpdate, checkForUpdates, updateState } from '$lib/updates.svelte';
  import { DEFAULT_EVENT_ID, eventState } from '$lib/event.svelte';

  let { children }: { children: import('svelte').Snippet } = $props();

  const brandHref = resolve('/');

  registerSW({ immediate: true });

  onMount(() => {
    void hydratePreferences();
  });

  $effect(() => {
    if (eventState.status === 'ready' && eventState.bundle) {
      void checkForUpdates(DEFAULT_EVENT_ID);
    }
  });

  function isActive(href: string): boolean {
    const path = page.url.pathname;
    return path === href || path.startsWith(`${href}/`);
  }
</script>

<div class="shell">
  <header class="app-bar">
    <a class="brand" href={brandHref}>IndiaFOSS Companion</a>
  </header>

  <main class="content">
    {@render children()}
  </main>

  {#if updateState.available}
    <section class="updatebanner" role="status" aria-label="Schedule update available">
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
      <button class="updatebtn" onclick={() => applyUpdate(DEFAULT_EVENT_ID)}>Update</button>
    </section>
  {/if}

  <nav class="tabbar" aria-label="Primary">
    <a href={resolve('/now')} aria-current={isActive('/now') ? 'page' : undefined}>Now</a>
    <a href={resolve('/plan')} aria-current={isActive('/plan') ? 'page' : undefined}>Plan</a>
    <a href={resolve('/schedule')} aria-current={isActive('/schedule') ? 'page' : undefined}
      >Schedule</a
    >
    <a href={resolve('/map')} aria-current={isActive('/map') ? 'page' : undefined}>Map</a>
    <a href={resolve('/explore')} aria-current={isActive('/explore') ? 'page' : undefined}
      >Explore</a
    >
  </nav>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
  }

  .app-bar {
    padding: 0.75rem 1rem;
    background: var(--event-primary);
    color: #ffffff;
    position: sticky;
    top: 0;
  }

  .brand {
    color: inherit;
    text-decoration: none;
    font-weight: 700;
    font-size: 1.1rem;
  }

  .content {
    flex: 1;
    padding: 1rem;
    max-width: 72rem;
    width: 100%;
    margin: 0 auto;
  }

  .tabbar {
    position: sticky;
    bottom: 0;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    background: var(--surface-raised);
    border-top: 1px solid color-mix(in srgb, var(--text-muted) 20%, transparent);
    padding-bottom: var(--safe-bottom);
  }

  .tabbar a {
    display: block;
    text-align: center;
    padding: 0.75rem 0.25rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    text-decoration: none;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tabbar a[aria-current='page'] {
    color: var(--event-primary);
    font-weight: 700;
  }

  .updatebanner {
    position: sticky;
    bottom: calc(52px + var(--safe-bottom));
    margin: 0 auto 0.5rem;
    max-width: 40rem;
    display: flex;
    gap: 0.8rem;
    align-items: center;
    justify-content: space-between;
    background: color-mix(in srgb, var(--warning) 12%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--warning) 45%, transparent);
    border-radius: var(--radius);
    padding: 0.6rem 0.9rem;
    box-shadow: 0 4px 14px rgb(0 0 0 / 0.12);
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
  .updatebtn {
    border: none;
    background: var(--event-primary);
    color: #fff;
    border-radius: 999px;
    padding: 0.45rem 1rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 40px;
  }
</style>
