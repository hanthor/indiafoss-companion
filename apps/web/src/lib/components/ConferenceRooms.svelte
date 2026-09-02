<script lang="ts">
  import type { EventBundle } from '@indiafoss/model';
  import { listedRooms, spaceLink } from '$lib/element-links';

  let { bundle }: { bundle: EventBundle | null } = $props();

  const space = $derived(spaceLink(bundle));
  const rooms = $derived(listedRooms(bundle));
  const server = $derived(bundle?.messaging?.aliasServer ?? '');
</script>

{#if space || rooms.length > 0}
  <section class="card rooms" aria-labelledby="rooms-title">
    <h2 id="rooms-title">Conference rooms on Matrix</h2>
    <p class="muted small">
      Public rooms run by the organisers{server ? ` on ${server}` : ''}. Join from any Matrix
      account you already have; they open in Element.
    </p>
    <!-- External matrix.to links: opened in the attendee's own Matrix client. -->
    <!-- eslint-disable svelte/no-navigation-without-resolve -- external links -->
    <ul>
      {#if space}
        <li class="space">
          <a href={space.href} target="_blank" rel="noreferrer">
            <strong>{space.name}</strong>
            <span class="muted small">Space with every room · {space.alias}</span>
          </a>
        </li>
      {/if}
      {#each rooms as room (room.alias)}
        <li>
          <a href={room.href} target="_blank" rel="noreferrer">
            <strong>{room.name}</strong>
            {#if room.purpose}<span class="muted small">{room.purpose}</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </section>
{/if}

<style>
  .rooms ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
  }
  .rooms li a {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.55rem 0;
    border-top: 1px solid var(--line);
    color: var(--text);
    text-decoration: none;
  }
  .rooms li a:hover strong {
    text-decoration: underline;
    text-decoration-color: var(--event-accent);
  }
  .rooms li.space a {
    border-top: none;
  }
  .rooms li strong::after {
    content: ' ↗';
    color: var(--text-faint);
    font-weight: 400;
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
</style>
