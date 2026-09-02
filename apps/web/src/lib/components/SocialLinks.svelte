<script lang="ts">
  import type { ContactLink } from '@indiafoss/model';

  /** Ordered, labelled links (see linksFromUrls / contactDeepLinks) rendered as icon buttons. */
  let { links, compact = false }: { links: ContactLink[]; compact?: boolean } = $props();

  // Minimal monochrome glyphs; brand marks are avoided so the set stays licence-clean.
  const ICONS: Record<string, string> = {
    website:
      'M12 2a10 10 0 100 20 10 10 0 000-20zm7.9 9h-3a15 15 0 00-1.4-5.4A8 8 0 0119.9 11zM12 4c1 1.3 1.8 3.6 2 7h-4c.2-3.4 1-5.7 2-7zM4.1 13h3a15 15 0 001.4 5.4A8 8 0 014.1 13zm3-2h-3a8 8 0 014.4-5.4A15 15 0 007.1 11zM12 20c-1-1.3-1.8-3.6-2-7h4c-.2 3.4-1 5.7-2 7zm3.5-1.6A15 15 0 0016.9 13h3a8 8 0 01-4.4 5.4z',
    github:
      'M12 2a10 10 0 00-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.4-1.1-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-5a3.9 3.9 0 011-2.7c-.1-.3-.5-1.3.1-2.7 0 0 .9-.3 2.8 1a9.5 9.5 0 015 0c1.9-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7a3.9 3.9 0 011 2.7c0 3.9-2.4 4.8-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0012 2z',
    gitlab:
      'M12 21.5l-8.7-6.3a.8.8 0 01-.3-.9l1-3.1 2-6.2a.4.4 0 01.8 0l2 6.2h6.4l2-6.2a.4.4 0 01.8 0l2 6.2 1 3.1a.8.8 0 01-.3.9L12 21.5z',
    linkedin:
      'M4 3.5A1.5 1.5 0 115.5 5 1.5 1.5 0 014 3.5zM4.2 8h2.6v12H4.2V8zm5 0h2.5v1.7h.1a2.8 2.8 0 012.5-1.9c2.7 0 3.2 1.8 3.2 4.1V20h-2.6v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V20H9.2V8z',
    mastodon:
      'M20.5 8.5c0-4.1-2.7-5.3-2.7-5.3C16.4 2.6 14 2.4 11.6 2.4S6.8 2.6 5.4 3.2c0 0-2.7 1.2-2.7 5.3v3.4c.1 4 .8 5.5 2.7 6.5 1.7.8 3.9 1 6.2.8.6 0 1.5-.2 2.5-.4v-2c-1 .3-2.1.5-3 .5-2.3.1-4.1-.2-4.4-2.1a9 9 0 01-.1-1c1.3.3 2.9.5 4.5.5 1.9 0 3.5-.2 4.6-.5 1.9-.3 4.7-1.8 4.8-8.2zm-3.7 5.9h-2.2V9.1c0-1.1-.5-1.7-1.4-1.7-1 0-1.6.7-1.6 2v2.9h-2.2v-2.9c0-1.3-.5-2-1.6-2-.9 0-1.4.6-1.4 1.7v5.3H4.2V9c0-1.1.3-2 .9-2.6a3 3 0 012.3-1c1.1 0 1.9.4 2.5 1.3l.6.9.6-.9a2.9 2.9 0 012.5-1.3c.9 0 1.7.3 2.3 1 .6.6.9 1.5.9 2.6v5.4z',
    bluesky:
      'M12 10.8c-.9-1.8-3.4-5.1-5.7-6.8C4.1 2.4 3.3 2.7 2.7 3c-.6.3-.7 1.3-.7 1.8s.3 4.6.5 5.3c.6 2.3 2.8 3 4.8 2.8-3 .4-5.6 1.5-2.1 5.3 3.8 4 5.2-.9 5.9-3.3.7 2.4 1.5 7 5.8 3.3 3.3-3.3.9-4.9-2.1-5.3 2 .2 4.2-.5 4.8-2.8.2-.7.5-4.8.5-5.3s-.1-1.5-.7-1.8c-.6-.3-1.4-.6-3.6 1-2.3 1.7-4.8 5-5.7 6.8z',
    x: 'M17.5 3h3l-6.6 7.6L21.6 21h-6.1l-4.8-6.2L5.2 21h-3l7.1-8.1L2 3h6.2l4.3 5.7L17.5 3zm-1 16.2h1.7L7.5 4.7H5.7l10.8 14.5z',
    matrix:
      'M3 3h2v18H3V3zm16 0h2v18h-2V3zM7 9h2v1a3 3 0 015 0 3 3 0 015 .5V15h-2v-4.3c0-.9-.4-1.3-1.2-1.3S14 10 14 11v4h-2v-4.3c0-.9-.4-1.3-1.2-1.3S9 10 9 11v4H7V9z',
    telegram:
      'M21 4.5L3.3 11.3c-1.2.5-1.2 1.2-.2 1.5l4.5 1.4 1.7 5.3c.2.6.1.8.7.8.5 0 .7-.2 1-.5l2.4-2.3 4.9 3.6c.9.5 1.5.2 1.8-.8L23 5.8c.3-1.3-.5-1.9-2-1.3zM9.6 13.9l9-5.7c.4-.3.8-.1.5.2l-7.6 6.9-.3 3.2-1.6-4.6z',
    whatsapp:
      'M12 2.5a9.5 9.5 0 00-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1012 2.5zm0 17.3a7.8 7.8 0 01-4-1.1l-.3-.2-2.8.8.8-2.8-.2-.3A7.8 7.8 0 1112 19.8zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.3-.5-.5-1-1.1-1.3-1.7-.1-.2 0-.4.1-.5l.4-.4.3-.4v-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.5.5-.9 1.2-.9 2 .1.9.4 1.7 1 2.4 1.1 1.6 2.5 2.9 4.2 3.7.6.3 1.3.5 2 .5.6-.1 1.2-.5 1.6-1 .2-.4.3-.8.2-1.2l-.4-.2z',
    signal:
      'M12 2.5a9.5 9.5 0 00-8 14.6L3 21.5l4.4-1.1A9.5 9.5 0 1012 2.5zm0 2a7.5 7.5 0 11-4 13.9l-.4-.2-2.1.5.5-2-.3-.4A7.5 7.5 0 0112 4.5z',
    xmpp: 'M4 5h16l-8 9-8-9zm2.4 2L12 11.2 17.6 7H6.4zM4 19l6-6.7 2 2.2 2-2.2 6 6.7h-2.7l-3.3-3.7-2 2.2-2-2.2L6.7 19H4z',
    deltachat:
      'M12 3a9 9 0 00-7.8 13.5L3 21l4.6-1.2A9 9 0 1012 3zm0 2a7 7 0 11-3.6 13l-.4-.2-2.3.6.6-2.2-.3-.4A7 7 0 0112 5zm-1 3h2l3 8h-2l-.6-1.6h-2.8L10 16H8l3-8zm1 2.3l-.9 2.5h1.8L12 10.3z',
    email: 'M3 5h18v14H3V5zm2 2v.5l7 4.5 7-4.5V7H5zm0 3v7h14v-7l-7 4.5L5 10z',
    phone:
      'M6.6 3h3.2l1.5 4-2 1.4a12 12 0 006.3 6.3l1.4-2 4 1.5v3.2A2.5 2.5 0 0118.5 20 16.5 16.5 0 014 5.5 2.5 2.5 0 016.6 3z',
    sms: 'M4 4h16v11h-9l-4 4v-4H4V4zm2 2v7h3v2l2-2h7V6H6z',
    youtube:
      'M21.6 7.2a2.5 2.5 0 00-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 002.4 7.2 26 26 0 002 12a26 26 0 00.4 4.8 2.5 2.5 0 001.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 001.8-1.8A26 26 0 0022 12a26 26 0 00-.4-4.8zM10 15V9l5.2 3L10 15z',
    medium: 'M4 6h4l3.5 8L15 6h4v12h-3v-8l-3.4 8h-1.2L8 10v8H4V6z',
    devto:
      'M3 6h4c2 0 3 1 3 3v6c0 2-1 3-3 3H3V6zm2 2v8h2c.7 0 1-.3 1-1V9c0-.7-.3-1-1-1H5zm7-2h5v2h-3v2h2v2h-2v2h3v2h-5V6zm6 0h2l1.5 8L21 6h2l-2.5 12h-2L16 6z',
    instagram:
      'M12 3h4a5 5 0 015 5v8a5 5 0 01-5 5H8a5 5 0 01-5-5V8a5 5 0 015-5h4zm0 2H8a3 3 0 00-3 3v8a3 3 0 003 3h8a3 3 0 003-3V8a3 3 0 00-3-3h-4zm0 3.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7zm0 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM17 6a1 1 0 110 2 1 1 0 010-2z',
  };
  const external = (href: string) => /^https?:/i.test(href);
</script>

{#if links.length > 0}
  <ul class="social" class:compact aria-label="Links">
    {#each links as link (link.href)}
      <li>
        <!-- External profile URLs from event data / scanned cards; never in-app routes. -->
        <!-- eslint-disable svelte/no-navigation-without-resolve -->
        <a
          href={link.href}
          rel={external(link.href) ? 'noreferrer noopener' : undefined}
          target={external(link.href) ? '_blank' : undefined}
          title={link.label}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d={ICONS[link.kind] ?? ICONS.website} /></svg
          >
          <span>{link.label}</span>
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </li>
    {/each}
  </ul>
{/if}

<style>
  .social {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .social a {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 36px;
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface-raised);
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 600;
    text-decoration: none;
  }
  .social a:hover {
    background: var(--line);
  }
  .social svg {
    width: 1rem;
    height: 1rem;
    fill: currentColor;
  }
  .compact a {
    min-height: 30px;
    padding: 0.15rem 0.55rem;
    font-size: 0.72rem;
  }
  .compact a span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
  .compact a {
    position: relative;
  }
</style>
