<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';

  /**
   * One Schedule tab, three ways to read it: the horizontal timeline that
   * opens at now, the rooms side by side, and the agenda list. They are
   * links, so each view has its own address and the back button works.
   */
  let { current }: { current: 'timeline' | 'rooms' | 'agenda' } = $props();

  // Carry the dev clock and event across, so a simulated day stays simulated.
  const kept = $derived(
    ['now', 'speed', 'event'].flatMap((key) => {
      const value = page.url.searchParams.get(key);
      return value ? [`${key}=${encodeURIComponent(value)}`] : [];
    }),
  );
  const href = (path: '/now' | '/schedule', view?: string) => {
    const query = [...(view ? [`view=${view}`] : []), ...kept].join('&');
    return `${resolve(path)}${query ? `?${query}` : ''}`;
  };
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- resolved above, with the kept query -->
<nav class="views" aria-label="Schedule view">
  <a href={href('/now')} aria-current={current === 'timeline' ? 'page' : undefined}
    >{t('view.timeline')}</a
  >
  <a href={href('/schedule', 'rooms')} aria-current={current === 'rooms' ? 'page' : undefined}
    >{t('view.rooms')}</a
  >
  <a href={href('/schedule')} aria-current={current === 'agenda' ? 'page' : undefined}
    >{t('view.agenda')}</a
  >
</nav>

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
  .views {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface);
  }
  .views a {
    min-height: 2.25rem;
    display: inline-flex;
    align-items: center;
    padding: 0 0.9rem;
    border-radius: 999px;
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 700;
    text-decoration: none;
  }
  .views a[aria-current='page'] {
    background: var(--text);
    color: var(--paper);
  }
</style>
