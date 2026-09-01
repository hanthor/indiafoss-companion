<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { registerSW } from 'virtual:pwa-register';

  let { children }: { children: import('svelte').Snippet } = $props();

  const brandHref = resolve('/');

  registerSW({ immediate: true });

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
</style>
