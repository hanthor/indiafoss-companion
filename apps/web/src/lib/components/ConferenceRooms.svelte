<script lang="ts">
  import type { EventBundle } from '@indiafoss/model';
  import type { ConferenceDirectory } from '@indiafoss/model/contracts';
  import { matrixToRoom, roomHandoffHref, spaceLink } from '$lib/element-links';

  let { bundle, directory }: { bundle: EventBundle | null; directory: ConferenceDirectory | null } =
    $props();

  const space = $derived(spaceLink(bundle));
  // The alias is the authoritative key and the only thing handed off. A
  // stored roomId is advisory: shown for someone comparing, never linked.
  const rooms = $derived(
    // Mesh-only rooms needed the retired IndiaFOSS Chat app; venue Wi-Fi reaches the rest.
    (directory?.rooms ?? [])
      .filter((room) => room.route !== 'mesh')
      .map((room) => ({
        ...room,
        href: roomHandoffHref(room.alias),
        webHref: matrixToRoom(room.alias),
      })),
  );
  // Resolution happens in the attendee's Matrix client, not here. When it
  // fails there (offline, or an alias the server does not hold) the client
  // reports it; this page never creates a room under a lookalike alias, and
  // must not grow a "create it" fallback — that is the split-room failure
  // #166 exists to prevent.
</script>

{#if space || rooms.length > 0}
  <section class="card rooms" aria-labelledby="rooms-title">
    <h2 id="rooms-title">Conference rooms on Matrix</h2>
    <p class="muted small">
      {#if directory}
        The organisers' published rooms on {directory.server}. Join from any Matrix account you
        already have; each opens in your own Matrix app. A room your app cannot resolve is
        unavailable for now: wait or ask an organiser, do not create one with the same name.
      {:else}
        Public rooms run by the organisers. Join from any Matrix account you already have.
      {/if}
    </p>
    <!-- External Matrix links: opened in the attendee's own Matrix client. -->
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
            {#if room.topic}<span class="muted small">{room.topic}</span>{/if}
            <code class="small">{room.alias}</code>
            {#if room.visibility !== 'public'}
              <span class="muted small"
                >{room.visibility === 'knock' ? 'Knock to join.' : 'Invite only.'}</span
              >
            {/if}
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
  .rooms code {
    color: var(--text-muted);
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 0.82rem;
  }
</style>
